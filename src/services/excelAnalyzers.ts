import * as XLSX from 'xlsx';
import {
  DataModuleKey,
  FollowupStatus,
  IndicatorRow,
  MICROREDES_RIS,
  MorbidityRow,
  NominalFollowupRecord,
  NominalRecord,
  PatientSummaryRow,
  QualityObservationRecord,
  QualityRemediationStatus,
  QualitySeverity,
  QualitySummaryRow,
} from '../types';

export interface ExcelAnalysisProgress {
  stage: 'preparando' | 'validando' | 'procesando';
  percent: number;
  processed: number;
  pending: number;
  errors: number;
  total: number;
  label: string;
}

export interface AnalyzedExcelResult {
  module: DataModuleKey;
  fileName: string;
  fileHash: string;
  rawRowCount: number;
  rowCount: number;
  duplicateCount: number;
  errorCount: number;
  establishmentCount: number;
  microredCount: number;
  columnHeaders: string[];
  publicRows: Record<string, unknown>[];
  nominalRows: NominalRecord[];
  summary: Record<string, unknown>;
  validationNotes: string;
}

const MONTH_NAMES_ES = [
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

function normalizeHeader(h: string): string {
  return String(h || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_');
}

function pickField(row: Record<string, unknown>, candidates: string[]): unknown {
  const keys = Object.keys(row);
  for (const c of candidates) {
    const exact = keys.find((k) => normalizeHeader(k) === c);
    if (exact !== undefined && row[exact] !== undefined && row[exact] !== '') {
      return row[exact];
    }
  }
  for (const c of candidates) {
    const partial = keys.find((k) => normalizeHeader(k).includes(c));
    if (partial !== undefined && row[partial] !== undefined && row[partial] !== '') {
      return row[partial];
    }
  }
  return undefined;
}

function toNumber(val: unknown, fallback = 0): number {
  if (typeof val === 'number' && !Number.isNaN(val)) return val;
  if (typeof val === 'string') {
    const cleaned = val.replace(/[%,\s]/g, '').trim();
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : fallback;
  }
  return fallback;
}

export function formatExcelDate(val: unknown): string {
  if (val === undefined || val === null || val === '') return '';
  if (typeof val === 'number' && val > 1000 && val < 80000) {
    // Excel serial date
    const utcDays = Math.floor(val - 25569);
    const d = new Date(utcDays * 86400 * 1000);
    if (!Number.isNaN(d.getTime())) {
      return d.toISOString().slice(0, 10);
    }
  }
  const str = String(val).trim();
  const ddmmyyyy = str.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (ddmmyyyy) {
    const day = ddmmyyyy[1].padStart(2, '0');
    const month = ddmmyyyy[2].padStart(2, '0');
    const year = ddmmyyyy[3].length === 2 ? `20${ddmmyyyy[3]}` : ddmmyyyy[3];
    return `${year}-${month}-${day}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    return str.slice(0, 10);
  }
  return str.slice(0, 30);
}

export function extractMonthName(dateStr: string, explicitMonth?: unknown): string {
  if (explicitMonth !== undefined && explicitMonth !== '') {
    const raw = String(explicitMonth).trim();
    const num = Number(raw);
    if (num >= 1 && num <= 12) return MONTH_NAMES_ES[num - 1];
    return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
  }
  const m = dateStr.match(/^\d{4}-(\d{2})-\d{2}/);
  if (m) {
    const idx = Number(m[1]) - 1;
    if (idx >= 0 && idx < 12) return MONTH_NAMES_ES[idx];
  }
  return 'Sin dato';
}

export function classifyAgeGroup(age: number | null): string {
  if (age === null || Number.isNaN(age)) return 'Sin dato';
  if (age >= 30 && age <= 34) return '30-34';
  if (age >= 35 && age <= 39) return '35-39';
  if (age >= 40 && age <= 44) return '40-44';
  if (age >= 45 && age <= 49) return '45-49';
  if (age >= 50 && age <= 54) return '50-54';
  if (age >= 55 && age <= 59) return '55-59';
  if (age < 30) return '<30';
  return '60+';
}

export function normalizeMicrored(raw: unknown): string {
  const text = String(raw || '').trim().toLowerCase();
  if (!text) return 'San Ignacio';
  if (text.includes('huarango')) return 'Huarango';
  if (text.includes('jose') || text.includes('lourdes')) return 'San José de Lourdes';
  if (text.includes('coipa')) return 'La Coipa';
  if (text.includes('tamborapa')) return 'Tamborapa';
  if (text.includes('ignacio')) return 'San Ignacio';
  if (text.includes('chirinos')) return 'Chirinos';
  if (text.includes('namballe')) return 'Namballe';
  if (text.includes('extern')) return 'Externos';
  const matched = MICROREDES_RIS.find((m) => m.toLowerCase() === text);
  return matched || String(raw).trim().slice(0, 60);
}

function sanitizeNominalRow(row: Record<string, unknown>): NominalRecord {
  const clean: NominalRecord = {};
  for (const [k, v] of Object.entries(row)) {
    const key = String(k).trim().slice(0, 80);
    if (!key) continue;
    if (typeof v === 'number' || typeof v === 'boolean') {
      clean[key] = v;
    } else if (v !== null && v !== undefined) {
      clean[key] = String(v).trim().slice(0, 240);
    }
  }
  return clean;
}

export function normalizeQualityObservationRows(
  rows: NominalRecord[]
): QualityObservationRecord[] {
  return rows.map((r, index) => {
    const fechaRaw = pickField(r, ['fecha_deteccion', 'fecha_atencion', 'fecha', 'fec_registro', 'fecha_registro']);
    const fechaDeteccion = formatExcelDate(fechaRaw) || 'Sin fecha';
    const periodo =
      /^\d{4}-\d{2}/.test(fechaDeteccion)
        ? fechaDeteccion.slice(0, 7)
        : String(pickField(r, ['periodo', 'mes']) || 'Sin periodo').slice(0, 24);

    const microred = normalizeMicrored(pickField(r, ['microred', 'red']));
    const establecimiento = String(
      pickField(r, ['establecimiento', 'ipress', 'eess', 'centro_salud']) || `C.S. ${microred}`
    ).slice(0, 120);

    const dniPersonal = String(
      pickField(r, ['dni_personal', 'dni_registrador', 'dni_responsable', 'doc_personal']) || '—'
    ).slice(0, 20);
    const nombrePersonal = String(
      pickField(r, ['nombre_personal', 'personal', 'responsable', 'digitador', 'profesional']) ||
        'Personal no especificado'
    ).slice(0, 140);

    const dniPaciente = String(
      pickField(r, ['dni_paciente', 'nro_documento', 'dni', 'doc_paciente']) || '—'
    ).slice(0, 20);
    const nombrePaciente = String(
      pickField(r, ['nombre_paciente', 'paciente', 'apellidos_nombres', 'nombres']) ||
        'Paciente sin nombre'
    ).slice(0, 140);

    const rawEdad = pickField(r, ['edad_paciente', 'edad', 'anos']);
    const edadNum = rawEdad !== undefined && rawEdad !== '' ? toNumber(rawEdad, -1) : -1;
    const edadPaciente = edadNum >= 0 && edadNum <= 115 ? edadNum : null;
    const grupoEdad = classifyAgeGroup(edadPaciente);

    const lote = String(pickField(r, ['lote', 'nro_lote']) || '—').slice(0, 32);
    const hoja = String(pickField(r, ['hoja', 'nro_hoja', 'pagina']) || '—').slice(0, 32);
    const registro = String(
      pickField(r, ['registro', 'nro_registro', 'item', 'codigo_his', 'id_registro']) || `${index + 1}`
    ).slice(0, 40);

    const tipoErrorRaw = String(
      pickField(r, ['tipo_error', 'error', 'tipo_observacion', 'categoria_error', 'observacion']) ||
        'Conforme'
    ).slice(0, 140);
    const descripcionRaw = String(
      pickField(r, ['descripcion_observacion', 'descripcion', 'detalle', 'observacion', 'error']) ||
        tipoErrorRaw
    ).slice(0, 240);

    const lowerCombined = `${tipoErrorRaw} ${descripcionRaw}`.toLowerCase();
    const isConforme =
      lowerCombined === 'conforme' ||
      lowerCombined.includes('sin error') ||
      lowerCombined.includes('sin observaci') ||
      lowerCombined === 'ok';
    const isError = !isConforme;

    const rawGravedad = String(
      pickField(r, ['nivel_gravedad', 'gravedad', 'severidad', 'prioridad']) || ''
    ).toLowerCase();
    let nivelGravedad: QualitySeverity = 'Conforme';
    if (isError) {
      if (rawGravedad.includes('crit') || lowerCombined.includes('duplic') || lowerCombined.includes('dni')) {
        nivelGravedad = 'Crítico';
      } else if (rawGravedad.includes('alt') || lowerCombined.includes('inconsis') || lowerCombined.includes('cie')) {
        nivelGravedad = 'Alto';
      } else if (rawGravedad.includes('mod') || lowerCombined.includes('lab') || lowerCombined.includes('falta')) {
        nivelGravedad = 'Moderado';
      } else {
        nivelGravedad = 'Leve';
      }
    }

    const rawEstado = String(
      pickField(r, ['estado_subsanacion', 'subsanacion', 'estado_correccion', 'estado']) || ''
    ).toLowerCase();
    let estadoSubsanacion: QualityRemediationStatus = isError ? 'Pendiente' : 'Conforme';
    if (isError) {
      if (rawEstado.includes('subsan') || rawEstado.includes('correg') || rawEstado.includes('cerrad')) {
        estadoSubsanacion = 'Subsanado';
      } else if (rawEstado.includes('proc')) {
        estadoSubsanacion = 'En proceso';
      }
    }

    return {
      nro: index + 1,
      fechaDeteccion,
      periodo,
      microred,
      establecimiento,
      dniPersonal,
      nombrePersonal,
      dniPaciente,
      nombrePaciente,
      edadPaciente,
      grupoEdad,
      lote,
      hoja,
      registro,
      tipoError: isError ? tipoErrorRaw : 'Sin observación',
      descripcionObservacion: descripcionRaw,
      nivelGravedad,
      estadoSubsanacion,
      isError,
      raw: r,
    };
  });
}

export function normalizeNominalFollowupRows(
  rows: NominalRecord[]
): NominalFollowupRecord[] {
  return rows.map((r, index) => {
    const dni = String(
      pickField(r, ['dni', 'nro_documento', 'documento', 'doc_identidad']) || '—'
    ).slice(0, 20);
    const apellidosNombres = String(
      pickField(r, ['apellidos_nombres', 'paciente', 'nombre_paciente', 'nombres_apellidos', 'nombre']) ||
        'Paciente Adulto'
    ).slice(0, 150);

    const rawGenero = String(pickField(r, ['genero', 'sexo']) || '').trim().toUpperCase();
    const genero = rawGenero.startsWith('M') || rawGenero.startsWith('H')
      ? 'Masculino'
      : rawGenero.startsWith('F')
      ? 'Femenino'
      : rawGenero || 'No especificado';

    const fechaNacimiento = formatExcelDate(
      pickField(r, ['fecha_nacimiento', 'fec_nac', 'nacimiento'])
    );
    const mesCumpleanos = extractMonthName(
      fechaNacimiento,
      pickField(r, ['mes_cumpleanos', 'mes_nac', 'cumpleanos'])
    );

    const edad = Math.max(
      0,
      toNumber(pickField(r, ['edad', 'edad_anos', 'anos']), 40)
    );
    const direccion = String(
      pickField(r, ['direccion', 'domicilio', 'sector', 'comunidad', 'caserio']) || 'San Ignacio'
    ).slice(0, 160);
    const microred = normalizeMicrored(pickField(r, ['microred', 'red']));
    const establecimiento = String(
      pickField(r, ['establecimiento', 'ipress', 'eess', 'centro_salud']) || `C.S. ${microred}`
    ).slice(0, 120);

    const condicionPaquete = String(
      pickField(r, ['condicion_paquete', 'estado_paquete', 'paquete', 'condicion']) || 'Iniciado'
    ).slice(0, 60);

    const entVal = String(pickField(r, ['tamizaje_ent', 'ent', 'hta_dm']) || '').toLowerCase();
    const smVal = String(pickField(r, ['salud_mental', 'mental', 'tamizaje_sm']) || '').toLowerCase();
    const labVal = String(pickField(r, ['laboratorio', 'dosaje', 'lab']) || '').toLowerCase();
    const bucalVal = String(pickField(r, ['salud_bucal', 'odontologia', 'bucal']) || '').toLowerCase();
    const vacVal = String(pickField(r, ['inmunizaciones', 'vacuna']) || '').toLowerCase();

    const activitiesChecks: { label: string; done: boolean }[] = [
      { label: 'Tamizaje ENT (HTA/DM)', done: Boolean(entVal && !entVal.includes('no') && !entVal.includes('pend')) },
      { label: 'Tamizaje Salud Mental', done: Boolean(smVal && !smVal.includes('no') && !smVal.includes('pend')) },
      { label: 'Dosaje Laboratorio', done: Boolean(labVal && !labVal.includes('no') && !labVal.includes('pend')) },
      { label: 'Evaluación Salud Bucal', done: Boolean(bucalVal && !bucalVal.includes('no') && !bucalVal.includes('pend')) },
      { label: 'Control Inmunizaciones', done: Boolean(vacVal && !vacVal.includes('no') && !vacVal.includes('pend')) },
    ];

    const explicitProg = toNumber(pickField(r, ['actividades_programadas', 'programadas']), -1);
    const explicitReal = toNumber(pickField(r, ['actividades_realizadas', 'realizadas']), -1);
    const explicitPend = toNumber(pickField(r, ['actividades_pendientes', 'pendientes']), -1);

    let actividadesProgramadas = explicitProg > 0 ? explicitProg : 5;
    let actividadesRealizadas =
      explicitReal >= 0
        ? explicitReal
        : activitiesChecks.filter((a) => a.done).length;

    if (
      explicitReal < 0 &&
      actividadesRealizadas === 0 &&
      (condicionPaquete.toLowerCase().includes('complet') || condicionPaquete.toLowerCase().includes('ta'))
    ) {
      actividadesRealizadas = actividadesProgramadas;
    } else if (
      explicitReal < 0 &&
      actividadesRealizadas === 0 &&
      condicionPaquete.toLowerCase().includes('inici')
    ) {
      actividadesRealizadas = 2;
    }

    const actividadesPendientes =
      explicitPend >= 0
        ? explicitPend
        : Math.max(0, actividadesProgramadas - actividadesRealizadas);

    const explicitPendText = String(
      pickField(r, ['detalle_pendientes', 'actividades_pendientes_detalle', 'faltantes']) || ''
    ).trim();
    const explicitRealText = String(
      pickField(r, ['detalle_realizadas', 'actividades_realizadas_detalle']) || ''
    ).trim();

    const listaPendientes =
      explicitPendText ||
      (actividadesPendientes === 0
        ? 'Ninguna'
        : activitiesChecks
            .filter((a) => !a.done)
            .slice(0, Math.max(1, actividadesPendientes))
            .map((a) => a.label)
            .join(', '));

    const listaRealizadas =
      explicitRealText ||
      (actividadesRealizadas === 0
        ? 'Ninguna registrada'
        : activitiesChecks
            .filter((a) => a.done)
            .map((a) => a.label)
            .join(', ') || `${actividadesRealizadas} actividad(es) registrada(s)`);

    const rawPct = pickField(r, ['porcentaje_cumplimiento', 'cumplimiento', 'avance_pct']);
    const porcentajeCumplimiento =
      rawPct !== undefined
        ? Math.min(100, Math.max(0, Number(toNumber(rawPct, 0).toFixed(1))))
        : Number(((Math.min(actividadesRealizadas, actividadesProgramadas) / Math.max(1, actividadesProgramadas)) * 100).toFixed(1));

    let estadoSeguimiento: FollowupStatus = 'Pendiente';
    const condLower = condicionPaquete.toLowerCase();
    if (porcentajeCumplimiento >= 100 || condLower.includes('complet') || condLower.includes('ta')) {
      estadoSeguimiento = 'Cumplimiento completo';
    } else if (porcentajeCumplimiento >= 50) {
      estadoSeguimiento = 'Cumplimiento parcial';
    } else if (porcentajeCumplimiento > 0) {
      estadoSeguimiento = 'En riesgo de incumplimiento';
    } else {
      estadoSeguimiento = 'Pendiente';
    }

    return {
      nro: index + 1,
      dni,
      apellidosNombres,
      genero,
      edad,
      fechaNacimiento: fechaNacimiento || '—',
      mesCumpleanos,
      direccion,
      microred,
      establecimiento,
      condicionPaquete,
      actividadesProgramadas,
      actividadesRealizadas,
      actividadesPendientes,
      listaPendientes,
      listaRealizadas,
      porcentajeCumplimiento,
      estadoSeguimiento,
      raw: r,
    };
  });
}

async function computeBufferHash(buffer: ArrayBuffer, fileName: string, size: number): Promise<string> {
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const digest = await crypto.subtle.digest('SHA-256', buffer);
      return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
        .slice(0, 48);
    }
  } catch {
    // fallback below
  }
  return `${fileName}_${size}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48);
}

const yieldToMain = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export async function analyzeExcelFile(
  file: File,
  module: DataModuleKey,
  onProgress?: (progress: ExcelAnalysisProgress) => void
): Promise<AnalyzedExcelResult> {
  onProgress?.({
    stage: 'preparando',
    percent: 10,
    processed: 0,
    pending: 0,
    errors: 0,
    total: 0,
    label: 'Leyendo archivo...',
  });

  const buffer = await file.arrayBuffer();
  const fileHash = await computeBufferHash(buffer, file.name, file.size);
  await yieldToMain();

  onProgress?.({
    stage: 'validando',
    percent: 28,
    processed: 0,
    pending: 0,
    errors: 0,
    total: 0,
    label: 'Validando estructura de hojas y columnas...',
  });

  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error('El archivo no contiene hojas válidas.');
  }
  const sheet = workbook.Sheets[firstSheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
  });

  if (rawRows.length === 0) {
    throw new Error('La hoja seleccionada no contiene registros.');
  }

  const columnHeaders = Object.keys(rawRows[0] || {})
    .map((k) => String(k).trim().slice(0, 80))
    .slice(0, 60);

  // Deduplicate exact row signatures incrementally without blocking UI
  const seen = new Set<string>();
  const uniqueRows: Record<string, unknown>[] = [];
  let duplicateCount = 0;
  let errorCount = 0;
  const totalRaw = rawRows.length;

  for (let i = 0; i < totalRaw; i++) {
    const r = rawRows[i];
    const hasAnyValue = Object.values(r).some((v) => String(v ?? '').trim() !== '');
    if (!hasAnyValue) {
      errorCount++;
      continue;
    }
    const sig = JSON.stringify(r);
    if (seen.has(sig)) {
      duplicateCount++;
    } else {
      seen.add(sig);
      uniqueRows.push(r);
    }
    if (i > 0 && i % 600 === 0) {
      onProgress?.({
        stage: 'procesando',
        percent: Math.min(82, 30 + Math.round((i / totalRaw) * 50)),
        processed: i,
        pending: totalRaw - i,
        errors: duplicateCount + errorCount,
        total: totalRaw,
        label: `Procesando y depurando registros (${i.toLocaleString('es-PE')} / ${totalRaw.toLocaleString('es-PE')})...`,
      });
      await yieldToMain();
    }
  }

  onProgress?.({
    stage: 'procesando',
    percent: 90,
    processed: uniqueRows.length,
    pending: 0,
    errors: duplicateCount + errorCount,
    total: totalRaw,
    label: 'Consolidando resumen y validando reglas sanitarias...',
  });
  await yieldToMain();

  const establishments = new Set<string>();
  const microredes = new Set<string>();

  if (module === 'morbilidades') {
    const aggMap = new Map<string, MorbidityRow>();
    for (const r of uniqueRows) {
      const microred = normalizeMicrored(
        pickField(r, ['microred', 'red', 'jurisdiccion'])
      );
      const ipress = String(
        pickField(r, ['ipress', 'establecimiento', 'eess', 'centro_salud']) ||
          `C.S. ${microred}`
      ).slice(0, 120);
      const codigoCie = String(
        pickField(r, ['codigo', 'cie10', 'cie_10', 'cod_diag', 'codigo_his']) || 'Z000'
      )
        .toUpperCase()
        .slice(0, 20);
      const diagnostico = String(
        pickField(r, ['diagnostico', 'descripcion', 'morbilidad', 'enfermedad']) ||
          'Atención general del adulto'
      ).slice(0, 160);
      const categoria = String(
        pickField(r, ['categoria', 'grupo', 'capitulo']) || 'Morbilidad General'
      ).slice(0, 80);

      const masc = toNumber(pickField(r, ['masculino', 'varones', 'hombres', 'm']), -1);
      const fem = toNumber(pickField(r, ['femenino', 'mujeres', 'f']), -1);
      const sexo = String(pickField(r, ['sexo', 'genero']) || '').toUpperCase();
      const totalVal = toNumber(pickField(r, ['total', 'casos', 'cantidad', 'atenciones']), 0);

      let masculino = masc >= 0 ? masc : 0;
      let femenino = fem >= 0 ? fem : 0;
      let total = totalVal;

      if (masc < 0 && fem < 0) {
        const count = totalVal > 0 ? totalVal : 1;
        if (sexo.startsWith('M') || sexo.startsWith('H')) {
          masculino = count;
        } else if (sexo.startsWith('F')) {
          femenino = count;
        } else {
          masculino = Math.floor(count / 2);
          femenino = count - masculino;
        }
        total = count;
      } else if (total <= 0) {
        total = masculino + femenino;
      }

      establishments.add(ipress);
      microredes.add(microred);

      const key = `${microred}__${ipress}__${codigoCie}`;
      const existing = aggMap.get(key);
      if (existing) {
        existing.masculino += masculino;
        existing.femenino += femenino;
        existing.total += total;
      } else {
        aggMap.set(key, {
          codigoCie,
          diagnostico,
          categoria,
          microred,
          ipress,
          masculino,
          femenino,
          total,
        });
      }
    }

    const publicRows = Array.from(aggMap.values()).sort((a, b) => b.total - a.total);
    return {
      module,
      fileName: file.name.slice(0, 240),
      fileHash,
      rawRowCount: totalRaw,
      rowCount: uniqueRows.length,
      duplicateCount,
      errorCount,
      establishmentCount: establishments.size,
      microredCount: microredes.size,
      columnHeaders,
      publicRows: publicRows as unknown as Record<string, unknown>[],
      nominalRows: [],
      summary: {
        totalCasos: publicRows.reduce((s, r) => s + r.total, 0),
        diagnosticosDistintos: new Set(publicRows.map((r) => r.codigoCie)).size,
      },
      validationNotes: `Consolidado sin PII: ${publicRows.length} agrupaciones CIE-10 desde ${uniqueRows.length} filas válidas (${duplicateCount} duplicados omitidos).`,
    };
  }

  if (module === 'indicadores') {
    const rows: IndicatorRow[] = [];
    for (const r of uniqueRows) {
      const microred = normalizeMicrored(pickField(r, ['microred', 'red']));
      const ipress = String(
        pickField(r, ['ipress', 'establecimiento', 'eess']) || `C.S. ${microred}`
      ).slice(0, 120);
      const indicador = String(
        pickField(r, ['indicador', 'nombre_indicador', 'meta_indicador', 'descripcion']) ||
          'Paquete de Atención Integral del Adulto'
      ).slice(0, 160);
      const indicadorId = normalizeHeader(indicador).slice(0, 48) || 'indicador_general';
      const numerador = toNumber(pickField(r, ['numerador', 'avance', 'logrado', 'ejecutado']), 0);
      const denominador = Math.max(
        1,
        toNumber(pickField(r, ['denominador', 'meta', 'programado', 'poblacion']), 100)
      );
      const metaPct = toNumber(pickField(r, ['meta_pct', 'meta_porcentaje', 'umbral']), 75);
      const rawPct = pickField(r, ['avance_pct', 'porcentaje', 'cobertura']);
      const avancePct =
        rawPct !== undefined
          ? Number(toNumber(rawPct, 0).toFixed(1))
          : Number(((numerador / denominador) * 100).toFixed(1));
      const estado: IndicatorRow['estado'] =
        avancePct >= metaPct ? 'Óptimo' : avancePct >= metaPct * 0.7 ? 'En proceso' : 'Riesgo';

      establishments.add(ipress);
      microredes.add(microred);
      rows.push({
        indicadorId,
        indicador,
        microred,
        ipress,
        numerador,
        denominador,
        metaPct,
        avancePct,
        estado,
      });
    }

    const avgAvance =
      rows.length > 0
        ? Number((rows.reduce((s, r) => s + r.avancePct, 0) / rows.length).toFixed(1))
        : 0;

    return {
      module,
      fileName: file.name.slice(0, 240),
      fileHash,
      rawRowCount: totalRaw,
      rowCount: rows.length,
      duplicateCount,
      errorCount,
      establishmentCount: establishments.size,
      microredCount: microredes.size,
      columnHeaders,
      publicRows: rows as unknown as Record<string, unknown>[],
      nominalRows: [],
      summary: {
        promedioCobertura: avgAvance,
        indicadoresEvaluados: new Set(rows.map((r) => r.indicador)).size,
      },
      validationNotes: `Indicadores consolidados: ${rows.length} filas válidas en ${establishments.size} establecimientos.`,
    };
  }

  if (module === 'calidad') {
    const summaryMap = new Map<string, QualitySummaryRow>();
    const nominalRows: NominalRecord[] = uniqueRows.map(sanitizeNominalRow);
    const normalizedQuality = normalizeQualityObservationRows(nominalRows);

    for (const q of normalizedQuality) {
      establishments.add(q.establecimiento);
      microredes.add(q.microred);

      const key = `${q.microred}__${q.establecimiento}`;
      const existing = summaryMap.get(key) || {
        microred: q.microred,
        ipress: q.establecimiento,
        registrosEvaluados: 0,
        conformes: 0,
        observados: 0,
        tasaConformidad: 100,
        principalObservacion: 'Sin observaciones críticas',
      };
      existing.registrosEvaluados += 1;
      if (q.isError) {
        existing.observados += 1;
        existing.principalObservacion = q.tipoError;
      } else {
        existing.conformes += 1;
      }
      existing.tasaConformidad = Number(
        ((existing.conformes / existing.registrosEvaluados) * 100).toFixed(1)
      );
      summaryMap.set(key, existing);
    }

    const publicRows = Array.from(summaryMap.values());
    const observedErrors = normalizedQuality.filter((q) => q.isError).length;
    return {
      module,
      fileName: file.name.slice(0, 240),
      fileHash,
      rawRowCount: totalRaw,
      rowCount: uniqueRows.length,
      duplicateCount,
      errorCount: errorCount + observedErrors,
      establishmentCount: establishments.size,
      microredCount: microredes.size,
      columnHeaders,
      publicRows: publicRows as unknown as Record<string, unknown>[],
      nominalRows,
      summary: {
        totalEvaluados: uniqueRows.length,
        totalObservados: publicRows.reduce((s, r) => s + r.observados, 0),
      },
      validationNotes: `Control de calidad: ${uniqueRows.length} registros auditados (${observedErrors} observaciones HIS, ${duplicateCount} duplicados omitidos).`,
    };
  }

  // pacientes
  const summaryMap = new Map<string, PatientSummaryRow>();
  const nominalRows: NominalRecord[] = uniqueRows.map(sanitizeNominalRow);
  const normalizedPatients = normalizeNominalFollowupRows(nominalRows);

  for (const p of normalizedPatients) {
    establishments.add(p.establecimiento);
    microredes.add(p.microred);

    const key = `${p.microred}__${p.establecimiento}`;
    const existing = summaryMap.get(key) || {
      microred: p.microred,
      ipress: p.establecimiento,
      adultosAtendidos: 0,
      paqueteIniciado: 0,
      paqueteCompleto: 0,
      tamizajeEnt: 0,
      saludMental: 0,
      pendientesSeguimiento: 0,
    };
    existing.adultosAtendidos += 1;
    if (p.estadoSeguimiento === 'Cumplimiento completo') {
      existing.paqueteCompleto += 1;
    } else if (p.estadoSeguimiento === 'Cumplimiento parcial') {
      existing.paqueteIniciado += 1;
      existing.pendientesSeguimiento += 1;
    } else {
      existing.pendientesSeguimiento += 1;
    }
    if (p.listaRealizadas.toLowerCase().includes('ent')) {
      existing.tamizajeEnt += 1;
    }
    if (p.listaRealizadas.toLowerCase().includes('mental')) {
      existing.saludMental += 1;
    }
    summaryMap.set(key, existing);
  }

  const publicRows = Array.from(summaryMap.values());
  return {
    module,
    fileName: file.name.slice(0, 240),
    fileHash,
    rawRowCount: totalRaw,
    rowCount: uniqueRows.length,
    duplicateCount,
    errorCount,
    establishmentCount: establishments.size,
    microredCount: microredes.size,
    columnHeaders,
    publicRows: publicRows as unknown as Record<string, unknown>[],
    nominalRows,
    summary: {
      adultosAtendidos: uniqueRows.length,
      paquetesCompletos: publicRows.reduce((s, r) => s + r.paqueteCompleto, 0),
    },
    validationNotes: `Seguimiento nominal: ${uniqueRows.length} adultos procesados (${duplicateCount} duplicados omitidos).`,
  };
}

