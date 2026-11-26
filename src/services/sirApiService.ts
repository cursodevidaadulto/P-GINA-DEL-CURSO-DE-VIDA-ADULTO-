import {
  SirChartPoint,
  SirCmiResponse,
  SirFichaTecnica,
  SirFiltrosResponse,
  SirIndicatorSummary,
  SirTrendPoint,
} from '../types';

export interface SirQueryParams {
  curso?: string;
  subcurso?: string;
  anio?: string;
  mes?: string;
  provincia?: string;
  distrito?: string;
  red?: string;
  microred?: string;
  ipress?: string;
  ris?: string;
  zona?: string;
  puerta?: string;
  categoria?: string;
  grupo_etario?: string;
  indicador?: string;
  nivel?: string;
}

function buildQuery(params: SirQueryParams): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '' && v !== 'Todos' && v !== 'Todas') {
      sp.set(k, String(v));
    }
  }
  return sp.toString();
}

async function fetchSirJson<T>(path: string): Promise<{ source: string; fetchedAt: string; data: T }> {
  const res = await fetch(path);
  const json = (await res.json().catch(() => ({}))) as {
    source?: string;
    fetchedAt?: string;
    data?: unknown;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(json.error || `Error consultando SIR DIRESA Cajamarca (${res.status})`);
  }

  const envelope = json.data as { ok?: boolean; data?: unknown; error?: string } | undefined;
  if (envelope && typeof envelope === 'object' && envelope.ok === false) {
    throw new Error(envelope.error || 'SIR DIRESA Cajamarca devolvió una respuesta inválida.');
  }

  const unwrapped =
    envelope && typeof envelope === 'object' && 'data' in envelope && envelope.data !== undefined
      ? (envelope.data as T)
      : (json.data as T);

  return {
    source: json.source || 'SIR DIRESA Cajamarca',
    fetchedAt: json.fetchedAt || new Date().toISOString(),
    data: unwrapped,
  };
}

export async function fetchSirFiltros(): Promise<{
  source: string;
  fetchedAt: string;
  data: SirFiltrosResponse;
}> {
  return fetchSirJson<SirFiltrosResponse>('/api/sir/filtros');
}

export async function fetchSirPeriodoReciente(): Promise<{
  source: string;
  fetchedAt: string;
  data: { ANIO?: number; MES?: number; anio?: number; mes?: number };
}> {
  return fetchSirJson('/api/sir/periodo-reciente');
}

export async function fetchSirProcesoControl(
  anio: string,
  mes: string,
  curso = '5'
): Promise<{
  source: string;
  fetchedAt: string;
  data: { FECHA_PROCESO?: string; ESTADO?: string; fecha_proceso?: string; estado?: string };
}> {
  const qs = buildQuery({ anio, mes, curso, subcurso: '0' });
  return fetchSirJson(`/api/sir/proceso-control?${qs}`);
}

export async function fetchSirResumen(
  params: SirQueryParams
): Promise<{ source: string; fetchedAt: string; data: SirIndicatorSummary[] }> {
  const qs = buildQuery({ curso: '5', subcurso: '0', ...params });
  const res = await fetchSirJson<SirIndicatorSummary[] | { rows?: SirIndicatorSummary[] }>(
    `/api/sir/resumen?${qs}`
  );
  const rows = Array.isArray(res.data) ? res.data : res.data?.rows || [];
  return { ...res, data: rows };
}

export async function fetchSirCmi(
  params: SirQueryParams
): Promise<{ source: string; fetchedAt: string; data: SirCmiResponse }> {
  const qs = buildQuery({ curso: '5', subcurso: '0', ...params });
  const res = await fetchSirJson<SirCmiResponse>(`/api/sir/cmi?${qs}`);
  return {
    ...res,
    data: {
      lista: Array.isArray(res.data?.lista) ? res.data.lista : [],
      velocimetros: Array.isArray(res.data?.velocimetros) ? res.data.velocimetros : [],
      radiales: Array.isArray(res.data?.radiales) ? res.data.radiales : [],
    },
  };
}

export async function fetchSirGrafica(
  params: SirQueryParams
): Promise<{ source: string; fetchedAt: string; data: SirChartPoint[] }> {
  const qs = buildQuery({ curso: '5', subcurso: '0', ...params });
  const res = await fetchSirJson<SirChartPoint[] | { rows?: SirChartPoint[] }>(
    `/api/sir/grafica?${qs}`
  );
  const rows = Array.isArray(res.data) ? res.data : res.data?.rows || [];
  return { ...res, data: rows };
}

export async function fetchSirTendencia(
  params: SirQueryParams
): Promise<{ source: string; fetchedAt: string; data: SirTrendPoint[] }> {
  const qs = buildQuery({ curso: '5', subcurso: '0', ...params });
  const res = await fetchSirJson<SirTrendPoint[] | { rows?: SirTrendPoint[] }>(
    `/api/sir/tendencia?${qs}`
  );
  const rows = Array.isArray(res.data) ? res.data : res.data?.rows || [];
  return { ...res, data: rows };
}

export async function fetchSirFicha(
  indicadorId: string
): Promise<{ source: string; fetchedAt: string; data: SirFichaTecnica }> {
  const res = await fetchSirJson<SirFichaTecnica | SirFichaTecnica[]>(
    `/api/sir/ficha?indicador=${encodeURIComponent(indicadorId)}`
  );
  const item = Array.isArray(res.data) ? res.data[0] || {} : res.data || {};
  return { ...res, data: item };
}
