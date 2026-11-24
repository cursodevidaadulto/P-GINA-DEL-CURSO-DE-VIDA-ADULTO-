import * as XLSX from 'xlsx';
import {
  DataModuleKey,
  IndicatorRow,
  MICROREDES_RIS,
  MorbidityRow,
  NominalRecord,
  PatientSummaryRow,
  QualitySummaryRow,
} from '../types';

export interface AnalyzedExcelResult {
  module: DataModuleKey;
  fileName: string;
  rowCount: number;
  duplicateCount: number;
  establishmentCount: number;
  microredCount: number;
  columnHeaders: string[];
  publicRows: Record<string, unknown>[];
  nominalRows: NominalRecord[];
  summary: Record<string, unknown>;
  validationNotes: string;
}

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
    const found = keys.find((k) => normalizeHeader(k) === c || normalizeHeader(k).includes(c));
    if (found !== undefined && row[found] !== undefined && row[found] !== '') {
      return row[found];
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

export async function analyzeExcelFile(
  file: File,
  module: DataModuleKey
): Promise<AnalyzedExcelResult> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error('El archivo Excel no contiene hojas válidas.');
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

  // Deduplicate exact row signatures
  const seen = new Set<string>();
  const uniqueRows: Record<string, unknown>[] = [];
  let duplicateCount = 0;

  for (const r of rawRows) {
    const sig = JSON.stringify(r);
    if (seen.has(sig)) {
      duplicateCount++;
    } else {
      seen.add(sig);
      uniqueRows.push(r);
    }
  }

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
      rowCount: uniqueRows.length,
      duplicateCount,
      establishmentCount: establishments.size,
      microredCount: microredes.size,
      columnHeaders,
      publicRows: publicRows as unknown as Record<string, unknown>[],
      nominalRows: [],
      summary: {
        totalCasos: publicRows.reduce((s, r) => s + r.total, 0),
        diagnosticosDistintos: new Set(publicRows.map((r) => r.codigoCie)).size,
      },
      validationNotes: `Consolidado sin PII: ${publicRows.length} agrupaciones CIE-10 desde ${uniqueRows.length} filas (${duplicateCount} duplicados omitidos).`,
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
      rowCount: rows.length,
      duplicateCount,
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
    const nominalRows: NominalRecord[] = [];

    for (const r of uniqueRows) {
      const microred = normalizeMicrored(pickField(r, ['microred', 'red']));
      const ipress = String(
        pickField(r, ['ipress', 'establecimiento', 'eess']) || `C.S. ${microred}`
      ).slice(0, 120);
      const obsRaw = String(
        pickField(r, ['observacion', 'error', 'estado_calidad', 'detalle', 'estado']) ||
          'Conforme'
      ).slice(0, 140);
      const isObserved =
        obsRaw.toLowerCase().includes('error') ||
        obsRaw.toLowerCase().includes('observ') ||
        obsRaw.toLowerCase().includes('inconsis') ||
        obsRaw.toLowerCase().includes('falta');

      establishments.add(ipress);
      microredes.add(microred);

      const key = `${microred}__${ipress}`;
      const existing = summaryMap.get(key) || {
        microred,
        ipress,
        registrosEvaluados: 0,
        conformes: 0,
        observados: 0,
        tasaConformidad: 100,
        principalObservacion: 'Sin observaciones críticas',
      };
      existing.registrosEvaluados += 1;
      if (isObserved) {
        existing.observados += 1;
        existing.principalObservacion = obsRaw;
      } else {
        existing.conformes += 1;
      }
      existing.tasaConformidad = Number(
        ((existing.conformes / existing.registrosEvaluados) * 100).toFixed(1)
      );
      summaryMap.set(key, existing);
      nominalRows.push(sanitizeNominalRow(r));
    }

    const publicRows = Array.from(summaryMap.values());
    return {
      module,
      fileName: file.name.slice(0, 240),
      rowCount: uniqueRows.length,
      duplicateCount,
      establishmentCount: establishments.size,
      microredCount: microredes.size,
      columnHeaders,
      publicRows: publicRows as unknown as Record<string, unknown>[],
      nominalRows,
      summary: {
        totalEvaluados: uniqueRows.length,
        totalObservados: publicRows.reduce((s, r) => s + r.observados, 0),
      },
      validationNotes: `Control de calidad: ${uniqueRows.length} registros auditados (${duplicateCount} duplicados). Resumen sin PII publicado y detalle nominal aislado.`,
    };
  }

  // pacientes
  const summaryMap = new Map<string, PatientSummaryRow>();
  const nominalRows: NominalRecord[] = [];

  for (const r of uniqueRows) {
    const microred = normalizeMicrored(pickField(r, ['microred', 'red']));
    const ipress = String(
      pickField(r, ['ipress', 'establecimiento', 'eess']) || `C.S. ${microred}`
    ).slice(0, 120);
    const estadoPaquete = String(
      pickField(r, ['paquete', 'estado_paquete', 'condicion', 'estado']) || ''
    ).toLowerCase();
    const tamizajeEntVal = String(
      pickField(r, ['ent', 'tamizaje_ent', 'hta_dm']) || ''
    ).toLowerCase();
    const smVal = String(
      pickField(r, ['salud_mental', 'mental', 'tamizaje_sm']) || ''
    ).toLowerCase();

    establishments.add(ipress);
    microredes.add(microred);

    const key = `${microred}__${ipress}`;
    const existing = summaryMap.get(key) || {
      microred,
      ipress,
      adultosAtendidos: 0,
      paqueteIniciado: 0,
      paqueteCompleto: 0,
      tamizajeEnt: 0,
      saludMental: 0,
      pendientesSeguimiento: 0,
    };
    existing.adultosAtendidos += 1;
    if (estadoPaquete.includes('complet') || estadoPaquete.includes('ta')) {
      existing.paqueteCompleto += 1;
    } else if (estadoPaquete.includes('inici') || estadoPaquete.includes('proceso')) {
      existing.paqueteIniciado += 1;
      existing.pendientesSeguimiento += 1;
    } else {
      existing.pendientesSeguimiento += 1;
    }
    if (tamizajeEntVal && !tamizajeEntVal.includes('no') && !tamizajeEntVal.includes('pend')) {
      existing.tamizajeEnt += 1;
    }
    if (smVal && !smVal.includes('no') && !smVal.includes('pend')) {
      existing.saludMental += 1;
    }
    summaryMap.set(key, existing);
    nominalRows.push(sanitizeNominalRow(r));
  }

  const publicRows = Array.from(summaryMap.values());
  return {
    module,
    fileName: file.name.slice(0, 240),
    rowCount: uniqueRows.length,
    duplicateCount,
    establishmentCount: establishments.size,
    microredCount: microredes.size,
    columnHeaders,
    publicRows: publicRows as unknown as Record<string, unknown>[],
    nominalRows,
    summary: {
      adultosAtendidos: uniqueRows.length,
      paquetesCompletos: publicRows.reduce((s, r) => s + r.paqueteCompleto, 0),
    },
    validationNotes: `Seguimiento nominal: ${uniqueRows.length} adultos procesados (${duplicateCount} duplicados). Resumen agregado sin PII + lotes nominales protegidos.`,
  };
}

export function exportRowsToExcel(
  rows: Record<string, unknown>[],
  fileName: string,
  sheetName = 'Datos'
): void {
  if (!rows.length) return;
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31));
  XLSX.writeFile(workbook, `${fileName}.xlsx`);
}
