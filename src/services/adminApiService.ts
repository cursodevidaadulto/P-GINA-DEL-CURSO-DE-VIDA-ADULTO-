import {
  AdminSessionState,
  AuditLogEntry,
  ContentDocumentItem,
  DataModuleKey,
  DriveSyncHistoryRecord,
  NominalManifest,
  NominalRecord,
  PlatformStatusInfo,
  PublicManifest,
  PublicModuleKey,
  UploadHistoryItem,
} from '../types';

// Strictly in-memory token store (never localStorage/sessionStorage)
let adminTokenMemory: string | null = null;

export function getAdminBearerToken(): string | null {
  return adminTokenMemory;
}

export function setAdminBearerToken(token: string | null): void {
  adminTokenMemory = token;
}

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { ...(extra || {}) };
  if (adminTokenMemory) {
    headers.Authorization = `Bearer ${adminTokenMemory}`;
  }
  return headers;
}

async function parseJsonOrThrow<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(String(data.error || `Error del servidor (${res.status})`));
  }
  return data as T;
}

export async function fetchAdminAuthStatus(): Promise<AdminSessionState> {
  const res = await fetch('/api/admin/status', {
    headers: authHeaders(),
  });
  const data = await parseJsonOrThrow<{
    initialized: boolean;
    authenticated: boolean;
    username: string | null;
    lastPasswordUpdate?: string | null;
  }>(res);

  if (!data.authenticated) {
    adminTokenMemory = null;
  }

  return {
    initialized: data.initialized,
    authenticated: data.authenticated,
    username: data.username,
    token: data.authenticated ? adminTokenMemory : null,
    lastPasswordUpdate: data.lastPasswordUpdate,
  };
}

export async function setupInitialAdminPassword(
  username: string,
  password: string
): Promise<AdminSessionState> {
  const res = await fetch('/api/admin/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await parseJsonOrThrow<{
    authenticated: boolean;
    username: string;
    token: string;
  }>(res);
  adminTokenMemory = data.token;
  return {
    initialized: true,
    authenticated: data.authenticated,
    username: data.username,
    token: data.token,
  };
}

export async function loginAdminCredentials(
  username: string,
  password: string
): Promise<AdminSessionState> {
  const res = await fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await parseJsonOrThrow<{
    authenticated: boolean;
    username: string;
    token: string;
  }>(res);
  adminTokenMemory = data.token;
  return {
    initialized: true,
    authenticated: data.authenticated,
    username: data.username,
    token: data.token,
  };
}

export async function changeAdminPassword(
  currentPassword: string,
  newPassword: string
): Promise<string> {
  const res = await fetch('/api/admin/change-password', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  const data = await parseJsonOrThrow<{ token: string; message: string }>(res);
  adminTokenMemory = data.token;
  return data.message;
}

export async function logoutAdminCredentials(): Promise<void> {
  try {
    await fetch('/api/admin/logout', {
      method: 'POST',
      headers: authHeaders(),
    });
  } finally {
    adminTokenMemory = null;
  }
}

export async function fetchAdminAuditLogs(): Promise<AuditLogEntry[]> {
  const res = await fetch('/api/admin/audit', {
    headers: authHeaders(),
  });
  const data = await parseJsonOrThrow<{ entries: AuditLogEntry[] }>(res);
  return data.entries || [];
}

export async function logAdminAction(
  action: string,
  module: string,
  details: string
): Promise<void> {
  if (!adminTokenMemory) return;
  await fetch('/api/admin/audit', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ action, module, details }),
  }).catch(() => {});
}

export async function fetchPlatformStatus(): Promise<{
  status: PlatformStatusInfo;
  publishedDocumentsCount: number;
  lastDriveSync: DriveSyncHistoryRecord | null;
  heroImageUrl: string | null;
}> {
  const res = await fetch('/api/platform/status');
  return parseJsonOrThrow(res);
}

