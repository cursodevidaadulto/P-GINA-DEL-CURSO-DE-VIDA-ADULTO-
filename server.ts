import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.resolve(process.cwd(), '.data');
const UPLOADS_DIR = path.resolve(DATA_DIR, 'uploads');
const DATASETS_DIR = path.resolve(DATA_DIR, 'datasets');
const AUTH_FILE = path.resolve(DATA_DIR, 'admin_auth.json');
const AUDIT_FILE = path.resolve(DATA_DIR, 'admin_audit.json');
const CONTENT_FILE = path.resolve(DATA_DIR, 'content_store.json');
const DRIVE_SYNC_FILE = path.resolve(DATA_DIR, 'drive_sync_history.json');
const STATUS_FILE = path.resolve(DATA_DIR, 'platform_status.json');
const UPLOAD_HIST_FILE = path.resolve(DATA_DIR, 'upload_history.json');
const HERO_META_FILE = path.resolve(DATA_DIR, 'hero_metadata.json');

const ADMIN_USERNAME = '71044399';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const SESSION_SECRET =
  process.env.SESSION_SECRET && process.env.SESSION_SECRET.trim().length >= 16
    ? process.env.SESSION_SECRET.trim()
    : crypto.randomBytes(32).toString('hex');

const SIR_BASE_URL = 'https://sir.diresacajamarca.gob.pe/tablero_mando/api';

interface AdminAuthRecord {
  username: string;
  salt: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
  configuredVia: 'env' | 'setup' | 'password_change';
}

interface AuditEntry {
  id: string;
  timestamp: string;
  username: string;
  action: string;
  module: string;
  details: string;
}

interface ContentItem {
  id: string;
  title: string;
  description: string;
  targetModule: 'indicadores' | 'morbilidades' | 'calidad' | 'pacientes' | 'cartilla' | 'general';
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

interface DriveSyncRecord {
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

type DataModuleKey = 'indicadores' | 'morbilidades' | 'calidad' | 'pacientes';

interface ModuleUpdateRecord {
  updatedAt: string;
  fileName: string;
  rowCount: number;
  status: 'COMPLETADO' | 'CON_OBSERVACIONES' | 'ERROR';
}

interface PlatformStatusRecord {
  lastUpdatedAt: string;
  status: 'COMPLETADO' | 'PUBLICANDO' | 'CON_OBSERVACIONES' | 'ERROR' | 'SIN_DATOS' | 'SINCRONIZANDO' | 'PENDIENTE';
  source: string;
  updatedBy: string;
  moduleUpdates?: Partial<Record<DataModuleKey, ModuleUpdateRecord>>;
}

interface AuthenticatedAdminRequest extends Request {
  adminUser?: {
    username: string;
    tokenId: string;
  };
}

function ensureDirectories(): void {
  for (const dir of [DATA_DIR, UPLOADS_DIR, DATASETS_DIR]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

function readJsonFile<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath: string, data: unknown): void {
  ensureDirectories();
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tempPath, filePath);
}

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function verifyPassword(password: string, salt: string, expectedHash: string): boolean {
  const derived = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHash, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

function bootstrapAdminFromEnvIfPresent(): void {
  ensureDirectories();
  if (fs.existsSync(AUTH_FILE)) return;
  const envPass = process.env.ADMIN_INITIAL_PASSWORD?.trim();
  if (envPass && envPass.length >= 6) {
    const salt = crypto.randomBytes(32).toString('hex');
    const now = new Date().toISOString();
    const record: AdminAuthRecord = {
      username: ADMIN_USERNAME,
      salt,
      passwordHash: hashPassword(envPass, salt),
      createdAt: now,
      updatedAt: now,
      configuredVia: 'env',
    };
    writeJsonFile(AUTH_FILE, record);
  }
}

const revokedTokens = new Set<string>();
const failedLoginAttempts = new Map<string, { count: number; resetAt: number }>();

function signAdminToken(username: string): string {
  const payload = {
    sub: username,
    jti: crypto.randomUUID(),
    iat: Date.now(),
    exp: Date.now() + SESSION_TTL_MS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
  const signature = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encodedPayload)
    .digest('base64url');
  return `${encodedPayload}.${signature}`;
}

function verifyAdminToken(token: string): { username: string; tokenId: string } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [encodedPayload, sig] = parts;
    const expectedSig = crypto
      .createHmac('sha256', SESSION_SECRET)
      .update(encodedPayload)
      .digest('base64url');

    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }

    const decoded = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf-8')) as {
      sub?: string;
      jti?: string;
      exp?: number;
    };

    if (
      decoded.sub !== ADMIN_USERNAME ||
      !decoded.jti ||
      !decoded.exp ||
      Date.now() > decoded.exp ||
      revokedTokens.has(decoded.jti)
    ) {
      return null;
    }

    return { username: decoded.sub, tokenId: decoded.jti };
  } catch {
    return null;
  }
}

function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice(7).trim();
}

function requireAdminAuth(
  req: AuthenticatedAdminRequest,
  res: Response,
  next: NextFunction
): void {
  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Acceso administrativo requerido. Inicie sesión como administrador.' });
    return;
  }
  const verified = verifyAdminToken(token);
  if (!verified) {
    res.status(403).json({ error: 'Sesión administrativa inválida o expirada.' });
    return;
  }
  req.adminUser = verified;
  next();
}

