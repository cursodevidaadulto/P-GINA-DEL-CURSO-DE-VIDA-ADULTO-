export type ModuleId =
  | 'indicadores'
  | 'pacientes'
  | 'calidad'
  | 'morbilidades'
  | 'admin';

export type DataModuleKey = 'pacientes' | 'calidad' | 'morbilidades' | 'indicadores';
export type PublicModuleKey = 'morbilidades' | 'indicadores' | 'calidad_resumen' | 'pacientes_resumen';
export type NominalModuleKey = 'pacientes' | 'calidad';

export const DRIVE_ROOT_FOLDER_ID = '1YgxzUACQqjVBifrU9_Q5F-EyFT-X36Am';
export const DRIVE_ROOT_FOLDER_URL =
  'https://drive.google.com/drive/folders/1YgxzUACQqjVBifrU9_Q5F-EyFT-X36Am?usp=drive_link';

export const BRAND_LOGOS = {
  cursoVidaAdulto: '/assets/aistudio/Curso_de_Vida_Adulto_San_Ignacio_ada3a4ac.png',
  ris: '/assets/logos/ris.png',
  oite: '/assets/logos/oite.png',
} as const;

export const INSTITUTIONAL_LINKS = {
  risUrl: 'http://www.redsaludsanignacio.gob.pe/',
  oiteUrl: 'https://indicadoresrissanignacio.redsaludsanignacio.gob.pe/inicio.php',
} as const;

export type DriveFileCategory =
  | 'PDF'
  | 'Imagen'
  | 'Presentación'
  | 'Hoja de cálculo'
  | 'Documento'
  | 'Video'
  | 'Carpeta'
  | 'Otro';

export type DriveTargetModule =
  | 'pacientes'
  | 'calidad'
  | 'morbilidades'
  | 'indicadores'
  | 'cartilla'
  | 'general';

export interface DriveDocumentItem {
  fileId: string;
  name: string;
  mimeType: string;
  category: DriveFileCategory;
  targetModule: DriveTargetModule;
  folderPath: string;
  sizeBytes: number;
  modifiedTime: string;
  webViewLink: string;
  webContentLink?: string;
  thumbnailLink?: string;
  syncedBy: string;
  updatedAt?: unknown;
}

export interface DriveSyncState {
  module: DataModuleKey | 'repositorio';
  driveFileId: string;
  fileName: string;
  mimeType: string;
  modifiedTime: string;
  lastCheckedAt: string;
  validationStatus: 'ok' | 'error' | 'pending';
  rowCount: number;
  errorMessage?: string;
  updatedBy: string;
  updatedAt?: unknown;
}

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

export interface AdminSessionState {
  initialized: boolean;
  authenticated: boolean;
  username: string | null;
  token: string | null;
  lastPasswordUpdate?: string | null;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  username: string;
  action: string;
  module: string;
  details: string;
}