export async function savePlatformHeroImage(payload: {
  fileName: string;
  mimeType: string;
  base64Data: string;
  driveFileId?: string;
}): Promise<{ heroImageUrl: string }> {
  const res = await fetch('/api/admin/hero-image', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow(res);
}

export async function fetchContentDocuments(): Promise<ContentDocumentItem[]> {
  const res = await fetch('/api/content', { headers: authHeaders() });
  const data = await parseJsonOrThrow<{ items: ContentDocumentItem[] }>(res);
  return data.items || [];
}

export async function uploadManualContentDocument(payload: {
  title: string;
  description: string;
  targetModule: ContentDocumentItem['targetModule'];
  category: ContentDocumentItem['category'];
  period: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  published: boolean;
  base64Data?: string;
}): Promise<ContentDocumentItem> {
  const res = await fetch('/api/content', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  const data = await parseJsonOrThrow<{ item: ContentDocumentItem }>(res);
  return data.item;
}

export async function updateContentDocument(
  id: string,
  updates: Partial<Pick<ContentDocumentItem, 'title' | 'description' | 'targetModule' | 'period' | 'published'>>
): Promise<ContentDocumentItem> {
  const res = await fetch(`/api/content/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(updates),
  });
  const data = await parseJsonOrThrow<{ item: ContentDocumentItem }>(res);
  return data.item;
}

export async function deleteContentDocument(id: string): Promise<void> {
  const res = await fetch(`/api/content/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  await parseJsonOrThrow(res);
}

export async function fetchDriveSyncHistory(): Promise<DriveSyncHistoryRecord[]> {
  const res = await fetch('/api/admin/drive-sync-history', { headers: authHeaders() });
  const data = await parseJsonOrThrow<{ history: DriveSyncHistoryRecord[] }>(res);
  return data.history || [];
}

export async function recordDriveSyncHistory(payload: {
  folderId: string;
  filesFound: number;
  filesSynced: number;
  filesPending: number;
  status: 'COMPLETADO' | 'DESCONECTADO' | 'ERROR';
  notes: string;
}): Promise<DriveSyncHistoryRecord> {
  const res = await fetch('/api/admin/drive-sync-history', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  const data = await parseJsonOrThrow<{ record: DriveSyncHistoryRecord }>(res);
  return data.record;
}

async function fetchWithTimeout(
  url: string,
  init?: RequestInit,
  timeoutMs = 20_000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...(init || {}),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('Tiempo de espera agotado al comunicarse con el servidor. Puede reintentar sin duplicar datos.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function updateServerPublishStatus(payload: {
  status: PlatformStatusInfo['status'];
  source: string;
  errorMessage?: string;
  fileName?: string;
  module?: DataModuleKey;
}): Promise<PlatformStatusInfo> {
  const res = await fetchWithTimeout(
    '/api/admin/publish-status',
    {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    },
    10_000
  );
  const data = await parseJsonOrThrow<{ status: PlatformStatusInfo }>(res);
  return data.status;
}

export interface BatchPublishPayload {
  module: DataModuleKey;
  fileName: string;
  fileHash?: string;
  rowCount: number;
  duplicateCount: number;
  errorCount?: number;
  establishmentCount: number;
  microredCount: number;
  columnHeaders: string[];
  publicRows: Record<string, unknown>[];
  nominalRows: NominalRecord[];
  summary: Record<string, unknown>;
  period: string;
  validationNotes: string;
  force?: boolean;
}

export async function publishDatasetToServer(
  payload: BatchPublishPayload,
  onBatchProgress?: (info: {
    percent: number;
    processed: number;
    pending: number;
    label: string;
  }) => void
): Promise<{
  manifest: PublicManifest;
  historyEntry: UploadHistoryItem;
  deduplicated?: boolean;
}> {
  const totalItems = payload.publicRows.length + payload.nominalRows.length;

  // Fast single-shot path for compact datasets (< 700 total rows)
  if (totalItems < 700) {
    onBatchProgress?.({
      percent: 55,
      processed: 0,
      pending: payload.rowCount,
      label: 'Publicando información en el servidor...',
    });
    const res = await fetchWithTimeout(
      `/api/admin/datasets/${encodeURIComponent(payload.module)}`,
      {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
      },
      20_000
    );
    const data = await parseJsonOrThrow<{
      manifest: PublicManifest;
      historyEntry: UploadHistoryItem;
      deduplicated?: boolean;
    }>(res);
    onBatchProgress?.({
      percent: 100,
      processed: payload.rowCount,
      pending: 0,
      label: data.deduplicated ? 'Versión vigente verificada sin duplicados.' : 'Publicación completada.',
    });
    return data;
  }

  // Batched incremental upload for large spreadsheets
  onBatchProgress?.({
    percent: 15,
    processed: 0,
    pending: totalItems,
    label: 'Iniciando sesión de publicación por lotes...',
  });

  const sessionRes = await fetchWithTimeout(
    `/api/admin/datasets/${encodeURIComponent(payload.module)}/session`,
    {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        fileName: payload.fileName,
        fileHash: payload.fileHash,
        period: payload.period,
        rowCount: payload.rowCount,
        duplicateCount: payload.duplicateCount,
        errorCount: payload.errorCount || 0,
        establishmentCount: payload.establishmentCount,
        microredCount: payload.microredCount,
        columnHeaders: payload.columnHeaders,
        summary: payload.summary,
        validationNotes: payload.validationNotes,
        force: payload.force,
      }),
    },
    15_000
  );
  const sessionData = await parseJsonOrThrow<{
    sessionId: string;
    alreadyPublished?: boolean;
    manifest?: PublicManifest;
  }>(sessionRes);

  if (sessionData.alreadyPublished && sessionData.manifest) {
    onBatchProgress?.({
      percent: 100,
      processed: payload.rowCount,
      pending: 0,
      label: 'Archivo ya publicado previamente (sin duplicados).',
    });
    return {
      manifest: sessionData.manifest,
      historyEntry: {
        historyId: `hist_dedup_${Date.now()}`,
        module: payload.module,
        versionId: sessionData.manifest.versionId,
        fileName: payload.fileName,
        rowCount: payload.rowCount,
        duplicateCount: payload.duplicateCount,
        status: 'Publicado correctamente',
        uploadedByUid: 'admin',
        uploadedByName: 'Administrador',
        uploadedAt: new Date().toISOString(),
      },
      deduplicated: true,
    };
  }

  const BATCH_SIZE = 750;
  let processedItems = 0;

  for (let i = 0; i < payload.publicRows.length; i += BATCH_SIZE) {
    const chunk = payload.publicRows.slice(i, i + BATCH_SIZE);
    const res = await fetchWithTimeout(
      `/api/admin/datasets/${encodeURIComponent(payload.module)}/batch`,
      {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          sessionId: sessionData.sessionId,
          publicRowsChunk: chunk,
        }),
      },
      20_000
    );
    await parseJsonOrThrow(res);
    processedItems += chunk.length;
    const pct = 15 + Math.round((processedItems / Math.max(1, totalItems)) * 75);
    onBatchProgress?.({
      percent: Math.min(90, pct),
      processed: processedItems,
      pending: Math.max(0, totalItems - processedItems),
      label: `Enviando lote resumen (${processedItems.toLocaleString('es-PE')} / ${totalItems.toLocaleString('es-PE')})...`,
    });
  }

  for (let i = 0; i < payload.nominalRows.length; i += BATCH_SIZE) {
    const chunk = payload.nominalRows.slice(i, i + BATCH_SIZE);
    const res = await fetchWithTimeout(
      `/api/admin/datasets/${encodeURIComponent(payload.module)}/batch`,
      {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          sessionId: sessionData.sessionId,
          nominalRowsChunk: chunk,
        }),
      },
      20_000
    );
    await parseJsonOrThrow(res);
    processedItems += chunk.length;
    const pct = 15 + Math.round((processedItems / Math.max(1, totalItems)) * 75);
    onBatchProgress?.({
      percent: Math.min(92, pct),
      processed: processedItems,
      pending: Math.max(0, totalItems - processedItems),
      label: `Enviando lote nominal (${processedItems.toLocaleString('es-PE')} / ${totalItems.toLocaleString('es-PE')})...`,
    });
  }

  onBatchProgress?.({
    percent: 95,
    processed: totalItems,
    pending: 0,
    label: 'Consolidando publicación en el servidor...',
  });

  const commitRes = await fetchWithTimeout(
    `/api/admin/datasets/${encodeURIComponent(payload.module)}/commit`,
    {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ sessionId: sessionData.sessionId }),
    },
    20_000
  );
  const committed = await parseJsonOrThrow<{
    manifest: PublicManifest;
    historyEntry: UploadHistoryItem;
    deduplicated?: boolean;
  }>(commitRes);

  onBatchProgress?.({
    percent: 100,
    processed: payload.rowCount,
    pending: 0,
    label: 'Publicación confirmada.',
  });

  return committed;
}