function appendAudit(username: string, action: string, module: string, details: string): AuditEntry {
  const entries = readJsonFile<AuditEntry[]>(AUDIT_FILE, []);
  const entry: AuditEntry = {
    id: `aud_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
    timestamp: new Date().toISOString(),
    username,
    action: action.slice(0, 80),
    module: module.slice(0, 60),
    details: details.slice(0, 400),
  };
  const updated = [entry, ...entries].slice(0, 500);
  writeJsonFile(AUDIT_FILE, updated);
  return entry;
}

function updatePlatformStatus(
  source: string,
  updatedBy: string,
  status: PlatformStatusRecord['status'] = 'COMPLETADO',
  moduleUpdate?: { module: DataModuleKey; fileName: string; rowCount: number; status: ModuleUpdateRecord['status'] }
): PlatformStatusRecord {
  const prev = readJsonFile<PlatformStatusRecord>(STATUS_FILE, {
    lastUpdatedAt: '',
    status: 'SIN_DATOS',
    source: 'Sin información publicada',
    updatedBy: 'Sistema RIS San Ignacio',
    moduleUpdates: {},
  });
  const now = new Date().toISOString();
  const nextUpdates: Partial<Record<DataModuleKey, ModuleUpdateRecord>> = {
    ...(prev.moduleUpdates || {}),
  };
  if (moduleUpdate) {
    nextUpdates[moduleUpdate.module] = {
      updatedAt: now,
      fileName: moduleUpdate.fileName.slice(0, 200),
      rowCount: moduleUpdate.rowCount,
      status: moduleUpdate.status,
    };
  }
  const next: PlatformStatusRecord = {
    lastUpdatedAt: status === 'PUBLICANDO' ? prev.lastUpdatedAt || now : now,
    status,
    source: source.slice(0, 140),
    updatedBy: updatedBy.slice(0, 120),
    moduleUpdates: nextUpdates,
  };
  writeJsonFile(STATUS_FILE, next);
  return next;
}

// Fast in-memory cache for published datasets (invalidated on commit/publish)
const datasetCache = new Map<string, { manifest: Record<string, unknown> | null; rows: Record<string, unknown>[] }>();
const batchPublishSessions = new Map<
  string,
  {
    module: DataModuleKey;
    fileName: string;
    fileHash: string;
    period: string;
    rowCount: number;
    duplicateCount: number;
    errorCount: number;
    establishmentCount: number;
    microredCount: number;
    columnHeaders: string[];
    summary: Record<string, unknown>;
    validationNotes: string;
    publicRows: Record<string, unknown>[];
    nominalRows: Record<string, unknown>[];
    createdAt: number;
    username: string;
  }
>();

// Simple TTL cache for SIR DIRESA Cajamarca proxy
const sirCache = new Map<string, { expiresAt: number; data: unknown }>();
const SIR_CACHE_TTL_MS = 120_000;

async function fetchSirUpstream(
  endpointPath: string,
  allowedParams: Record<string, string | undefined>
): Promise<unknown> {
  const params = new URLSearchParams();
  for (const [key, val] of Object.entries(allowedParams)) {
    if (val !== undefined && val !== '') {
      params.set(key, String(val).slice(0, 120));
    }
  }
  const queryString = params.toString();
  const cacheKey = `${endpointPath}?${queryString}`;
  const cached = sirCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const targetUrl = `${SIR_BASE_URL}/${endpointPath}${queryString ? `?${queryString}` : ''}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const upstreamRes = await fetch(targetUrl, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!upstreamRes.ok) {
      throw new Error(`SIR DIRESA respondió con estado HTTP ${upstreamRes.status}`);
    }
    const json = (await upstreamRes.json()) as unknown;
    sirCache.set(cacheKey, { expiresAt: Date.now() + SIR_CACHE_TTL_MS, data: json });
    return json;
  } finally {
    clearTimeout(timer);
  }
}

const ALLOWED_UPLOAD_MIME_EXT: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.ms-excel': '.xls',
  'text/csv': '.csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  'application/vnd.ms-powerpoint': '.ppt',
};

