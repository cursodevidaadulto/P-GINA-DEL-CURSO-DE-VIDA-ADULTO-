import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  FileText,
  Filter,
  Info,
  Search,
  TrendingUp,
  X,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { exportRowsToExcel } from '../services/excelAnalyzers';
import { fetchPublicBatchRows } from '../services/firestoreService';
import { fetchServerPublicDataset } from '../services/adminApiService';
import { exportInstitutionalPdf, printInstitutionalReport } from '../services/pdfExportService';
import {
  fetchSirCmi,
  fetchSirFicha,
  fetchSirFiltros,
  fetchSirGrafica,
  fetchSirPeriodoReciente,
  fetchSirProcesoControl,
  fetchSirResumen,
  fetchSirTendencia,
} from '../services/sirApiService';
import {
  ContentDocumentItem,
  DriveDocumentItem,
  IndicatorRow,
  MICROREDES_RIS,
  PublicManifest,
  SirChartPoint,
  SirCmiResponse,
  SirFichaTecnica,
  SirFilterHierarchyRow,
  SirIndicatorSummary,
  SirTrendPoint,
} from '../types';
import { ExportToolbar } from './ExportToolbar';
import { ModuleDrivePanel } from './ModuleDrivePanel';

interface IndicatorsModuleProps {
  manifest?: PublicManifest;
  initialMicrored?: string;
  driveFiles: DriveDocumentItem[];
  manualDocs: ContentDocumentItem[];
  onPreviewFile: (file: DriveDocumentItem) => void;
}

const MONTHS_ES = [
  { val: '1', label: 'Enero' },
  { val: '2', label: 'Febrero' },
  { val: '3', label: 'Marzo' },
  { val: '4', label: 'Abril' },
  { val: '5', label: 'Mayo' },
  { val: '6', label: 'Junio' },
  { val: '7', label: 'Julio' },
  { val: '8', label: 'Agosto' },
  { val: '9', label: 'Septiembre' },
  { val: '10', label: 'Octubre' },
  { val: '11', label: 'Noviembre' },
  { val: '12', label: 'Diciembre' },
];

type TabView = 'tablero' | 'cmi' | 'evolucion' | 'tabla';