export async function fetchServerUploadHistory(): Promise<UploadHistoryItem[]> {
  const res = await fetchWithTimeout('/api/admin/upload-history', { headers: authHeaders() }, 10_000);
  const data = await parseJsonOrThrow<{ history: UploadHistoryItem[] }>(res);
  return data.history || [];
}

export async function fetchServerPublicManifests(): Promise<
  Partial<Record<PublicModuleKey, PublicManifest>>
> {
  const res = await fetchWithTimeout('/api/datasets/public', undefined, 10_000);
  const data = await parseJsonOrThrow<{
    manifests: Partial<Record<PublicModuleKey, PublicManifest>>;
  }>(res);
  return data.manifests || {};
}

export async function fetchServerPublicDataset<T = Record<string, unknown>>(
  module: PublicModuleKey,
  options?: { page?: number; limit?: number; search?: string; microred?: string }
): Promise<{
  manifest: PublicManifest | null;
  rows: T[];
  total?: number;
  page?: number;
  totalPages?: number;
}> {
  const params = new URLSearchParams();
  if (options?.page) params.set('page', String(options.page));
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.search) params.set('search', options.search);
  if (options?.microred) params.set('microred', options.microred);
  const qs = params.toString();
  const res = await fetchWithTimeout(
    `/api/datasets/public/${encodeURIComponent(module)}${qs ? `?${qs}` : ''}`,
    undefined,
    12_000
  );
  return parseJsonOrThrow(res);
}

export async function fetchServerNominalDataset(
  module: 'pacientes' | 'calidad',
  options?: { page?: number; limit?: number; search?: string; microred?: string }
): Promise<{
  manifest: NominalManifest | null;
  rows: NominalRecord[];
  total?: number;
  page?: number;
  totalPages?: number;
}> {
  const params = new URLSearchParams();
  if (options?.page) params.set('page', String(options.page));
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.search) params.set('search', options.search);
  if (options?.microred) params.set('microred', options.microred);
  const qs = params.toString();
  const res = await fetchWithTimeout(
    `/api/datasets/nominal/${encodeURIComponent(module)}${qs ? `?${qs}` : ''}`,
    { headers: authHeaders() },
    15_000
  );
  return parseJsonOrThrow(res);
}
