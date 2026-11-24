import React, { useEffect, useMemo, useState } from 'react';
import {
  Download,
  Lock,
  Search,
  ShieldCheck,
  Upload,
  Users,
} from 'lucide-react';
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
import { fetchNominalModuleData, fetchPublicBatchRows } from '../services/firestoreService';
import {
  MICROREDES_RIS,
  ModuleId,
  NominalManifest,
  NominalRecord,
  PatientSummaryRow,
  PublicManifest,
  UserProfile,
} from '../types';

interface PatientsModuleProps {
  manifest?: PublicManifest;
  user: UserProfile | null;
  onOpenAuth: () => void;
  onNavigate: (module: ModuleId) => void;
}

export const PatientsModule: React.FC<PatientsModuleProps> = ({
  manifest,
  user,
  onOpenAuth,
  onNavigate,
}) => {
  const [viewMode, setViewMode] = useState<'agregado' | 'nominal'>('agregado');
  const [summaryRows, setSummaryRows] = useState<PatientSummaryRow[]>([]);
  const [nominalManifest, setNominalManifest] = useState<NominalManifest | null>(null);
  const [nominalRows, setNominalRows] = useState<NominalRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingNominal, setLoadingNominal] = useState(false);
  const [selectedMicrored, setSelectedMicrored] = useState<string>('Todas');
  const [searchTerm, setSearchTerm] = useState('');

  const canAccessNominal = Boolean(user && (user.role === 'admin' || user.nominalAccess));

  useEffect(() => {
    let active = true;
    async function load() {
      if (!manifest) {
        setSummaryRows([]);
        return;
      }
      setLoading(true);
      try {
        const rows = await fetchPublicBatchRows<PatientSummaryRow>(manifest);
        if (active) setSummaryRows(rows);
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [manifest]);

  useEffect(() => {
    let active = true;
    async function loadNominal() {
      if (viewMode !== 'nominal' || !canAccessNominal) return;
      setLoadingNominal(true);
      try {
        const res = await fetchNominalModuleData('pacientes');
        if (active) {
          setNominalManifest(res.manifest);
          setNominalRows(res.rows);
        }
      } finally {
        if (active) setLoadingNominal(false);
      }
    }
    loadNominal();
    return () => {
      active = false;
    };
  }, [viewMode, canAccessNominal]);

  const filteredSummary = useMemo(() => {
    return summaryRows.filter((r) => {
      const matchMr = selectedMicrored === 'Todas' || r.microred === selectedMicrored;
      const q = searchTerm.trim().toLowerCase();
      const matchSearch =
        !q ||
        r.ipress.toLowerCase().includes(q) ||
        r.microred.toLowerCase().includes(q);
      return matchMr && matchSearch;
    });
  }, [summaryRows, selectedMicrored, searchTerm]);

  const totals = useMemo(() => {
    return filteredSummary.reduce(
      (acc, r) => ({
        atendidos: acc.atendidos + r.adultosAtendidos,
        iniciados: acc.iniciados + r.paqueteIniciado,
        completos: acc.completos + r.paqueteCompleto,
        pendientes: acc.pendientes + r.pendientesSeguimiento,
      }),
      { atendidos: 0, iniciados: 0, completos: 0, pendientes: 0 }
    );
  }, [filteredSummary]);

  const chartData = useMemo(() => {
    const byMr = new Map<string, { microred: string; completos: number; iniciados: number }>();
    for (const r of filteredSummary) {
      const curr = byMr.get(r.microred) || {
        microred: r.microred,
        completos: 0,
        iniciados: 0,
      };
      curr.completos += r.paqueteCompleto;
      curr.iniciados += r.paqueteIniciado;
      byMr.set(r.microred, curr);
    }
    return Array.from(byMr.values());
  }, [filteredSummary]);

  const filteredNominal = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return nominalRows.filter((row) => {
      const vals = Object.values(row).map((v) => String(v ?? '').toLowerCase());
      const matchMr =
        selectedMicrored === 'Todas' ||
        vals.some((v) => v.includes(selectedMicrored.toLowerCase()));
      const matchQ = !q || vals.some((v) => v.includes(q));
      return matchMr && matchQ;
    });
  }, [nominalRows, selectedMicrored, searchTerm]);

  const nominalHeaders = useMemo(() => {
    if (nominalManifest?.columnHeaders?.length) return nominalManifest.columnHeaders.slice(0, 10);
    if (nominalRows.length > 0) return Object.keys(nominalRows[0]).slice(0, 10);
    return [];
  }, [nominalManifest, nominalRows]);

  return (
    <div className="space-y-6">
      {/* Header Toolbar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-[#123B72]">
            Seguimiento por Pacientes (30 a 59 años)
          </h1>
          <p className="text-[13.5px] text-slate-600 mt-1">
            Control de paquetes de atención integral, tamizajes ENT, salud mental y seguimiento por
            establecimiento.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center p-1 bg-[#F5F3EE] rounded-xl border border-slate-200/80">
            <button
              type="button"
              onClick={() => setViewMode('agregado')}
              className={`px-3.5 py-1.5 rounded-lg text-[13px] font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                viewMode === 'agregado'
                  ? 'bg-white text-[#123B72] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Resumen Agregado
            </button>
            <button
              type="button"
              onClick={() => setViewMode('nominal')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[13px] font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                viewMode === 'nominal'
                  ? 'bg-white text-[#123B72] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {!canAccessNominal && <Lock className="w-3.5 h-3.5 text-slate-500" />}
              <span>Padrón Nominal</span>
            </button>
          </div>

          {viewMode === 'agregado' && filteredSummary.length > 0 && (
            <button
              type="button"
              onClick={() =>
                exportRowsToExcel(
                  filteredSummary as unknown as Record<string, unknown>[],
                  'RIS_San_Ignacio_Seguimiento_Agregado',
                  'Seguimiento'
                )
              }
              className="inline-flex items-center gap-2 bg-white hover:bg-slate-50 border border-slate-200 text-[#123B57] font-semibold text-[13px] px-3.5 py-2 rounded-xl transition-colors whitespace-nowrap cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Exportar Excel</span>
            </button>
          )}

          {viewMode === 'nominal' && canAccessNominal && filteredNominal.length > 0 && (
            <button
              type="button"
              onClick={() =>
                exportRowsToExcel(
                  filteredNominal as Record<string, unknown>[],
                  'RIS_San_Ignacio_Padron_Nominal',
                  'Nominal'
                )
              }
              className="inline-flex items-center gap-2 bg-[#25804A] hover:bg-[#1f6d3f] text-white font-semibold text-[13px] px-3.5 py-2 rounded-xl transition-colors whitespace-nowrap cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Exportar Nominal</span>
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={
              viewMode === 'nominal'
                ? 'Buscar por DNI, nombre de paciente o IPRESS...'
                : 'Buscar por IPRESS o microred...'
            }
            className="w-full pl-10 pr-4 py-2.5 text-[13.5px] bg-[#F5F3EE]/60 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#123B72]/30"
          />
        </div>

        <select
          value={selectedMicrored}
          onChange={(e) => setSelectedMicrored(e.target.value)}
          aria-label="Filtrar por microred"
          className="px-3.5 py-2.5 text-[13.5px] bg-white border border-slate-200 rounded-xl text-[#123B57] font-medium focus:outline-none focus:ring-2 focus:ring-[#123B72]/30"
        >
          <option value="Todas">Todas las microredes (7 + externos)</option>
          {MICROREDES_RIS.map((mr) => (
            <option key={mr} value={mr}>
              Microred {mr}
            </option>
          ))}
          <option value="Externos">Externos</option>
        </select>
      </div>

      {/* Nominal View Gate */}
      {viewMode === 'nominal' ? (
        !canAccessNominal ? (
          <div className="bg-white rounded-2xl border border-slate-200/80 p-8 sm:p-10 text-center max-w-2xl mx-auto">
            <div className="w-12 h-12 rounded-2xl bg-[#123B72]/10 text-[#123B72] flex items-center justify-center mx-auto mb-4">
              <Lock className="w-6 h-6" />
            </div>
            <h2 className="font-display text-lg font-bold text-[#123B72] mb-2">
              Acceso Restringido a Datos Nominales
            </h2>
            <p className="text-[14px] text-slate-600 leading-relaxed mb-6">
              Por protección de datos personales (PII), el listado nominal por DNI y paciente solo
              está disponible para personal autorizado de la RIS San Ignacio. Los resúmenes
              agregados por IPRESS permanecen de acceso libre.
            </p>
            {!user ? (
              <button
                type="button"
                onClick={onOpenAuth}
                className="inline-flex items-center gap-2 bg-[#123B72] hover:bg-[#0e2f5c] text-white font-semibold text-[13.5px] px-5 py-2.5 rounded-xl transition-colors cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Iniciar sesión institucional</span>
              </button>
            ) : (
              <p className="text-[13px] font-medium text-[#25804A] bg-[#25804A]/8 px-4 py-2.5 rounded-xl inline-block">
                Sesión iniciada como {user.email}. Solicite al administrador habilitar su Acceso
                Nominal.
              </p>
            )}
          </div>
        ) : loadingNominal ? (
          <div className="bg-white rounded-2xl border border-slate-200/80 p-10 text-center text-slate-500 text-sm">
            Cargando padrón nominal protegido desde Firestore...
          </div>
        ) : filteredNominal.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200/80 p-10 text-center">
            <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <h3 className="font-display text-base font-bold text-[#123B57] mb-1">
              Sin registros nominales publicados aún
            </h3>
            <p className="text-sm text-slate-500 mb-5">
              Suba un archivo Excel de seguimiento nominal desde el panel de Administración.
            </p>
            {user?.role === 'admin' && (
              <button
                type="button"
                onClick={() => onNavigate('admin')}
                className="inline-flex items-center gap-2 bg-[#123B72] text-white text-sm font-semibold px-4 py-2 rounded-xl cursor-pointer"
              >
                <Upload className="w-4 h-4" />
                <span>Ir a Administración</span>
              </button>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200/80 flex items-center justify-between text-xs text-slate-500">
              <span>
                Mostrando <strong className="font-mono-tabular text-[#123B72]">{filteredNominal.length}</strong>{' '}
                registros nominales
              </span>
              <span>Archivo: {nominalManifest?.fileName}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-[13px]">
                <thead>
                  <tr className="bg-[#F5F3EE] border-b border-slate-200 text-slate-600">
                    {nominalHeaders.map((h) => (
                      <th key={h} className="px-4 py-3 font-semibold whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredNominal.slice(0, 150).map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/80">
                      {nominalHeaders.map((h) => (
                        <td
                          key={h}
                          className="px-4 py-2.5 text-slate-700 whitespace-nowrap font-mono-tabular text-[12.5px]"
                        >
                          {String(row[h] ?? '—')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : loading ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-10 text-center text-slate-500 text-sm">
          Sincronizando resumen de seguimiento...
        </div>
      ) : filteredSummary.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-10 text-center">
          <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h2 className="font-display text-lg font-bold text-[#123B57] mb-1.5">
            Pendiente de publicación inicial de Seguimiento
          </h2>
          <p className="text-[13.5px] text-slate-500 max-w-lg mx-auto mb-5">
            Cuando el coordinador de la RIS San Ignacio publique el consolidado Excel de pacientes
            adultos (30–59 años), aquí se mostrarán los totales agregados por Microred e IPRESS sin
            exponer datos personales.
          </p>
          {user?.role === 'admin' && (
            <button
              type="button"
              onClick={() => onNavigate('admin')}
              className="inline-flex items-center gap-2 bg-[#123B72] hover:bg-[#0e2f5c] text-white text-sm font-semibold px-4 py-2.5 rounded-xl cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              <span>Cargar archivo Excel en Administración</span>
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Summary KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5">
              <p className="text-[12.5px] text-slate-500 font-medium">Adultos atendidos</p>
              <p className="font-mono-tabular text-2xl font-bold text-[#123B72] mt-1.5">
                {totals.atendidos.toLocaleString('es-PE')}
              </p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5">
              <p className="text-[12.5px] text-slate-500 font-medium">Paquetes completos (TA)</p>
              <p className="font-mono-tabular text-2xl font-bold text-[#25804A] mt-1.5">
                {totals.completos.toLocaleString('es-PE')}
              </p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5">
              <p className="text-[12.5px] text-slate-500 font-medium">Paquetes en proceso</p>
              <p className="font-mono-tabular text-2xl font-bold text-[#123B57] mt-1.5">
                {totals.iniciados.toLocaleString('es-PE')}
              </p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5">
              <p className="text-[12.5px] text-slate-500 font-medium">Pendientes de seguimiento</p>
              <p className="font-mono-tabular text-2xl font-bold text-[#C74747] mt-1.5">
                {totals.pendientes.toLocaleString('es-PE')}
              </p>
            </div>
          </div>

          {/* Chart */}
          {chartData.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6">
              <h2 className="font-display text-base font-bold text-[#123B57] mb-4">
                Estado del Paquete Integral por Microred
              </h2>
              <div className="h-[260px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                    <XAxis dataKey="microred" tick={{ fontSize: 12, fill: '#475569' }} />
                    <YAxis tick={{ fontSize: 12, fill: '#475569' }} />
                    <Tooltip
                      contentStyle={{
                        borderRadius: '12px',
                        border: '1px solid #E2E8F0',
                        fontSize: '12.5px',
                      }}
                    />
                    <Bar
                      dataKey="completos"
                      name="Paquete Completo"
                      fill="#25804A"
                      radius={[6, 6, 0, 0]}
                    />
                    <Bar
                      dataKey="iniciados"
                      name="En Proceso"
                      fill="#123B72"
                      radius={[6, 6, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Table */}
          <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-[13.5px]">
                <thead>
                  <tr className="bg-[#F5F3EE] border-b border-slate-200 text-slate-600">
                    <th className="px-4 py-3 font-semibold">Microred</th>
                    <th className="px-4 py-3 font-semibold">IPRESS / Establecimiento</th>
                    <th className="px-4 py-3 font-semibold text-right">Atendidos</th>
                    <th className="px-4 py-3 font-semibold text-right">Paquete Completo</th>
                    <th className="px-4 py-3 font-semibold text-right">En Proceso</th>
                    <th className="px-4 py-3 font-semibold text-right">Tamizaje ENT</th>
                    <th className="px-4 py-3 font-semibold text-right">Pendientes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredSummary.map((row, idx) => (
                    <tr key={`${row.microred}_${row.ipress}_${idx}`} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-medium text-[#123B57]">{row.microred}</td>
                      <td className="px-4 py-3 text-slate-700">{row.ipress}</td>
                      <td className="px-4 py-3 text-right font-mono-tabular">
                        {row.adultosAtendidos.toLocaleString('es-PE')}
                      </td>
                      <td className="px-4 py-3 text-right font-mono-tabular text-[#25804A] font-semibold">
                        {row.paqueteCompleto.toLocaleString('es-PE')}
                      </td>
                      <td className="px-4 py-3 text-right font-mono-tabular">
                        {row.paqueteIniciado.toLocaleString('es-PE')}
                      </td>
                      <td className="px-4 py-3 text-right font-mono-tabular">
                        {row.tamizajeEnt.toLocaleString('es-PE')}
                      </td>
                      <td className="px-4 py-3 text-right font-mono-tabular text-[#C74747] font-semibold">
                        {row.pendientesSeguimiento.toLocaleString('es-PE')}
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
