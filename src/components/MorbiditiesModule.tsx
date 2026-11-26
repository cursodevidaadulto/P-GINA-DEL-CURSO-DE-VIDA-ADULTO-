import React, { useEffect, useMemo, useState } from 'react';
import { Activity, Search } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { fetchServerPublicDataset } from '../services/adminApiService';
import { exportRowsToExcel } from '../services/excelAnalyzers';
import { fetchPublicBatchRows } from '../services/firestoreService';
import { exportInstitutionalPdf, printInstitutionalReport } from '../services/pdfExportService';
import {
  ContentDocumentItem,
  DriveDocumentItem,
  MICROREDES_RIS,
  MorbidityRow,
  PublicManifest,
} from '../types';
import { ExportToolbar } from './ExportToolbar';
import { ModuleDrivePanel } from './ModuleDrivePanel';

interface MorbiditiesModuleProps {
  manifest?: PublicManifest;
  driveFiles: DriveDocumentItem[];
  manualDocs: ContentDocumentItem[];
  onPreviewFile: (file: DriveDocumentItem) => void;
}

export const MorbiditiesModule: React.FC<MorbiditiesModuleProps> = ({
  manifest,
  driveFiles,
  manualDocs,
  onPreviewFile,
}) => {
  const [rows, setRows] = useState<MorbidityRow[]>([]);
  const [localManifest, setLocalManifest] = useState<PublicManifest | null>(null);
  const [loading, setLoading] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [selectedMicrored, setSelectedMicrored] = useState('Todas');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const serverRes = await fetchServerPublicDataset<MorbidityRow>('morbilidades');
        if (active && serverRes.rows?.length) {
          setRows(serverRes.rows);
          if (serverRes.manifest) setLocalManifest(serverRes.manifest);
          return;
        }
        if (manifest?.batchIds && manifest.batchIds.length > 0) {
          const data = await fetchPublicBatchRows<MorbidityRow>(manifest);
          if (active && data.length > 0) {
            setRows(data);
            return;
          }
        }
        if (active) setRows([]);
      } catch {
        if (active) setRows([]);
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [manifest]);

  const effectiveManifest = manifest || localManifest;

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return rows.filter((r) => {
      const matchMr = selectedMicrored === 'Todas' || r.microred === selectedMicrored;
      const matchQ =
        !q ||
        r.codigoCie.toLowerCase().includes(q) ||
        r.diagnostico.toLowerCase().includes(q) ||
        r.ipress.toLowerCase().includes(q);
      return matchMr && matchQ;
    });
  }, [rows, selectedMicrored, searchTerm]);

  const topDiagnoses = useMemo(() => {
    const map = new Map<
      string,
      { codigoCie: string; diagnostico: string; masculino: number; femenino: number; total: number }
    >();
    for (const r of filtered) {
      const curr = map.get(r.codigoCie) || {
        codigoCie: r.codigoCie,
        diagnostico: r.diagnostico,
        masculino: 0,
        femenino: 0,
        total: 0,
      };
      curr.masculino += r.masculino;
      curr.femenino += r.femenino;
      curr.total += r.total;
      map.set(r.codigoCie, curr);
    }
    return Array.from(map.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [filtered]);

  const summary = useMemo(() => {
    const total = filtered.reduce((s, r) => s + r.total, 0);
    const masc = filtered.reduce((s, r) => s + r.masculino, 0);
    const fem = filtered.reduce((s, r) => s + r.femenino, 0);
    return {
      total,
      masc,
      fem,
      distintos: new Set(filtered.map((r) => r.codigoCie)).size,
    };
  }, [filtered]);

  const handleExportExcel = () => {
    exportRowsToExcel(
      filtered.map((r) => ({
        Codigo_CIE10: r.codigoCie,
        Diagnostico: r.diagnostico,
        Categoria: r.categoria,
        Microred: r.microred,
        IPRESS: r.ipress,
        Femenino: r.femenino,
        Masculino: r.masculino,
        Total: r.total,
      })),
      'RIS_San_Ignacio_Morbilidades_Adulto',
      'Morbilidades',
      {
        modulo: 'Reporte de Morbilidades del Adulto (CIE-10)',
        periodo: effectiveManifest?.period || 'Vigente',
        filtros: `Microred: ${selectedMicrored}${searchTerm ? ` · Búsqueda: ${searchTerm}` : ''}`,
        fuente: effectiveManifest?.fileName || 'Consolidado RIS San Ignacio',
      }
    );
  };

  const handleExportPdf = async () => {
    setExportingPdf(true);
    try {
      await exportInstitutionalPdf({
        fileName: 'RIS_San_Ignacio_Morbilidades_Adulto',
        moduleName: 'Reporte de Morbilidades del Adulto (CIE-10)',
        subtitle: 'Perfil epidemiológico consolidado de diagnósticos frecuentes (30–59 años)',
        period: effectiveManifest?.period || 'Periodo vigente',
        appliedFilters: `Microred: ${selectedMicrored}${searchTerm ? ` · Búsqueda: ${searchTerm}` : ''}`,
        dataSource: effectiveManifest?.fileName || 'Consolidado oficial RIS San Ignacio',
        kpis: [
          { label: 'Total Atenciones CIE-10', value: summary.total.toLocaleString('es-PE') },
          { label: 'Diagnósticos Distintos', value: summary.distintos.toLocaleString('es-PE') },
          { label: 'Población Femenina', value: summary.fem.toLocaleString('es-PE') },
          { label: 'Población Masculina', value: summary.masc.toLocaleString('es-PE') },
        ],
        sections: [
          {
            title: 'Top 10 Diagnósticos CIE-10 Más Frecuentes',
            columns: ['CIE-10', 'Diagnóstico', 'Femenino', 'Masculino', 'Total'],
            rows: topDiagnoses.map((d) => [
              d.codigoCie,
              d.diagnostico,
              d.femenino.toLocaleString('es-PE'),
              d.masculino.toLocaleString('es-PE'),
              d.total.toLocaleString('es-PE'),
            ]),
          },
          {
            title: 'Detalle por Microred e IPRESS (Primeros 120 registros)',
            columns: ['CIE-10', 'Diagnóstico', 'Microred', 'IPRESS', 'Fem.', 'Masc.', 'Total'],
            rows: filtered.slice(0, 120).map((r) => [
              r.codigoCie,
              r.diagnostico,
              r.microred,
              r.ipress,
              r.femenino,
              r.masculino,
              r.total,
            ]),
          },
        ],
      });
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="card-premium rounded-2xl p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          {effectiveManifest?.updatedAt ? (
            <p className="text-[11px] font-mono-tabular font-semibold text-[#F07832] mb-1">
              Módulo actualizado: {new Date(String(effectiveManifest.updatedAt)).toLocaleString('es-PE')}
            </p>
          ) : null}
          <h1 className="font-display text-xl sm:text-2xl font-bold text-[#102A43]">
            Reporte de Morbilidades del Adulto (CIE-10)
          </h1>
          <p className="text-[13.5px] text-[#102A43]/70 mt-1">
            Perfil epidemiológico consolidado de diagnósticos frecuentes por microred, IPRESS y
            sexo.
          </p>
        </div>

        <ExportToolbar
          onExportExcel={filtered.length > 0 ? handleExportExcel : undefined}
          onExportPdf={filtered.length > 0 ? handleExportPdf : undefined}
          onPrint={printInstitutionalReport}
          loadingPdf={exportingPdf}
        />
      </div>

      <div className="card-premium rounded-2xl p-4 flex flex-col sm:flex-row gap-3 no-print">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-[#102A43]/45 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por código CIE-10, diagnóstico o IPRESS..."
            className="w-full pl-10 pr-4 py-2.5 text-[13.5px] bg-[#F8F7F2] border border-[#102A43]/15 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#F07832]/40"
          />
        </div>
        <select
          value={selectedMicrored}
          onChange={(e) => setSelectedMicrored(e.target.value)}
          aria-label="Filtrar por microred"
          className="px-3.5 py-2.5 text-[13.5px] bg-white border border-[#102A43]/15 rounded-xl text-[#102A43] font-semibold focus:outline-none focus:ring-2 focus:ring-[#F07832]/40"
        >
          <option value="Todas">Todas las microredes</option>
          {MICROREDES_RIS.map((mr) => (
            <option key={mr} value={mr}>
              Microred {mr}
            </option>
          ))}
          <option value="Externos">Externos</option>
        </select>
      </div>

      {loading ? (
        <div className="card-premium rounded-2xl p-10 text-center text-[#102A43]/65 text-sm">
          Cargando perfil de morbilidades...
        </div>
      ) : filtered.length === 0 ? (
        <div className="card-premium rounded-2xl p-10 text-center">
          <Activity className="w-10 h-10 text-[#102A43]/25 mx-auto mb-3" />
          <h2 className="font-display text-lg font-bold text-[#102A43] mb-1.5">
            Sin datos de morbilidades publicados aún
          </h2>
          <p className="text-[13.5px] text-[#102A43]/70 max-w-lg mx-auto">
            Cuando el administrador publique el consolidado de morbilidades CIE-10 desde el módulo
            de Administración, aquí se mostrará el ranking de diagnósticos y gráficos comparativos.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
            <div className="card-premium rounded-2xl p-4 sm:p-5">
              <p className="text-[12px] sm:text-[12.5px] text-[#102A43]/70 font-medium">
                Total atenciones CIE-10
              </p>
              <p className="font-mono-tabular text-xl sm:text-2xl font-bold text-[#102A43] mt-1.5">
                {summary.total.toLocaleString('es-PE')}
              </p>
            </div>
            <div className="card-premium rounded-2xl p-4 sm:p-5">
              <p className="text-[12px] sm:text-[12.5px] text-[#102A43]/70 font-medium">
                Diagnósticos distintos
              </p>
              <p className="font-mono-tabular text-xl sm:text-2xl font-bold text-[#102A43] mt-1.5">
                {summary.distintos.toLocaleString('es-PE')}
              </p>
            </div>
            <div className="card-premium rounded-2xl p-4 sm:p-5">
              <p className="text-[12px] sm:text-[12.5px] text-[#102A43]/70 font-medium">
                Población Femenina
              </p>
              <p className="font-mono-tabular text-xl sm:text-2xl font-bold text-[#F07832] mt-1.5">
                {summary.fem.toLocaleString('es-PE')}
              </p>
            </div>
            <div className="card-premium rounded-2xl p-4 sm:p-5">
              <p className="text-[12px] sm:text-[12.5px] text-[#102A43]/70 font-medium">
                Población Masculina
              </p>
              <p className="font-mono-tabular text-xl sm:text-2xl font-bold text-[#102A43] mt-1.5">
                {summary.masc.toLocaleString('es-PE')}
              </p>
            </div>
          </div>

          <div className="card-premium rounded-2xl p-5 sm:p-6">
            <h2 className="font-display text-base font-bold text-[#102A43] mb-4">
              Top 10 Diagnósticos CIE-10 (Distribución por Sexo)
            </h2>
            <div className="h-[300px] sm:h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={topDiagnoses}
                  layout="vertical"
                  margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 12, fill: '#102A43' }} />
                  <YAxis
                    type="category"
                    dataKey="codigoCie"
                    width={64}
                    tick={{ fontSize: 12, fill: '#102A43', fontWeight: 700 }}
                  />
                  <Tooltip
                    formatter={(value: unknown, name: unknown) => [
                      Number(value).toLocaleString('es-PE'),
                      String(name),
                    ]}
                    contentStyle={{
                      borderRadius: '12px',
                      border: '1px solid #CBD5E1',
                      fontSize: '12.5px',
                    }}
                  />
                  <Bar dataKey="femenino" name="Femenino" stackId="a" fill="#F07832" />
                  <Bar
                    dataKey="masculino"
                    name="Masculino"
                    stackId="a"
                    fill="#102A43"
                    radius={[0, 6, 6, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card-premium rounded-2xl overflow-hidden">
            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-[#102A43]/10">
              {filtered.slice(0, 80).map((row, idx) => (
                <div key={`${row.codigoCie}_${row.ipress}_mob_${idx}`} className="p-4 space-y-1.5 text-[12.5px]">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-mono-tabular font-bold text-[#F07832]">{row.codigoCie}</span>
                    <span className="font-mono-tabular font-bold text-[#102A43]">
                      Total: {row.total.toLocaleString('es-PE')}
                    </span>
                  </div>
                  <p className="font-semibold text-[#102A43]">{row.diagnostico}</p>
                  <div className="flex items-center justify-between text-[11.5px] text-[#102A43]/70">
                    <span>{row.microred} · {row.ipress}</span>
                    <span className="font-mono-tabular">
                      F: {row.femenino} · M: {row.masculino}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse text-[13.5px]">
                <thead>
                  <tr className="bg-[#F8F7F2] border-b border-[#102A43]/12 text-[#102A43]/80">
                    <th className="px-4 py-3 font-semibold">CIE-10</th>
                    <th className="px-4 py-3 font-semibold">Diagnóstico</th>
                    <th className="px-4 py-3 font-semibold">Microred</th>
                    <th className="px-4 py-3 font-semibold">IPRESS</th>
                    <th className="px-4 py-3 font-semibold text-right">Femenino</th>
                    <th className="px-4 py-3 font-semibold text-right">Masculino</th>
                    <th className="px-4 py-3 font-semibold text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#102A43]/8">
                  {filtered.slice(0, 150).map((row, idx) => (
                    <tr
                      key={`${row.codigoCie}_${row.ipress}_${idx}`}
                      className="hover:bg-[#F8F7F2]/70"
                    >
                      <td className="px-4 py-3 font-mono-tabular font-bold text-[#F07832]">
                        {row.codigoCie}
                      </td>
                      <td className="px-4 py-3 text-[#102A43]">{row.diagnostico}</td>
                      <td className="px-4 py-3 text-[#102A43]/75">{row.microred}</td>
                      <td className="px-4 py-3 text-[#102A43]/75">{row.ipress}</td>
                      <td className="px-4 py-3 text-right font-mono-tabular">
                        {row.femenino.toLocaleString('es-PE')}
                      </td>
                      <td className="px-4 py-3 text-right font-mono-tabular">
                        {row.masculino.toLocaleString('es-PE')}
                      </td>
                      <td className="px-4 py-3 text-right font-mono-tabular font-bold text-[#102A43]">
                        {row.total.toLocaleString('es-PE')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <ModuleDrivePanel
        targetModule="morbilidades"
        moduleLabel="Reporte de Morbilidades CIE-10"
        driveFiles={driveFiles}
        manualDocs={manualDocs}
        onPreviewFile={onPreviewFile}
      />
    </div>
  );
};
