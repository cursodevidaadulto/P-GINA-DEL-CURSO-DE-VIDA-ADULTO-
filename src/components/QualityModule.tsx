import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownUp,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  FileText,
  Filter,
  Lock,
  Search,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
  UserCheck,
  Users,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  exportRowsToExcel,
  normalizeQualityObservationRows,
} from '../services/excelAnalyzers';
import { fetchNominalModuleData, fetchPublicBatchRows } from '../services/firestoreService';
import { fetchServerNominalDataset, fetchServerPublicDataset } from '../services/adminApiService';
import { exportInstitutionalPdf, printInstitutionalReport } from '../services/pdfExportService';
import {
  AdminSessionState,
  ContentDocumentItem,
  DriveDocumentItem,
  MICROREDES_RIS,
  NominalManifest,
  NominalRecord,
  PublicManifest,
  QualityObservationRecord,
  QualitySeverity,
  QualitySummaryRow,
  UserProfile,
} from '../types';
import { ExportToolbar } from './ExportToolbar';
import { ModuleDrivePanel } from './ModuleDrivePanel';

interface QualityModuleProps {
  manifest?: PublicManifest;
  user: UserProfile | null;
  adminSession: AdminSessionState;
  onOpenAuth: () => void;
  driveFiles: DriveDocumentItem[];
  manualDocs: ContentDocumentItem[];
  onPreviewFile: (file: DriveDocumentItem) => void;
}

const AGE_GROUPS_30_59 = ['30-34', '35-39', '40-44', '45-49', '50-54', '55-59'];
const PIE_COLORS = ['#102A43', '#1E4E79', '#F07832', '#E89B6C', '#475569', '#0B1F33', '#94A3B8'];
const PAGE_SIZE = 40;

type SortField = 'nro' | 'fechaDeteccion' | 'microred' | 'establecimiento' | 'tipoError' | 'nivelGravedad';

