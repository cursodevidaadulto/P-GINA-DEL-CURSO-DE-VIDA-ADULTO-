import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ClipboardCheck,
  Download,
  Lock,
  Search,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { exportRowsToExcel } from '../services/excelAnalyzers';
import { fetchNominalModuleData, fetchPublicBatchRows } from '../services/firestoreService';
import {
  MICROREDES_RIS,
  ModuleId,
  NominalManifest,
  NominalRecord,
  PublicManifest,
  QualitySummaryRow,
  UserProfile,
} from '../types';

interface QualityModuleProps {
  manifest?: PublicManifest;
  user: UserProfile | null;
  onOpenAuth: () => void;
  onNavigate: (module: ModuleId) => void;
}

export const QualityModule: React.FC<QualityModuleProps> = ({
  manifest,
  user,
  onOpenAuth,
  onNavigate,
}) => {
  const [viewMode, setViewMode] = useState<'resumen' | 'detalle'>('resumen');
  const [summaryRows, setSummaryRows] = useState<QualitySummaryRow[]>([]);
  const [nominalManifest, setNominalManifest] = useState<NominalManifest | null>(null);
  const [nominalRows, setNominalRows] = useState<NominalRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingNominal, setLoadingNominal] = useState(false);
  const [selectedMicrored, setSelectedMicrored] = useState('Todas');
  const [searchTerm, setSearchTerm] = useState('');

  const canAccessDetail = Boolean(user && (user.role === 'admin' || user.nominalAccess));

  useEffect(() => {
    let active = true;
    async function load() {
      if (!manifest) {
        setSummaryRows([]);
        return;
      }
      setLoading(true);
      try {
        const rows = await fetchPublicBatchRows<QualitySummaryRow>(manifest);
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
    async function loadDetail() {
      if (viewMode !== 'detalle' || !canAccessDetail) return;
      setLoadingNominal(true);
      try {
        const res = await fetchNominalModuleData('calidad');
        if (active) {
          setNominalManifest(res.manifest);
          setNominalRows(res.rows);
        }
      } finally {
        if (active) setLoadingNominal(false);
      }
    }
    loadDetail();
    return () => {
      active = false;
    };
  }, [viewMode, canAccessDetail]);

  const filteredSummary = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return summaryRows.filter((r) => {
      const matchMr = selectedMicrored === 'Todas' || r.microred === selectedMicrored;
      const matchQ =
        !q ||
        r.ipress.toLowerCase().includes(q) ||
        r.principalObservacion.toLowerCase().includes(q);
      return matchMr && matchQ;
    });
  }, [summaryRows, selectedMicrored, searchTerm]);

  const kpis = useMemo(() => {
    const evaluados = filteredSummary.reduce((s, r) => s + r.registrosEvaluados, 0);
    const conformes = filteredSummary.reduce((s, r) => s + r.conformes, 0);
    const observados = filteredSummary.reduce((s, r) => s + r.observados, 0);
    const tasa = evaluados > 0 ? Number(((conformes / evaluados) * 100).toFixed(1)) : 0;
    return { evaluados, conformes, observados, tasa };
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
      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-[#123B72]">
            Control de Calidad de Registro HIS
          </h1>
          <p className="text-[13.5px] text-slate-600 mt-1">
            Auditoría de consistencia de códigos HIS, campos LAB, tipo de diagnóstico y duplicidades.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center p-1 bg-[#F5F3EE] rounded-xl border border-slate-200/80">
            <button
              type="button"
              onClick={() => setViewMode('resumen')}
              className={`px-3.5 py-1.5 rounded-lg text-[13px] font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                viewMode === 'resumen'
                  ? 'bg-white text-[#123B72] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Resumen por IPRESS
            </button>
            <button
              type="button"
              onClick={() => setViewMode('detalle')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[13px] font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                viewMode === 'detalle'
                  ? 'bg-white text-[#123B72] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {!canAccessDetail && <Lock className="w-3.5 h-3.5 text-slate-500" />}
              <span>Detalle de Observaciones</span>
            </button>
          </div>

          {viewMode === 'resumen' && filteredSummary.length > 0 && (
            <button
              type="button"
              onClick={() =>
                exportRowsToExcel(
                  filteredSummary as unknown as Record<string, unknown>[],
                  'RIS_San_Ignacio_Control_Calidad_Resumen',
                  'Calidad'
                )
              }
              className="inline-flex items-center gap-2 bg-white hover:bg-slate-50 border border-slate-200 text-[#123B57] font-semibold text-[13px] px-3.5 py-2 rounded-xl transition-colors whitespace-nowrap cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Exportar Resumen</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Filtrar por IPRESS o tipo de observación HIS..."
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

      {viewMode === 'detalle' ? (
        !canAccessDetail ? (
          <div className="bg-white rounded-2xl border border-slate-200/80 p-8 sm:p-10 text-center max-w-2xl mx-auto">
            <div className="w-12 h-12 rounded-2xl bg-[#123B72]/10 text-[#123B72] flex items-center justify-center mx-auto mb-4">
              <Lock className="w-6 h-6" />
            </div>
            <h2 className="font-display text-lg font-bold text-[#123B72] mb-2">
              Inicie sesión para ver el detalle nominal de calidad
            </h2>
            <p className="text-[14px] text-slate-600 leading-relaxed mb-6">
              El detalle fila por fila contiene identificadores de ficha, digitador o paciente. Para
              consultarlo necesita una cuenta institucional con Acceso Nominal autorizado.
            </p>
            {!user ? (
              <button
                type="button"
                onClick={onOpenAuth}
                className="inline-flex items-center gap-2 bg-[#123B72] hover:bg-[#0e2f5c] text-white font-semibold text-[13.5px] px-5 py-2.5 rounded-xl cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Iniciar sesión institucional</span>
              </button>
            ) : (
              <p className="text-[13px] font-medium text-[#25804A] bg-[#25804A]/8 px-4 py-2.5 rounded-xl inline-block">
                Usuario conectado: {user.email} (Requiere habilitación de Acceso Nominal).
              </p>
            )}
          </div>
        ) : loadingNominal ? (
          <div className="bg-white rounded-2xl border border-slate-200/80 p-10 text-center text-slate-500 text-sm">
            Cargando observaciones detalladas de calidad...
          </div>
        ) : filteredNominal.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200/80 p-10 text-center">
            <ClipboardCheck className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <h3 className="font-display text-base font-bold text-[#123B57]">
              Sin detalle de auditoría cargado
            </h3>
            <p className="text-sm text-slate-500 mt-1">
              Cargue la sábana de control de calidad HIS en el módulo Administración.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200/80 flex items-center justify-between text-xs text-slate-500">
              <span>
                Registros detallados:{' '}
                <strong className="font-mono-tabular text-[#123B72]">{filteredNominal.length}</strong>
              </span>
              <button
                type="button"
                onClick={() =>
                  exportRowsToExcel(
                    filteredNominal as Record<string, unknown>[],
                    'RIS_San_Ignacio_Calidad_Detalle',
                    'Observaciones'
                  )
                }
                className="text-[#123B72] font-semibold hover:underline cursor-pointer"
              >
                Descargar XLSX
              </button>
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
                    <tr key={idx} className="hover:bg-slate-50/70">
                      {nominalHeaders.map((h) => (
                        <td key={h} className="px-4 py-2.5 text-slate-700 whitespace-nowrap">
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
          Cargando resumen de control de calidad...
        </div>
      ) : filteredSummary.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-10 text-center">
          <ClipboardCheck className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h2 className="font-display text-lg font-bold text-[#123B57] mb-1.5">
            Sin reportes de Control de Calidad publicados
          </h2>
          <p className="text-[13.5px] text-slate-500 max-w-lg mx-auto mb-5">
            Una vez publicada la auditoría HIS desde Administración, podrá consultar la tasa de
            conformidad por establecimiento y las observaciones más frecuentes.
          </p>
          {user?.role === 'admin' && (
            <button
              type="button"
              onClick={() => onNavigate('admin')}
              className="inline-flex items-center gap-2 bg-[#123B72] text-white text-sm font-semibold px-4 py-2.5 rounded-xl cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              <span>Publicar reporte de calidad</span>
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5">
              <p className="text-[12.5px] text-slate-500 font-medium">Registros evaluados</p>
              <p className="font-mono-tabular text-2xl font-bold text-[#123B72] mt-1.5">
                {kpis.evaluados.toLocaleString('es-PE')}
              </p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5">
              <p className="text-[12.5px] text-slate-500 font-medium">Registros conformes</p>
              <p className="font-mono-tabular text-2xl font-bold text-[#25804A] mt-1.5">
                {kpis.conformes.toLocaleString('es-PE')}
              </p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5">
              <p className="text-[12.5px] text-slate-500 font-medium">Observados por corregir</p>
              <p className="font-mono-tabular text-2xl font-bold text-[#C74747] mt-1.5">
                {kpis.observados.toLocaleString('es-PE')}
              </p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5">
              <p className="text-[12.5px] text-slate-500 font-medium">Tasa de conformidad</p>
              <p className="font-mono-tabular text-2xl font-bold text-[#123B57] mt-1.5">
                {kpis.tasa}%
              </p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-[13.5px]">
                <thead>
                  <tr className="bg-[#F5F3EE] border-b border-slate-200 text-slate-600">
                    <th className="px-4 py-3 font-semibold">Microred</th>
                    <th className="px-4 py-3 font-semibold">IPRESS</th>
                    <th className="px-4 py-3 font-semibold text-right">Evaluados</th>
                    <th className="px-4 py-3 font-semibold text-right">Conformes</th>
                    <th className="px-4 py-3 font-semibold text-right">Observados</th>
                    <th className="px-4 py-3 font-semibold text-right">Conformidad</th>
                    <th className="px-4 py-3 font-semibold">Observación principal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredSummary.map((row, idx) => (
                    <tr key={`${row.ipress}_${idx}`} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-medium text-[#123B57]">{row.microred}</td>
                      <td className="px-4 py-3 text-slate-700">{row.ipress}</td>
                      <td className="px-4 py-3 text-right font-mono-tabular">
                        {row.registrosEvaluados.toLocaleString('es-PE')}
                      </td>
                      <td className="px-4 py-3 text-right font-mono-tabular text-[#25804A]">
                        {row.conformes.toLocaleString('es-PE')}
                      </td>
                      <td className="px-4 py-3 text-right font-mono-tabular text-[#C74747] font-semibold">
                        {row.observados.toLocaleString('es-PE')}
                      </td>
                      <td className="px-4 py-3 text-right font-mono-tabular font-semibold">
                        <span className="inline-flex items-center gap-1">
                          <CheckCircle2
                            className={`w-3.5 h-3.5 ${
                              row.tasaConformidad >= 90 ? 'text-[#25804A]' : 'text-[#E7B83D]'
                            }`}
                          />
                          {row.tasaConformidad}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600 text-[12.5px]">
                        {row.principalObservacion}
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
