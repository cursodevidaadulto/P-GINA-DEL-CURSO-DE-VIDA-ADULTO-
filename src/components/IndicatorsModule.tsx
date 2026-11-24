import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart2,
  CheckCircle2,
  Clock,
  Download,
  Search,
  Upload,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { exportRowsToExcel } from '../services/excelAnalyzers';
import { fetchPublicBatchRows } from '../services/firestoreService';
import {
  IndicatorRow,
  MICROREDES_RIS,
  ModuleId,
  PublicManifest,
  UserProfile,
} from '../types';

interface IndicatorsModuleProps {
  manifest?: PublicManifest;
  initialMicrored?: string;
  user: UserProfile | null;
  onNavigate: (module: ModuleId) => void;
}

export const IndicatorsModule: React.FC<IndicatorsModuleProps> = ({
  manifest,
  initialMicrored,
  user,
  onNavigate,
}) => {
  const [rows, setRows] = useState<IndicatorRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedMicrored, setSelectedMicrored] = useState(initialMicrored || 'Todas');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (initialMicrored) {
      setSelectedMicrored(initialMicrored);
    }
  }, [initialMicrored]);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!manifest) {
        setRows([]);
        return;
      }
      setLoading(true);
      try {
        const data = await fetchPublicBatchRows<IndicatorRow>(manifest);
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
        r.indicador.toLowerCase().includes(q) ||
        r.ipress.toLowerCase().includes(q);
      return matchMr && matchQ;
    });
  }, [rows, selectedMicrored, searchTerm]);

  const microredChart = useMemo(() => {
    const map = new Map<string, { microred: string; num: number; den: number }>();
    for (const r of filtered) {
      const curr = map.get(r.microred) || { microred: r.microred, num: 0, den: 0 };
      curr.num += r.numerador;
      curr.den += r.denominador;
      map.set(r.microred, curr);
    }
    return Array.from(map.values()).map((m) => ({
      microred: m.microred,
      cobertura: m.den > 0 ? Number(((m.num / m.den) * 100).toFixed(1)) : 0,
    }));
  }, [filtered]);

  const kpis = useMemo(() => {
    const num = filtered.reduce((s, r) => s + r.numerador, 0);
    const den = filtered.reduce((s, r) => s + r.denominador, 0);
    const globalPct = den > 0 ? Number(((num / den) * 100).toFixed(1)) : 0;
    const optimos = filtered.filter((r) => r.estado === 'Óptimo').length;
    const riesgo = filtered.filter((r) => r.estado === 'Riesgo').length;
    return { globalPct, optimos, riesgo, total: filtered.length };
  }, [filtered]);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-[#123B72]">
            Monitoreo de Indicadores · Curso de Vida Adulto
          </h1>
          <p className="text-[13.5px] text-slate-600 mt-1">
            Seguimiento de metas sanitarias, cobertura de paquete integral y tamizajes en las siete
            microredes.
          </p>
        </div>

        {filtered.length > 0 && (
          <button
            type="button"
            onClick={() =>
              exportRowsToExcel(
                filtered as unknown as Record<string, unknown>[],
                'RIS_San_Ignacio_Indicadores_Adulto',
                'Indicadores'
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
            placeholder="Buscar indicador o IPRESS..."
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
          Cargando indicadores de desempeño...
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-10 text-center">
          <BarChart2 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h2 className="font-display text-lg font-bold text-[#123B57] mb-1.5">
            Sin indicadores publicados todavía
          </h2>
          <p className="text-[13.5px] text-slate-500 max-w-lg mx-auto mb-5">
            Cuando se cargue la matriz Excel de indicadores del Curso de Vida Adulto en
            Administración, podrá monitorear el avance porcentual y brechas por microred e IPRESS.
          </p>
          {user?.role === 'admin' && (
            <button
              type="button"
              onClick={() => onNavigate('admin')}
              className="inline-flex items-center gap-2 bg-[#123B72] text-white text-sm font-semibold px-4 py-2.5 rounded-xl cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              <span>Cargar Indicadores</span>
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5">
              <p className="text-[12.5px] text-slate-500 font-medium">Cobertura global</p>
              <p className="font-mono-tabular text-2xl font-bold text-[#123B72] mt-1.5">
                {kpis.globalPct}%
              </p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5">
              <p className="text-[12.5px] text-slate-500 font-medium">Filas evaluadas</p>
              <p className="font-mono-tabular text-2xl font-bold text-[#123B57] mt-1.5">
                {kpis.total.toLocaleString('es-PE')}
              </p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5">
              <p className="text-[12.5px] text-slate-500 font-medium">En nivel Óptimo</p>
              <p className="font-mono-tabular text-2xl font-bold text-[#25804A] mt-1.5">
                {kpis.optimos.toLocaleString('es-PE')}
              </p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5">
              <p className="text-[12.5px] text-slate-500 font-medium">En situación de Riesgo</p>
              <p className="font-mono-tabular text-2xl font-bold text-[#C74747] mt-1.5">
                {kpis.riesgo.toLocaleString('es-PE')}
              </p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6">
            <h2 className="font-display text-base font-bold text-[#123B57] mb-4">
              Avance Porcentual Promedio por Microred (%)
            </h2>
            <div className="h-[270px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={microredChart} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis dataKey="microred" tick={{ fontSize: 12, fill: '#475569' }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: '#475569' }} />
                  <Tooltip
                    formatter={(val: unknown) => [`${val}%`, 'Cobertura']}
                    contentStyle={{
                      borderRadius: '12px',
                      border: '1px solid #E2E8F0',
                      fontSize: '12.5px',
                    }}
                  />
                  <ReferenceLine y={75} stroke="#25804A" strokeDasharray="4 4" />
                  <Bar
                    dataKey="cobertura"
                    name="Cobertura (%)"
                    fill="#123B72"
                    radius={[6, 6, 0, 0]}
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
                    <th className="px-4 py-3 font-semibold">Indicador</th>
                    <th className="px-4 py-3 font-semibold">Microred</th>
                    <th className="px-4 py-3 font-semibold">IPRESS</th>
                    <th className="px-4 py-3 font-semibold text-right">Num. / Den.</th>
                    <th className="px-4 py-3 font-semibold text-right">Meta</th>
                    <th className="px-4 py-3 font-semibold text-right">Avance</th>
                    <th className="px-4 py-3 font-semibold">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((row, idx) => (
                    <tr key={`${row.indicadorId}_${row.ipress}_${idx}`} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-medium text-[#123B57] max-w-xs">
                        {row.indicador}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{row.microred}</td>
                      <td className="px-4 py-3 text-slate-600">{row.ipress}</td>
                      <td className="px-4 py-3 text-right font-mono-tabular">
                        {row.numerador.toLocaleString('es-PE')} /{' '}
                        {row.denominador.toLocaleString('es-PE')}
                      </td>
                      <td className="px-4 py-3 text-right font-mono-tabular">{row.metaPct}%</td>
                      <td className="px-4 py-3 text-right font-mono-tabular font-bold text-[#123B72]">
                        {row.avancePct}%
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1.5 text-[12.5px] font-semibold ${
                            row.estado === 'Óptimo'
                              ? 'text-[#25804A]'
                              : row.estado === 'En proceso'
                              ? 'text-[#A67C0E]'
                              : 'text-[#C74747]'
                          }`}
                        >
                          {row.estado === 'Óptimo' ? (
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          ) : row.estado === 'En proceso' ? (
                            <Clock className="w-3.5 h-3.5" />
                          ) : (
                            <AlertTriangle className="w-3.5 h-3.5" />
                          )}
                          <span>{row.estado}</span>
                        </span>
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