export const QualityModule: React.FC<QualityModuleProps> = ({
  manifest,
  user,
  adminSession,
  onOpenAuth,
  driveFiles,
  manualDocs,
  onPreviewFile,
}) => {
  const [viewMode, setViewMode] = useState<'ejecutivo' | 'resumen'>('resumen');
  const [summaryRows, setSummaryRows] = useState<QualitySummaryRow[]>([]);
  const [nominalManifest, setNominalManifest] = useState<NominalManifest | null>(null);
  const [rawDetailRows, setRawDetailRows] = useState<NominalRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  // A. 13 Combined Filters
  const [filterMes, setFilterMes] = useState('Todos');
  const [filterDesde, setFilterDesde] = useState('');
  const [filterHasta, setFilterHasta] = useState('');
  const [filterMicrored, setFilterMicrored] = useState('Todas');
  const [filterIpress, setFilterIpress] = useState('Todos');
  const [filterPersonalSelect, setFilterPersonalSelect] = useState('Todos');
  const [filterTipoError, setFilterTipoError] = useState('Todos');
  const [filterLote, setFilterLote] = useState('');
  const [filterHoja, setFilterHoja] = useState('');
  const [filterRegistro, setFilterRegistro] = useState('');
  const [filterDniPersonal, setFilterDniPersonal] = useState('');
  const [filterNombrePersonal, setFilterNombrePersonal] = useState('');
  const [filterPacienteQuery, setFilterPacienteQuery] = useState('');

  const [sortField, setSortField] = useState<SortField>('nro');
  const [sortAsc, setSortAsc] = useState(true);
  const [page, setPage] = useState(1);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [localManifest, setLocalManifest] = useState<PublicManifest | null>(null);

  const canAccessDetail = Boolean(
    adminSession.authenticated || (user && (user.role === 'admin' || user.nominalAccess))
  );

  // Default authorized users directly to executive detail if desired, or load cleanly
  useEffect(() => {
    if (canAccessDetail) {
      setViewMode('ejecutivo');
    }
  }, [canAccessDetail]);

  // Load Public Summary (Fast server dataset FIRST, optional Firestore fallback)
  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const srv = await fetchServerPublicDataset<QualitySummaryRow>('calidad_resumen');
        if (active && srv.rows?.length) {
          setSummaryRows(srv.rows);
          if (srv.manifest) setLocalManifest(srv.manifest);
          return;
        }
        if (manifest?.batchIds?.length) {
          const rows = await fetchPublicBatchRows<QualitySummaryRow>(manifest);
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

  // Load Detailed Observations (authorized only)
  useEffect(() => {
    let active = true;
    async function loadDetail() {
      if (viewMode !== 'ejecutivo' || !canAccessDetail) return;
      setLoadingDetail(true);
      try {
        if (adminSession.authenticated) {
          const srv = await fetchServerNominalDataset('calidad').catch(() => null);
          if (active && srv?.rows?.length) {
            setNominalManifest(srv.manifest);
            setRawDetailRows(srv.rows);
            return;
          }
        }
        if (user) {
          const fb = await fetchNominalModuleData('calidad');
          if (active) {
            setNominalManifest(fb.manifest);
            setRawDetailRows(fb.rows);
          }
        }
      } finally {
        if (active) setLoadingDetail(false);
      }
    }
    loadDetail();
    return () => {
      active = false;
    };
  }, [viewMode, canAccessDetail, adminSession.authenticated, user]);

  const normalizedObs = useMemo(
    () => normalizeQualityObservationRows(rawDetailRows),
    [rawDetailRows]
  );

  // Dynamic Filter Dropdown Options
  const mesesOptions = useMemo(() => {
    const set = new Set(normalizedObs.map((r) => r.periodo).filter((p) => p && p !== 'Sin periodo'));
    return ['Todos', ...Array.from(set).sort().reverse()];
  }, [normalizedObs]);

  const ipressOptions = useMemo(() => {
    const src = viewMode === 'ejecutivo' ? normalizedObs : summaryRows;
    const set = new Set<string>();
    for (const r of src) {
      const mr = r.microred;
      const eess = 'establecimiento' in r ? r.establecimiento : r.ipress;
      if ((filterMicrored === 'Todas' || mr === filterMicrored) && eess) set.add(eess);
    }
    return ['Todos', ...Array.from(set).sort()];
  }, [viewMode, normalizedObs, summaryRows, filterMicrored]);

  const personalOptions = useMemo(() => {
    const set = new Set(
      normalizedObs
        .filter((r) => filterIpress === 'Todos' || r.establecimiento === filterIpress)
        .map((r) => r.nombrePersonal)
        .filter(Boolean)
    );
    return ['Todos', ...Array.from(set).sort()];
  }, [normalizedObs, filterIpress]);

  const errorTypeOptions = useMemo(() => {
    const set = new Set(normalizedObs.filter((r) => r.isError).map((r) => r.tipoError));
    return ['Todos', ...Array.from(set).sort()];
  }, [normalizedObs]);

  // Apply all 13 Filters
  const filteredObs = useMemo(() => {
    const loteQ = filterLote.trim().toLowerCase();
    const hojaQ = filterHoja.trim().toLowerCase();
    const regQ = filterRegistro.trim().toLowerCase();
    const dniPersQ = filterDniPersonal.trim().toLowerCase();
    const nomPersQ = filterNombrePersonal.trim().toLowerCase();
    const pacQ = filterPacienteQuery.trim().toLowerCase();

    return normalizedObs.filter((r) => {
      if (filterMes !== 'Todos' && r.periodo !== filterMes) return false;
      if (filterDesde && /^\d{4}-\d{2}-\d{2}$/.test(r.fechaDeteccion) && r.fechaDeteccion < filterDesde)
        return false;
      if (filterHasta && /^\d{4}-\d{2}-\d{2}$/.test(r.fechaDeteccion) && r.fechaDeteccion > filterHasta)
        return false;
      if (filterMicrored !== 'Todas' && r.microred !== filterMicrored) return false;
      if (filterIpress !== 'Todos' && r.establecimiento !== filterIpress) return false;
      if (filterPersonalSelect !== 'Todos' && r.nombrePersonal !== filterPersonalSelect) return false;
      if (filterTipoError !== 'Todos' && r.tipoError !== filterTipoError) return false;
      if (loteQ && !r.lote.toLowerCase().includes(loteQ)) return false;
      if (hojaQ && !r.hoja.toLowerCase().includes(hojaQ)) return false;
      if (regQ && !r.registro.toLowerCase().includes(regQ)) return false;
      if (dniPersQ && !r.dniPersonal.toLowerCase().includes(dniPersQ)) return false;
      if (nomPersQ && !r.nombrePersonal.toLowerCase().includes(nomPersQ)) return false;
      if (
        pacQ &&
        !r.nombrePaciente.toLowerCase().includes(pacQ) &&
        !r.dniPaciente.toLowerCase().includes(pacQ)
      ) {
        return false;
      }
      return true;
    });
  }, [
    normalizedObs,
    filterMes,
    filterDesde,
    filterHasta,
    filterMicrored,
    filterIpress,
    filterPersonalSelect,
    filterTipoError,
    filterLote,
    filterHoja,
    filterRegistro,
    filterDniPersonal,
    filterNombrePersonal,
    filterPacienteQuery,
  ]);

  const sortedObs = useMemo(() => {
    const arr = [...filteredObs];
    arr.sort((a, b) => {
      const av = String(a[sortField] ?? '');
      const bv = String(b[sortField] ?? '');
      if (sortField === 'nro') {
        return sortAsc ? a.nro - b.nro : b.nro - a.nro;
      }
      return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
    });
    return arr;
  }, [filteredObs, sortField, sortAsc]);

  const totalPages = Math.max(1, Math.ceil(sortedObs.length / PAGE_SIZE));
  const paginatedObs = sortedObs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // B. 4 Executive KPI Cards + Previous Period Comparison
  const kpiMetrics = useMemo(() => {
    const errorRows = filteredObs.filter((r) => r.isError);
    const totalErrors = errorRows.length;
    const affectedPatients = new Set(
      errorRows.map((r) => (r.dniPaciente !== '—' ? r.dniPaciente : r.nombrePaciente))
    ).size;
    const staffWithErrors = new Set(
      errorRows.map((r) => (r.dniPersonal !== '—' ? r.dniPersonal : r.nombrePersonal))
    ).size;
    const establishmentsWithObs = new Set(errorRows.map((r) => r.establecimiento)).size;

    // Calculate previous period delta when a previous month exists in normalizedObs
    const allPeriods = Array.from(
      new Set(normalizedObs.map((r) => r.periodo).filter((p) => /^\d{4}-\d{2}$/.test(p)))
    ).sort();
    const activePeriod =
      filterMes !== 'Todos' ? filterMes : allPeriods[allPeriods.length - 1] || '';
    const idxPrev = allPeriods.indexOf(activePeriod) - 1;
    const prevPeriod = idxPrev >= 0 ? allPeriods[idxPrev] : null;

    let deltaErrors: number | null = null;
    let deltaPatients: number | null = null;
    let deltaStaff: number | null = null;
    let deltaEstab: number | null = null;

    if (prevPeriod) {
      const prevErrs = normalizedObs.filter((r) => r.isError && r.periodo === prevPeriod);
      const calcVar = (curr: number, prev: number): number | null => {
        if (prev === 0) return curr > 0 ? 100 : 0;
        return Number((((curr - prev) / prev) * 100).toFixed(1));
      };
      deltaErrors = calcVar(totalErrors, prevErrs.length);
      deltaPatients = calcVar(
        affectedPatients,
        new Set(prevErrs.map((r) => (r.dniPaciente !== '—' ? r.dniPaciente : r.nombrePaciente))).size
      );
      deltaStaff = calcVar(
        staffWithErrors,
        new Set(prevErrs.map((r) => (r.dniPersonal !== '—' ? r.dniPersonal : r.nombrePersonal))).size
      );
      deltaEstab = calcVar(
        establishmentsWithObs,
        new Set(prevErrs.map((r) => r.establecimiento)).size
      );
    }

    return {
      totalErrors,
      affectedPatients,
      staffWithErrors,
      establishmentsWithObs,
      prevPeriod,
      deltaErrors,
      deltaPatients,
      deltaStaff,
      deltaEstab,
    };
  }, [filteredObs, normalizedObs, filterMes]);

  // D. Ranking of Errors by Responsible Staff & Establishment
  const responsibleRanking = useMemo(() => {
    const errorRows = filteredObs.filter((r) => r.isError);
    const totalErr = errorRows.length;
    const map = new Map<
      string,
      {
        microred: string;
        establecimiento: string;
        personal: string;
        count: number;
        errorTypeCounts: Record<string, number>;
      }
    >();

    for (const r of errorRows) {
      const key = `${r.microred}__${r.establecimiento}__${r.nombrePersonal}`;
      const curr = map.get(key) || {
        microred: r.microred,
        establecimiento: r.establecimiento,
        personal: r.nombrePersonal,
        count: 0,
        errorTypeCounts: {},
      };
      curr.count += 1;
      curr.errorTypeCounts[r.tipoError] = (curr.errorTypeCounts[r.tipoError] || 0) + 1;
      map.set(key, curr);
    }

    return Array.from(map.values())
      .sort((a, b) => b.count - a.count)
      .map((item, idx) => {
        const topError = Object.entries(item.errorTypeCounts).sort((x, y) => y[1] - x[1])[0]?.[0] || '—';
        return {
          posicion: idx + 1,
          microred: item.microred,
          establecimiento: item.establecimiento,
          personal: item.personal,
          cantidadErrores: item.count,
          participacionPct: totalErr > 0 ? Number(((item.count / totalErr) * 100).toFixed(1)) : 0,
          tipoPredominante: topError,
        };
      });
  }, [filteredObs]);

  // F. Pie Chart: Patients by 5-year Age Groups (30-34 to 55-59)
  const ageGroupDistribution = useMemo(() => {
    const uniquePatients = new Map<string, QualityObservationRecord>();
    for (const r of filteredObs) {
      const pKey = r.dniPaciente !== '—' ? r.dniPaciente : `${r.nombrePaciente}_${r.nro}`;
      if (!uniquePatients.has(pKey)) {
        uniquePatients.set(pKey, r);
      }
    }

    const counts: Record<string, number> = {};
    for (const grp of AGE_GROUPS_30_59) counts[grp] = 0;

    let totalAnalyzed = 0;
    for (const p of uniquePatients.values()) {
      const grp = p.grupoEdad;
      if (grp in counts) {
        counts[grp] += 1;
      } else if (grp !== 'Sin dato') {
        counts[grp] = (counts[grp] || 0) + 1;
      } else {
        counts['Sin dato'] = (counts['Sin dato'] || 0) + 1;
      }
      totalAnalyzed += 1;
    }

    return {
      totalAnalyzed,
      slices: Object.entries(counts)
        .filter(([, count]) => count > 0)
        .map(([name, value], i) => ({
          name: `${name} años`,
          rawGroup: name,
          value,
          pct: totalAnalyzed > 0 ? Number(((value / totalAnalyzed) * 100).toFixed(1)) : 0,
          color: PIE_COLORS[i % PIE_COLORS.length],
        })),
    };
  }, [filteredObs]);

  // G. Daily Evolution Bar Chart
  const dailyEvolutionData = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of filteredObs.filter((x) => x.isError)) {
      const d = r.fechaDeteccion || 'Sin fecha';
      map.set(d, (map.get(d) || 0) + 1);
    }
    const entries = Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([fecha, errores]) => ({ fecha, errores }));
    const peak = entries.reduce(
      (max, curr) => (curr.errores > max.errores ? curr : max),
      { fecha: '—', errores: 0 }
    );
    return { entries, peak };
  }, [filteredObs]);

  // E. Intelligent Statistical Quality Engine (Factual over filteredObs)
  const intelligentAnalysis = useMemo(() => {
    const errors = filteredObs.filter((r) => r.isError);
    if (errors.length === 0) {
      return {
        highlights: [
          'No se registran observaciones de error HIS en los criterios actualmente seleccionados.',
        ],
        recommendations: [
          'Mantener las auditorías periódicas de consistencia de códigos CPMS, CIE-10 y campos LAB.',
        ],
      };
    }

    const total = errors.length;
    const countBy = (fn: (r: QualityObservationRecord) => string) => {
      const m = new Map<string, number>();
      for (const e of errors) {
        const k = fn(e);
        m.set(k, (m.get(k) || 0) + 1);
      }
      return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
    };

    const topErrors = countBy((r) => r.tipoError);
    const topMicroredes = countBy((r) => r.microred);
    const topEstablishments = countBy((r) => r.establecimiento);
    const topStaff = countBy((r) => r.nombrePersonal);
    const critCount = errors.filter(
      (e) => e.nivelGravedad === 'Crítico' || e.nivelGravedad === 'Alto'
    ).length;
    const pendingCount = errors.filter((e) => e.estadoSubsanacion === 'Pendiente').length;

    const topErr = topErrors[0];
    const topMr = topMicroredes[0];
    const topEst = topEstablishments[0];
    const topPers = topStaff[0];
    const top3EstSum = topEstablishments.slice(0, 3).reduce((s, [, c]) => s + c, 0);
    const estConcentration = Number(((top3EstSum / total) * 100).toFixed(1));

    const highlights: string[] = [
      `Error más frecuente: "${topErr[0]}" con ${topErr[1]} casos (${((topErr[1] / total) * 100).toFixed(1)}% del total de observaciones).`,
      `Incidencia territorial: La Microred ${topMr[0]} concentra ${topMr[1]} observaciones (${((topMr[1] / total) * 100).toFixed(1)}%), encabezada por ${topEst[0]} (${topEst[1]} errores).`,
      `Concentración operativa: Los 3 establecimientos con más observaciones acumulan el ${estConcentration}% de los errores; en personal destaca ${topPers[0]} con ${topPers[1]} registros observados.`,
      `Severidad y subsanación: ${critCount} observaciones (${((critCount / total) * 100).toFixed(1)}%) son de nivel Crítico/Alto y ${pendingCount} (${((pendingCount / total) * 100).toFixed(1)}%) permanecen pendientes de corrección.`,
    ];

    if (dailyEvolutionData.peak.errores > 0) {
      highlights.push(
        `Comportamiento temporal: El pico diario se registró el ${dailyEvolutionData.peak.fecha} con ${dailyEvolutionData.peak.errores} observaciones detectadas${
          kpiMetrics.deltaErrors !== null
            ? `; frente al periodo previo (${kpiMetrics.prevPeriod}) la variación es de ${kpiMetrics.deltaErrors > 0 ? '+' : ''}${kpiMetrics.deltaErrors}%`
            : ''
        }.`
      );
    }

    const recommendations: string[] = [];
    const joinedTypes = topErrors
      .slice(0, 3)
      .map(([t]) => t.toLowerCase())
      .join(' ');
    if (joinedTypes.includes('lab')) {
      recommendations.push(
        'Reforzar la verificación del campo LAB en tamizajes y laboratorios del adulto antes del cierre de hoja HIS.'
      );
    }
    if (joinedTypes.includes('duplic')) {
      recommendations.push(
        'Implementar control previo por DNI/fecha/lote en digitación para evitar duplicidad de prestaciones.'
      );
    }
    if (joinedTypes.includes('cie') || joinedTypes.includes('inconsis')) {
      recommendations.push(
        'Socializar la Cartilla Digital HIS para asegurar correspondencia entre tipo de diagnóstico (P/D/R) y código CIE-10/CPMS.'
      );
    }
    recommendations.push(
      `Priorizar asistencia técnica focalizada en ${topEst[0]} (Microred ${topMr[0]}) para subsanar los ${pendingCount} registros pendientes.`
    );

    return { highlights, recommendations };
  }, [filteredObs, dailyEvolutionData, kpiMetrics]);

  // Aggregate summary fallback (when public/resumen view)
  const filteredSummary = useMemo(() => {
    const q = filterPacienteQuery.trim().toLowerCase();
    return summaryRows.filter((r) => {
      const matchMr = filterMicrored === 'Todas' || r.microred === filterMicrored;
      const matchIp = filterIpress === 'Todos' || r.ipress === filterIpress;
      const matchQ =
        !q ||
        r.ipress.toLowerCase().includes(q) ||
        r.principalObservacion.toLowerCase().includes(q);
      return matchMr && matchIp && matchQ;
    });
  }, [summaryRows, filterMicrored, filterIpress, filterPacienteQuery]);

  const summaryKpis = useMemo(() => {
    const evaluados = filteredSummary.reduce((s, r) => s + r.registrosEvaluados, 0);
    const conformes = filteredSummary.reduce((s, r) => s + r.conformes, 0);
    const observados = filteredSummary.reduce((s, r) => s + r.observados, 0);
    const tasa = evaluados > 0 ? Number(((conformes / evaluados) * 100).toFixed(1)) : 0;
    return { evaluados, conformes, observados, tasa };
  }, [filteredSummary]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const getSeverityBadge = (sev: QualitySeverity) => {
    switch (sev) {
      case 'Crítico':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'Alto':
        return 'bg-[#F07832]/18 text-[#D96420] border-[#F07832]/35';
      case 'Moderado':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'Leve':
        return 'bg-slate-100 text-[#102A43] border-slate-200';
      default:
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    }
  };

  const resetAllFilters = () => {
    setFilterMes('Todos');
    setFilterDesde('');
    setFilterHasta('');
    setFilterMicrored('Todas');
    setFilterIpress('Todos');
    setFilterPersonalSelect('Todos');
    setFilterTipoError('Todos');
    setFilterLote('');
    setFilterHoja('');
    setFilterRegistro('');
    setFilterDniPersonal('');
    setFilterNombrePersonal('');
    setFilterPacienteQuery('');
  };

  const activeFiltersLabel = `Mes: ${filterMes} | Microred: ${filterMicrored} | IPRESS: ${filterIpress} | Error: ${filterTipoError}`;

  const handleExportExcel = () => {
    if (viewMode === 'ejecutivo') {
      if (!canAccessDetail) return;
      const rows = sortedObs.map((r, i) => ({
        'N.º': i + 1,
        'Fecha detección': r.fechaDeteccion,
        Microred: r.microred,
        Establecimiento: r.establecimiento,
        'DNI personal': r.dniPersonal,
        'Nombre personal': r.nombrePersonal,
        'DNI paciente': r.dniPaciente,
        'Nombre paciente': r.nombrePaciente,
        Lote: r.lote,
        Hoja: r.hoja,
        Registro: r.registro,
        'Tipo de error': r.tipoError,
        'Descripción observación': r.descripcionObservacion,
        'Nivel de gravedad': r.nivelGravedad,
        'Estado subsanación': r.estadoSubsanacion,
      }));
      exportRowsToExcel(rows, 'RIS_San_Ignacio_Control_Calidad_Detalle', 'Calidad', {
        modulo: 'Control de Calidad HIS — Reporte Ejecutivo',
        periodo: filterMes === 'Todos' ? nominalManifest?.period || 'Vigente' : filterMes,
        filtros: activeFiltersLabel,
        fuente: nominalManifest?.fileName || 'Auditoría HIS RIS San Ignacio',
      });
    } else {
      exportRowsToExcel(
        filteredSummary as unknown as Record<string, unknown>[],
        'RIS_San_Ignacio_Control_Calidad_Resumen',
        'Resumen_Calidad',
        {
          modulo: 'Control de Calidad HIS — Resumen por IPRESS',
          periodo: manifest?.period || 'Vigente',
          filtros: `Microred: ${filterMicrored} | IPRESS: ${filterIpress}`,
          fuente: manifest?.fileName || 'Auditoría HIS RIS San Ignacio',
        }
      );
    }
  };

  const handleExportExecutivePdf = async () => {
    setExportingPdf(true);
    try {
      if (viewMode === 'ejecutivo' && canAccessDetail) {
        await exportInstitutionalPdf({
          fileName: 'RIS_San_Ignacio_Control_Calidad_Ejecutivo',
          moduleName: 'Control de Calidad HIS · Reporte Ejecutivo',
          subtitle: 'Auditoría de inconsistencias, ranking por responsable y análisis estadístico',
          period: filterMes === 'Todos' ? nominalManifest?.period || 'Vigente' : filterMes,
          appliedFilters: activeFiltersLabel,
          dataSource: nominalManifest?.fileName || 'Auditoría HIS RIS San Ignacio',
          kpis: [
            { label: 'Errores Encontrados', value: String(kpiMetrics.totalErrors) },
            { label: 'Pacientes Afectados', value: String(kpiMetrics.affectedPatients) },
            { label: 'Personal con Errores', value: String(kpiMetrics.staffWithErrors) },
            { label: 'IPRESS Observadas', value: String(kpiMetrics.establishmentsWithObs) },
          ],
          narrativeTitle: 'ANÁLISIS INTELIGENTE DEL CONTROL DE CALIDAD',
          narrativeParagraphs: [
            ...intelligentAnalysis.highlights,
            ...intelligentAnalysis.recommendations.map((r) => `Recomendación: ${r}`),
          ],
          sections: [
            {
              title: 'Ranking de Errores por Responsable y Establecimiento',
              columns: [
                'Pos.',
                'Microred',
                'Establecimiento',
                'Personal',
                'Errores',
                '% Part.',
                'Error Predominante',
              ],
              rows: responsibleRanking.slice(0, 30).map((r) => [
                r.posicion,
                r.microred,
                r.establecimiento,
                r.personal,
                r.cantidadErrores,
                `${r.participacionPct}%`,
                r.tipoPredominante,
              ]),
            },
            {
              title: 'Detalle de Observaciones Detectadas (Muestra hasta 150 registros)',
              columns: [
                'N.º',
                'Fecha',
                'IPRESS',
                'Personal',
                'Paciente / DNI',
                'Lote/Hoja/Reg',
                'Tipo de Error',
                'Gravedad',
                'Estado',
              ],
              rows: sortedObs.slice(0, 150).map((r, i) => [
                i + 1,
                r.fechaDeteccion,
                r.establecimiento,
                r.nombrePersonal,
                `${r.nombrePaciente} (${r.dniPaciente})`,
                `${r.lote}/${r.hoja}/${r.registro}`,
                r.tipoError,
                r.nivelGravedad,
                r.estadoSubsanacion,
              ]),
            },
          ],
        });
      } else {
        await exportInstitutionalPdf({
          fileName: 'RIS_San_Ignacio_Control_Calidad_Resumen',
          moduleName: 'Control de Calidad HIS · Resumen por IPRESS',
          subtitle: 'Consolidado agregado de conformidad de registros HIS',
          period: manifest?.period || 'Vigente',
          appliedFilters: `Microred: ${filterMicrored} | IPRESS: ${filterIpress}`,
          dataSource: manifest?.fileName || 'Auditoría HIS RIS San Ignacio',
          kpis: [
            { label: 'Evaluados', value: summaryKpis.evaluados.toLocaleString('es-PE') },
            { label: 'Conformes', value: summaryKpis.conformes.toLocaleString('es-PE') },
            { label: 'Observados', value: summaryKpis.observados.toLocaleString('es-PE') },
            { label: 'Tasa Conformidad', value: `${summaryKpis.tasa}%` },
          ],
          sections: [
            {
              title: 'Resumen por Establecimiento',
              columns: [
                'Microred',
                'IPRESS',
                'Evaluados',
                'Conformes',
                'Observados',
                'Conformidad',
                'Observación Principal',
              ],
              rows: filteredSummary.map((r) => [
                r.microred,
                r.ipress,
                r.registrosEvaluados,
                r.conformes,
                r.observados,
                `${r.tasaConformidad}%`,
                r.principalObservacion,
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
      {/* Header */}
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
            Sistema Avanzado de Control de Calidad HIS
          </h1>
          <p className="text-[13.5px] text-[#102A43]/70 mt-1">
            Monitoreo de inconsistencias, ranking por responsable, distribución etaria, evolución
            diaria y análisis estadístico inteligente.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="inline-flex items-center p-1 bg-[#F8F7F2] rounded-xl border border-[#102A43]/12 no-print">
            <button
              type="button"
              onClick={() => setViewMode('resumen')}
              className={`px-3.5 py-1.5 rounded-lg text-[13px] font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                viewMode === 'resumen'
                  ? 'bg-[#102A43] text-white shadow-xs'
                  : 'text-[#102A43]/70 hover:text-[#102A43]'
              }`}
            >
              Resumen por IPRESS
            </button>
            <button
              type="button"
              onClick={() => setViewMode('ejecutivo')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[13px] font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                viewMode === 'ejecutivo'
                  ? 'bg-[#102A43] text-white shadow-xs'
                  : 'text-[#102A43]/70 hover:text-[#102A43]'
              }`}
            >
              {!canAccessDetail && <Lock className="w-3.5 h-3.5 text-[#F07832]" />}
              <span>Control Ejecutivo Detallado</span>
            </button>
          </div>

          <ExportToolbar
            onExportExcel={handleExportExcel}
            onExportPdf={handleExportExecutivePdf}
            onPrint={printInstitutionalReport}
            disabledExcel={
              viewMode === 'ejecutivo'
                ? !canAccessDetail || sortedObs.length === 0
                : filteredSummary.length === 0
            }
            disabledPdf={
              viewMode === 'ejecutivo'
                ? !canAccessDetail || sortedObs.length === 0
                : filteredSummary.length === 0
            }
            loadingPdf={exportingPdf}
          />
        </div>
      </div>

      {/* A. Filters Panel */}
      <section className="card-premium rounded-2xl p-4 sm:p-5 space-y-3 no-print">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[13px] font-bold text-[#102A43]">
            <Filter className="w-4 h-4 text-[#F07832]" />
            <span>
              {viewMode === 'ejecutivo'
                ? 'Filtros Avanzados de Auditoría HIS (13 criterios combinables)'
                : 'Filtros por Microred e IPRESS'}
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
            onClick={resetAllFilters}
            className="text-[12px] font-semibold text-[#F07832] hover:underline cursor-pointer"
          >
            Restablecer filtros
          </button>
        </div>

        <div className={`${mobileFiltersOpen ? 'grid' : 'hidden md:grid'} grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5`}>
          <select
            value={filterMicrored}
            onChange={(e) => {
              setFilterMicrored(e.target.value);
              setFilterIpress('Todos');
            }}
            className="px-3 py-2 text-[12.5px] bg-white border border-[#102A43]/15 rounded-xl font-semibold text-[#102A43]"
          >
            <option value="Todas">Microred: Todas</option>
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
            className="px-3 py-2 text-[12.5px] bg-white border border-[#102A43]/15 rounded-xl font-semibold text-[#102A43]"
          >
            {ipressOptions.map((eess) => (
              <option key={eess} value={eess}>
                Establecimiento: {eess}
              </option>
            ))}
          </select>

          {viewMode === 'ejecutivo' && (
            <>
              <select
                value={filterMes}
                onChange={(e) => setFilterMes(e.target.value)}
                className="px-3 py-2 text-[12.5px] bg-white border border-[#102A43]/15 rounded-xl font-semibold text-[#102A43]"
              >
                {mesesOptions.map((m) => (
                  <option key={m} value={m}>
                    Mes / Periodo: {m}
                  </option>
                ))}
              </select>

              <input
                type="date"
                value={filterDesde}
                onChange={(e) => setFilterDesde(e.target.value)}
                title="Periodo desde"
                className="px-3 py-2 text-[12.5px] bg-[#F8F7F2] border border-[#102A43]/15 rounded-xl"
              />

              <input
                type="date"
                value={filterHasta}
                onChange={(e) => setFilterHasta(e.target.value)}
                title="Periodo hasta"
                className="px-3 py-2 text-[12.5px] bg-[#F8F7F2] border border-[#102A43]/15 rounded-xl"
              />

              <select
                value={filterPersonalSelect}
                onChange={(e) => setFilterPersonalSelect(e.target.value)}
                className="px-3 py-2 text-[12.5px] bg-white border border-[#102A43]/15 rounded-xl font-semibold text-[#102A43]"
              >
                {personalOptions.map((p) => (
                  <option key={p} value={p}>
                    Personal: {p}
                  </option>
                ))}
              </select>

              <select
                value={filterTipoError}
                onChange={(e) => setFilterTipoError(e.target.value)}
                className="px-3 py-2 text-[12.5px] bg-white border border-[#102A43]/15 rounded-xl font-semibold text-[#102A43]"
              >
                {errorTypeOptions.map((t) => (
                  <option key={t} value={t}>
                    Tipo de error: {t}
                  </option>
                ))}
              </select>

              <input
                type="text"
                value={filterLote}
                onChange={(e) => setFilterLote(e.target.value)}
                placeholder="Lote..."
                className="px-3 py-2 text-[12.5px] bg-[#F8F7F2] border border-[#102A43]/15 rounded-xl font-mono-tabular"
              />

              <input
                type="text"
                value={filterHoja}
                onChange={(e) => setFilterHoja(e.target.value)}
                placeholder="Hoja..."
                className="px-3 py-2 text-[12.5px] bg-[#F8F7F2] border border-[#102A43]/15 rounded-xl font-mono-tabular"
              />

              <input
                type="text"
                value={filterRegistro}
                onChange={(e) => setFilterRegistro(e.target.value)}
                placeholder="Registro / Código..."
                className="px-3 py-2 text-[12.5px] bg-[#F8F7F2] border border-[#102A43]/15 rounded-xl font-mono-tabular"
              />

              <input
                type="text"
                value={filterDniPersonal}
                onChange={(e) => setFilterDniPersonal(e.target.value)}
                placeholder="DNI del personal..."
                className="px-3 py-2 text-[12.5px] bg-[#F8F7F2] border border-[#102A43]/15 rounded-xl font-mono-tabular"
              />

              <input
                type="text"
                value={filterNombrePersonal}
                onChange={(e) => setFilterNombrePersonal(e.target.value)}
                placeholder="Nombre del personal..."
                className="px-3 py-2 text-[12.5px] bg-[#F8F7F2] border border-[#102A43]/15 rounded-xl"
              />
            </>
          )}

          <div className="relative sm:col-span-2 lg:col-span-3">
            <Search className="w-3.5 h-3.5 text-[#102A43]/45 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={filterPacienteQuery}
              onChange={(e) => setFilterPacienteQuery(e.target.value)}
              placeholder={
                viewMode === 'ejecutivo'
                  ? 'Buscar por Nombre o DNI del paciente...'
                  : 'Filtrar por IPRESS o tipo de observación HIS...'
              }
              className="w-full pl-8 pr-3 py-2 text-[12.5px] bg-[#F8F7F2] border border-[#102A43]/15 rounded-xl"
            />
          </div>
        </div>
      </section>

      {/* EXECUTIVE DETAILED VIEW */}
      {viewMode === 'ejecutivo' ? (
        !canAccessDetail ? (
          <div className="card-premium rounded-2xl p-8 sm:p-10 text-center max-w-2xl mx-auto">
            <div className="w-12 h-12 rounded-2xl bg-[#102A43]/10 text-[#102A43] flex items-center justify-center mx-auto mb-4">
              <Lock className="w-6 h-6 text-[#F07832]" />
            </div>
            <h2 className="font-display text-lg font-bold text-[#102A43] mb-2">
              Acceso Restringido al Detalle Nominal de Control de Calidad
            </h2>
            <p className="text-[14px] text-[#102A43]/75 leading-relaxed mb-6">
              El tablero nominal fila por fila incluye DNI del personal y del paciente. Inicie sesión
              con cuenta autorizada para visualizar el detalle completo y el análisis por
              responsable.
            </p>
            {!user ? (
              <button
                type="button"
                onClick={onOpenAuth}
                className="inline-flex items-center gap-2 bg-[#102A43] hover:bg-[#183B5E] text-white font-semibold text-[13.5px] px-5 py-2.5 rounded-xl cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4 text-[#F07832]" />
                <span>Iniciar sesión institucional</span>
              </button>
            ) : (
              <p className="text-[13px] font-medium text-[#102A43] bg-[#F07832]/12 border border-[#F07832]/30 px-4 py-2.5 rounded-xl inline-block">
                Usuario conectado: {user.email} (Requiere habilitación de Acceso Nominal).
              </p>
            )}
          </div>
        ) : loadingDetail ? (
          <div className="card-premium rounded-2xl p-10 text-center text-[#102A43]/65 text-sm">
            Procesando observaciones de Control de Calidad HIS...
          </div>
        ) : rawDetailRows.length === 0 ? (
          <div className="card-premium rounded-2xl p-10 text-center">
            <ClipboardCheck className="w-10 h-10 text-[#102A43]/25 mx-auto mb-3" />
            <h3 className="font-display text-base font-bold text-[#102A43]">
              Sin auditoría de Control de Calidad cargada aún
            </h3>
            <p className="text-sm text-[#102A43]/65 mt-1">
              El administrador debe cargar la matriz de Control de Calidad HIS desde el módulo
              privado de Administración.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* B. 4 Executive KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              {[
                {
                  title: 'CANTIDAD DE ERRORES ENCONTRADOS',
                  value: kpiMetrics.totalErrors,
                  delta: kpiMetrics.deltaErrors,
                  icon: AlertTriangle,
                  accent: true,
                },
                {
                  title: 'PACIENTES AFECTADOS',
                  value: kpiMetrics.affectedPatients,
                  delta: kpiMetrics.deltaPatients,
                  icon: Users,
                },
                {
                  title: 'PERSONAL CON ERRORES',
                  value: kpiMetrics.staffWithErrors,
                  delta: kpiMetrics.deltaStaff,
                  icon: UserCheck,
                },
                {
                  title: 'ESTABLECIMIENTOS CON OBSERVACIONES',
                  value: kpiMetrics.establishmentsWithObs,
                  delta: kpiMetrics.deltaEstab,
                  icon: Building2,
                },
              ].map((card) => {
                const Icon = card.icon;
                return (
                  <div key={card.title} className="card-premium rounded-2xl p-5 flex flex-col justify-between">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[11px] font-bold tracking-wide text-[#102A43]/70 leading-snug">
                        {card.title}
                      </span>
                      <Icon
                        className={`w-5 h-5 shrink-0 ${
                          card.accent ? 'text-[#F07832]' : 'text-[#102A43]'
                        }`}
                      />
                    </div>
                    <div className="mt-3 flex items-baseline justify-between gap-2">
                      <p
                        className={`font-mono-tabular text-3xl font-extrabold ${
                          card.accent ? 'text-[#F07832]' : 'text-[#102A43]'
                        }`}
                      >
                        {card.value.toLocaleString('es-PE')}
                      </p>
                      {card.delta !== null ? (
                        <span
                          className={`inline-flex items-center gap-1 text-[11.5px] font-bold font-mono-tabular ${
                            card.delta > 0 ? 'text-red-600' : 'text-emerald-700'
                          }`}
                        >
                          {card.delta > 0 ? (
                            <TrendingUp className="w-3.5 h-3.5" />
                          ) : (
                            <TrendingDown className="w-3.5 h-3.5" />
                          )}
                          {card.delta > 0 ? '+' : ''}
                          {card.delta}% vs {kpiMetrics.prevPeriod}
                        </span>
                      ) : (
                        <span className="text-[11px] text-[#102A43]/55">Periodo único cargado</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* E. Wide Intelligent Analysis Card */}
            <section className="rounded-2xl bg-gradient-to-br from-[#102A43] via-[#153554] to-[#0B1F33] text-white p-6 shadow-lg border border-[#102A43]">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#F07832] text-white flex items-center justify-center shrink-0">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="font-display text-base sm:text-lg font-bold">
                      ANÁLISIS INTELIGENTE DEL CONTROL DE CALIDAD
                    </h2>
                    <p className="text-[12px] text-slate-300">
                      Diagnóstico estadístico automatizado sobre {filteredObs.length} registros
                      filtrados
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleExportExecutivePdf}
                  disabled={exportingPdf}
                  className="inline-flex items-center gap-2 bg-[#F07832] hover:bg-[#D96420] text-white font-bold text-[12.5px] px-4 py-2.5 rounded-xl transition-colors shadow-sm shrink-0 cursor-pointer no-print"
                >
                  <FileText className="w-4 h-4" />
                  <span>
                    {exportingPdf ? 'Generando PDF...' : 'Generar Reporte Ejecutivo PDF'}
                  </span>
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 text-[13px]">
                <div className="lg:col-span-7 bg-white/8 rounded-xl p-4 border border-white/10 space-y-2">
                  <p className="text-[11.5px] font-bold uppercase tracking-wider text-[#F07832]">
                    Hallazgos Estadísticos Principales
                  </p>
                  <ul className="space-y-1.5 text-slate-100/95 leading-relaxed">
                    {intelligentAnalysis.highlights.map((h, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-[#F07832] font-bold">•</span>
                        <span>{h}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="lg:col-span-5 bg-white/8 rounded-xl p-4 border border-white/10 space-y-2">
                  <p className="text-[11.5px] font-bold uppercase tracking-wider text-[#F07832]">
                    Acciones Correctivas Recomendadas
                  </p>
                  <ul className="space-y-1.5 text-slate-100/95 leading-relaxed">
                    {intelligentAnalysis.recommendations.map((rec, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-[#F07832] shrink-0 mt-0.5" />
                        <span>{rec}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>

            {/* F & G. Charts Row: Age Groups Pie Chart + Daily Evolution Bar Chart */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-5 card-premium rounded-2xl p-5 sm:p-6">
                <h2 className="font-display text-[15px] font-bold text-[#102A43]">
                  DISTRIBUCIÓN DE PACIENTES POR GRUPOS DE EDAD
                </h2>
                <p className="text-[12px] text-[#102A43]/65 mb-3">
                  Total de pacientes analizados:{' '}
                  <strong className="font-mono-tabular text-[#102A43]">
                    {ageGroupDistribution.totalAnalyzed}
                  </strong>{' '}
                  (intervalos quinquenales 30–59 años)
                </p>
                {ageGroupDistribution.slices.length === 0 ? (
                  <p className="text-xs text-[#102A43]/60 py-14 text-center">
                    El archivo cargado no incluyó columna numérica de edad.
                  </p>
                ) : (
                  <div className="h-[270px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={ageGroupDistribution.slices}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="46%"
                          outerRadius={78}
                          label={({ name, pct }: { name?: string; pct?: number }) =>
                            `${name}: ${pct}%`
                          }
                          labelLine={false}
                        >
                          {ageGroupDistribution.slices.map((s) => (
                            <Cell key={s.name} fill={s.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(val: unknown, name: unknown) => [
                            `${val} pacientes`,
                            String(name),
                          ]}
                        />
                        <Legend verticalAlign="bottom" height={40} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              <div className="lg:col-span-7 card-premium rounded-2xl p-5 sm:p-6">
                <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
                  <div>
                    <h2 className="font-display text-[15px] font-bold text-[#102A43]">
                      EVOLUCIÓN DIARIA DE OBSERVACIONES
                    </h2>
                    <p className="text-[12px] text-[#102A43]/65">
                      Tendencia por fecha de detección dentro del periodo filtrado
                    </p>
                  </div>
                  {dailyEvolutionData.peak.errores > 0 && (
                    <span className="text-[12px] font-bold text-[#F07832]">
                      Día pico: {dailyEvolutionData.peak.fecha} ({dailyEvolutionData.peak.errores}{' '}
                      obs.)
                    </span>
                  )}
                </div>
                <div className="h-[270px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={dailyEvolutionData.entries}
                      margin={{ top: 8, right: 16, left: 0, bottom: 20 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                      <XAxis dataKey="fecha" tick={{ fontSize: 11, fill: '#102A43' }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11.5, fill: '#102A43' }} />
                      <Tooltip
                        formatter={(val: unknown) => [`${val} observaciones`, 'Cantidad']}
                        contentStyle={{
                          borderRadius: '12px',
                          border: '1px solid #CBD5E1',
                          fontSize: '12.5px',
                        }}
                      />
                      <Bar
                        dataKey="errores"
                        name="Observaciones"
                        fill="#F07832"
                        radius={[6, 6, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* D. Ranking Table: Errors by Responsible Staff & Establishment */}
            <div className="card-premium rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-[#102A43]/10 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-[15px] font-bold text-[#102A43]">
                  RANKING DE ERRORES POR RESPONSABLE Y ESTABLECIMIENTO
                </h2>
                <span className="text-[12px] text-[#102A43]/65">
                  Orden descendente por incidencia ({responsibleRanking.length} responsables)
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-[12.5px]">
                  <thead>
                    <tr className="bg-[#F8F7F2] border-b border-[#102A43]/12 text-[#102A43]/85">
                      <th className="px-4 py-2.5 font-semibold">Posición</th>
                      <th className="px-4 py-2.5 font-semibold">Microred</th>
                      <th className="px-4 py-2.5 font-semibold">Establecimiento</th>
                      <th className="px-4 py-2.5 font-semibold">Personal</th>
                      <th className="px-4 py-2.5 font-semibold text-right">Cantidad de errores</th>
                      <th className="px-4 py-2.5 font-semibold text-right">% participación</th>
                      <th className="px-4 py-2.5 font-semibold">Tipo de error predominante</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#102A43]/8">
                    {responsibleRanking.slice(0, 35).map((r) => (
                      <tr key={`${r.posicion}_${r.personal}`} className="hover:bg-[#F8F7F2]/70">
                        <td className="px-4 py-2.5 font-mono-tabular font-bold text-[#F07832]">
                          #{r.posicion}
                        </td>
                        <td className="px-4 py-2.5 font-medium text-[#102A43]">{r.microred}</td>
                        <td className="px-4 py-2.5 text-[#102A43]/80">{r.establecimiento}</td>
                        <td className="px-4 py-2.5 font-semibold text-[#102A43]">{r.personal}</td>
                        <td className="px-4 py-2.5 text-right font-mono-tabular font-bold text-[#102A43]">
                          {r.cantidadErrores}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono-tabular">
                          {r.participacionPct}%
                        </td>
                        <td className="px-4 py-2.5 text-[#102A43]/80">{r.tipoPredominante}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* C. Main Observations Table (15 Columns) */}
            <div className="card-premium rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-[#102A43]/10 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-[15px] font-bold text-[#102A43]">
                  Tabla Principal de Observaciones Detectadas ({sortedObs.length})
                </h2>
                <div className="flex items-center gap-2 text-xs text-[#102A43]/70">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="px-2.5 py-1 rounded-lg border border-[#102A43]/15 disabled:opacity-40 cursor-pointer"
                  >
                    Anterior
                  </button>
                  <span className="font-mono-tabular font-semibold">
                    Pág. {page} / {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="px-2.5 py-1 rounded-lg border border-[#102A43]/15 disabled:opacity-40 cursor-pointer"
                  >
                    Siguiente
                  </button>
                </div>
              </div>

              {/* Mobile Observations Cards */}
              <div className="md:hidden divide-y divide-[#102A43]/10">
                {paginatedObs.map((r, idx) => (
                  <div key={`${r.nro}_mob_${idx}`} className="p-4 space-y-1.5 text-[12.5px]">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-bold text-[#102A43]">{r.tipoError}</span>
                      <span
                        className={`px-2 py-0.5 rounded-lg border text-[10.5px] font-bold shrink-0 ${getSeverityBadge(
                          r.nivelGravedad
                        )}`}
                      >
                        {r.nivelGravedad}
                      </span>
                    </div>
                    <p className="text-[11.5px] text-[#102A43]/75">
                      {r.microred} · {r.establecimiento} · {r.fechaDeteccion}
                    </p>
                    <p className="text-[12px] text-[#102A43]/85">
                      Personal: <strong>{r.nombrePersonal}</strong> · Paciente: {r.nombrePaciente} ({r.dniPaciente})
                    </p>
                    <p className="text-[11.5px] text-[#102A43]/70">{r.descripcionObservacion}</p>
                  </div>
                ))}
              </div>

              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse text-[12px]">
                  <thead>
                    <tr className="bg-[#F8F7F2] border-b border-[#102A43]/12 text-[#102A43]/85">
                      <th
                        onClick={() => toggleSort('nro')}
                        className="px-3 py-2.5 font-semibold whitespace-nowrap cursor-pointer"
                      >
                        <span className="inline-flex items-center gap-1">
                          N.º <ArrowDownUp className="w-3 h-3" />
                        </span>
                      </th>
                      <th
                        onClick={() => toggleSort('fechaDeteccion')}
                        className="px-3 py-2.5 font-semibold whitespace-nowrap cursor-pointer"
                      >
                        <span className="inline-flex items-center gap-1">
                          Fecha detección <ArrowDownUp className="w-3 h-3" />
                        </span>
                      </th>
                      <th
                        onClick={() => toggleSort('microred')}
                        className="px-3 py-2.5 font-semibold whitespace-nowrap cursor-pointer"
                      >
                        Microred
                      </th>
                      <th
                        onClick={() => toggleSort('establecimiento')}
                        className="px-3 py-2.5 font-semibold whitespace-nowrap cursor-pointer"
                      >
                        Establecimiento
                      </th>
                      <th className="px-3 py-2.5 font-semibold whitespace-nowrap">DNI personal</th>
                      <th className="px-3 py-2.5 font-semibold whitespace-nowrap">
                        Nombre personal
                      </th>
                      <th className="px-3 py-2.5 font-semibold whitespace-nowrap">DNI paciente</th>
                      <th className="px-3 py-2.5 font-semibold whitespace-nowrap">
                        Nombre paciente
                      </th>
                      <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Lote</th>
                      <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Hoja</th>
                      <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Registro</th>
                      <th
                        onClick={() => toggleSort('tipoError')}
                        className="px-3 py-2.5 font-semibold whitespace-nowrap cursor-pointer"
                      >
                        Tipo de error
                      </th>
                      <th className="px-3 py-2.5 font-semibold whitespace-nowrap">
                        Descripción observación
                      </th>
                      <th
                        onClick={() => toggleSort('nivelGravedad')}
                        className="px-3 py-2.5 font-semibold whitespace-nowrap cursor-pointer"
                      >
                        Gravedad
                      </th>
                      <th className="px-3 py-2.5 font-semibold whitespace-nowrap">
                        Estado subsanación
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#102A43]/8">
                    {paginatedObs.map((r, idx) => (
                      <tr key={`${r.nro}_${idx}`} className="hover:bg-[#F8F7F2]/70">
                        <td className="px-3 py-2.5 font-mono-tabular text-[#102A43]/65">
                          {(page - 1) * PAGE_SIZE + idx + 1}
                        </td>
                        <td className="px-3 py-2.5 font-mono-tabular whitespace-nowrap">
                          {r.fechaDeteccion}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap font-medium">{r.microred}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap">{r.establecimiento}</td>
                        <td className="px-3 py-2.5 font-mono-tabular whitespace-nowrap">
                          {r.dniPersonal}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">{r.nombrePersonal}</td>
                        <td className="px-3 py-2.5 font-mono-tabular whitespace-nowrap">
                          {r.dniPaciente}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap font-medium text-[#102A43]">
                          {r.nombrePaciente}
                        </td>
                        <td className="px-3 py-2.5 font-mono-tabular whitespace-nowrap">{r.lote}</td>
                        <td className="px-3 py-2.5 font-mono-tabular whitespace-nowrap">{r.hoja}</td>
                        <td className="px-3 py-2.5 font-mono-tabular whitespace-nowrap">
                          {r.registro}
                        </td>
                        <td className="px-3 py-2.5 font-semibold text-[#102A43] max-w-[200px]">
                          {r.tipoError}
                        </td>
                        <td className="px-3 py-2.5 text-[#102A43]/75 max-w-[240px]">
                          {r.descripcionObservacion}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-lg border text-[11px] font-bold ${getSeverityBadge(
                              r.nivelGravedad
                            )}`}
                          >
                            {r.nivelGravedad}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap font-semibold text-[#102A43]">
                          {r.estadoSubsanacion}
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
          Cargando resumen de control de calidad...
        </div>
      ) : filteredSummary.length === 0 ? (
        <div className="card-premium rounded-2xl p-10 text-center">
          <ClipboardCheck className="w-10 h-10 text-[#102A43]/25 mx-auto mb-3" />
          <h2 className="font-display text-lg font-bold text-[#102A43] mb-1.5">
            Sin reportes de Control de Calidad publicados
          </h2>
          <p className="text-[13.5px] text-[#102A43]/70 max-w-lg mx-auto">
            Una vez publicada la auditoría HIS desde Administración, podrá consultar la tasa de
            conformidad por establecimiento y las observaciones más frecuentes.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="card-premium rounded-2xl p-5">
              <p className="text-[12.5px] text-[#102A43]/70 font-medium">Registros evaluados</p>
              <p className="font-mono-tabular text-2xl font-bold text-[#102A43] mt-1.5">
                {summaryKpis.evaluados.toLocaleString('es-PE')}
              </p>
            </div>
            <div className="card-premium rounded-2xl p-5">
              <p className="text-[12.5px] text-[#102A43]/70 font-medium">Registros conformes</p>
              <p className="font-mono-tabular text-2xl font-bold text-[#102A43] mt-1.5">
                {summaryKpis.conformes.toLocaleString('es-PE')}
              </p>
            </div>
            <div className="card-premium rounded-2xl p-5">
              <p className="text-[12.5px] text-[#102A43]/70 font-medium">Observados por corregir</p>
              <p className="font-mono-tabular text-2xl font-bold text-[#F07832] mt-1.5">
                {summaryKpis.observados.toLocaleString('es-PE')}
              </p>
            </div>
            <div className="card-premium rounded-2xl p-5">
              <p className="text-[12.5px] text-[#102A43]/70 font-medium">Tasa de conformidad</p>
              <p className="font-mono-tabular text-2xl font-bold text-[#102A43] mt-1.5">
                {summaryKpis.tasa}%
              </p>
            </div>
          </div>

          <div className="card-premium rounded-2xl overflow-hidden">
            {/* Mobile Quality Summary Cards */}
            <div className="md:hidden divide-y divide-[#102A43]/10">
              {filteredSummary.map((row, idx) => (
                <div key={`${row.ipress}_mob_${idx}`} className="p-4 space-y-1.5 text-[12.5px]">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-bold text-[#102A43]">{row.ipress}</p>
                    <span className="font-mono-tabular font-bold text-[#102A43] shrink-0">
                      {row.tasaConformidad}%
                    </span>
                  </div>
                  <p className="text-[11.5px] text-[#102A43]/70">Microred {row.microred}</p>
                  <div className="flex items-center justify-between font-mono-tabular text-[11.5px]">
                    <span>Eval.: {row.registrosEvaluados} · Conf.: {row.conformes}</span>
                    <span className="text-[#F07832] font-bold">Obs.: {row.observados}</span>
                  </div>
                  <p className="text-[11.5px] text-[#102A43]/75">{row.principalObservacion}</p>
                </div>
              ))}
            </div>

            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse text-[13.5px]">
                <thead>
                  <tr className="bg-[#F8F7F2] border-b border-[#102A43]/12 text-[#102A43]/80">
                    <th className="px-4 py-3 font-semibold">Microred</th>
                    <th className="px-4 py-3 font-semibold">IPRESS</th>
                    <th className="px-4 py-3 font-semibold text-right">Evaluados</th>
                    <th className="px-4 py-3 font-semibold text-right">Conformes</th>
                    <th className="px-4 py-3 font-semibold text-right">Observados</th>
                    <th className="px-4 py-3 font-semibold text-right">Conformidad</th>
                    <th className="px-4 py-3 font-semibold">Observación principal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#102A43]/8">
                  {filteredSummary.map((row, idx) => (
                    <tr key={`${row.ipress}_${idx}`} className="hover:bg-[#F8F7F2]/70">
                      <td className="px-4 py-3 font-semibold text-[#102A43]">{row.microred}</td>
                      <td className="px-4 py-3 text-[#102A43]/80">{row.ipress}</td>
                      <td className="px-4 py-3 text-right font-mono-tabular">
                        {row.registrosEvaluados.toLocaleString('es-PE')}
                      </td>
                      <td className="px-4 py-3 text-right font-mono-tabular text-[#102A43] font-semibold">
                        {row.conformes.toLocaleString('es-PE')}
                      </td>
                      <td className="px-4 py-3 text-right font-mono-tabular text-[#F07832] font-bold">
                        {row.observados.toLocaleString('es-PE')}
                      </td>
                      <td className="px-4 py-3 text-right font-mono-tabular font-semibold">
                        <span className="inline-flex items-center gap-1 text-[#102A43]">
                          <CheckCircle2
                            className={`w-3.5 h-3.5 ${
                              row.tasaConformidad >= 90 ? 'text-[#102A43]' : 'text-[#F07832]'
                            }`}
                          />
                          {row.tasaConformidad}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[#102A43]/75 text-[12.5px]">
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

      {/* Clean Published Documents */}
      <ModuleDrivePanel
        targetModule="calidad"
        moduleLabel="Control de Calidad HIS"
        driveFiles={driveFiles}
        manualDocs={manualDocs}
        onPreviewFile={onPreviewFile}
      />
    </div>
  );
};