async function startServer(): Promise<void> {
  ensureDirectories();
  bootstrapAdminFromEnvIfPresent();

  const app = express();
  app.use(express.json({ limit: '50mb' }));

  // --- Admin Auth Endpoints ---
  app.get('/api/admin/status', (req: Request, res: Response) => {
    const authRecord = readJsonFile<AdminAuthRecord | null>(AUTH_FILE, null);
    const token = extractBearerToken(req);
    const verified = token ? verifyAdminToken(token) : null;
    res.json({
      initialized: Boolean(authRecord),
      authenticated: Boolean(verified),
      username: verified ? verified.username : null,
      expectedUsername: ADMIN_USERNAME,
      lastPasswordUpdate: authRecord?.updatedAt || null,
    });
  });

  app.post('/api/admin/setup', (req: Request, res: Response) => {
    const existing = readJsonFile<AdminAuthRecord | null>(AUTH_FILE, null);
    if (existing) {
      res.status(409).json({
        error: 'La cuenta administrativa ya fue inicializada. Utilice sus credenciales para ingresar.',
      });
      return;
    }

    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '');

    if (username !== ADMIN_USERNAME) {
      res.status(400).json({ error: 'El usuario administrador autorizado debe ser 71044399.' });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({
        error: 'La contraseña administrativa inicial debe tener al menos 8 caracteres.',
      });
      return;
    }

    const salt = crypto.randomBytes(32).toString('hex');
    const now = new Date().toISOString();
    const record: AdminAuthRecord = {
      username: ADMIN_USERNAME,
      salt,
      passwordHash: hashPassword(password, salt),
      createdAt: now,
      updatedAt: now,
      configuredVia: 'setup',
    };
    writeJsonFile(AUTH_FILE, record);
    const token = signAdminToken(ADMIN_USERNAME);
    appendAudit(ADMIN_USERNAME, 'SETUP_ADMIN', 'admin', 'Configuración inicial segura de contraseña administrativa.');

    res.status(201).json({
      authenticated: true,
      username: ADMIN_USERNAME,
      token,
      message: 'Contraseña administrativa configurada con hash seguro.',
    });
  });

  app.post('/api/admin/login', (req: Request, res: Response) => {
    const clientKey = req.ip || 'local';
    const attemptState = failedLoginAttempts.get(clientKey);
    if (attemptState && attemptState.resetAt > Date.now() && attemptState.count >= 5) {
      res.status(429).json({
        error: 'Demasiados intentos fallidos. Espere 10 minutos antes de intentar nuevamente.',
      });
      return;
    }

    const authRecord = readJsonFile<AdminAuthRecord | null>(AUTH_FILE, null);
    if (!authRecord) {
      res.status(400).json({
        error: 'La contraseña administrativa inicial aún no ha sido configurada.',
      });
      return;
    }

    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '');

    const valid =
      username === ADMIN_USERNAME &&
      password.length > 0 &&
      verifyPassword(password, authRecord.salt, authRecord.passwordHash);

    if (!valid) {
      const currentCount =
        attemptState && attemptState.resetAt > Date.now() ? attemptState.count + 1 : 1;
      failedLoginAttempts.set(clientKey, {
        count: currentCount,
        resetAt: Date.now() + 10 * 60 * 1000,
      });
      appendAudit(
        username || 'desconocido',
        'LOGIN_FALLIDO',
        'admin',
        'Intento de acceso administrativo rechazado.'
      );
      res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
      return;
    }

    failedLoginAttempts.delete(clientKey);
    const token = signAdminToken(ADMIN_USERNAME);
    appendAudit(ADMIN_USERNAME, 'LOGIN_ADMIN', 'admin', 'Inicio de sesión administrativo verificado.');

    res.json({
      authenticated: true,
      username: ADMIN_USERNAME,
      token,
    });
  });

  app.post('/api/admin/change-password', requireAdminAuth, (req: AuthenticatedAdminRequest, res: Response) => {
    const currentPassword = String(req.body?.currentPassword || '');
    const newPassword = String(req.body?.newPassword || '');
    const authRecord = readJsonFile<AdminAuthRecord | null>(AUTH_FILE, null);

    if (!authRecord || !verifyPassword(currentPassword, authRecord.salt, authRecord.passwordHash)) {
      res.status(401).json({ error: 'La contraseña actual no es correcta.' });
      return;
    }
    if (newPassword.length < 8) {
      res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres.' });
      return;
    }

    const salt = crypto.randomBytes(32).toString('hex');
    const updated: AdminAuthRecord = {
      ...authRecord,
      salt,
      passwordHash: hashPassword(newPassword, salt),
      updatedAt: new Date().toISOString(),
      configuredVia: 'password_change',
    };
    writeJsonFile(AUTH_FILE, updated);

    if (req.adminUser?.tokenId) {
      revokedTokens.add(req.adminUser.tokenId);
    }
    const newToken = signAdminToken(ADMIN_USERNAME);
    appendAudit(ADMIN_USERNAME, 'CAMBIO_CONTRASENA', 'admin', 'Contraseña administrativa actualizada.');

    res.json({
      authenticated: true,
      username: ADMIN_USERNAME,
      token: newToken,
      message: 'Contraseña actualizada correctamente.',
    });
  });

  app.post('/api/admin/logout', (req: Request, res: Response) => {
    const token = extractBearerToken(req);
    const verified = token ? verifyAdminToken(token) : null;
    if (verified) {
      revokedTokens.add(verified.tokenId);
      appendAudit(verified.username, 'LOGOUT_ADMIN', 'admin', 'Cierre de sesión administrativo.');
    }
    res.json({ authenticated: false });
  });

  app.get('/api/admin/audit', requireAdminAuth, (_req: AuthenticatedAdminRequest, res: Response) => {
    const entries = readJsonFile<AuditEntry[]>(AUDIT_FILE, []);
    res.json({ entries });
  });

  app.post('/api/admin/audit', requireAdminAuth, (req: AuthenticatedAdminRequest, res: Response) => {
    const action = String(req.body?.action || 'ACCION_ADMIN').trim();
    const moduleName = String(req.body?.module || 'admin').trim();
    const details = String(req.body?.details || '').trim();
    const entry = appendAudit(req.adminUser!.username, action, moduleName, details);
    res.status(201).json({ entry });
  });

  // --- Platform Status, Hero Image & Content Management ---
  app.get('/api/platform/status', (_req: Request, res: Response) => {
    const status = readJsonFile<PlatformStatusRecord>(STATUS_FILE, {
      lastUpdatedAt: '',
      status: 'SIN_DATOS',
      source: 'Sin información publicada',
      updatedBy: 'Sistema RIS San Ignacio',
      moduleUpdates: {},
    });
    const content = readJsonFile<ContentItem[]>(CONTENT_FILE, []);
    const driveHistory = readJsonFile<DriveSyncRecord[]>(DRIVE_SYNC_FILE, []);
    const heroMeta = readJsonFile<{ storedFileName?: string; updatedAt?: string } | null>(
      HERO_META_FILE,
      null
    );
    const heroExists =
      heroMeta?.storedFileName &&
      fs.existsSync(path.resolve(UPLOADS_DIR, path.basename(heroMeta.storedFileName)));
    res.json({
      status,
      publishedDocumentsCount: content.filter((c) => c.published).length,
      lastDriveSync: driveHistory[0] || null,
      heroImageUrl: heroExists
        ? `/api/platform/hero-image?v=${encodeURIComponent(heroMeta?.updatedAt || '1')}`
        : null,
    });
  });

  app.post('/api/admin/publish-status', requireAdminAuth, (req: AuthenticatedAdminRequest, res: Response) => {
    const status = (req.body?.status || 'PUBLICANDO') as PlatformStatusRecord['status'];
    const source = String(req.body?.source || 'Publicación administrativa').trim();
    const errorMessage = String(req.body?.errorMessage || '').trim();
    const fileName = String(req.body?.fileName || '').trim();
    const moduleName = String(req.body?.module || '') as DataModuleKey;

    if (status === 'ERROR' && fileName && ['indicadores', 'morbilidades', 'calidad', 'pacientes'].includes(moduleName)) {
      const now = new Date().toISOString();
      const hist = readJsonFile<Record<string, unknown>[]>(UPLOAD_HIST_FILE, []);
      const errEntry = {
        historyId: `hist_err_${Date.now()}`,
        module: moduleName,
        versionId: `err_${Date.now()}`,
        fileName: fileName.slice(0, 240),
        rowCount: 0,
        duplicateCount: 0,
        errorCount: 1,
        status: 'Error de publicación',
        period: now.slice(0, 7),
        validationNotes: errorMessage.slice(0, 400),
        errorMessage: errorMessage.slice(0, 400),
        uploadedByUid: req.adminUser!.username,
        uploadedByName: `Administrador (${req.adminUser!.username})`,
        uploadedAt: now,
      };
      writeJsonFile(UPLOAD_HIST_FILE, [errEntry, ...hist].slice(0, 150));
    }

    const updated = updatePlatformStatus(source, req.adminUser!.username, status);
    res.json({ status: updated });
  });

  app.get('/api/platform/hero-image', (_req: Request, res: Response) => {
    const heroMeta = readJsonFile<{ storedFileName?: string; mimeType?: string } | null>(
      HERO_META_FILE,
      null
    );
    if (!heroMeta?.storedFileName) {
      res.status(404).json({ error: 'Imagen principal aún no sincronizada.' });
      return;
    }
    const safeFilePath = path.resolve(UPLOADS_DIR, path.basename(heroMeta.storedFileName));
    if (!safeFilePath.startsWith(UPLOADS_DIR + path.sep) || !fs.existsSync(safeFilePath)) {
      res.status(404).json({ error: 'Archivo de imagen principal no encontrado.' });
      return;
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-cache');
    res.type(heroMeta.mimeType || 'image/jpeg');
    res.sendFile(safeFilePath);
  });

  app.post('/api/admin/hero-image', requireAdminAuth, (req: AuthenticatedAdminRequest, res: Response) => {
    const fileName = String(req.body?.fileName || 'portada_drive.jpg').trim().slice(0, 200);
    const mimeType = String(req.body?.mimeType || 'image/jpeg').trim().toLowerCase();
    const base64Data = typeof req.body?.base64Data === 'string' ? req.body.base64Data : '';
    const driveFileId = String(req.body?.driveFileId || '').trim().slice(0, 140);

    const allowedImageExts: Record<string, string> = {
      'image/png': '.png',
      'image/jpeg': '.jpg',
      'image/jpg': '.jpg',
      'image/webp': '.webp',
    };
    const ext = allowedImageExts[mimeType] || (/\.(png|jpe?g|webp)$/i.exec(fileName)?.[0]?.toLowerCase() || '');
    if (!ext || !base64Data) {
      res.status(400).json({ error: 'Se requiere una imagen válida (PNG, JPG o WEBP) en base64.' });
      return;
    }

    const buf = Buffer.from(base64Data, 'base64');
    if (buf.length === 0 || buf.length > 10 * 1024 * 1024) {
      res.status(413).json({ error: 'La imagen debe pesar menos de 10 MB.' });
      return;
    }

    const storedFileName = `hero_panel${ext}`;
    const safeTarget = path.resolve(UPLOADS_DIR, path.basename(storedFileName));
    if (!safeTarget.startsWith(UPLOADS_DIR + path.sep)) {
      res.status(400).json({ error: 'Ruta de destino inválida.' });
      return;
    }
    fs.writeFileSync(safeTarget, buf);

    const now = new Date().toISOString();
    writeJsonFile(HERO_META_FILE, {
      storedFileName,
      mimeType,
      fileName,
      driveFileId,
      updatedAt: now,
      updatedBy: req.adminUser!.username,
    });
    updatePlatformStatus(`Imagen principal Drive: ${fileName}`, req.adminUser!.username);
    appendAudit(
      req.adminUser!.username,
      'ACTUALIZAR_PORTADA_DRIVE',
      'inicio',
      `Imagen de portada actualizada desde Google Drive: "${fileName}".`
    );

    res.status(201).json({
      heroImageUrl: `/api/platform/hero-image?v=${encodeURIComponent(now)}`,
      fileName,
      updatedAt: now,
    });
  });

  app.get('/api/content', (req: Request, res: Response) => {
    const token = extractBearerToken(req);
    const isAdmin = Boolean(token && verifyAdminToken(token));
    const items = readJsonFile<ContentItem[]>(CONTENT_FILE, []);
    const visible = isAdmin ? items : items.filter((item) => item.published);
    res.json({ items: visible });
  });

  app.post('/api/content', requireAdminAuth, (req: AuthenticatedAdminRequest, res: Response) => {
    const title = String(req.body?.title || '').trim().slice(0, 200);
    const description = String(req.body?.description || '').trim().slice(0, 600);
    const targetModule = String(req.body?.targetModule || 'general') as ContentItem['targetModule'];
    const category = String(req.body?.category || 'Otro') as ContentItem['category'];
    const period = String(req.body?.period || new Date().toISOString().slice(0, 7)).slice(0, 32);
    const fileName = String(req.body?.fileName || 'documento').trim().slice(0, 200);
    const mimeType = String(req.body?.mimeType || 'application/octet-stream').trim().slice(0, 140);
    const published = req.body?.published !== false;
    const base64Data = typeof req.body?.base64Data === 'string' ? req.body.base64Data : '';

    if (!title || !fileName) {
      res.status(400).json({ error: 'Título y nombre de archivo son obligatorios.' });
      return;
    }

    const id = `doc_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    let storedFileName: string | undefined;
    let sizeBytes = Number(req.body?.sizeBytes || 0);

    if (base64Data) {
      const extFromMime = ALLOWED_UPLOAD_MIME_EXT[mimeType.toLowerCase()];
      const rawExt = path.extname(fileName).toLowerCase();
      const allowedExts = new Set(Object.values(ALLOWED_UPLOAD_MIME_EXT));
      const safeExt = extFromMime || (allowedExts.has(rawExt) ? rawExt : '');
      if (!safeExt) {
        res.status(400).json({
          error: 'Formato de archivo no permitido. Use PDF, Excel (.xlsx/.xls/.csv), Word (.docx/.doc), PowerPoint o imágenes PNG/JPG/WEBP.',
        });
        return;
      }

      const buf = Buffer.from(base64Data, 'base64');
      if (buf.length > 12 * 1024 * 1024) {
        res.status(413).json({ error: 'El archivo excede el límite máximo de 12 MB.' });
        return;
      }
      storedFileName = `${id}${safeExt}`;
      fs.writeFileSync(path.join(UPLOADS_DIR, storedFileName), buf);
      sizeBytes = buf.length;
    }

    const now = new Date().toISOString();
    const item: ContentItem = {
      id,
      title,
      description,
      targetModule,
      category,
      period,
      fileName,
      mimeType,
      sizeBytes,
      storedFileName,
      published,
      uploadedBy: req.adminUser!.username,
      createdAt: now,
      updatedAt: now,
    };

    const existing = readJsonFile<ContentItem[]>(CONTENT_FILE, []);
    writeJsonFile(CONTENT_FILE, [item, ...existing]);
    updatePlatformStatus(`Carga manual: ${fileName}`, req.adminUser!.username);
    appendAudit(
      req.adminUser!.username,
      'CARGA_CONTENIDO',
      targetModule,
      `Archivo "${fileName}" (${category}, periodo ${period}) ${published ? 'publicado' : 'guardado en borrador'}.`
    );

    res.status(201).json({ item });
  });

  app.patch('/api/content/:id', requireAdminAuth, (req: AuthenticatedAdminRequest, res: Response) => {
    const id = String(req.params.id || '').replace(/[^a-zA-Z0-9_-]/g, '');
    const items = readJsonFile<ContentItem[]>(CONTENT_FILE, []);
    const idx = items.findIndex((c) => c.id === id);
    if (idx === -1) {
      res.status(404).json({ error: 'Documento no encontrado.' });
      return;
    }

    const current = items[idx];
    const updated: ContentItem = {
      ...current,
      title: typeof req.body?.title === 'string' ? req.body.title.trim().slice(0, 200) : current.title,
      description:
        typeof req.body?.description === 'string'
          ? req.body.description.trim().slice(0, 600)
          : current.description,
      targetModule: req.body?.targetModule || current.targetModule,
      period: typeof req.body?.period === 'string' ? req.body.period.slice(0, 32) : current.period,
      published: typeof req.body?.published === 'boolean' ? req.body.published : current.published,
      updatedAt: new Date().toISOString(),
    };
    items[idx] = updated;
    writeJsonFile(CONTENT_FILE, items);
    updatePlatformStatus(`Actualización de contenido: ${updated.title}`, req.adminUser!.username);
    appendAudit(
      req.adminUser!.username,
      'ACTUALIZAR_CONTENIDO',
      updated.targetModule,
      `Actualizado "${updated.title}" (Publicado: ${updated.published ? 'Sí' : 'No'}).`
    );
    res.json({ item: updated });
  });

  app.delete('/api/content/:id', requireAdminAuth, (req: AuthenticatedAdminRequest, res: Response) => {
    const id = String(req.params.id || '').replace(/[^a-zA-Z0-9_-]/g, '');
    const items = readJsonFile<ContentItem[]>(CONTENT_FILE, []);
    const target = items.find((c) => c.id === id);
    if (!target) {
      res.status(404).json({ error: 'Documento no encontrado.' });
      return;
    }

    if (target.storedFileName) {
      const filePath = path.resolve(UPLOADS_DIR, path.basename(target.storedFileName));
      if (filePath.startsWith(UPLOADS_DIR + path.sep) && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    const remaining = items.filter((c) => c.id !== id);
    writeJsonFile(CONTENT_FILE, remaining);
    updatePlatformStatus('Eliminación de documento', req.adminUser!.username);
    appendAudit(
      req.adminUser!.username,
      'ELIMINAR_CONTENIDO',
      target.targetModule,
      `Eliminado documento "${target.title}" (${target.fileName}).`
    );
    res.json({ deleted: true });
  });

  app.get('/api/content/file/:id', (req: Request, res: Response) => {
    const id = String(req.params.id || '').replace(/[^a-zA-Z0-9_-]/g, '');
    const items = readJsonFile<ContentItem[]>(CONTENT_FILE, []);
    const target = items.find((c) => c.id === id);
    if (!target || !target.storedFileName) {
      res.status(404).json({ error: 'Archivo no disponible.' });
      return;
    }

    if (!target.published) {
      const token = extractBearerToken(req);
      if (!token || !verifyAdminToken(token)) {
        res.status(403).json({ error: 'Documento no publicado.' });
        return;
      }
    }

    const safeFilePath = path.resolve(UPLOADS_DIR, path.basename(target.storedFileName));
    if (!safeFilePath.startsWith(UPLOADS_DIR + path.sep) || !fs.existsSync(safeFilePath)) {
      res.status(404).json({ error: 'Archivo físico no encontrado.' });
      return;
    }

    res.setHeader('X-Content-Type-Options', 'nosniff');
    const inlineAllowed =
      target.mimeType === 'application/pdf' || target.mimeType.startsWith('image/');
    res.setHeader(
      'Content-Disposition',
      `${inlineAllowed ? 'inline' : 'attachment'}; filename="${encodeURIComponent(target.fileName)}"`
    );
    res.type(target.mimeType || 'application/octet-stream');
    res.sendFile(safeFilePath);
  });

  // --- Admin Drive Sync Tracking ---
  app.get('/api/admin/drive-sync-history', requireAdminAuth, (_req: AuthenticatedAdminRequest, res: Response) => {
    const history = readJsonFile<DriveSyncRecord[]>(DRIVE_SYNC_FILE, []);
    res.json({ history });
  });

  app.post('/api/admin/drive-sync-history', requireAdminAuth, (req: AuthenticatedAdminRequest, res: Response) => {
    const record: DriveSyncRecord = {
      id: `drv_${Date.now()}`,
      timestamp: new Date().toISOString(),
      username: req.adminUser!.username,
      folderId: String(req.body?.folderId || '1YgxzUACQqjVBifrU9_Q5F-EyFT-X36Am').slice(0, 128),
      filesFound: Number(req.body?.filesFound || 0),
      filesSynced: Number(req.body?.filesSynced || 0),
      filesPending: Number(req.body?.filesPending || 0),
      status: req.body?.status || 'COMPLETADO',
      notes: String(req.body?.notes || '').slice(0, 300),
    };
    const existing = readJsonFile<DriveSyncRecord[]>(DRIVE_SYNC_FILE, []);
    writeJsonFile(DRIVE_SYNC_FILE, [record, ...existing].slice(0, 100));
    if (record.status === 'COMPLETADO') {
      updatePlatformStatus('Sincronización Google Drive', req.adminUser!.username);
    }
    appendAudit(
      req.adminUser!.username,
      `DRIVE_${record.status}`,
      'drive',
      `${record.notes || `Archivos encontrados: ${record.filesFound}, sincronizados: ${record.filesSynced}`}`
    );
    res.status(201).json({ record });
  });

  // --- Helper: Persist finalized module dataset atomically + invalidate cache ---
  function commitPublishedModuleDataset(params: {
    moduleName: DataModuleKey;
    fileName: string;
    fileHash?: string;
    rowCount: number;
    duplicateCount: number;
    errorCount: number;
    establishmentCount: number;
    microredCount: number;
    columnHeaders: string[];
    publicRows: Record<string, unknown>[];
    nominalRows: Record<string, unknown>[];
    summary: Record<string, unknown>;
    period: string;
    validationNotes: string;
    username: string;
    force?: boolean;
  }): { manifest: Record<string, unknown>; historyEntry: Record<string, unknown>; deduplicated: boolean } {
    const {
      moduleName,
      fileName,
      fileHash,
      rowCount,
      duplicateCount,
      errorCount,
      establishmentCount,
      microredCount,
      columnHeaders,
      publicRows,
      nominalRows,
      summary,
      period,
      validationNotes,
      username,
      force,
    } = params;

    const publicModuleKey =
      moduleName === 'pacientes'
        ? 'pacientes_resumen'
        : moduleName === 'calidad'
        ? 'calidad_resumen'
        : moduleName;

    const publicCacheKey = `public_${publicModuleKey}`;
    const existingPublic =
      datasetCache.get(publicCacheKey) ||
      readJsonFile<{ manifest: Record<string, unknown> | null; rows: Record<string, unknown>[] } | null>(
        path.join(DATASETS_DIR, `public_${publicModuleKey}.json`),
        null
      );

    // Idempotent skip if exact fileHash + module + period already published
    if (
      !force &&
      fileHash &&
      existingPublic?.manifest &&
      existingPublic.manifest.fileHash === fileHash &&
      existingPublic.manifest.period === period
    ) {
      const hist = readJsonFile<Record<string, unknown>[]>(UPLOAD_HIST_FILE, []);
      return {
        manifest: existingPublic.manifest,
        historyEntry: hist[0] || {
          historyId: `hist_dedup_${Date.now()}`,
          module: moduleName,
          fileName,
          rowCount,
          status: errorCount > 0 ? 'Publicado con observaciones' : 'Publicado correctamente',
          uploadedAt: new Date().toISOString(),
        },
        deduplicated: true,
      };
    }

    const versionId = `${moduleName}_${Date.now()}`;
    const now = new Date().toISOString();
    const hasObs = errorCount > 0 || duplicateCount > 0;
    const outcomeStatus = errorCount > 0 ? 'CON_OBSERVACIONES' : 'COMPLETADO';
    const historyOutcome =
      errorCount > 0 ? 'Publicado con observaciones' : 'Publicado correctamente';

    const manifest: Record<string, unknown> = {
      module: publicModuleKey,
      versionId,
      isDemo: false,
      fileName: fileName.slice(0, 240),
      fileHash: fileHash || '',
      rowCount,
      duplicateCount,
      errorCount,
      establishmentCount,
      microredCount,
      summary,
      period: period.slice(0, 32),
      updatedBy: `Admin ${username}`,
      updatedAt: now,
    };

    const publicPayload = { manifest, rows: publicRows };
    writeJsonFile(path.join(DATASETS_DIR, `public_${publicModuleKey}.json`), publicPayload);
    datasetCache.set(publicCacheKey, publicPayload);

    if (moduleName === 'pacientes' || moduleName === 'calidad') {
      const nominalCacheKey = `nominal_${moduleName}`;
      const nominalPayload = {
        manifest: {
          module: moduleName,
          versionId,
          isDemo: false,
          fileName: manifest.fileName,
          fileHash: fileHash || '',
          rowCount,
          columnHeaders,
          period: manifest.period,
          updatedBy: manifest.updatedBy,
          updatedAt: now,
        },
        rows: nominalRows,
      };
      writeJsonFile(path.join(DATASETS_DIR, `nominal_${moduleName}.json`), nominalPayload);
      datasetCache.set(nominalCacheKey, nominalPayload);
    }

    const hist = readJsonFile<Record<string, unknown>[]>(UPLOAD_HIST_FILE, []);
    const histEntry = {
      historyId: `hist_${versionId}`,
      module: moduleName,
      versionId,
      fileName: manifest.fileName,
      fileHash: fileHash || '',
      rowCount,
      duplicateCount,
      errorCount,
      status: historyOutcome,
      period: manifest.period,
      validationNotes: validationNotes.slice(0, 600),
      uploadedByUid: username,
      uploadedByName: `Administrador (${username})`,
      uploadedAt: now,
    };
    writeJsonFile(UPLOAD_HIST_FILE, [histEntry, ...hist].slice(0, 150));

    updatePlatformStatus(
      `${moduleName}: ${fileName}`,
      username,
      outcomeStatus,
      {
        module: moduleName,
        fileName: String(manifest.fileName),
        rowCount,
        status: outcomeStatus,
      }
    );

    appendAudit(
      username,
      'PUBLICAR_DATASET',
      moduleName,
      `Archivo "${fileName}" (${rowCount} filas${hasObs ? `, ${duplicateCount} dup., ${errorCount} obs.` : ''}) → ${historyOutcome}.`
    );

    return { manifest, historyEntry: histEntry, deduplicated: false };
  }

  // --- Batched / Incremental Dataset Upload (Fast & Progress-Tracked) ---
  app.post('/api/admin/datasets/:module/session', requireAdminAuth, (req: AuthenticatedAdminRequest, res: Response) => {
    const moduleName = String(req.params.module || '') as DataModuleKey;
    if (!['indicadores', 'morbilidades', 'calidad', 'pacientes'].includes(moduleName)) {
      res.status(400).json({ error: 'Módulo no válido.' });
      return;
    }

    const sessionId = `pub_${moduleName}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const fileName = String(req.body?.fileName || 'archivo.xlsx').slice(0, 240);
    const fileHash = String(req.body?.fileHash || '').slice(0, 128);
    const period = String(req.body?.period || new Date().toISOString().slice(0, 7)).slice(0, 32);

    // Quick check if identical fileHash already published for this module & period
    const publicModuleKey =
      moduleName === 'pacientes'
        ? 'pacientes_resumen'
        : moduleName === 'calidad'
        ? 'calidad_resumen'
        : moduleName;
    const existingPublic =
      datasetCache.get(`public_${publicModuleKey}`) ||
      readJsonFile<{ manifest: Record<string, unknown> | null; rows: Record<string, unknown>[] } | null>(
        path.join(DATASETS_DIR, `public_${publicModuleKey}.json`),
        null
      );

    if (
      !req.body?.force &&
      fileHash &&
      existingPublic?.manifest?.fileHash === fileHash &&
      existingPublic?.manifest?.period === period
    ) {
      updatePlatformStatus(
        `${moduleName}: ${fileName}`,
        req.adminUser!.username,
        'COMPLETADO',
        {
          module: moduleName,
          fileName,
          rowCount: Number(existingPublic.manifest.rowCount || 0),
          status: 'COMPLETADO',
        }
      );
      res.json({
        sessionId,
        alreadyPublished: true,
        manifest: existingPublic.manifest,
      });
      return;
    }

    batchPublishSessions.set(sessionId, {
      module: moduleName,
      fileName,
      fileHash,
      period,
      rowCount: Number(req.body?.rowCount || 0),
      duplicateCount: Number(req.body?.duplicateCount || 0),
      errorCount: Number(req.body?.errorCount || 0),
      establishmentCount: Number(req.body?.establishmentCount || 0),
      microredCount: Number(req.body?.microredCount || 0),
      columnHeaders: Array.isArray(req.body?.columnHeaders) ? req.body.columnHeaders : [],
      summary: (req.body?.summary as Record<string, unknown>) || {},
      validationNotes: String(req.body?.validationNotes || ''),
      publicRows: Array.isArray(req.body?.publicRows) ? req.body.publicRows : [],
      nominalRows: [],
      createdAt: Date.now(),
      username: req.adminUser!.username,
    });

    updatePlatformStatus(`Publicando ${moduleName}: ${fileName}`, req.adminUser!.username, 'PUBLICANDO');
    res.status(201).json({ sessionId, alreadyPublished: false });
  });

  app.post('/api/admin/datasets/:module/batch', requireAdminAuth, (req: AuthenticatedAdminRequest, res: Response) => {
    const sessionId = String(req.body?.sessionId || '');
    const session = batchPublishSessions.get(sessionId);
    if (!session || session.username !== req.adminUser!.username) {
      res.status(404).json({ error: 'Sesión de publicación expirada o inválida.' });
      return;
    }
    if (Array.isArray(req.body?.publicRowsChunk)) {
      session.publicRows.push(...req.body.publicRowsChunk);
    }
    if (Array.isArray(req.body?.nominalRowsChunk)) {
      session.nominalRows.push(...req.body.nominalRowsChunk);
    }
    res.json({
      receivedPublic: session.publicRows.length,
      receivedNominal: session.nominalRows.length,
    });
  });

  app.post('/api/admin/datasets/:module/commit', requireAdminAuth, (req: AuthenticatedAdminRequest, res: Response) => {
    const sessionId = String(req.body?.sessionId || '');
    const session = batchPublishSessions.get(sessionId);
    if (!session || session.username !== req.adminUser!.username) {
      res.status(404).json({ error: 'Sesión de publicación no encontrada.' });
      return;
    }
    batchPublishSessions.delete(sessionId);

    const committed = commitPublishedModuleDataset({
      moduleName: session.module,
      fileName: session.fileName,
      fileHash: session.fileHash,
      rowCount: session.rowCount,
      duplicateCount: session.duplicateCount,
      errorCount: session.errorCount,
      establishmentCount: session.establishmentCount,
      microredCount: session.microredCount,
      columnHeaders: session.columnHeaders,
      publicRows: session.publicRows,
      nominalRows: session.nominalRows,
      summary: session.summary,
      period: session.period,
      validationNotes: session.validationNotes,
      username: req.adminUser!.username,
      force: true,
    });

    res.status(201).json(committed);
  });

  // --- Single-shot Server-side Module Datasets (Fast fallback / small-medium files) ---
  app.post('/api/admin/datasets/:module', requireAdminAuth, (req: AuthenticatedAdminRequest, res: Response) => {
    const moduleName = String(req.params.module || '') as DataModuleKey;
    if (!['indicadores', 'morbilidades', 'calidad', 'pacientes'].includes(moduleName)) {
      res.status(400).json({ error: 'Módulo no válido.' });
      return;
    }

    const result = commitPublishedModuleDataset({
      moduleName,
      fileName: String(req.body?.fileName || 'archivo.xlsx'),
      fileHash: String(req.body?.fileHash || ''),
      rowCount: Number(req.body?.rowCount || 0),
      duplicateCount: Number(req.body?.duplicateCount || 0),
      errorCount: Number(req.body?.errorCount || 0),
      establishmentCount: Number(req.body?.establishmentCount || 0),
      microredCount: Number(req.body?.microredCount || 0),
      columnHeaders: Array.isArray(req.body?.columnHeaders) ? req.body.columnHeaders : [],
      publicRows: Array.isArray(req.body?.publicRows) ? req.body.publicRows : [],
      nominalRows: Array.isArray(req.body?.nominalRows) ? req.body.nominalRows : [],
      summary: (req.body?.summary as Record<string, unknown>) || {},
      period: String(req.body?.period || new Date().toISOString().slice(0, 7)),
      validationNotes: String(req.body?.validationNotes || ''),
      username: req.adminUser!.username,
      force: Boolean(req.body?.force),
    });

    res.status(201).json(result);
  });

  app.get('/api/admin/upload-history', requireAdminAuth, (_req: AuthenticatedAdminRequest, res: Response) => {
    const history = readJsonFile<Record<string, unknown>[]>(UPLOAD_HIST_FILE, []);
    res.json({ history });
  });

  app.get('/api/datasets/public', (_req: Request, res: Response) => {
    const keys = ['morbilidades', 'indicadores', 'calidad_resumen', 'pacientes_resumen'];
    const manifests: Record<string, unknown> = {};
    for (const k of keys) {
      const cached = datasetCache.get(`public_${k}`);
      const payload =
        cached ||
        readJsonFile<{ manifest?: Record<string, unknown> | null; rows: Record<string, unknown>[] } | null>(
          path.join(DATASETS_DIR, `public_${k}.json`),
          null
        );
      if (payload?.manifest) {
        if (!cached) {
          datasetCache.set(`public_${k}`, {
            manifest: payload.manifest,
            rows: Array.isArray(payload.rows) ? payload.rows : [],
          });
        }
        manifests[k] = payload.manifest;
      }
    }
    res.json({ manifests });
  });

  function readCachedDataset(
    cacheKey: string,
    fileName: string
  ): { manifest: Record<string, unknown> | null; rows: Record<string, unknown>[] } {
    const cached = datasetCache.get(cacheKey);
    if (cached) return cached;
    const loaded = readJsonFile<{
      manifest: Record<string, unknown> | null;
      rows: Record<string, unknown>[];
    } | null>(path.join(DATASETS_DIR, fileName), null);
    const normalized = {
      manifest: loaded?.manifest || null,
      rows: Array.isArray(loaded?.rows) ? loaded!.rows : [],
    };
    if (normalized.manifest) {
      datasetCache.set(cacheKey, normalized);
    }
    return normalized;
  }

  function applyServerPaginationAndFilter(
    rows: Record<string, unknown>[],
    req: Request
  ): { rows: Record<string, unknown>[]; total: number; page: number; totalPages: number } {
    const search = String(req.query.search || '').trim().toLowerCase();
    const microred = String(req.query.microred || '').trim().toLowerCase();
    const pageParam = Number(req.query.page || 0);
    const limitParam = Number(req.query.limit || 0);

    let filtered = rows;
    if (microred && microred !== 'todas' && microred !== 'todos') {
      filtered = filtered.filter((r) =>
        String(r.microred || r.Microred || r.MICRORED || '')
          .toLowerCase()
          .includes(microred)
      );
    }
    if (search) {
      filtered = filtered.filter((r) =>
        Object.values(r).some((v) => String(v ?? '').toLowerCase().includes(search))
      );
    }

    const total = filtered.length;
    if (pageParam > 0 && limitParam > 0) {
      const safeLimit = Math.min(200, Math.max(10, limitParam));
      const totalPages = Math.max(1, Math.ceil(total / safeLimit));
      const safePage = Math.min(totalPages, Math.max(1, pageParam));
      const start = (safePage - 1) * safeLimit;
      return {
        rows: filtered.slice(start, start + safeLimit),
        total,
        page: safePage,
        totalPages,
      };
    }

    return { rows: filtered, total, page: 1, totalPages: 1 };
  }

  app.get('/api/datasets/public/:module', (req: Request, res: Response) => {
    const mod = String(req.params.module || '');
    if (!['morbilidades', 'indicadores', 'calidad_resumen', 'pacientes_resumen'].includes(mod)) {
      res.status(400).json({ error: 'Módulo público inválido.' });
      return;
    }
    const dataset = readCachedDataset(`public_${mod}`, `public_${mod}.json`);
    const paged = applyServerPaginationAndFilter(dataset.rows, req);
    res.json({
      manifest: dataset.manifest,
      rows: paged.rows,
      total: paged.total,
      page: paged.page,
      totalPages: paged.totalPages,
    });
  });

  app.get('/api/datasets/nominal/:module', requireAdminAuth, (req: AuthenticatedAdminRequest, res: Response) => {
    const mod = String(req.params.module || '');
    if (!['pacientes', 'calidad'].includes(mod)) {
      res.status(400).json({ error: 'Módulo nominal inválido.' });
      return;
    }
    const dataset = readCachedDataset(`nominal_${mod}`, `nominal_${mod}.json`);
    const paged = applyServerPaginationAndFilter(dataset.rows, req);
    res.json({
      manifest: dataset.manifest,
      rows: paged.rows,
      total: paged.total,
      page: paged.page,
      totalPages: paged.totalPages,
    });
  });

  // --- SIR DIRESA Cajamarca Proxy Endpoints (Strictly Allowlisted) ---
  app.get('/api/sir/filtros', async (_req: Request, res: Response) => {
    try {
      const data = await fetchSirUpstream('filtros', {});
      res.json({ source: 'SIR DIRESA Cajamarca', fetchedAt: new Date().toISOString(), data });
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'No se pudo consultar filtros de SIR DIRESA Cajamarca.',
      });
    }
  });

  app.get('/api/sir/periodo-reciente', async (_req: Request, res: Response) => {
    try {
      const data = await fetchSirUpstream('periodo_reciente', {});
      res.json({ source: 'SIR DIRESA Cajamarca', fetchedAt: new Date().toISOString(), data });
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Error consultando periodo reciente SIR.',
      });
    }
  });

  app.get('/api/sir/proceso-control', async (req: Request, res: Response) => {
    try {
      const data = await fetchSirUpstream('proceso_control', {
        anio: req.query.anio as string | undefined,
        mes: req.query.mes as string | undefined,
        curso: (req.query.curso as string | undefined) || '5',
        subcurso: (req.query.subcurso as string | undefined) || '0',
      });
      res.json({ source: 'SIR DIRESA Cajamarca', fetchedAt: new Date().toISOString(), data });
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Error consultando fecha de procesamiento SIR.',
      });
    }
  });

  const handleSirFilteredEndpoint = async (
    endpoint: string,
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const data = await fetchSirUpstream(endpoint, {
        curso: (req.query.curso as string | undefined) || '5',
        subcurso: (req.query.subcurso as string | undefined) || '0',
        anio: req.query.anio as string | undefined,
        mes: req.query.mes as string | undefined,
        provincia: req.query.provincia as string | undefined,
        distrito: req.query.distrito as string | undefined,
        red: req.query.red as string | undefined,
        microred: req.query.microred as string | undefined,
        ipress: req.query.ipress as string | undefined,
        ris: req.query.ris as string | undefined,
        zona: req.query.zona as string | undefined,
        puerta: req.query.puerta as string | undefined,
        categoria: req.query.categoria as string | undefined,
        grupo_etario: req.query.grupo_etario as string | undefined,
        indicador: req.query.indicador as string | undefined,
        nivel: req.query.nivel as string | undefined,
      });
      res.json({ source: 'SIR DIRESA Cajamarca', fetchedAt: new Date().toISOString(), data });
    } catch (err) {
      res.status(502).json({
        error:
          err instanceof Error
            ? err.message
            : `No se pudo consultar ${endpoint} en SIR DIRESA Cajamarca.`,
      });
    }
  };

  app.get('/api/sir/resumen', (req, res) => void handleSirFilteredEndpoint('resumen', req, res));
  app.get('/api/sir/cmi', (req, res) => void handleSirFilteredEndpoint('cmi', req, res));
  app.get('/api/sir/grafica', (req, res) => void handleSirFilteredEndpoint('grafica', req, res));
  app.get('/api/sir/tendencia', (req, res) => void handleSirFilteredEndpoint('tendencia', req, res));

  app.get('/api/sir/ficha', async (req: Request, res: Response) => {
    try {
      const indicador = String(req.query.indicador || '').trim();
      if (!indicador) {
        res.status(400).json({ error: 'ID de indicador requerido.' });
        return;
      }
      const data = await fetchSirUpstream('ficha', { indicador });
      res.json({ source: 'SIR DIRESA Cajamarca', fetchedAt: new Date().toISOString(), data });
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Error consultando ficha técnica SIR.',
      });
    }
  });

  // --- Vite Middleware (Dev) or Static Assets (Prod) ---
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor Curso de Vida Adulto RIS San Ignacio escuchando en http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Error fatal al iniciar servidor:', err);
  process.exit(1);
});
