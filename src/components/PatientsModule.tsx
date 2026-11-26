import React, { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Eye,
  Filter,
  Lock,
  MapPin,
  Search,
  ShieldCheck,
  UserCheck,
  Users,
  X,
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
import {
  exportRowsToExcel,
  normalizeNominalFollowupRows,
} from '../services/excelAnalyzers';
import { fetchNominalModuleData, fetchPublicBatchRows } from '../services/firestoreService';
import { fetchServerNominalDataset, fetchServerPublicDataset } from '../services/adminApiService';
import { exportInstitutionalPdf, printInstitutionalReport } from '../services/pdfExportService';
import {
  AdminSessionState,
  ContentDocumentItem,
  DriveDocumentItem,
  FollowupStatus,
  MICROREDES_RIS,
  NominalFollowupRecord,
  NominalManifest,
  NominalRecord,
  PatientSummaryRow,
  PublicManifest,
  UserProfile,
} from '../types';
import { ExportToolbar } from './ExportToolbar';
import { ModuleDrivePanel } from './ModuleDrivePanel';

interface PatientsModuleProps {
  manifest?: PublicManifest;
  user: UserProfile | null;
  adminSession: AdminSessionState;
  onOpenAuth: () => void;
  driveFiles: DriveDocumentItem[];
  manualDocs: ContentDocumentItem[];
  onPreviewFile: (file: DriveDocumentItem) => void;
}

const MONTHS_BIRTH = [
  'Todos',
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

const PAGE_SIZE = 40;

export const PatientsModule: React.FC<PatientsModuleProps> = ({
  manifest,
  user,
  adminSession,
  onOpenAuth,
  driveFiles,
  manualDocs,
  onPreviewFile,
}) => {
  const [viewMode, setViewMode] = useState<'agregado' | 'nominal'>('agregado');
  const [summaryRows, setSummaryRows] = useState<PatientSummaryRow[]>([]);
  const [nominalManifest, setNominalManifest] = useState<NominalManifest | null>(null);
  const [rawNominalRows, setRawNominalRows] = useState<NominalRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingNominal, setLoadingNominal] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  // 10 combined filters
  const [filterMicrored, setFilterMicrored] = useState('Todas');
  const [filterIpress, setFilterIpress] = useState('Todos');
  const [filterPaciente, setFilterPaciente] = useState('');
  const [filterDni, setFilterDni] = useState('');
  const [filterGenero, setFilterGenero] = useState('Todos');
  const [filterEdad, setFilterEdad] = useState('');
  const [filterMesCumple, setFilterMesCumple] = useState('Todos');
  const [filterCondicion, setFilterCondicion] = useState('Todas');
  const [filterDireccion, setFilterDireccion] = useState('');
  const [filterPendientes, setFilterPendientes] = useState('Todas');

  const [page, setPage] = useState(1);
  const [selectedPatient, setSelectedPatient] = useState<NominalFollowupRecord | null>(null);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [localManifest, setLocalManifest] = useState<PublicManifest | null>(null);

  const canAccessNominal = Boolean(
    adminSession.authenticated || (user && (user.role === 'admin' || user.nominalAccess))
  );

  // Load aggregate summary (Fast server dataset FIRST, Firestore fallback if needed)
  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const srv = await fetchServerPublicDataset<PatientSummaryRow>('pacientes_resumen');
        if (active && srv.rows?.length) {
          setSummaryRows(srv.rows);
          if (srv.manifest) setLocalManifest(srv.manifest);
          return;
        }
        if (manifest?.batchIds?.length) {
          const rows = await fetchPublicBatchRows<PatientSummaryRow>(manifest);
          if (active && rows.length) {
            setSummaryRows(rows);
            return;
          }
        }
        if (active) setSummaryRows([]);
      } catch {
        if (active) setSummaryRows([]);
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [manifest]);

  // Load nominal dataset (authorized only)
  useEffect(() => {
    let active = true;
    async function loadNominal() {
      if (viewMode !== 'nominal' || !canAccessNominal) return;
      setLoadingNominal(true);
      try {
        if (adminSession.authenticated) {
          const srv = await fetchServerNominalDataset('pacientes').catch(() => null);
          if (active && srv?.rows?.length) {
            setNominalManifest(srv.manifest);
            setRawNominalRows(srv.rows);
            return;
          }
        }
        if (user) {
          const fb = await fetchNominalModuleData('pacientes');
          if (active) {
            setNominalManifest(fb.manifest);
            setRawNominalRows(fb.rows);
          }
        }
      } finally {
        if (active) setLoadingNominal(false);
      }
    }
    loadNominal();
    return () => {
      active = false;
    };
  }, [viewMode, canAccessNominal, adminSession.authenticated, user]);

  const normalizedNominal = useMemo(
    () => normalizeNominalFollowupRows(rawNominalRows),
    [rawNominalRows]
  );

  // Dynamic options for cascading filters
  const ipressOptions = useMemo(() => {
    const source = viewMode === 'nominal' ? normalizedNominal : summaryRows;
    const set = new Set<string>();
    for (const r of source) {
      const mr = 'microred' in r ? r.microred : '';
      const eess = 'establecimiento' in r ? r.establecimiento : 'ipress' in r ? r.ipress : '';
      if ((filterMicrored === 'Todas' || mr === filterMicrored) && eess) {
        set.add(eess);
      }
    }
    return ['Todos', ...Array.from(set).sort()];
  }, [viewMode, normalizedNominal, summaryRows, filterMicrored]);

  const condicionOptions = useMemo(() => {
    const set = new Set(normalizedNominal.map((r) => r.condicionPaquete).filter(Boolean));
    return ['Todas', ...Array.from(set).sort()];
  }, [normalizedNominal]);

  const filteredSummary = useMemo(() => {
    const q = filterPaciente.trim().toLowerCase();
    return summaryRows.filter((r) => {
      const matchMr = filterMicrored === 'Todas' || r.microred === filterMicrored;
      const matchIp = filterIpress === 'Todos' || r.ipress === filterIpress;
      const matchQ =
        !q || r.ipress.toLowerCase().includes(q) || r.microred.toLowerCase().includes(q);
      return matchMr && matchIp && matchQ;
    });
  }, [summaryRows, filterMicrored, filterIpress, filterPaciente]);

  const filteredNominal = useMemo(() => {
    const pacQ = filterPaciente.trim().toLowerCase();
    const dniQ = filterDni.trim().toLowerCase();
    const dirQ = filterDireccion.trim().toLowerCase();
    const edadQ = filterEdad.trim();

    return normalizedNominal.filter((r) => {
      if (filterMicrored !== 'Todas' && r.microred !== filterMicrored) return false;
      if (filterIpress !== 'Todos' && r.establecimiento !== filterIpress) return false;
      if (pacQ && !r.apellidosNombres.toLowerCase().includes(pacQ)) return false;
      if (dniQ && !r.dni.toLowerCase().includes(dniQ)) return false;
      if (filterGenero !== 'Todos' && r.genero !== filterGenero) return false;
      if (edadQ) {
        const rangeMatch = edadQ.match(/^(\d+)\s*-\s*(\d+)$/);
        if (rangeMatch) {
          const min = Number(rangeMatch[1]);
          const max = Number(rangeMatch[2]);
          if (r.edad < min || r.edad > max) return false;
        } else if (!String(r.edad).includes(edadQ)) {
          return false;
        }
      }
      if (
        filterMesCumple !== 'Todos' &&
        r.mesCumpleanos.toLowerCase() !== filterMesCumple.toLowerCase()
      ) {
        return false;
      }
      if (filterCondicion !== 'Todas' && r.condicionPaquete !== filterCondicion) return false;
      if (dirQ && !r.direccion.toLowerCase().includes(dirQ)) return false;
      if (filterPendientes === 'Con pendientes' && r.actividadesPendientes <= 0) return false;
      if (filterPendientes === 'Sin pendientes' && r.actividadesPendientes > 0) return false;
      if (filterPendientes === 'En riesgo' && r.estadoSeguimiento !== 'En riesgo de incumplimiento')
        return false;
      return true;
    });
  }, [
    normalizedNominal,
    filterMicrored,
    filterIpress,
    filterPaciente,
    filterDni,
    filterGenero,
    filterEdad,
    filterMesCumple,
    filterCondicion,
    filterDireccion,
    filterPendientes,
  ]);

  useEffect(() => {
    setPage(1);
  }, [
    filterMicrored,
    filterIpress,
    filterPaciente,
    filterDni,
    filterGenero,
    filterEdad,
    filterMesCumple,
    filterCondicion,
    filterDireccion,
    filterPendientes,
    viewMode,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredNominal.length / PAGE_SIZE));
  const paginatedNominal = filteredNominal.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const summaryTotals = useMemo(() => {
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

  const getStatusBadgeStyle = (status: FollowupStatus) => {
    switch (status) {
      case 'Cumplimiento completo':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'Cumplimiento parcial':
        return 'bg-[#102A43]/10 text-[#102A43] border-[#102A43]/20';
      case 'En riesgo de incumplimiento':
        return 'bg-red-100 text-red-700 border-red-200';
      default:
        return 'bg-[#F07832]/15 text-[#D96420] border-[#F07832]/30';
    }
  };

  const resetFilters = () => {
    setFilterMicrored('Todas');
    setFilterIpress('Todos');
    setFilterPaciente('');
    setFilterDni('');
    setFilterGenero('Todos');
    setFilterEdad('');
    setFilterMesCumple('Todos');
    setFilterCondicion('Todas');
    setFilterDireccion('');
    setFilterPendientes('Todas');
  };

  const activeFiltersLabel = `Microred: ${filterMicrored} | IPRESS: ${filterIpress} | Género: ${filterGenero} | Mes cumple: ${filterMesCumple} | Condición: ${filterCondicion} | Pendientes: ${filterPendientes}`;

  const handleExportExcel = () => {
    if (viewMode === 'nominal') {
      if (!canAccessNominal) return;
      const rows = filteredNominal.map((r, idx) => ({
        'N.º': idx + 1,
        DNI: r.dni,
        'Apellidos y nombres': r.apellidosNombres,
        Género: r.genero,
        Edad: r.edad,
        'Fecha de nacimiento': r.fechaNacimiento,
        'Mes de cumpleaños': r.mesCumpleanos,
        Dirección: r.direccion,
        Microred: r.microred,
        Establecimiento: r.establecimiento,
        'Condición del paquete': r.condicionPaquete,
        'Actividades programadas': r.actividadesProgramadas,
        'Actividades realizadas': r.actividadesRealizadas,
        'Actividades pendientes': `${r.actividadesPendientes} (${r.listaPendientes})`,
        '% de cumplimiento': `${r.porcentajeCumplimiento}%`,
        'Estado de seguimiento': r.estadoSeguimiento,
      }));
      exportRowsToExcel(rows, 'RIS_San_Ignacio_Seguimiento_Nominal', 'Nominal', {
        modulo: 'Seguimiento Nominal de Pacientes (30–59 años)',
        periodo: nominalManifest?.period || 'Vigente',
        filtros: activeFiltersLabel,
        fuente: nominalManifest?.fileName || 'Padrón Nominal RIS San Ignacio',
      });
    } else {
      exportRowsToExcel(
        filteredSummary as unknown as Record<string, unknown>[],
        'RIS_San_Ignacio_Seguimiento_Agregado',
        'Agregado',
        {
          modulo: 'Seguimiento por Pacientes — Resumen Agregado',
          periodo: manifest?.period || 'Vigente',
          filtros: `Microred: ${filterMicrored} | IPRESS: ${filterIpress}`,
          fuente: manifest?.fileName || 'Consolidado RIS San Ignacio',
        }
      );
    }
  };

  const handleExportPdf = async () => {
    if (viewMode === 'nominal' && !canAccessNominal) return;
    setExportingPdf(true);
    try {
      if (viewMode === 'nominal') {
        await exportInstitutionalPdf({
          fileName: 'RIS_San_Ignacio_Seguimiento_Nominal',
          moduleName: 'Seguimiento Nominal · Curso de Vida Adulto',
          subtitle: 'Control nominal de cumplimiento del paquete integral (30 a 59 años)',
          period: nominalManifest?.period || 'Vigente',
          appliedFilters: activeFiltersLabel,
          dataSource: nominalManifest?.fileName || 'Padrón Nominal RIS San Ignacio',
          kpis: [
            { label: 'Pacientes Filtrados', value: String(filteredNominal.length) },
            {
              label: 'Cumplimiento Completo',
              value: String(
                filteredNominal.filter((r) => r.estadoSeguimiento === 'Cumplimiento completo').length
              ),
            },
            {
              label: 'Cumplimiento Parcial',
              value: String(
                filteredNominal.filter((r) => r.estadoSeguimiento === 'Cumplimiento parcial').length
              ),
            },
            {
              label: 'Pendientes / En Riesgo',
              value: String(
                filteredNominal.filter(
                  (r) =>
                    r.estadoSeguimiento === 'Pendiente' ||
                    r.estadoSeguimiento === 'En riesgo de incumplimiento'
                ).length
              ),
            },
          ],
          sections: [
            {
              title: 'Padrón Nominal de Seguimiento Integral (Primeros 250 registros filtrados)',
              columns: [
                'N.º',
                'DNI',
                'Apellidos y Nombres',
                'Edad/Gén.',
                'Microred / IPRESS',
                'Paquete',
                'Prog./Real./Pend.',
                'Cumpl. %',
                'Estado',
              ],
              rows: filteredNominal.slice(0, 250).map((r, i) => [
                i + 1,
                r.dni,
                r.apellidosNombres,
                `${r.edad} (${r.genero.charAt(0)})`,
                `${r.microred} / ${r.establecimiento}`,
                r.condicionPaquete,
                `${r.actividadesProgramadas}/${r.actividadesRealizadas}/${r.actividadesPendientes}`,
                `${r.porcentajeCumplimiento}%`,
                r.estadoSeguimiento,
              ]),
            },
          ],
        });
      } else {
        await exportInstitutionalPdf({
          fileName: 'RIS_San_Ignacio_Seguimiento_Agregado',
          moduleName: 'Seguimiento por Pacientes · Resumen Agregado',
          subtitle: 'Consolidado territorial de paquetes integrales del adulto',
          period: manifest?.period || 'Vigente',
          appliedFilters: `Microred: ${filterMicrored} | IPRESS: ${filterIpress}`,
          dataSource: manifest?.fileName || 'Consolidado RIS San Ignacio',
          kpis: [
            { label: 'Adultos Atendidos', value: summaryTotals.atendidos.toLocaleString('es-PE') },
            { label: 'Paquetes Completos', value: summaryTotals.completos.toLocaleString('es-PE') },
            { label: 'Paquetes en Proceso', value: summaryTotals.iniciados.toLocaleString('es-PE') },
            { label: 'Pendientes', value: summaryTotals.pendientes.toLocaleString('es-PE') },
          ],
          sections: [
            {
              title: 'Resumen Agregado por Microred e IPRESS',
              columns: [
                'Microred',
                'Establecimiento',
                'Atendidos',
                'Paquete Completo',
                'En Proceso',
                'Tamizaje ENT',
                'Pendientes',
              ],
              rows: filteredSummary.map((r) => [
                r.microred,
                r.ipress,
                r.adultosAtendidos,
                r.paqueteCompleto,
                r.paqueteIniciado,
                r.tamizajeEnt,
                r.pendientesSeguimiento,
              ]),
            },
          ],
        });
      }
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Toolbar */}
      <div className="card-premium rounded-2xl p-5 sm:p-6 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
        <div>
          {(manifest?.updatedAt || localManifest?.updatedAt || nominalManifest?.updatedAt) ? (
            <p className="text-[11px] font-mono-tabular font-semibold text-[#F07832] mb-1">
              Módulo actualizado:{' '}
              {new Date(
                String(manifest?.updatedAt || localManifest?.updatedAt || nominalManifest?.updatedAt)
              ).toLocaleString('es-PE')}
            </p>
          ) : null}
          <h1 className="font-display text-xl sm:text-2xl font-bold text-[#102A43]">
            Seguimiento Nominal y Paquete Integral (30 a 59 años)
          </h1>
          <p className="text-[13.5px] text-[#102A43]/70 mt-1">
            Monitoreo nominal de actividades programadas, realizadas y pendientes por paciente,
            microred y establecimiento.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="inline-flex items-center p-1 bg-[#F8F7F2] rounded-xl border border-[#102A43]/12 no-print">
            <button
              type="button"
              onClick={() => setViewMode('agregado')}
              className={`px-3.5 py-1.5 rounded-lg text-[13px] font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                viewMode === 'agregado'
                  ? 'bg-[#102A43] text-white shadow-xs'
                  : 'text-[#102A43]/70 hover:text-[#102A43]'
              }`}
            >
              Resumen Agregado
            </button>
            <button
              type="button"
              onClick={() => setViewMode('nominal')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[13px] font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                viewMode === 'nominal'
                  ? 'bg-[#102A43] text-white shadow-xs'
                  : 'text-[#102A43]/70 hover:text-[#102A43]'
              }`}
            >
              {!canAccessNominal && <Lock className="w-3.5 h-3.5 text-[#F07832]" />}
              <span>Seguimiento Nominal</span>
            </button>
          </div>

          <ExportToolbar
            onExportExcel={handleExportExcel}
            onExportPdf={handleExportPdf}
            onPrint={printInstitutionalReport}
            disabledExcel={
              viewMode === 'nominal'
                ? !canAccessNominal || filteredNominal.length === 0
                : filteredSummary.length === 0
            }
            disabledPdf={
              viewMode === 'nominal'
                ? !canAccessNominal || filteredNominal.length === 0
                : filteredSummary.length === 0
            }
            loadingPdf={exportingPdf}
          />
        </div>
      </div>

      {/* Filters Panel (Full 10 combined filters in Nominal, 3 core in Aggregate) */}
      <section className="card-premium rounded-2xl p-4 sm:p-5 space-y-3 no-print">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[13px] font-bold text-[#102A43]">
            <Filter className="w-4 h-4 text-[#F07832]" />
            <span>
              {viewMode === 'nominal'
                ? 'Filtros Combinados de Búsqueda Nominal (10 criterios)'
                : 'Filtros Territoriales'}
            </span>
            <button
              type="button"
              onClick={() => setMobileFiltersOpen((v) => !v)}
              className="md:hidden inline-flex items-center gap-1 ml-1 px-2.5 py-1 rounded-lg bg-[#F8F7F2] border border-[#102A43]/15 text-[11.5px] font-semibold text-[#102A43] cursor-pointer"
            >
              <span>{mobileFiltersOpen ? 'Ocultar' : 'Mostrar'}</span>
              {mobileFiltersOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
          <button
            type="button"
            onClick={resetFilters}
            className="text-[12px] font-semibold text-[#F07832] hover:underline cursor-pointer"
          >
            Limpiar filtros
          </button>
        </div>

        <div className={`${mobileFiltersOpen ? 'grid' : 'hidden md:grid'} grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5`}>
          <select
            value={filterMicrored}
            onChange={(e) => {
              setFilterMicrored(e.target.value);
              setFilterIpress('Todos');
            }}
            aria-label="Filtrar por microred"
            className="px-3 py-2 text-[12.5px] bg-white border border-[#102A43]/15 rounded-xl text-[#102A43] font-semibold"
          >
            <option value="Todas">Microred: Todas (7 + ext.)</option>
            {MICROREDES_RIS.map((mr) => (
              <option key={mr} value={mr}>
                {mr}
              </option>
            ))}
            <option value="Externos">Externos</option>
          </select>

          <select
            value={filterIpress}
            onChange={(e) => setFilterIpress(e.target.value)}
            aria-label="Filtrar por establecimiento"
            className="px-3 py-2 text-[12.5px] bg-white border border-[#102A43]/15 rounded-xl text-[#102A43] font-semibold"
          >
            {ipressOptions.map((eess) => (
              <option key={eess} value={eess}>
                IPRESS: {eess}
              </option>
            ))}
          </select>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#102A43]/45 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={filterPaciente}
              onChange={(e) => setFilterPaciente(e.target.value)}
              placeholder={
                viewMode === 'nominal' ? 'Paciente (Apellidos/Nombres)...' : 'Buscar IPRESS...'
              }
              className="w-full pl-8 pr-3 py-2 text-[12.5px] bg-[#F8F7F2] border border-[#102A43]/15 rounded-xl"
            />
          </div>

          {viewMode === 'nominal' && (
            <>
              <input
                type="text"
                value={filterDni}
                onChange={(e) => setFilterDni(e.target.value)}
                placeholder="DNI del paciente..."
                className="px-3 py-2 text-[12.5px] bg-[#F8F7F2] border border-[#102A43]/15 rounded-xl font-mono-tabular"
              />

              <select
                value={filterGenero}
                onChange={(e) => setFilterGenero(e.target.value)}
                className="px-3 py-2 text-[12.5px] bg-white border border-[#102A43]/15 rounded-xl text-[#102A43] font-semibold"
              >
                <option value="Todos">Género: Todos</option>
                <option value="Femenino">Femenino</option>
                <option value="Masculino">Masculino</option>
              </select>

              <input
                type="text"
                value={filterEdad}
                onChange={(e) => setFilterEdad(e.target.value)}
                placeholder="Edad o rango (ej. 30-45)"
                className="px-3 py-2 text-[12.5px] bg-[#F8F7F2] border border-[#102A43]/15 rounded-xl"
              />

              <select
                value={filterMesCumple}
                onChange={(e) => setFilterMesCumple(e.target.value)}
                className="px-3 py-2 text-[12.5px] bg-white border border-[#102A43]/15 rounded-xl text-[#102A43] font-semibold"
              >
                {MONTHS_BIRTH.map((m) => (
                  <option key={m} value={m}>
                    Cumpleaños: {m}
                  </option>
                ))}
              </select>

              <select
                value={filterCondicion}
                onChange={(e) => setFilterCondicion(e.target.value)}
                className="px-3 py-2 text-[12.5px] bg-white border border-[#102A43]/15 rounded-xl text-[#102A43] font-semibold"
              >
                {condicionOptions.map((c) => (
                  <option key={c} value={c}>
                    Paquete: {c}
                  </option>
                ))}
              </select>

              <input
                type="text"
                value={filterDireccion}
                onChange={(e) => setFilterDireccion(e.target.value)}
                placeholder="Dirección / Sector..."
                className="px-3 py-2 text-[12.5px] bg-[#F8F7F2] border border-[#102A43]/15 rounded-xl"
              />

              <select
                value={filterPendientes}
                onChange={(e) => setFilterPendientes(e.target.value)}
                className="px-3 py-2 text-[12.5px] bg-white border border-[#102A43]/15 rounded-xl text-[#102A43] font-semibold"
              >
                <option value="Todas">Pendientes: Todos</option>
                <option value="Con pendientes">Con actividades pendientes</option>
                <option value="Sin pendientes">Sin pendientes (Completos)</option>
                <option value="En riesgo">En riesgo de incumplimiento</option>
              </select>
            </>
          )}
        </div>
      </section>

      {/* NOMINAL VIEW */}
      {viewMode === 'nominal' ? (
        !canAccessNominal ? (
          <div className="card-premium rounded-2xl p-8 sm:p-10 text-center max-w-2xl mx-auto">
            <div className="w-12 h-12 rounded-2xl bg-[#102A43]/10 text-[#102A43] flex items-center justify-center mx-auto mb-4">
              <Lock className="w-6 h-6 text-[#F07832]" />
            </div>
            <h2 className="font-display text-lg font-bold text-[#102A43] mb-2">
              Acceso Restringido a Datos Nominales
            </h2>
            <p className="text-[14px] text-[#102A43]/75 leading-relaxed mb-6">
              Por protección de datos personales del paciente (DNI, nombres, dirección y fecha de
              nacimiento), el Seguimiento Nominal está reservado para personal autorizado y
              administración.
            </p>
            {!user ? (
              <button
                type="button"
                onClick={onOpenAuth}
                className="inline-flex items-center gap-2 bg-[#102A43] hover:bg-[#183B5E] text-white font-semibold text-[13.5px] px-5 py-2.5 rounded-xl transition-colors cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4 text-[#F07832]" />
                <span>Iniciar sesión institucional</span>
              </button>
            ) : (
              <p className="text-[13px] font-medium text-[#102A43] bg-[#F07832]/12 border border-[#F07832]/30 px-4 py-2.5 rounded-xl inline-block">
                Cuenta conectada: {user.email}. Solicite al administrador habilitar su Acceso
                Nominal.
              </p>
            )}
          </div>
        ) : loadingNominal ? (
          <div className="card-premium rounded-2xl p-10 text-center text-[#102A43]/65 text-sm">
            Cargando padrón nominal protegido...
          </div>
        ) : filteredNominal.length === 0 ? (
          <div className="card-premium rounded-2xl p-10 text-center">
            <Users className="w-10 h-10 text-[#102A43]/25 mx-auto mb-3" />
            <h3 className="font-display text-base font-bold text-[#102A43] mb-1">
              Sin registros nominales para mostrar
            </h3>
            <p className="text-sm text-[#102A43]/65">
              {rawNominalRows.length === 0
                ? 'El administrador aún no ha publicado la matriz nominal de pacientes.'
                : 'No hay pacientes que coincidan con los 10 filtros aplicados.'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Nominal Status Summary Strip */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
              <div className="card-premium rounded-2xl p-4">
                <p className="text-[12px] text-[#102A43]/70 font-medium">Pacientes filtrados</p>
                <p className="font-mono-tabular text-xl font-bold text-[#102A43] mt-1">
                  {filteredNominal.length.toLocaleString('es-PE')}
                </p>
              </div>
              <div className="card-premium rounded-2xl p-4">
                <p className="text-[12px] text-[#102A43]/70 font-medium">Cumplimiento completo</p>
                <p className="font-mono-tabular text-xl font-bold text-emerald-700 mt-1">
                  {filteredNominal.filter((r) => r.estadoSeguimiento === 'Cumplimiento completo').length}
                </p>
              </div>
              <div className="card-premium rounded-2xl p-4">
                <p className="text-[12px] text-[#102A43]/70 font-medium">Cumplimiento parcial</p>
                <p className="font-mono-tabular text-xl font-bold text-[#102A43] mt-1">
                  {filteredNominal.filter((r) => r.estadoSeguimiento === 'Cumplimiento parcial').length}
                </p>
              </div>
              <div className="card-premium rounded-2xl p-4">
                <p className="text-[12px] text-[#102A43]/70 font-medium">
                  Pendientes / En riesgo
                </p>
                <p className="font-mono-tabular text-xl font-bold text-[#F07832] mt-1">
                  {
                    filteredNominal.filter(
                      (r) =>
                        r.estadoSeguimiento === 'Pendiente' ||
                        r.estadoSeguimiento === 'En riesgo de incumplimiento'
                    ).length
                  }
                </p>
              </div>
            </div>

            {/* 16-Column Full Nominal Table */}
            <div className="card-premium rounded-2xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-[#102A43]/10 flex flex-wrap items-center justify-between gap-2 text-xs text-[#102A43]/70">
                <span>
                  Mostrando{' '}
                  <strong className="font-mono-tabular text-[#102A43]">
                    {(page - 1) * PAGE_SIZE + 1}–
                    {Math.min(page * PAGE_SIZE, filteredNominal.length)}
                  </strong>{' '}
                  de{' '}
                  <strong className="font-mono-tabular text-[#102A43]">
                    {filteredNominal.length}
                  </strong>{' '}
                  registros · Clic en un paciente para ver evolución y detalle
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="p-1.5 rounded-lg border border-[#102A43]/15 disabled:opacity-40 cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="font-mono-tabular font-semibold">
                    Pág. {page} / {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="p-1.5 rounded-lg border border-[#102A43]/15 disabled:opacity-40 cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Mobile Nominal Cards */}
              <div className="md:hidden divide-y divide-[#102A43]/10">
                {paginatedNominal.map((row, idx) => (
                  <button
                    key={`${row.dni}_mob_${idx}`}
                    type="button"
                    onClick={() => setSelectedPatient(row)}
                    className="w-full text-left p-4 space-y-2 hover:bg-[#F8F7F2]/80 cursor-pointer"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-bold text-[13px] text-[#102A43] truncate">
                          {row.apellidosNombres}
                        </p>
                        <p className="font-mono-tabular text-[11.5px] text-[#102A43]/70">
                          DNI {row.dni} · {row.edad} años ({row.genero})
                        </p>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-lg border text-[10.5px] font-bold shrink-0 ${getStatusBadgeStyle(
                          row.estadoSeguimiento
                        )}`}
                      >
                        {row.estadoSeguimiento}
                      </span>
                    </div>
                    <p className="text-[11.5px] text-[#102A43]/75 truncate">
                      {row.microred} · {row.establecimiento}
                    </p>
                    <div className="flex items-center justify-between text-[11.5px] font-mono-tabular">
                      <span>
                        Real.: <strong>{row.actividadesRealizadas}</strong> / Pend.:{' '}
                        <strong className="text-[#F07832]">{row.actividadesPendientes}</strong>
                      </span>
                      <span className="font-bold text-[#102A43]">{row.porcentajeCumplimiento}%</span>
                    </div>
                  </button>
                ))}
              </div>

              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse text-[12px]">
                  <thead>
                    <tr className="bg-[#F8F7F2] border-b border-[#102A43]/12 text-[#102A43]/85">
                      <th className="px-3 py-2.5 font-semibold whitespace-nowrap">N.º</th>
                      <th className="px-3 py-2.5 font-semibold whitespace-nowrap">DNI</th>
                      <th className="px-3 py-2.5 font-semibold whitespace-nowrap">
                        Apellidos y nombres
                      </th>
                      <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Género</th>
                      <th className="px-3 py-2.5 font-semibold whitespace-nowrap text-right">
                        Edad
                      </th>
                      <th className="px-3 py-2.5 font-semibold whitespace-nowrap">
                        Fecha nac.
                      </th>
                      <th className="px-3 py-2.5 font-semibold whitespace-nowrap">
                        Mes cumple.
                      </th>
                      <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Dirección</th>
                      <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Microred</th>
                      <th className="px-3 py-2.5 font-semibold whitespace-nowrap">
                        Establecimiento
                      </th>
                      <th className="px-3 py-2.5 font-semibold whitespace-nowrap">
                        Condición paquete
                      </th>
                      <th className="px-3 py-2.5 font-semibold whitespace-nowrap text-right">
                        Prog.
                      </th>
                      <th className="px-3 py-2.5 font-semibold whitespace-nowrap text-right">
                        Real.
                      </th>
                      <th className="px-3 py-2.5 font-semibold whitespace-nowrap text-right">
                        Pend.
                      </th>
                      <th className="px-3 py-2.5 font-semibold whitespace-nowrap text-right">
                        % Cumpl.
                      </th>
                      <th className="px-3 py-2.5 font-semibold whitespace-nowrap">
                        Estado de seguimiento
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#102A43]/8">
                    {paginatedNominal.map((row, idx) => (
                      <tr
                        key={`${row.dni}_${idx}`}
                        onClick={() => setSelectedPatient(row)}
                        className="hover:bg-[#F07832]/6 cursor-pointer transition-colors"
                      >
                        <td className="px-3 py-2.5 font-mono-tabular text-[#102A43]/65">
                          {(page - 1) * PAGE_SIZE + idx + 1}
                        </td>
                        <td className="px-3 py-2.5 font-mono-tabular font-bold text-[#102A43] whitespace-nowrap">
                          {row.dni}
                        </td>
                        <td className="px-3 py-2.5 font-semibold text-[#102A43] whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5">
                            <Eye className="w-3.5 h-3.5 text-[#F07832]" />
                            <span>{row.apellidosNombres}</span>
                          </span>
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">{row.genero}</td>
                        <td className="px-3 py-2.5 text-right font-mono-tabular">{row.edad}</td>
                        <td className="px-3 py-2.5 font-mono-tabular whitespace-nowrap">
                          {row.fechaNacimiento}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">{row.mesCumpleanos}</td>
                        <td className="px-3 py-2.5 max-w-[160px] truncate">{row.direccion}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap font-medium">
                          {row.microred}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">{row.establecimiento}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap">{row.condicionPaquete}</td>
                        <td className="px-3 py-2.5 text-right font-mono-tabular">
                          {row.actividadesProgramadas}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono-tabular font-bold text-[#102A43]">
                          {row.actividadesRealizadas}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono-tabular font-bold text-[#F07832]">
                          {row.actividadesPendientes}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono-tabular font-bold">
                          {row.porcentajeCumplimiento}%
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-lg border text-[11px] font-bold ${getStatusBadgeStyle(
                              row.estadoSeguimiento
                            )}`}
                          >
                            {row.estadoSeguimiento}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )
      ) : loading ? (
        <div className="card-premium rounded-2xl p-10 text-center text-[#102A43]/65 text-sm">
          Sincronizando resumen de seguimiento...
        </div>
      ) : filteredSummary.length === 0 ? (
        <div className="card-premium rounded-2xl p-10 text-center">
          <Users className="w-10 h-10 text-[#102A43]/25 mx-auto mb-3" />
          <h2 className="font-display text-lg font-bold text-[#102A43] mb-1.5">
            Pendiente de publicación de Seguimiento
          </h2>
          <p className="text-[13.5px] text-[#102A43]/70 max-w-lg mx-auto">
            Una vez publicada la matriz de pacientes adultos (30–59 años), aquí se mostrarán los
            consolidados por Microred e IPRESS sin exponer datos personales.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="card-premium rounded-2xl p-5">
              <p className="text-[12.5px] text-[#102A43]/70 font-medium">Adultos atendidos</p>
              <p className="font-mono-tabular text-2xl font-bold text-[#102A43] mt-1.5">
                {summaryTotals.atendidos.toLocaleString('es-PE')}
              </p>
            </div>
            <div className="card-premium rounded-2xl p-5">
              <p className="text-[12.5px] text-[#102A43]/70 font-medium">Paquetes completos</p>
              <p className="font-mono-tabular text-2xl font-bold text-[#F07832] mt-1.5">
                {summaryTotals.completos.toLocaleString('es-PE')}
              </p>
            </div>
            <div className="card-premium rounded-2xl p-5">
              <p className="text-[12.5px] text-[#102A43]/70 font-medium">Paquetes en proceso</p>
              <p className="font-mono-tabular text-2xl font-bold text-[#102A43] mt-1.5">
                {summaryTotals.iniciados.toLocaleString('es-PE')}
              </p>
            </div>
            <div className="card-premium rounded-2xl p-5">
              <p className="text-[12.5px] text-[#102A43]/70 font-medium">
                Pendientes de seguimiento
              </p>
              <p className="font-mono-tabular text-2xl font-bold text-[#F07832] mt-1.5">
                {summaryTotals.pendientes.toLocaleString('es-PE')}
              </p>
            </div>
          </div>

          {chartData.length > 0 && (
            <div className="card-premium rounded-2xl p-5 sm:p-6">
              <h2 className="font-display text-base font-bold text-[#102A43] mb-4">
                Estado del Paquete Integral por Microred
              </h2>
              <div className="h-[260px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                    <XAxis dataKey="microred" tick={{ fontSize: 12, fill: '#102A43' }} />
                    <YAxis tick={{ fontSize: 12, fill: '#102A43' }} />
                    <Tooltip
                      contentStyle={{
                        borderRadius: '12px',
                        border: '1px solid #CBD5E1',
                        fontSize: '12.5px',
                      }}
                    />
                    <Bar
                      dataKey="completos"
                      name="Paquete Completo"
                      fill="#102A43"
                      radius={[6, 6, 0, 0]}
                    />
                    <Bar
                      dataKey="iniciados"
                      name="En Proceso"
                      fill="#F07832"
                      radius={[6, 6, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <div className="card-premium rounded-2xl overflow-hidden">
            {/* Mobile Aggregate Summary Cards */}
            <div className="md:hidden divide-y divide-[#102A43]/10">
              {filteredSummary.map((row, idx) => (
                <div key={`${row.microred}_${row.ipress}_mob_${idx}`} className="p-4 space-y-1.5 text-[12.5px]">
                  <p className="font-bold text-[#102A43]">{row.ipress}</p>
                  <p className="text-[11.5px] text-[#102A43]/70">Microred {row.microred}</p>
                  <div className="grid grid-cols-3 gap-2 pt-1 font-mono-tabular text-[11.5px]">
                    <span>Atendidos: <strong>{row.adultosAtendidos.toLocaleString('es-PE')}</strong></span>
                    <span>Completos: <strong>{row.paqueteCompleto.toLocaleString('es-PE')}</strong></span>
                    <span className="text-[#F07832]">Pend.: <strong>{row.pendientesSeguimiento.toLocaleString('es-PE')}</strong></span>
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse text-[13.5px]">
                <thead>
                  <tr className="bg-[#F8F7F2] border-b border-[#102A43]/12 text-[#102A43]/80">
                    <th className="px-4 py-3 font-semibold">Microred</th>
                    <th className="px-4 py-3 font-semibold">IPRESS / Establecimiento</th>
                    <th className="px-4 py-3 font-semibold text-right">Atendidos</th>
                    <th className="px-4 py-3 font-semibold text-right">Paquete Completo</th>
                    <th className="px-4 py-3 font-semibold text-right">En Proceso</th>
                    <th className="px-4 py-3 font-semibold text-right">Tamizaje ENT</th>
                    <th className="px-4 py-3 font-semibold text-right">Pendientes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#102A43]/8">
                  {filteredSummary.map((row, idx) => (
                    <tr
                      key={`${row.microred}_${row.ipress}_${idx}`}
                      className="hover:bg-[#F8F7F2]/70"
                    >
                      <td className="px-4 py-3 font-semibold text-[#102A43]">{row.microred}</td>
                      <td className="px-4 py-3 text-[#102A43]/80">{row.ipress}</td>
                      <td className="px-4 py-3 text-right font-mono-tabular">
                        {row.adultosAtendidos.toLocaleString('es-PE')}
                      </td>
                      <td className="px-4 py-3 text-right font-mono-tabular text-[#102A43] font-bold">
                        {row.paqueteCompleto.toLocaleString('es-PE')}
                      </td>
                      <td className="px-4 py-3 text-right font-mono-tabular">
                        {row.paqueteIniciado.toLocaleString('es-PE')}
                      </td>
                      <td className="px-4 py-3 text-right font-mono-tabular">
                        {row.tamizajeEnt.toLocaleString('es-PE')}
                      </td>
                      <td className="px-4 py-3 text-right font-mono-tabular text-[#F07832] font-bold">
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

      {/* Clean Published Documents */}
      <ModuleDrivePanel
        targetModule="pacientes"
        moduleLabel="Seguimiento por Pacientes"
        driveFiles={driveFiles}
        manualDocs={manualDocs}
        onPreviewFile={onPreviewFile}
      />

      {/* Individual Patient Evolution Modal */}
      {selectedPatient && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0B1F33]/65 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-2xl bg-white rounded-2xl border border-[#102A43]/15 shadow-2xl overflow-hidden">
            <div className="px-6 py-4 bg-gradient-to-r from-[#102A43] to-[#183B5E] text-white flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-[#F07832]">
                  Ficha Nominal de Seguimiento · DNI {selectedPatient.dni}
                </p>
                <h2 className="font-display text-lg font-bold mt-0.5">
                  {selectedPatient.apellidosNombres}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPatient(null)}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-[12.5px]">
                <div className="p-3 rounded-xl bg-[#F8F7F2] border border-[#102A43]/10">
                  <p className="text-[#102A43]/60 font-medium">Edad / Género</p>
                  <p className="font-bold text-[#102A43] mt-0.5">
                    {selectedPatient.edad} años · {selectedPatient.genero}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-[#F8F7F2] border border-[#102A43]/10">
                  <p className="text-[#102A43]/60 font-medium flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-[#F07832]" />
                    <span>Nacimiento</span>
                  </p>
                  <p className="font-bold text-[#102A43] mt-0.5">
                    {selectedPatient.fechaNacimiento} ({selectedPatient.mesCumpleanos})
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-[#F8F7F2] border border-[#102A43]/10 col-span-2 sm:col-span-1">
                  <p className="text-[#102A43]/60 font-medium flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-[#F07832]" />
                    <span>Jurisdicción</span>
                  </p>
                  <p className="font-bold text-[#102A43] mt-0.5 truncate">
                    {selectedPatient.microred} · {selectedPatient.establecimiento}
                  </p>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-[13px] mb-1.5">
                  <span className="font-bold text-[#102A43]">
                    Avance del Paquete Integral ({selectedPatient.condicionPaquete})
                  </span>
                  <span className="font-mono-tabular font-extrabold text-[#F07832]">
                    {selectedPatient.porcentajeCumplimiento}%
                  </span>
                </div>
                <div className="w-full h-3 rounded-full bg-[#102A43]/10 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#F07832]"
                    style={{ width: `${selectedPatient.porcentajeCumplimiento}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-[13px]">
                <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/50">
                  <p className="font-bold text-emerald-900 flex items-center gap-1.5 mb-1.5">
                    <UserCheck className="w-4 h-4" />
                    <span>Actividades Realizadas ({selectedPatient.actividadesRealizadas})</span>
                  </p>
                  <p className="text-emerald-950/80 leading-relaxed">
                    {selectedPatient.listaRealizadas}
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-[#F07832]/35 bg-[#F07832]/8">
                  <p className="font-bold text-[#102A43] mb-1.5">
                    Actividades Pendientes ({selectedPatient.actividadesPendientes})
                  </p>
                  <p className="text-[#102A43]/80 leading-relaxed">
                    {selectedPatient.listaPendientes}
                  </p>
                </div>
              </div>
            </div>

            <div className="px-6 py-3.5 bg-[#F8F7F2] border-t border-[#102A43]/10 flex items-center justify-between">
              <span
                className={`px-3 py-1 rounded-lg border text-[12px] font-bold ${getStatusBadgeStyle(
                  selectedPatient.estadoSeguimiento
                )}`}
              >
                {selectedPatient.estadoSeguimiento}
              </span>
              <button
                type="button"
                onClick={() => setSelectedPatient(null)}
                className="px-4 py-2 rounded-xl bg-[#102A43] hover:bg-[#183B5E] text-white text-[13px] font-semibold cursor-pointer"
              >
                Cerrar ficha
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