export function exportRowsToExcel(
  rows: Record<string, unknown>[],
  fileName: string,
  sheetName = 'Datos',
  metadata?: {
    modulo: string;
    periodo?: string;
    filtros?: string;
    fuente?: string;
  }
): void {
  if (!rows.length) return;
  const workbook = XLSX.utils.book_new();
  const cleanSheetName = sheetName.slice(0, 31);

  if (metadata) {
    const headers = Object.keys(rows[0]);
    const headerRows: unknown[][] = [
      ['RED INTEGRADA DE SALUD SAN IGNACIO — CURSO DE VIDA ADULTO'],
      [`Módulo: ${metadata.modulo}`, `Fecha de generación: ${new Date().toLocaleString('es-PE')}`],
      [
        `Periodo consultado: ${metadata.periodo || 'Vigente'}`,
        `Fuente: ${metadata.fuente || 'Plataforma RIS San Ignacio'}`,
      ],
      [`Filtros aplicados: ${metadata.filtros || 'Todos los registros'}`],
      [],
      headers,
      ...rows.map((r) => headers.map((h) => r[h] ?? '')),
    ];
    const worksheet = XLSX.utils.aoa_to_sheet(headerRows);
    XLSX.utils.book_append_sheet(workbook, worksheet, cleanSheetName);
  } else {
    const worksheet = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, cleanSheetName);
  }

  XLSX.writeFile(workbook, `${fileName}.xlsx`);
}