export const IndicatorsModule: React.FC<IndicatorsModuleProps> = ({
  manifest,
  initialMicrored,
  driveFiles,
  manualDocs,
  onPreviewFile,
}) => {
  const [activeView, setActiveView] = useState<TabView>('tablero');

  // SIR Filters & Metadata
  const [hierarchyRows, setHierarchyRows] = useState<SirFilterHierarchyRow[]>([]);
  const [anio, setAnio] = useState<string>('2026');
  const [mes, setMes] = useState<string>('11');
  const [provincia, setProvincia] = useState<string>('SAN IGNACIO');
  const [distrito, setDistrito] = useState<string>('Todos');
  const [red, setRed] = useState<string>('SAN IGNACIO');
  const [microred, setMicrored] = useState<string>(initialMicrored || 'Todas');
  const [ipress, setIpress] = useState<string>('Todos');
  const [ambitoNivel, setAmbitoNivel] = useState<string>('microred');
  const [categoriaFilter, setCategoriaFilter] = useState<string>('Todas');
  const [grupoEtario, setGrupoEtario] = useState<string>('30 a 59 años');
  const [selectedIndicadorId, setSelectedIndicadorId] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');

  // Live SIR state
  const [sirResumen, setSirResumen] = useState<SirIndicatorSummary[]>([]);
  const [sirCmi, setSirCmi] = useState<SirCmiResponse>({
    lista: [],
    velocimetros: [],
    radiales: [],
  });
  const [sirGrafica, setSirGrafica] = useState<SirChartPoint[]>([]);
  const [sirTendencia, setSirTendencia] = useState<SirTrendPoint[]>([]);
  const [sirLastUpdate, setSirLastUpdate] = useState<string>('');
  const [sirSourceStatus, setSirSourceStatus] = useState<'sir' | 'local' | 'loading'>('loading');
  const [sirError, setSirError] = useState<string | null>(null);
  const [loadingSir, setLoadingSir] = useState(false);

  // Local fallback Excel dataset
  const [localRows, setLocalRows] = useState<IndicatorRow[]>([]);

  const [fichaModalOpen, setFichaModalOpen] = useState(false);
  const [fichaLoading, setFichaLoading] = useState(false);
  const [fichaData, setFichaData] = useState<SirFichaTecnica | null>(null);
  const [fichaIndicatorName, setFichaIndicatorName] = useState('');
  const [exportingPdf, setExportingPdf] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  useEffect(() => {
    if (initialMicrored) {
      setMicrored(initialMicrored.toUpperCase());
    }
  }, [initialMicrored]);

  // Load initial filters & recent period from SIR + local fallback
  useEffect(() => {
    let active = true;
    async function bootstrap() {
      try {
        const [filtrosRes, periodoRes] = await Promise.all([
          fetchSirFiltros(),
          fetchSirPeriodoReciente(),
        ]);
        if (!active) return;
        setHierarchyRows(filtrosRes.data?.rows || []);
        const recAnio = periodoRes.data?.ANIO || periodoRes.data?.anio;
        const recMes = periodoRes.data?.MES || periodoRes.data?.mes;
        if (recAnio) setAnio(String(recAnio));
        if (recMes) setMes(String(recMes));
      } catch {
        // Silent fallback handled in data fetch
      }

      // Check published institutional dataset FIRST (fast server endpoint), then optional Firestore fallback
      try {
        const srv = await fetchServerPublicDataset<IndicatorRow>('indicadores');
        if (active && srv.rows?.length) {
          setLocalRows(srv.rows);
          return;
        }
        if (manifest?.batchIds?.length) {
          const fbRows = await fetchPublicBatchRows<IndicatorRow>(manifest);
          if (active && fbRows.length) setLocalRows(fbRows);
        }
      } catch {
        // Ignore if empty
      }
    }
    bootstrap();
    return () => {
      active = false;
    };
  }, [manifest]);

  // Cascading filter options derived from SIR hierarchy
  const provincias = useMemo(() => {
    const set = new Set(hierarchyRows.map((r) => r.PROVINCIA).filter(Boolean));
    return ['Todas', ...Array.from(set).sort()];
  }, [hierarchyRows]);

  const distritos = useMemo(() => {
    const rows = hierarchyRows.filter(
      (r) => provincia === 'Todas' || r.PROVINCIA === provincia
    );
    const set = new Set(rows.map((r) => r.DISTRITO).filter(Boolean));
    return ['Todos', ...Array.from(set).sort()];
  }, [hierarchyRows, provincia]);

  const redes = useMemo(() => {
    const set = new Set(hierarchyRows.map((r) => r.red).filter(Boolean));
    const arr = Array.from(set).sort();
    return ['Todas', ...(arr.length ? arr : ['SAN IGNACIO'])];
  }, [hierarchyRows]);

  const microredes = useMemo(() => {
    const rows = hierarchyRows.filter(
      (r) =>
        (provincia === 'Todas' || r.PROVINCIA === provincia) &&
        (distrito === 'Todos' || r.DISTRITO === distrito) &&
        (red === 'Todas' || r.red === red)
    );
    const set = new Set(rows.map((r) => r.MICRORED).filter(Boolean));
    const arr = Array.from(set).sort();
    return ['Todas', ...(arr.length ? arr : MICROREDES_RIS.map((m) => m.toUpperCase()))];
  }, [hierarchyRows, provincia, distrito, red]);

  const establecimientos = useMemo(() => {
    const rows = hierarchyRows.filter(
      (r) =>
        (red === 'Todas' || r.red === red) &&
        (microred === 'Todas' || r.MICRORED.toUpperCase() === microred.toUpperCase()) &&
        (distrito === 'Todos' || r.DISTRITO === distrito)
    );
    const set = new Set(rows.map((r) => r.ipress).filter(Boolean));
    return ['Todos', ...Array.from(set).sort()];
  }, [hierarchyRows, red, microred, distrito]);

  // Query SIR Resumen, CMI & Proceso Control whenever filters change
  const loadSirIndicators = useCallback(async () => {
    setLoadingSir(true);
    setSirError(null);
    try {
      const commonParams = {
        curso: '5',
        subcurso: '0',
        anio,
        mes,
        provincia: provincia === 'Todas' ? undefined : provincia,
        distrito: distrito === 'Todos' ? undefined : distrito,
        red: red === 'Todas' ? undefined : red,
        microred: microred === 'Todas' ? undefined : microred,
        ipress: ipress === 'Todos' ? undefined : ipress,
      };

      const [resumenRes, cmiRes, procesoRes] = await Promise.all([
        fetchSirResumen(commonParams),
        fetchSirCmi(commonParams),
        fetchSirProcesoControl(anio, mes, '5').catch(() => null),
      ]);

      setSirResumen(resumenRes.data);
      setSirCmi(cmiRes.data);
      setSirSourceStatus('sir');
      const procFecha =
        procesoRes?.data?.FECHA_PROCESO || procesoRes?.data?.fecha_proceso || resumenRes.fetchedAt;
      setSirLastUpdate(procFecha);

      if (!selectedIndicadorId && resumenRes.data.length > 0) {
        setSelectedIndicadorId(String(resumenRes.data[0].ID_INDICADOR));
      }
    } catch (err) {
      setSirError(
        err instanceof Error
          ? err.message
          : 'No se pudo conectar en vivo con SIR DIRESA Cajamarca.'
      );
      setSirSourceStatus(localRows.length > 0 ? 'local' : 'sir');
    } finally {
      setLoadingSir(false);
    }
  }, [anio, mes, provincia, distrito, red, microred, ipress, selectedIndicadorId, localRows.length]);

  useEffect(() => {
    loadSirIndicators();
  }, [loadSirIndicators]);

  // Load territorial chart & historical trend for the selected indicator
  useEffect(() => {
    if (!selectedIndicadorId) return;
    let active = true;
    async function loadIndicatorCharts() {
      const params = {
        curso: '5',
        subcurso: '0',
        anio,
        mes,
        provincia: provincia === 'Todas' ? undefined : provincia,
        distrito: distrito === 'Todos' ? undefined : distrito,
        red: red === 'Todas' ? undefined : red,
        microred: microred === 'Todas' ? undefined : microred,
        ipress: ipress === 'Todos' ? undefined : ipress,
        indicador: selectedIndicadorId,
        nivel: ambitoNivel,
      };
      try {
        const [grafRes, tendRes] = await Promise.all([
          fetchSirGrafica(params),
          fetchSirTendencia(params),
        ]);
        if (!active) return;
        setSirGrafica(grafRes.data);
        setSirTendencia(tendRes.data);
      } catch {
        // Keep last chart state silently
      }
    }
    loadIndicatorCharts();
    return () => {
      active = false;
    };
  }, [selectedIndicadorId, anio, mes, provincia, distrito, red, microred, ipress, ambitoNivel]);

  // Normalized unified rows (SIR live data OR local uploaded Excel)
  const normalizedRows = useMemo(() => {
    if (sirResumen.length > 0) {
      return sirResumen.map((item) => {
        const meta = Number(item.META || 0);
        const avance = Number(item.AVANCE || 0);
        const cobertura = Number(
          item.COBERTURA ?? (meta > 0 ? (avance / meta) * 100 : 0)
        );
        const target = Number(item.META_ESPERADA || 75);
        const estado: IndicatorRow['estado'] =
          cobertura >= target ? 'Óptimo' : cobertura >= target * 0.7 ? 'En proceso' : 'Riesgo';
        return {
          indicadorId: String(item.ID_INDICADOR),
          indicador: item.NOMBRE_INDICADOR,
          categoria: item.CATEGORIA || 'Curso de Vida Adulto',
          grupoEtario: item.GRUPO_ETARIO || '30 a 59 años',
          microred: microred === 'Todas' ? red : microred,
          ipress: ipress === 'Todos' ? 'Consolidado territorial' : ipress,
          numerador: avance,
          denominador: meta,
          metaPct: target,
          avancePct: Number(cobertura.toFixed(1)),
          estado,
        };
      });
    }

    return localRows.map((r) => ({
      ...r,
      categoria: 'Consolidado Local RIS',
      grupoEtario: '30 a 59 años',
    }));
  }, [sirResumen, localRows, microred, red, ipress]);

  const categorias = useMemo(() => {
    const set = new Set(normalizedRows.map((r) => r.categoria).filter(Boolean));
    return ['Todas', ...Array.from(set)];
  }, [normalizedRows]);

  const filteredIndicators = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return normalizedRows.filter((r) => {
      const matchCat = categoriaFilter === 'Todas' || r.categoria === categoriaFilter;
      const matchQ =
        !q ||
        r.indicador.toLowerCase().includes(q) ||
        r.microred.toLowerCase().includes(q) ||
        r.ipress.toLowerCase().includes(q);
      return matchCat && matchQ;
    });
  }, [normalizedRows, categoriaFilter, searchTerm]);

  const kpis = useMemo(() => {
    const total = filteredIndicators.length;
    const optimos = filteredIndicators.filter((r) => r.estado === 'Óptimo').length;
    const proceso = filteredIndicators.filter((r) => r.estado === 'En proceso').length;
    const riesgo = filteredIndicators.filter((r) => r.estado === 'Riesgo').length;
    const avgCobertura =
      total > 0
        ? Number(
            (filteredIndicators.reduce((s, r) => s + r.avancePct, 0) / total).toFixed(1)
          )
        : 0;
    const totalMeta = filteredIndicators.reduce((s, r) => s + r.denominador, 0);
    const totalAvance = filteredIndicators.reduce((s, r) => s + r.numerador, 0);
    return { total, optimos, proceso, riesgo, avgCobertura, totalMeta, totalAvance };
  }, [filteredIndicators]);

  const pieStatusData = useMemo(
    () => [
      { name: 'Óptimo', value: kpis.optimos, color: '#102A43' },
      { name: 'En proceso', value: kpis.proceso, color: '#F07832' },
      { name: 'Riesgo', value: kpis.riesgo, color: '#DC2626' },
    ].filter((d) => d.value > 0),
    [kpis]
  );

  const barTerritorialData = useMemo(() => {
    if (sirGrafica.length > 0) {
      return sirGrafica.map((g) => ({
        nombre: String(g.NOMBRE || g.ETIQUETA || g.MICRORED || g.IPRESS || 'Zona').slice(0, 22),
        cobertura: Number(Number(g.COBERTURA || 0).toFixed(1)),
        avance: Number(g.AVANCE || 0),
        meta: Number(g.META || 0),
      }));
    }
    return filteredIndicators.slice(0, 12).map((r) => ({
      nombre: r.ipress !== 'Consolidado territorial' ? r.ipress.slice(0, 22) : r.indicador.slice(0, 22),
      cobertura: r.avancePct,
      avance: r.numerador,
      meta: r.denominador,
    }));
  }, [sirGrafica, filteredIndicators]);

  const trendChartData = useMemo(() => {
    return sirTendencia.map((t) => {
      const mIdx = Number(t.MES) - 1;
      const label = t.NOMBRE_MES || (mIdx >= 0 && mIdx < 12 ? MONTHS_ES[mIdx].label.slice(0, 3) : String(t.MES));
      return {
        mes: label,
        cobertura: Number(Number(t.COBERTURA || 0).toFixed(1)),
        avance: Number(t.AVANCE || 0),
        meta: Number(t.META || 0),
      };
    });
  }, [sirTendencia]);

  const handleOpenFicha = async (indId: string, indName: string) => {
    setFichaIndicatorName(indName);
    setFichaModalOpen(true);
    setFichaLoading(true);
    setFichaData(null);
    try {
      const res = await fetchSirFicha(indId);
      setFichaData(res.data);
    } catch {
      setFichaData({
        NOMBRE_INDICADOR: indName,
        DEFINICION: 'Ficha técnica oficial del indicador sanitario del Curso de Vida Adulto (30–59 años).',
      });
    } finally {
      setFichaLoading(false);
    }
  };

  const monthLabel = MONTHS_ES.find((m) => m.val === mes)?.label || mes;
  const activeFilterSummary = `Año ${anio} | Mes ${monthLabel} | Red: ${red} | Microred: ${microred} | IPRESS: ${ipress} | Ámbito: ${ambitoNivel}`;

  const handleExportExcel = () => {
    const rows = filteredIndicators.map((r, i) => ({
      'N°': i + 1,
      Indicador: r.indicador,
      Categoría: r.categoria,
      Microred: r.microred,
      Establecimiento: r.ipress,
      Avance: r.numerador,
      Meta: r.denominador,
      'Meta (%)': r.metaPct,
      'Cobertura (%)': r.avancePct,
      Estado: r.estado,
    }));
    exportRowsToExcel(rows, `RIS_San_Ignacio_Indicadores_${anio}_${mes}`, 'Indicadores', {
      modulo: 'Monitoreo de Indicadores — Curso de Vida Adulto',
      periodo: `${monthLabel} ${anio}`,
      filtros: activeFilterSummary,
      fuente:
        sirSourceStatus === 'sir'
          ? 'SIR DIRESA Cajamarca (Tablero de Mando)'
          : 'Base de Datos Institucional RIS San Ignacio',
    });
  };

  const handleExportPdf = async () => {
    setExportingPdf(true);
    try {
      await exportInstitutionalPdf({
        fileName: `RIS_San_Ignacio_Indicadores_${anio}_${mes}`,
        moduleName: 'Monitoreo de Indicadores · Curso de Vida Adulto',
        subtitle: 'Tablero de Mando Sanitario y Cumplimiento de Metas (30 a 59 años)',
        period: `${monthLabel} ${anio}`,
        appliedFilters: activeFilterSummary,
        dataSource:
          sirSourceStatus === 'sir'
            ? 'SIR DIRESA Cajamarca'
            : 'Repositorio Institucional RIS San Ignacio',
        kpis: [
          { label: 'Cobertura Promedio', value: `${kpis.avgCobertura}%` },
          { label: 'Indicadores Evaluados', value: String(kpis.total) },
          { label: 'En Nivel Óptimo', value: String(kpis.optimos) },
          { label: 'En Riesgo', value: String(kpis.riesgo) },
        ],
        sections: [
          {
            title: 'Consolidado de Indicadores del Curso de Vida Adulto',
            columns: ['N°', 'Indicador', 'Territorio', 'Avance', 'Meta', 'Cobertura %', 'Estado'],
            rows: filteredIndicators.map((r, idx) => [
              idx + 1,
              r.indicador,
              `${r.microred} / ${r.ipress}`,
              r.numerador.toLocaleString('es-PE'),
              r.denominador.toLocaleString('es-PE'),
              `${r.avancePct}%`,
              r.estado,
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
      {/* Header Toolbar */}
      <div className="card-premium rounded-2xl p-5 sm:p-6 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#F07832]">
              Tablero de Mando Sanitario · Curso de Vida Adulto
            </span>
            <span className="text-[11px] font-mono-tabular text-[#102A43]/65">
              · Fuente:{' '}
              {sirResumen.length > 0 ? 'SIR DIRESA Cajamarca (En vivo)' : 'Carga Institucional RIS'}
              {manifest?.updatedAt
                ? ` · Módulo act.: ${new Date(String(manifest.updatedAt)).toLocaleString('es-PE')}`
                : sirLastUpdate
                ? ` · Act.: ${sirLastUpdate}`
                : ''}
            </span>
          </div>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-[#102A43]">
            Monitoreo de Indicadores y Cuadro de Mando Integral
          </h1>
          <p className="text-[13.5px] text-[#102A43]/70 mt-1">
            Evaluación de metas sanitarias, comparativos por microred/IPRESS, evolución histórica
            mensual y fichas técnicas oficiales.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <ExportToolbar
            onExportExcel={handleExportExcel}
            onExportPdf={handleExportPdf}
            onPrint={printInstitutionalReport}
            disabledExcel={filteredIndicators.length === 0}
            disabledPdf={filteredIndicators.length === 0}
            loadingPdf={exportingPdf}
          />
        </div>
      </div>

      {/* Multi-level Cascading Filters */}
      <section className="card-premium rounded-2xl p-4 sm:p-5 space-y-3 no-print">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[13px] font-bold text-[#102A43]">
            <Filter className="w-4 h-4 text-[#F07832]" />
            <span>Filtros Territoriales y Temporales</span>
            <button
              type="button"
              onClick={() => setMobileFiltersOpen((v) => !v)}
              className="md:hidden inline-flex items-center gap-1 ml-1 px-2.5 py-1 rounded-lg bg-[#F8F7F2] border border-[#102A43]/15 text-[11.5px] font-semibold text-[#102A43] cursor-pointer"
            >
              <span>{mobileFiltersOpen ? 'Ocultar' : 'Mostrar'}</span>
              {mobileFiltersOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
          <div className="inline-flex flex-wrap items-center p-1 bg-[#F8F7F2] rounded-xl border border-[#102A43]/12 max-w-full overflow-x-auto">
            {(
              [
                { id: 'tablero', label: 'Resumen & Gráficos' },
                { id: 'cmi', label: 'CMI Velocímetros' },
                { id: 'evolucion', label: 'Tendencia Mensual' },
                { id: 'tabla', label: 'Matriz & Ranking' },
              ] as { id: TabView; label: string }[]
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveView(t.id)}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  activeView === t.id
                    ? 'bg-[#102A43] text-white'
                    : 'text-[#102A43]/70 hover:text-[#102A43]'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className={`${mobileFiltersOpen ? 'grid' : 'hidden md:grid'} grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5`}>
          <div>
            <label className="block text-[11px] font-semibold text-[#102A43]/65 mb-1">Año</label>
            <select
              value={anio}
              onChange={(e) => setAnio(e.target.value)}
              className="w-full px-3 py-2 text-[12.5px] bg-white border border-[#102A43]/15 rounded-xl font-semibold text-[#102A43]"
            >
              {['2026', '2025', '2024', '2023'].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#102A43]/65 mb-1">
              Periodo / Mes
            </label>
            <select
              value={mes}
              onChange={(e) => setMes(e.target.value)}
              className="w-full px-3 py-2 text-[12.5px] bg-white border border-[#102A43]/15 rounded-xl font-semibold text-[#102A43]"
            >
              {MONTHS_ES.map((m) => (
                <option key={m.val} value={m.val}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#102A43]/65 mb-1">
              Provincia
            </label>
            <select
              value={provincia}
              onChange={(e) => {
                setProvincia(e.target.value);
                setDistrito('Todos');
              }}
              className="w-full px-3 py-2 text-[12.5px] bg-white border border-[#102A43]/15 rounded-xl font-semibold text-[#102A43]"
            >
              {provincias.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#102A43]/65 mb-1">
              Distrito
            </label>
            <select
              value={distrito}
              onChange={(e) => setDistrito(e.target.value)}
              className="w-full px-3 py-2 text-[12.5px] bg-white border border-[#102A43]/15 rounded-xl font-semibold text-[#102A43]"
            >
              {distritos.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#102A43]/65 mb-1">
              Red de Salud
            </label>
            <select
              value={red}
              onChange={(e) => {
                setRed(e.target.value);
                setMicrored('Todas');
                setIpress('Todos');
              }}
              className="w-full px-3 py-2 text-[12.5px] bg-white border border-[#102A43]/15 rounded-xl font-semibold text-[#102A43]"
            >
              {redes.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#102A43]/65 mb-1">
              Microred
            </label>
            <select
              value={microred}
              onChange={(e) => {
                setMicrored(e.target.value);
                setIpress('Todos');
              }}
              className="w-full px-3 py-2 text-[12.5px] bg-white border border-[#102A43]/15 rounded-xl font-semibold text-[#102A43]"
            >
              {microredes.map((mr) => (
                <option key={mr} value={mr}>
                  {mr}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-[11px] font-semibold text-[#102A43]/65 mb-1">
              Establecimiento de Salud (IPRESS)
            </label>
            <select
              value={ipress}
              onChange={(e) => setIpress(e.target.value)}
              className="w-full px-3 py-2 text-[12.5px] bg-white border border-[#102A43]/15 rounded-xl font-semibold text-[#102A43]"
            >
              {establecimientos.map((eess) => (
                <option key={eess} value={eess}>
                  {eess}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#102A43]/65 mb-1">Ámbito</label>
            <select
              value={ambitoNivel}
              onChange={(e) => setAmbitoNivel(e.target.value)}
              className="w-full px-3 py-2 text-[12.5px] bg-white border border-[#102A43]/15 rounded-xl font-semibold text-[#102A43]"
            >
              <option value="microred">Microred</option>
              <option value="ipress">Establecimiento</option>
              <option value="distrito">Distrito</option>
              <option value="ris">RIS</option>
              <option value="zona">Zona sanitaria</option>
              <option value="puerta">Puerta de entrada</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#102A43]/65 mb-1">
              Grupo etario
            </label>
            <select
              value={grupoEtario}
              onChange={(e) => setGrupoEtario(e.target.value)}
              className="w-full px-3 py-2 text-[12.5px] bg-white border border-[#102A43]/15 rounded-xl font-semibold text-[#102A43]"
            >
              <option value="30 a 59 años">Adulto (30–59 años)</option>
              <option value="30-39 años">30–39 años</option>
              <option value="40-49 años">40–49 años</option>
              <option value="50-59 años">50–59 años</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#102A43]/65 mb-1">
              Categoría
            </label>
            <select
              value={categoriaFilter}
              onChange={(e) => setCategoriaFilter(e.target.value)}
              className="w-full px-3 py-2 text-[12.5px] bg-white border border-[#102A43]/15 rounded-xl font-semibold text-[#102A43]"
            >
              {categorias.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#102A43]/65 mb-1">
              Buscar indicador
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#102A43]/45 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Filtrar nombre..."
                className="w-full pl-8 pr-3 py-2 text-[12.5px] bg-[#F8F7F2] border border-[#102A43]/15 rounded-xl"
              />
            </div>
          </div>
        </div>
      </section>

      {sirError && sirResumen.length === 0 && (
        <div className="p-4 rounded-2xl bg-[#F07832]/12 border border-[#F07832]/35 text-[13px] text-[#102A43] flex items-center gap-2.5">
          <Info className="w-4 h-4 text-[#F07832] shrink-0" />
          <span>
            {sirError}{' '}
            {localRows.length > 0
              ? 'Mostrando matriz de indicadores cargada localmente en la plataforma.'
              : 'Verifique conexión o utilice la matriz de indicadores cargada por el administrador.'}
          </span>
        </div>
      )}

      {/* 4 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card-premium rounded-2xl p-5">
          <p className="text-[12.5px] text-[#102A43]/70 font-medium">Cobertura promedio</p>
          <p className="font-mono-tabular text-2xl font-bold text-[#102A43] mt-1.5">
            {kpis.avgCobertura}%
          </p>
          <p className="text-[11.5px] text-[#102A43]/60 mt-1">
            Avance acumulado: {kpis.totalAvance.toLocaleString('es-PE')} /{' '}
            {kpis.totalMeta.toLocaleString('es-PE')}
          </p>
        </div>

        <div className="card-premium rounded-2xl p-5">
          <p className="text-[12.5px] text-[#102A43]/70 font-medium">Indicadores evaluados</p>
          <p className="font-mono-tabular text-2xl font-bold text-[#102A43] mt-1.5">
            {kpis.total}
          </p>
          <p className="text-[11.5px] text-[#102A43]/60 mt-1">
            Curso de Vida Adulto ({grupoEtario})
          </p>
        </div>

        <div className="card-premium rounded-2xl p-5">
          <p className="text-[12.5px] text-[#102A43]/70 font-medium">En nivel Óptimo</p>
          <p className="font-mono-tabular text-2xl font-bold text-[#102A43] mt-1.5">
            {kpis.optimos}
          </p>
          <p className="text-[11.5px] text-[#102A43]/60 mt-1">
            En proceso: {kpis.proceso} indicador(es)
          </p>
        </div>

        <div className="card-premium rounded-2xl p-5">
          <p className="text-[12.5px] text-[#102A43]/70 font-medium">En situación de Riesgo</p>
          <p className="font-mono-tabular text-2xl font-bold text-[#F07832] mt-1.5">
            {kpis.riesgo}
          </p>
          <p className="text-[11.5px] text-[#102A43]/60 mt-1">
            Requieren priorización operativa
          </p>
        </div>
      </div>

      {loadingSir && filteredIndicators.length === 0 ? (
        <div className="card-premium rounded-2xl p-10 text-center text-[#102A43]/65 text-sm">
          Consultando indicadores del Curso de Vida Adulto...
        </div>
      ) : filteredIndicators.length === 0 ? (
        <div className="card-premium rounded-2xl p-10 text-center">
          <BarChart2 className="w-10 h-10 text-[#102A43]/25 mx-auto mb-3" />
          <h2 className="font-display text-lg font-bold text-[#102A43]">
            Sin registros disponibles para la selección actual
          </h2>
          <p className="text-[13.5px] text-[#102A43]/70 mt-1">
            Ajuste los filtros de año, periodo, microred o establecimiento.
          </p>
        </div>
      ) : (
        <>
          {/* VIEW 1: RESUMEN & GRÁFICOS */}
          {(activeView === 'tablero' || activeView === 'evolucion') && (
            <div className="space-y-6">
              {/* Indicator Selector for Charts */}
              {filteredIndicators.length > 0 && (
                <div className="card-premium rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex-1">
                    <label className="block text-[11.5px] font-bold uppercase tracking-wider text-[#F07832] mb-1">
                      Indicador Analizado en Gráficas Comparativas y Evolución
                    </label>
                    <select
                      value={selectedIndicadorId}
                      onChange={(e) => setSelectedIndicadorId(e.target.value)}
                      className="w-full px-3.5 py-2 text-[13px] bg-[#F8F7F2] border border-[#102A43]/15 rounded-xl font-bold text-[#102A43]"
                    >
                      {filteredIndicators.map((ind) => (
                        <option key={ind.indicadorId} value={ind.indicadorId}>
                          {ind.indicador} ({ind.avancePct}%)
                        </option>
                      ))}
                    </select>
                  </div>

                  {selectedIndicadorId && (
                    <button
                      type="button"
                      onClick={() => {
                        const found = filteredIndicators.find(
                          (i) => i.indicadorId === selectedIndicadorId
                        );
                        handleOpenFicha(selectedIndicadorId, found?.indicador || 'Indicador');
                      }}
                      className="inline-flex items-center gap-1.5 bg-[#102A43] hover:bg-[#183B5E] text-white font-semibold text-[12.5px] px-4 py-2.5 rounded-xl shrink-0 cursor-pointer"
                    >
                      <FileText className="w-4 h-4 text-[#F07832]" />
                      <span>Ver Ficha Técnica</span>
                    </button>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Bar Chart: Comparison by Territorial Unit */}
                <div className="lg:col-span-8 card-premium rounded-2xl p-5 sm:p-6">
                  <h2 className="font-display text-base font-bold text-[#102A43] mb-1">
                    Comparativo por {ambitoNivel.toUpperCase()} (%)
                  </h2>
                  <p className="text-[12px] text-[#102A43]/65 mb-4">
                    Distribución de cobertura porcentual según ámbito territorial seleccionado
                  </p>
                  <div className="h-[290px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={barTerritorialData}
                        margin={{ top: 10, right: 16, left: 0, bottom: 28 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                        <XAxis
                          dataKey="nombre"
                          tick={{ fontSize: 11, fill: '#102A43' }}
                          interval={0}
                          angle={-18}
                          textAnchor="end"
                        />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 11.5, fill: '#102A43' }} />
                        <Tooltip
                          formatter={(val: unknown) => [`${val}%`, 'Cobertura']}
                          contentStyle={{
                            borderRadius: '12px',
                            border: '1px solid #CBD5E1',
                            fontSize: '12.5px',
                          }}
                        />
                        <ReferenceLine y={75} stroke="#F07832" strokeDasharray="4 4" />
                        <Bar dataKey="cobertura" name="Cobertura (%)" fill="#102A43" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Pie Chart: Status Distribution */}
                <div className="lg:col-span-4 card-premium rounded-2xl p-5 sm:p-6">
                  <h2 className="font-display text-base font-bold text-[#102A43] mb-1">
                    Estado de Indicadores
                  </h2>
                  <p className="text-[12px] text-[#102A43]/65 mb-2">
                    Proporción por nivel de cumplimiento
                  </p>
                  <div className="h-[260px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieStatusData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="48%"
                          innerRadius={48}
                          outerRadius={78}
                          paddingAngle={3}
                        >
                          {pieStatusData.map((entry) => (
                            <Cell key={entry.name} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend verticalAlign="bottom" height={36} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Line Chart: Historical Monthly Evolution */}
              {trendChartData.length > 0 && (
                <div className="card-premium rounded-2xl p-5 sm:p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <TrendingUp className="w-5 h-5 text-[#F07832]" />
                    <h2 className="font-display text-base font-bold text-[#102A43]">
                      Evolución Histórica Mensual · Año {anio}
                    </h2>
                  </div>
                  <div className="h-[260px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={trendChartData}
                        margin={{ top: 10, right: 20, left: 0, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                        <XAxis dataKey="mes" tick={{ fontSize: 12, fill: '#102A43' }} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: '#102A43' }} />
                        <Tooltip
                          formatter={(val: unknown) => [`${val}%`, 'Cobertura mensual']}
                          contentStyle={{
                            borderRadius: '12px',
                            border: '1px solid #CBD5E1',
                            fontSize: '12.5px',
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="cobertura"
                          name="Cobertura (%)"
                          stroke="#F07832"
                          strokeWidth={3}
                          dot={{ r: 4, fill: '#102A43' }}
                          activeDot={{ r: 6, fill: '#F07832' }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* VIEW 2: CMI GAUGES & RADIALS */}
          {activeView === 'cmi' && (
            <div className="space-y-6">
              <div className="card-premium rounded-2xl p-5 sm:p-6">
                <h2 className="font-display text-base font-bold text-[#102A43] mb-4">
                  Cuadro de Mando Integral (CMI) · Velocímetros de Desempeño
                </h2>
                {sirCmi.velocimetros.length === 0 && sirCmi.radiales.length === 0 ? (
                  <p className="text-sm text-[#102A43]/65">
                    Consultando indicadores priorizados del Cuadro de Mando Integral...
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[...sirCmi.velocimetros, ...sirCmi.radiales].map((item, idx) => {
                      const pct = Math.min(100, Math.max(0, Number(item.COBERTURA || 0)));
                      const title = item.NOMBRE_INDICADOR || item.INDICADOR || `Indicador ${idx + 1}`;
                      const isOptimal = pct >= (item.UMBRAL_VERDE || 75);
                      return (
                        <div
                          key={`${title}_${idx}`}
                          className="rounded-2xl border border-[#102A43]/12 bg-[#F8F7F2]/60 p-4 space-y-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-[13px] font-bold text-[#102A43] leading-snug">
                              {title}
                            </p>
                            <span
                              className={`font-mono-tabular text-[15px] font-extrabold shrink-0 ${
                                isOptimal ? 'text-[#102A43]' : 'text-[#F07832]'
                              }`}
                            >
                              {pct.toFixed(1)}%
                            </span>
                          </div>
                          <div className="w-full h-3 rounded-full bg-[#102A43]/10 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${
                                isOptimal ? 'bg-[#102A43]' : 'bg-[#F07832]'
                              }`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <div className="flex items-center justify-between text-[11.5px] text-[#102A43]/70 font-mono-tabular">
                            <span>Avance: {Number(item.AVANCE || 0).toLocaleString('es-PE')}</span>
                            <span>Meta: {Number(item.META || 0).toLocaleString('es-PE')}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* RANKING & FULL INDICATORS TABLE (Visible on tablero and tabla) */}
          {(activeView === 'tablero' || activeView === 'tabla') && (
            <div className="card-premium rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-[#102A43]/10 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-base font-bold text-[#102A43]">
                  Ranking y Detalle Completo de Indicadores ({filteredIndicators.length})
                </h2>
                <span className="text-[12px] text-[#102A43]/65">
                  Seleccione &ldquo;Ficha Técnica&rdquo; para ver definición, fórmula y fuente oficial
                </span>
              </div>
              {/* Mobile cards view */}
              <div className="md:hidden divide-y divide-[#102A43]/10">
                {filteredIndicators.map((row, idx) => (
                  <div key={`${row.indicadorId}_${row.ipress}_mob_${idx}`} className="p-4 space-y-2 text-[12.5px]">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-bold text-[#102A43] leading-snug">
                        {idx + 1}. {row.indicador}
                      </p>
                      <span className="font-mono-tabular font-extrabold text-[#102A43] shrink-0">
                        {row.avancePct}%
                      </span>
                    </div>
                    <p className="text-[11.5px] text-[#102A43]/70">
                      {row.microred} · {row.ipress}
                    </p>
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <span className="font-mono-tabular text-[11.5px] text-[#102A43]/80">
                        {row.numerador.toLocaleString('es-PE')} / {row.denominador.toLocaleString('es-PE')} (Meta {row.metaPct}%)
                      </span>
                      <button
                        type="button"
                        onClick={() => handleOpenFicha(row.indicadorId, row.indicador)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#F8F7F2] border border-[#102A43]/15 text-[#102A43] text-[11px] font-semibold cursor-pointer"
                      >
                        <FileText className="w-3 h-3 text-[#F07832]" />
                        <span>Ficha</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse text-[13px]">
                  <thead>
                    <tr className="bg-[#F8F7F2] border-b border-[#102A43]/12 text-[#102A43]/80">
                      <th className="px-4 py-3 font-semibold">N°</th>
                      <th className="px-4 py-3 font-semibold">Indicador</th>
                      <th className="px-4 py-3 font-semibold">Territorio</th>
                      <th className="px-4 py-3 font-semibold text-right">Avance / Meta</th>
                      <th className="px-4 py-3 font-semibold text-right">Umbral</th>
                      <th className="px-4 py-3 font-semibold text-right">Cobertura</th>
                      <th className="px-4 py-3 font-semibold">Estado</th>
                      <th className="px-4 py-3 font-semibold text-right no-print">Ficha</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#102A43]/8">
                    {filteredIndicators.map((row, idx) => (
                      <tr
                        key={`${row.indicadorId}_${row.ipress}_${idx}`}
                        className="hover:bg-[#F8F7F2]/70"
                      >
                        <td className="px-4 py-3 font-mono-tabular text-[#102A43]/65">{idx + 1}</td>
                        <td className="px-4 py-3 font-semibold text-[#102A43] max-w-sm">
                          {row.indicador}
                        </td>
                        <td className="px-4 py-3 text-[#102A43]/75">
                          {row.microred} · {row.ipress}
                        </td>
                        <td className="px-4 py-3 text-right font-mono-tabular">
                          {row.numerador.toLocaleString('es-PE')} /{' '}
                          {row.denominador.toLocaleString('es-PE')}
                        </td>
                        <td className="px-4 py-3 text-right font-mono-tabular">{row.metaPct}%</td>
                        <td className="px-4 py-3 text-right font-mono-tabular font-bold text-[#102A43]">
                          {row.avancePct}%
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1 text-[12px] font-bold px-2.5 py-1 rounded-lg ${
                              row.estado === 'Óptimo'
                                ? 'bg-[#102A43]/10 text-[#102A43]'
                                : row.estado === 'En proceso'
                                ? 'bg-[#F07832]/15 text-[#D96420]'
                                : 'bg-red-100 text-red-700'
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
                        <td className="px-4 py-3 text-right no-print">
                          <button
                            type="button"
                            onClick={() => handleOpenFicha(row.indicadorId, row.indicador)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#F8F7F2] hover:bg-[#102A43] hover:text-white border border-[#102A43]/15 text-[#102A43] text-[11.5px] font-semibold transition-colors cursor-pointer"
                          >
                            <FileText className="w-3.5 h-3.5 text-[#F07832]" />
                            <span>Ficha Técnica</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Clean Published Documents Section */}
      <ModuleDrivePanel
        targetModule="indicadores"
        moduleLabel="Monitoreo de Indicadores"
        driveFiles={driveFiles}
        manualDocs={manualDocs}
        onPreviewFile={onPreviewFile}
      />

      {/* Ficha Técnica Modal (12 Standardized Fields) */}
      {fichaModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0B1F33]/65 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-3xl max-h-[88vh] bg-white rounded-2xl border border-[#102A43]/15 shadow-2xl flex flex-col overflow-hidden">
            <div className="px-6 py-4 bg-gradient-to-r from-[#102A43] to-[#183B5E] text-white flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-bold tracking-wider uppercase text-[#F07832]">
                  Ficha Técnica Oficial · SIR DIRESA Cajamarca
                </p>
                <h2 className="font-display text-lg font-bold mt-0.5">
                  {fichaData?.NOMBRE_INDICADOR || fichaIndicatorName}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setFichaModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              {fichaLoading ? (
                <p className="text-sm text-[#102A43]/70 py-8 text-center">
                  Cargando ficha técnica oficial...
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-[13px]">
                  {[
                    {
                      label: 'Nombre del indicador',
                      val: String(fichaData?.NOMBRE_INDICADOR || fichaData?.NOMBRE_FICHA || fichaIndicatorName),
                    },
                    {
                      label: 'Definición',
                      val: String(
                        fichaData?.DEFINICION ||
                          fichaData?.DESCRIPCION_FICHA ||
                          'Mide la proporción de población adulta (30–59 años) que cumple con la intervención sanitaria establecida.'
                      ),
                    },
                    {
                      label: 'Tipo / Responsable',
                      val: String(
                        [fichaData?.TIPO_INDICADOR, fichaData?.RESPONSABLE_FICHA]
                          .filter(Boolean)
                          .join(' · ') ||
                          fichaData?.OBJETIVO ||
                          'Monitoreo de cobertura y calidad de atención integral del adulto.'
                      ),
                    },
                    {
                      label: 'Numerador',
                      val: String(
                        fichaData?.NUMERADOR ||
                          'Adultos de 30 a 59 años con registro HIS válido cumpliendo criterio del indicador.'
                      ),
                    },
                    {
                      label: 'Denominador',
                      val: String(
                        fichaData?.DENOMINADOR ||
                          'Población adulta programada o atendida en el periodo evaluado.'
                      ),
                    },
                    {
                      label: 'Fórmula de cálculo',
                      val: String(
                        fichaData?.FORMULA_FICHA ||
                          fichaData?.FORMULA ||
                          '(Numerador / Denominador) × 100'
                      ),
                    },
                    {
                      label: 'Unidad de medida',
                      val: String(fichaData?.UNIDAD || fichaData?.UNIDAD_MEDIDA || 'Porcentaje (%)'),
                    },
                    {
                      label: 'Fuente de información',
                      val: String(
                        fichaData?.FUENTE_INFORMACION || 'HIS-MINSA / SIR DIRESA Cajamarca'
                      ),
                    },
                    {
                      label: 'Periodicidad',
                      val: String(
                        fichaData?.FRECUENCIA_MEDICION ||
                          fichaData?.PERIODICIDAD ||
                          'Mensual / Acumulado anual'
                      ),
                    },
                    {
                      label: 'Vigencia / Meta referencial',
                      val: String(
                        fichaData?.VIGENCIA ||
                          fichaData?.META_REFERENCIAL ||
                          '≥ 75% (según convenio / norma)'
                      ),
                    },
                    {
                      label: 'Interpretación',
                      val: String(
                        fichaData?.INTERPRETACION ||
                          'Valores cercanos o superiores a la meta reflejan adecuada cobertura del paquete integral.'
                      ),
                    },
                    {
                      label: 'Observaciones metodológicas',
                      val: String(
                        fichaData?.OBSERVACIONES_FICHA ||
                          fichaData?.OBSERVACIONES ||
                          'Sujeto a consistencia de códigos CIE-10/CPMS, tipo de diagnóstico y campos LAB vigentes.'
                      ),
                    },
                  ].map((field) => (
                    <div
                      key={field.label}
                      className="p-3.5 rounded-xl bg-[#F8F7F2] border border-[#102A43]/10"
                    >
                      <p className="text-[11px] font-bold uppercase tracking-wide text-[#F07832] mb-1">
                        {field.label}
                      </p>
                      <p className="text-[#102A43] leading-relaxed whitespace-pre-line">{field.val}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="px-6 py-3.5 bg-[#F8F7F2] border-t border-[#102A43]/10 flex justify-end">
              <button
                type="button"
                onClick={() => setFichaModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-[#102A43] hover:bg-[#183B5E] text-white text-[13px] font-semibold cursor-pointer"
              >
                Cerrar Ficha Técnica
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
