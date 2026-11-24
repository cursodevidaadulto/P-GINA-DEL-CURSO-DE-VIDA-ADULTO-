export type ModuleId =
  | 'inicio'
  | 'pacientes'
  | 'calidad'
  | 'morbilidades'
  | 'indicadores'
  | 'cartilla'
  | 'admin';

export type DataModuleKey = 'pacientes' | 'calidad' | 'morbilidades' | 'indicadores';
export type PublicModuleKey = 'morbilidades' | 'indicadores' | 'calidad_resumen' | 'pacientes_resumen';
export type NominalModuleKey = 'pacientes' | 'calidad';

export const MICROREDES_RIS = [
  'San Ignacio',
  'Chirinos',
  'Huarango',
  'La Coipa',
  'Namballe',
  'San José de Lourdes',
  'Tamborapa',
] as const;

export type MicroredName = (typeof MICROREDES_RIS)[number] | 'Externos';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: 'admin' | 'consultor';
  nominalAccess: boolean;
  active: boolean;
  microred?: string;
  establishment?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PublicManifest {
  module: PublicModuleKey;
  versionId: string;
  isDemo: boolean;
  fileName: string;
  rowCount: number;
  establishmentCount?: number;
  microredCount?: number;
  batchIds: string[];
  summary?: Record<string, unknown>;
  updatedBy: string;
  updatedAt?: unknown;
}

export interface NominalManifest {
  module: NominalModuleKey;
  versionId: string;
  isDemo: boolean;
  fileName: string;
  rowCount: number;
  batchIds: string[];
  columnHeaders?: string[];
  updatedBy: string;
  updatedAt?: unknown;
}

export interface UploadHistoryItem {
  historyId: string;
  module: DataModuleKey;
  versionId: string;
  fileName: string;
  rowCount: number;
  duplicateCount: number;
  status: 'Publicado' | 'Histórico' | 'Cancelado';
  validationNotes?: string;
  uploadedByUid: string;
  uploadedByName: string;
  uploadedAt?: unknown;
  batchIds: string[];
}

export type CartillaTopic =
  | 'Códigos HIS'
  | 'Diagnósticos'
  | 'Procedimientos'
  | 'Laboratorios'
  | 'Criterios de registro'
  | 'Ejemplos de registros correctos'
  | 'Errores frecuentes'
  | 'Recomendaciones de indicadores';

export type CartillaResourceType =
  | 'Guía HIS'
  | 'Documento PDF'
  | 'Documento Word'
  | 'Video tutorial';

export interface HISRowExample {
  diagnostico: string;
  tipo: 'P' | 'D' | 'R';
  lab: string;
  codigo: string;
}

export interface CartillaResource {
  resourceId: string;
  title: string;
  topic: CartillaTopic;
  resourceType: CartillaResourceType;
  summary: string;
  content: string;
  hisCodes?: string[];
  fileUrl?: string;
  published: boolean;
  authorUid: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  isBuiltIn?: boolean;
  examples?: HISRowExample[];
}

export interface MorbidityRow {
  codigoCie: string;
  diagnostico: string;
  categoria: string;
  microred: string;
  ipress: string;
  masculino: number;
  femenino: number;
  total: number;
}

export interface IndicatorRow {
  indicadorId: string;
  indicador: string;
  microred: string;
  ipress: string;
  numerador: number;
  denominador: number;
  metaPct: number;
  avancePct: number;
  estado: 'Óptimo' | 'En proceso' | 'Riesgo';
}

export interface QualitySummaryRow {
  microred: string;
  ipress: string;
  registrosEvaluados: number;
  conformes: number;
  observados: number;
  tasaConformidad: number;
  principalObservacion: string;
}

export interface PatientSummaryRow {
  microred: string;
  ipress: string;
  adultosAtendidos: number;
  paqueteIniciado: number;
  paqueteCompleto: number;
  tamizajeEnt: number;
  saludMental: number;
  pendientesSeguimiento: number;
}

export interface NominalRecord {
  [key: string]: string | number | boolean | undefined;
}