export interface ContentDocumentItem {
  id: string;
  title: string;
  description: string;
  targetModule: DriveTargetModule;
  category: 'PDF' | 'Imagen' | 'Documento' | 'Hoja de cálculo' | 'Presentación' | 'Otro';
  period: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storedFileName?: string;
  published: boolean;
  uploadedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface DriveSyncHistoryRecord {
  id: string;
  timestamp: string;
  username: string;
  folderId: string;
  filesFound: number;
  filesSynced: number;
  filesPending: number;
  status: 'COMPLETADO' | 'DESCONECTADO' | 'ERROR';
  notes: string;
}

export type PublishStage =
  | 'idle'
  | 'preparando'
  | 'validando'
  | 'procesando'
  | 'publicando'
  | 'completado'
  | 'observaciones'
  | 'error';

export interface PublishProgressState {
  stage: PublishStage;
  percent: number;
  processed: number;
  pending: number;
  errors: number;
  total: number;
  label: string;
  details?: string;
}

export interface ModuleUpdateInfo {
  updatedAt: string;
  fileName: string;
  rowCount: number;
  status: 'COMPLETADO' | 'CON_OBSERVACIONES' | 'ERROR';
}

export interface PlatformStatusInfo {
  lastUpdatedAt: string;
  status: 'COMPLETADO' | 'PUBLICANDO' | 'CON_OBSERVACIONES' | 'ERROR' | 'SIN_DATOS' | 'SINCRONIZANDO' | 'PENDIENTE';
  source: string;
  updatedBy: string;
  moduleUpdates?: Partial<Record<DataModuleKey, ModuleUpdateInfo>>;
}

export interface PublicManifest {
  module: PublicModuleKey;
  versionId: string;
  isDemo: boolean;
  fileName: string;
  rowCount: number;
  establishmentCount?: number;
  microredCount?: number;
  batchIds?: string[];
  summary?: Record<string, unknown>;
  period?: string;
  updatedBy: string;
  updatedAt?: unknown;
}

export interface NominalManifest {
  module: NominalModuleKey;
  versionId: string;
  isDemo: boolean;
  fileName: string;
  rowCount: number;
  batchIds?: string[];
  columnHeaders?: string[];
  period?: string;
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
  errorCount?: number;
  status:
    | 'Publicado correctamente'
    | 'Publicado con observaciones'
    | 'Error de publicación'
    | 'Publicado'
    | 'Histórico'
    | 'Cancelado';
  period?: string;
  validationNotes?: string;
  errorMessage?: string;
  fileHash?: string;
  uploadedByUid: string;
  uploadedByName: string;
  uploadedAt?: unknown;
  batchIds?: string[];
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

export type FollowupStatus =
  | 'Cumplimiento completo'
  | 'Cumplimiento parcial'
  | 'Pendiente'
  | 'En riesgo de incumplimiento';

export interface NominalFollowupRecord {
  nro: number;
  dni: string;
  apellidosNombres: string;
  genero: string;
  edad: number;
  fechaNacimiento: string;
  mesCumpleanos: string;
  direccion: string;
  microred: string;
  establecimiento: string;
  condicionPaquete: string;
  actividadesProgramadas: number;
  actividadesRealizadas: number;
  actividadesPendientes: number;
  listaPendientes: string;
  listaRealizadas: string;
  porcentajeCumplimiento: number;
  estadoSeguimiento: FollowupStatus;
  raw?: Record<string, unknown>;
}

export type QualitySeverity = 'Crítico' | 'Alto' | 'Moderado' | 'Leve' | 'Conforme';
export type QualityRemediationStatus = 'Pendiente' | 'En proceso' | 'Subsanado' | 'Conforme';

export interface QualityObservationRecord {
  nro: number;
  fechaDeteccion: string;
  periodo: string;
  microred: string;
  establecimiento: string;
  dniPersonal: string;
  nombrePersonal: string;
  dniPaciente: string;
  nombrePaciente: string;
  edadPaciente: number | null;
  grupoEdad: string;
  lote: string;
  hoja: string;
  registro: string;
  tipoError: string;
  descripcionObservacion: string;
  nivelGravedad: QualitySeverity;
  estadoSubsanacion: QualityRemediationStatus;
  isError: boolean;
  raw?: Record<string, unknown>;
}

export interface NominalRecord {
  [key: string]: string | number | boolean | undefined;
}

// --- SIR DIRESA Cajamarca API Models ---
export interface SirFilterHierarchyRow {
  PROVINCIA: string;
  DISTRITO: string;
  red: string;
  MICRORED: string;
  ris_nombre: string;
  zona_sanitaria: string;
  ipress_pta_entrada: string;
  RENIPRESS: string;
  ipress: string;
}

export interface SirFiltrosResponse {
  rows: SirFilterHierarchyRow[];
  provincias?: string[];
  distritos?: string[];
  redes?: string[];
  microredes?: string[];
  ris?: string[];
  zonas?: string[];
  puertas_entrada?: string[];
  cursos?: { id: number | string; nombre: string }[];
  subcursos?: { id: number | string; nombre: string; curso_id?: number | string }[];
}

export interface SirIndicatorSummary {
  ID_INDICADOR: number | string;
  NOMBRE_INDICADOR: string;
  CATEGORIA?: string;
  GRUPO_ETARIO?: string;
  META: number;
  AVANCE: number;
  COBERTURA: number;
  META_ESPERADA?: number;
}

export interface SirCmiMetric {
  ID_INDICADOR?: number | string;
  NOMBRE_INDICADOR?: string;
  INDICADOR?: string;
  META: number;
  AVANCE: number;
  COBERTURA: number;
  UMBRAL_VERDE?: number;
  UMBRAL_AMBAR?: number;
}

export interface SirCmiResponse {
  lista: SirCmiMetric[];
  velocimetros: SirCmiMetric[];
  radiales: SirCmiMetric[];
}

export interface SirChartPoint {
  NOMBRE?: string;
  ETIQUETA?: string;
  MICRORED?: string;
  IPRESS?: string;
  META: number;
  AVANCE: number;
  COBERTURA: number;
}

export interface SirTrendPoint {
  MES: number | string;
  NOMBRE_MES?: string;
  META: number;
  AVANCE: number;
  COBERTURA: number;
}

export interface SirFichaTecnica {
  ID_INDICADOR?: number | string;
  NOMBRE_INDICADOR?: string;
  DEFINICION?: string;
  OBJETIVO?: string;
  DESCRIPCION_FICHA?: string;
  NUMERADOR?: string;
  DENOMINADOR?: string;
  FORMULA?: string;
  UNIDAD_MEDIDA?: string;
  FUENTE_INFORMACION?: string;
  PERIODICIDAD?: string;
  META_REFERENCIAL?: string;
  INTERPRETACION?: string;
  OBSERVACIONES?: string;
  [key: string]: unknown;
}
