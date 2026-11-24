import React, { useEffect, useMemo, useState } from 'react';
import { Activity, Download, Search, Upload } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { exportRowsToExcel } from '../services/excelAnalyzers';
import { fetchPublicBatchRows } from '../services/firestoreService';
import {
  MICROREDES_RIS,
  ModuleId,
  MorbidityRow,
  PublicManifest,
  UserProfile,
} from '../types';

interface MorbiditiesModuleProps {
  manifest?: PublicManifest;
  user: UserProfile | null;
  onNavigate: (module: ModuleId) => void;
}

export const MorbiditiesModule: React.FC<MorbiditiesModuleProps> = ({
  manifest,
  user,
  onNavigate,
}) => {
  const [rows, setRows] = useState<MorbidityRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedMicrored, setSelectedMicrored] = useState('Todas');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    let active = true;
    async function load() {
      if (!manifest) {
        setRows([]);
        return;
      }
      setLoading(true);
      try {
        const data = await fetchPublicBatchRows<MorbidityRow>(manifest);
        if (active) setRows(data);
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [manifest]);

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

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-[#123B72]">
            Reporte de Morbilidades del Adulto (CIE-10)
          </h1>
          <p className="text-[13.5px] text-slate-600 mt-1">
            Perfil epidemiológico consolidado de diagnósticos frecuentes por microred, IPRESS y
            sexo.
          </p>
        </div>

        {filtered.length > 0 && (
          <button
            type="button"
            onClick={() =>
              exportRowsToExcel(
                filtered as unknown as Record<string, unknown>[],
                'RIS_San_Ignacio_Morbilidades_Adulto',
                'Morbilidades'
              )
            }
            className="inline-flex items-center gap-2 bg-[#123B72] hover:bg-[#0e2f5c] text-white font-semibold text-[13px] px-4 py-2.5 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Exportar Excel</span>
          </button>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por código CIE-10, diagnóstico o IPRESS..."
            className="w-full pl-10 pr-4 py-2.5 text-[13.5px] bg-[#F5F3EE]/60 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#123B72]/30"
          />
        </div>
        <select
          value={selectedMicrored}
          onChange={(e) => setSelectedMicrored(e.target.value)}
          aria-label="Filtrar por microred"
          className="px-3.5 py-2.5 text-[13.5px] bg-white border border-slate-200 rounded-xl text-[#123B57] font-medium focus:outline-none focus:ring-2 focus:ring-[#123B72]/30"
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
        <div className="bg-white rounded-2xl border border-slate-200/80 p-10 text-center text-slate-500 text-sm">
          Cargando perfil de morbilidades...
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-10 text-center">
          <Activity className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h2 className="font-display text-lg font-bold text-[#123B57] mb-1.5">
            Sin datos de morbilidades publicados aún
          </h2>
          <p className="text-[13.5px] text-slate-500 max-w-lg mx-auto mb-5">
            Publique el consolidado Excel de morbilidades desde Administración para visualizar el
            ranking CIE-10 y los gráficos comparativos por sexo y microred.
          </p>
          {user?.role === 'admin' && (
            <button
              type="button"
              onClick={() => onNavigate('admin')}
              className="inline-flex items-center gap-2 bg-[#123B72] text-white text-sm font-semibold px-4 py-2.5 rounded-xl cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              <span>Cargar Morbilidades</span>
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5">
              <p className="text-[12.5px] text-slate-500 font-medium">Total de atenciones CIE-10</p>
              <p className="font-mono-tabular text-2xl font-bold text-[#123B72] mt-1.5">
                {summary.total.toLocaleString('es-PE')}
              </p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5">
              <p className="text-[12.5px] text-slate-500 font-medium">Diagnósticos distintos</p>
              <p className="font-mono-tabular text-2xl font-bold text-[#123B57] mt-1.5">
                {summary.distintos.toLocaleString('es-PE')}
              </p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5">
              <p className="text-[12.5px] text-slate-500 font-medium">Población Femenina</p>
              <p className="font-mono-tabular text-2xl font-bold text-[#25804A] mt-1.5">
                {summary.fem.toLocaleString('es-PE')}
              </p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5">
              <p className="text-[12.5px] text-slate-500 font-medium">Población Masculina</p>
              <p className="font-mono-tabular text-2xl font-bold text-[#E7B83D] mt-1.5">
                {summary.masc.toLocaleString('es-PE')}
              </p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6">
            <h2 className="font-display text-base font-bold text-[#123B57] mb-4">
              Top 10 Diagnósticos CIE-10 (Distribución por Sexo)
            </h2>
            <div className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={topDiagnoses}
                  layout="vertical"
                  margin={{ top: 5, right: 24, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 12, fill: '#475569' }} />
                  <YAxis
                    type="category"
                    dataKey="codigoCie"
                    width={64}
                    tick={{ fontSize: 12, fill: '#123B57', fontWeight: 600 }}
                  />
                  <Tooltip
                    formatter={(value: unknown, name: unknown) => [
                      Number(value).toLocaleString('es-PE'),
                      String(name),
                    ]}
                    contentStyle={{
                      borderRadius: '12px',
                      border: '1px solid #E2E8F0',
                      fontSize: '12.5px',
                    }}
                  />
                  <Bar dataKey="femenino" name="Femenino" stackId="a" fill="#25804A" />
                  <Bar
                    dataKey="masculino"
                    name="Masculino"
                    stackId="a"
                    fill="#123B72"
                    radius={[0, 6, 6, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-[13.5px]">
                <thead>
                  <tr className="bg-[#F5F3EE] border-b border-slate-200 text-slate-600">
                    <th className="px-4 py-3 font-semibold">CIE-10</th>
                    <th className="px-4 py-3 font-semibold">Diagnóstico</th>
                    <th className="px-4 py-3 font-semibold">Microred</th>
                    <th className="px-4 py-3 font-semibold">IPRESS</th>
                    <th className="px-4 py-3 font-semibold text-right">Femenino</th>
                    <th className="px-4 py-3 font-semibold text-right">Masculino</th>
                    <th className="px-4 py-3 font-semibold text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.slice(0, 150).map((row, idx) => (
                    <tr key={`${row.codigoCie}_${row.ipress}_${idx}`} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-mono-tabular font-bold text-[#123B72]">
                        {row.codigoCie}
                      </td>
                      <td className="px-4 py-3 text-slate-800">{row.diagnostico}</td>
                      <td className="px-4 py-3 text-slate-600">{row.microred}</td>
                      <td className="px-4 py-3 text-slate-600">{row.ipress}</td>
                      <td className="px-4 py-3 text-right font-mono-tabular">
                        {row.femenino.toLocaleString('es-PE')}
                      </td>
                      <td className="px-4 py-3 text-right font-mono-tabular">
                        {row.masculino.toLocaleString('es-PE')}
                      </td>
                      <td className="px-4 py-3 text-right font-mono-tabular font-bold text-[#123B57]">
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
    </div>
  );
};
