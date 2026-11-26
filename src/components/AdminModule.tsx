import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  CloudOff,
  ExternalLink,
  Eye,
  EyeOff,
  FileSpreadsheet,
  FileText,
  FolderSync,
  History,
  KeyRound,
  Loader2,
  Lock,
  LogOut,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  changeAdminPassword,
  deleteContentDocument,
  fetchContentDocuments,
  fetchDriveSyncHistory,
  fetchServerUploadHistory,
  loginAdminCredentials,
  logoutAdminCredentials,
  publishDatasetToServer,
  recordDriveSyncHistory,
  setupInitialAdminPassword,
  updateServerPublishStatus,
  uploadManualContentDocument,
} from '../services/adminApiService';
import {
  analyzeExcelFile,
  AnalyzedExcelResult,
} from '../services/excelAnalyzers';
import {
  publishAnalyzedDataset,
  saveDriveSyncState,
} from '../services/firestoreService';
import {
  downloadDriveSpreadsheetAsFile,
  fetchDriveFileBlob,
} from '../services/googleDriveService';
import {
  AdminSessionState,
  BRAND_LOGOS,
  ContentDocumentItem,
  DataModuleKey,
  DRIVE_ROOT_FOLDER_ID,
  DRIVE_ROOT_FOLDER_URL,
  DriveDocumentItem,
  DriveSyncHistoryRecord,
  DriveSyncState,
  PublishProgressState,
  UploadHistoryItem,
  UserProfile,
} from '../types';

interface AdminModuleProps {
  user: UserProfile | null;
  adminSession: AdminSessionState;
  onAdminSessionChange: (next: AdminSessionState) => void;
  onOpenAuth: () => void;
  onDataPublished: () => Promise<void>;
  onPublishProgressChange?: (isPublishing: boolean) => void;
  driveFiles: DriveDocumentItem[];
  driveSyncStates: Record<string, DriveSyncState>;
  driveConnected: boolean;
  driveAccessToken: string | null;
  syncingDrive: boolean;
  syncError: string | null;
  onConnectAndSyncDrive: () => Promise<DriveDocumentItem[] | void>;
  onDisconnectDrive: () => void;
  onPreviewFile: (file: DriveDocumentItem) => void;
  onSetDriveHeroImage?: (file: DriveDocumentItem) => Promise<void>;
}

const MODULE_OPTIONS: { id: DataModuleKey; label: string }[] = [
  { id: 'indicadores', label: 'Monitoreo de indicadores' },
  { id: 'pacientes', label: 'Seguimiento' },
  { id: 'calidad', label: 'Control de calidad' },
  { id: 'morbilidades', label: 'Morbilidad' },
];

const MODULE_LABELS: Record<string, string> = {
  indicadores: 'Monitoreo de indicadores',
  pacientes: 'Seguimiento',
  calidad: 'Control de calidad',
  morbilidades: 'Morbilidad',
  general: 'General',
};

function detectCategoryFromFile(file: File): ContentDocumentItem['category'] {
  const name = file.name.toLowerCase();
  const mime = file.type.toLowerCase();
  if (mime === 'application/pdf' || name.endsWith('.pdf')) return 'PDF';
  if (mime.startsWith('image/') || /\.(png|jpe?g|webp)$/.test(name)) return 'Imagen';
  if (/\.(xlsx|xls|csv)$/.test(name) || mime.includes('spreadsheet') || mime.includes('excel')) {
    return 'Hoja de cálculo';
  }
  if (/\.(pptx|ppt)$/.test(name) || mime.includes('presentation')) return 'Presentación';
  if (/\.(docx|doc)$/.test(name) || mime.includes('word')) return 'Documento';
  return 'Otro';
}

function isSpreadsheetFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv');
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.onerror = () => reject(new Error('No se pudo leer el archivo seleccionado.'));
    reader.readAsDataURL(file);
  });
}

function formatDateTimeParts(raw?: unknown): { fecha: string; hora: string } {
  if (!raw) return { fecha: '—', hora: '—' };
  const d = new Date(String(raw));
  if (Number.isNaN(d.getTime())) return { fecha: '—', hora: '—' };
  return {
    fecha: d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    hora: d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: true }),
  };
}

export const AdminModule: React.FC<AdminModuleProps> = ({
  user,
  adminSession,
  onAdminSessionChange,
  onDataPublished,
  onPublishProgressChange,
  driveFiles,
  driveConnected,
  driveAccessToken,
  syncingDrive,
  syncError,
  onConnectAndSyncDrive,
  onDisconnectDrive,
  onPreviewFile,
}) => {
  // Auth Gate state
  const [loginUser, setLoginUser] = useState('71044399');
  const [loginPass, setLoginPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Change Password Modal
  const [pwdModalOpen, setPwdModalOpen] = useState(false);
  const [currPwd, setCurrPwd] = useState('');
  const [nextPwd, setNextPwd] = useState('');
  const [confirmNextPwd, setConfirmNextPwd] = useState('');
  const [pwdSubmitting, setPwdSubmitting] = useState(false);
  const [pwdMessage, setPwdMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  // Unified Publishing Screen State
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [targetModule, setTargetModule] = useState<DataModuleKey>('indicadores');
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedDriveSource, setSelectedDriveSource] = useState<DriveDocumentItem | null>(null);
  const [loadingDriveFileId, setLoadingDriveFileId] = useState<string | null>(null);
  const [driveSearch, setDriveSearch] = useState('');

  // Validation & Preview state
  const [validatedExcel, setValidatedExcel] = useState<AnalyzedExcelResult | null>(null);
  const [validatedDocInfo, setValidatedDocInfo] = useState<{
    fileName: string;
    category: ContentDocumentItem['category'];
    sizeKb: string;
  } | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Progress & Publish State
  const [progress, setProgress] = useState<PublishProgressState>({
    stage: 'idle',
    percent: 0,
    processed: 0,
    pending: 0,
    errors: 0,
    total: 0,
    label: 'Seleccione un archivo para comenzar.',
  });
  const [canRetry, setCanRetry] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'warning' | 'error'; text: string } | null>(
    null
  );

  // History & Existing Published Documents
  const [historyRows, setHistoryRows] = useState<UploadHistoryItem[]>([]);
  const [driveSyncHistory, setDriveSyncHistory] = useState<DriveSyncHistoryRecord[]>([]);
  const [publishedDocs, setPublishedDocs] = useState<ContentDocumentItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showDocsManager, setShowDocsManager] = useState(false);
  const [selectedErrorDetail, setSelectedErrorDetail] = useState<UploadHistoryItem | null>(null);

  const isAdmin = adminSession.authenticated;
  const isBusy =
    progress.stage === 'preparando' ||
    progress.stage === 'validando' ||
    progress.stage === 'procesando' ||
    progress.stage === 'publicando';

  const loadAdminHistory = useCallback(async () => {
    if (!isAdmin) return;
    setLoadingHistory(true);
    try {
      const [hist, drvHist, docs] = await Promise.all([
        fetchServerUploadHistory().catch(() => []),
        fetchDriveSyncHistory().catch(() => []),
        fetchContentDocuments().catch(() => []),
      ]);
      setHistoryRows(hist);
      setDriveSyncHistory(drvHist);
      setPublishedDocs(docs);
    } finally {
      setLoadingHistory(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    void loadAdminHistory();
  }, [loadAdminHistory]);

  // --- Auth handlers ---
  const handleAdminSetupOrLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    if (!loginUser.trim() || !loginPass) {
      setAuthError('Ingrese el usuario y la contraseña administrativa.');
      return;
    }
    if (!adminSession.initialized) {
      if (loginPass.length < 8) {
        setAuthError('La contraseña inicial debe tener al menos 8 caracteres.');
        return;
      }
      if (loginPass !== confirmPass) {
        setAuthError('Las contraseñas ingresadas no coinciden.');
        return;
      }
    }
    setAuthSubmitting(true);
    try {
      const next = adminSession.initialized
        ? await loginAdminCredentials(loginUser.trim(), loginPass)
        : await setupInitialAdminPassword(loginUser.trim(), loginPass);
      setLoginPass('');
      setConfirmPass('');
      onAdminSessionChange(next);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'No se pudo autenticar.');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleAdminLogout = async () => {
    await logoutAdminCredentials();
    onAdminSessionChange({
      initialized: true,
      authenticated: false,
      username: null,
      token: null,
    });
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdMessage(null);
    if (nextPwd.length < 8) {
      setPwdMessage({ type: 'error', text: 'La nueva contraseña debe tener al menos 8 caracteres.' });
      return;
    }
    if (nextPwd !== confirmNextPwd) {
      setPwdMessage({ type: 'error', text: 'La confirmación de contraseña no coincide.' });
      return;
    }
    setPwdSubmitting(true);
    try {
      const msg = await changeAdminPassword(currPwd, nextPwd);
      setPwdMessage({ type: 'success', text: msg });
      setCurrPwd('');
      setNextPwd('');
      setConfirmNextPwd('');
      setTimeout(() => setPwdModalOpen(false), 1100);
    } catch (err) {
      setPwdMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'No se pudo actualizar la contraseña.',
      });
    } finally {
      setPwdSubmitting(false);
    }
  };

  // --- Drive handlers ---
  const handleConnectDrive = async () => {
    setNotice(null);
    try {
      const files = (await onConnectAndSyncDrive()) || driveFiles;
      const count = Array.isArray(files) ? files.length : driveFiles.length;
      await recordDriveSyncHistory({
        folderId: DRIVE_ROOT_FOLDER_ID,
        filesFound: count,
        filesSynced: count,
        filesPending: 0,
        status: 'COMPLETADO',
        notes: `Conexión Drive verificada (${count} archivos disponibles).`,
      }).catch(() => {});
      void loadAdminHistory();
      setNotice({
        type: 'success',
        text: `Google Drive conectado (${count} archivos disponibles en la carpeta institucional).`,
      });
    } catch (err) {
      setNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'No se pudo conectar con Google Drive.',
      });
    }
  };

  const handleDisconnectDrive = () => {
    onDisconnectDrive();
    setNotice({ type: 'warning', text: 'Conexión de Google Drive desconectada.' });
  };

  // --- Step 1 + Step 2: Select & Automatically Validate ---
  const runValidationForFile = useCallback(
    async (file: File, moduleToValidate: DataModuleKey) => {
      setValidationError(null);
      setValidatedExcel(null);
      setValidatedDocInfo(null);
      setCanRetry(false);
      setNotice(null);

      if (file.size > 15 * 1024 * 1024) {
        const msg = 'El archivo supera el límite permitido de 15 MB.';
        setValidationError(msg);
        setProgress({
          stage: 'error',
          percent: 0,
          processed: 0,
          pending: 0,
          errors: 1,
          total: 0,
          label: 'Error de validación',
          details: msg,
        });
        return;
      }

      setProgress({
        stage: 'preparando',
        percent: 8,
        processed: 0,
        pending: 0,
        errors: 0,
        total: 0,
        label: 'Preparando lectura del archivo...',
      });

      try {
        if (isSpreadsheetFile(file)) {
          const analyzed = await analyzeExcelFile(file, moduleToValidate, (p) => {
            setProgress({
              stage: p.stage,
              percent: p.percent,
              processed: p.processed,
              pending: p.pending,
              errors: p.errors,
              total: p.total,
              label: p.label,
            });
          });
          setValidatedExcel(analyzed);
          const hasObs = analyzed.errorCount > 0 || analyzed.duplicateCount > 0;
          setProgress({
            stage: 'validando',
            percent: 100,
            processed: analyzed.rowCount,
            pending: 0,
            errors: analyzed.errorCount,
            total: analyzed.rawRowCount,
            label: hasObs
              ? `Validado con ${analyzed.errorCount} observaciones y ${analyzed.duplicateCount} duplicados omitidos.`
              : `Validación exitosa: ${analyzed.rowCount.toLocaleString('es-PE')} registros listos para publicar.`,
          });
        } else {
          const allowedExt = /\.(pdf|png|jpe?g|webp|docx?|pptx?)$/i.test(file.name);
          if (!allowedExt) {
            throw new Error(
              'Formato no compatible. Use Excel (.xlsx/.xls/.csv), PDF, imagen PNG/JPG/WEBP, Word o PowerPoint.'
            );
          }
          const cat = detectCategoryFromFile(file);
          setValidatedDocInfo({
            fileName: file.name,
            category: cat,
            sizeKb: `${(file.size / 1024).toFixed(1)} KB`,
          });
          setProgress({
            stage: 'validando',
            percent: 100,
            processed: 1,
            pending: 0,
            errors: 0,
            total: 1,
            label: `Documento ${cat} validado y listo para publicar en ${MODULE_LABELS[moduleToValidate]}.`,
          });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'No se pudo validar el archivo.';
        setValidationError(msg);
        setProgress({
          stage: 'error',
          percent: 0,
          processed: 0,
          pending: 0,
          errors: 1,
          total: 0,
          label: 'Error de validación',
          details: msg,
        });
      }
    },
    []
  );

  const handleChooseLocalFile = (file: File | undefined) => {
    if (!file) return;
    setSelectedDriveSource(null);
    setSelectedFile(file);
    void runValidationForFile(file, targetModule);
  };

  const handleChooseDriveFile = async (driveItem: DriveDocumentItem) => {
    if (!driveAccessToken) {
      setNotice({ type: 'error', text: 'Conecte Google Drive antes de seleccionar archivos.' });
      return;
    }
    const inferredModule: DataModuleKey =
      driveItem.targetModule === 'pacientes' ||
      driveItem.targetModule === 'calidad' ||
      driveItem.targetModule === 'morbilidades' ||
      driveItem.targetModule === 'indicadores'
        ? driveItem.targetModule
        : targetModule;

    setTargetModule(inferredModule);
    setSelectedDriveSource(driveItem);
    setLoadingDriveFileId(driveItem.fileId);
    setNotice(null);

    try {
      let fileObj: File;
      if (
        driveItem.category === 'Hoja de cálculo' ||
        driveItem.mimeType.includes('spreadsheet') ||
        /\.(xlsx|xls|csv)$/i.test(driveItem.name)
      ) {
        fileObj = await downloadDriveSpreadsheetAsFile(driveItem, driveAccessToken);
      } else {
        const blob = await fetchDriveFileBlob(driveItem, driveAccessToken);
        fileObj = new File([blob], driveItem.name, { type: blob.type || driveItem.mimeType });
      }
      setSelectedFile(fileObj);
      await runValidationForFile(fileObj, inferredModule);
    } catch (err) {
      setNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'No se pudo descargar el archivo desde Drive.',
      });
    } finally {
      setLoadingDriveFileId(null);
    }
  };

  const handleChangeModule = (nextModule: DataModuleKey) => {
    setTargetModule(nextModule);
    if (selectedFile) {
      void runValidationForFile(selectedFile, nextModule);
    }
  };

  // --- Step 3: Fast, Batched, Non-Blocking Publish ---
  const handlePublish = async (forceRetry = false) => {
    if (!selectedFile) return;
    setNotice(null);
    setCanRetry(false);
    onPublishProgressChange?.(true);

    try {
      if (isSpreadsheetFile(selectedFile)) {
        const analyzed =
          validatedExcel && validatedExcel.module === targetModule
            ? validatedExcel
            : await analyzeExcelFile(selectedFile, targetModule, (p) => {
                setProgress({
                  stage: p.stage,
                  percent: Math.min(40, p.percent),
                  processed: p.processed,
                  pending: p.pending,
                  errors: p.errors,
                  total: p.total,
                  label: p.label,
                });
              });

        setValidatedExcel(analyzed);
        setProgress({
          stage: 'publicando',
          percent: 45,
          processed: 0,
          pending: analyzed.rowCount,
          errors: analyzed.errorCount,
          total: analyzed.rowCount,
          label: `Publicando ${analyzed.rowCount.toLocaleString('es-PE')} registros en ${MODULE_LABELS[targetModule]}...`,
        });

        await updateServerPublishStatus({
          status: 'PUBLICANDO',
          source: `Publicando ${MODULE_LABELS[targetModule]}: ${analyzed.fileName}`,
          module: targetModule,
          fileName: analyzed.fileName,
        }).catch(() => {});

        const publishRes = await publishDatasetToServer(
          {
            module: analyzed.module,
            fileName: analyzed.fileName,
            fileHash: analyzed.fileHash,
            rowCount: analyzed.rowCount,
            duplicateCount: analyzed.duplicateCount,
            errorCount: analyzed.errorCount,
            establishmentCount: analyzed.establishmentCount,
            microredCount: analyzed.microredCount,
            columnHeaders: analyzed.columnHeaders,
            publicRows: analyzed.publicRows,
            nominalRows: analyzed.nominalRows,
            summary: analyzed.summary,
            period,
            validationNotes: analyzed.validationNotes,
            force: forceRetry,
          },
          (bp) => {
            setProgress({
              stage: 'publicando',
              percent: Math.max(45, bp.percent),
              processed: bp.processed,
              pending: bp.pending,
              errors: analyzed.errorCount,
              total: analyzed.rowCount,
              label: bp.label,
            });
          }
        );

        // Non-blocking background sync to Firestore if Firebase admin user is signed in
        if (user?.role === 'admin') {
          void publishAnalyzedDataset(analyzed, user).catch(() => {});
          if (selectedDriveSource) {
            void saveDriveSyncState({
              module: analyzed.module,
              driveFileId: selectedDriveSource.fileId,
              fileName: selectedDriveSource.name,
              mimeType: selectedDriveSource.mimeType,
              modifiedTime: selectedDriveSource.modifiedTime,
              lastCheckedAt: new Date().toISOString(),
              validationStatus: 'ok',
              rowCount: analyzed.rowCount,
              updatedBy: `Admin ${adminSession.username}`,
            }).catch(() => {});
          }
        }

        // Fast refresh (<30ms) of platform manifests & status bar across all modules
        await onDataPublished();
        void loadAdminHistory();

        const hasObs = analyzed.errorCount > 0;
        setProgress({
          stage: hasObs ? 'observaciones' : 'completado',
          percent: 100,
          processed: analyzed.rowCount,
          pending: 0,
          errors: analyzed.errorCount,
          total: analyzed.rowCount,
          label: publishRes.deduplicated
            ? 'Información ya publicada previamente (sin duplicados).'
            : hasObs
            ? `Publicado con ${analyzed.errorCount} observaciones registradas.`
            : 'Publicado correctamente.',
        });

        setNotice({
          type: hasObs ? 'warning' : 'success',
          text: publishRes.deduplicated
            ? `El archivo "${analyzed.fileName}" ya se encuentra vigente en ${MODULE_LABELS[targetModule]} (sin duplicar registros).`
            : `Publicado en ${MODULE_LABELS[targetModule]}: ${analyzed.rowCount.toLocaleString('es-PE')} registros procesados${
                analyzed.errorCount > 0 ? ` (${analyzed.errorCount} con observaciones)` : ''
              }.`,
        });
      } else {
        setProgress({
          stage: 'publicando',
          percent: 60,
          processed: 0,
          pending: 1,
          errors: 0,
          total: 1,
          label: 'Subiendo y publicando documento...',
        });
        const base64Data = await fileToBase64(selectedFile);
        const cat = detectCategoryFromFile(selectedFile);
        await uploadManualContentDocument({
          title: selectedFile.name.replace(/\.[^/.]+$/, ''),
          description: `Publicado en ${MODULE_LABELS[targetModule]}`,
          targetModule,
          category: cat,
          period,
          fileName: selectedFile.name,
          mimeType: selectedFile.type || 'application/octet-stream',
          sizeBytes: selectedFile.size,
          published: true,
          base64Data,
        });
        await onDataPublished();
        void loadAdminHistory();
        setProgress({
          stage: 'completado',
          percent: 100,
          processed: 1,
          pending: 0,
          errors: 0,
          total: 1,
          label: 'Documento publicado correctamente.',
        });
        setNotice({
          type: 'success',
          text: `Documento "${selectedFile.name}" publicado en ${MODULE_LABELS[targetModule]}.`,
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Ocurrió un error al publicar la información.';
      setCanRetry(true);
      setProgress((prev) => ({
        ...prev,
        stage: 'error',
        errors: Math.max(1, prev.errors),
        label: 'Error de publicación',
        details: msg,
      }));
      setNotice({ type: 'error', text: msg });
      await updateServerPublishStatus({
        status: 'ERROR',
        source: `Error al publicar en ${MODULE_LABELS[targetModule]}`,
        errorMessage: msg,
        fileName: selectedFile.name,
        module: targetModule,
      }).catch(() => {});
      void onDataPublished().catch(() => {});
      void loadAdminHistory();
    } finally {
      onPublishProgressChange?.(false);
    }
  };

  const handleResetSelection = () => {
    setSelectedFile(null);
    setSelectedDriveSource(null);
    setValidatedExcel(null);
    setValidatedDocInfo(null);
    setValidationError(null);
    setCanRetry(false);
    setNotice(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setProgress({
      stage: 'idle',
      percent: 0,
      processed: 0,
      pending: 0,
      errors: 0,
      total: 0,
      label: 'Seleccione un archivo para comenzar.',
    });
  };

  const handleDeletePublishedDoc = async (docItem: ContentDocumentItem) => {
    try {
      await deleteContentDocument(docItem.id);
      setPublishedDocs((prev) => prev.filter((d) => d.id !== docItem.id));
      await onDataPublished();
    } catch (err) {
      setNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'No se pudo eliminar el documento.',
      });
    }
  };

  const filteredDriveFiles = useMemo(() => {
    const q = driveSearch.trim().toLowerCase();
    return driveFiles.filter(
      (f) =>
        f.category !== 'Carpeta' &&
        (!q || f.name.toLowerCase().includes(q) || f.targetModule.toLowerCase().includes(q))
    );
  }, [driveFiles, driveSearch]);

  // --- PRIVATE ADMIN LOGIN GATE ---
  if (!isAdmin) {
    return (
      <div className="max-w-lg mx-auto mt-4 sm:mt-8">
        <div className="card-premium rounded-2xl overflow-hidden border border-[#102A43]/15 shadow-lg">
          <div className="px-6 py-5 bg-gradient-to-r from-[#102A43] to-[#183B5E] text-white flex items-center gap-4">
            <img
              src={BRAND_LOGOS.cursoVidaAdulto}
              alt="Curso de Vida Adulto"
              className="h-14 w-auto object-contain shrink-0 drop-shadow-[0_6px_12px_rgba(0,0,0,0.45)]"
            />
            <div>
              <p className="text-[11px] font-bold tracking-[0.08em] text-[#F07832] uppercase">
                ACCESO PRIVADO · RIS SAN IGNACIO
              </p>
              <h1 className="font-display text-lg font-bold leading-snug">
                Módulo de Administración
              </h1>
            </div>
          </div>

          <form onSubmit={handleAdminSetupOrLogin} className="p-6 space-y-4 bg-white">
            <div className="p-3.5 rounded-xl bg-[#F8F7F2] border border-[#102A43]/12 text-[13px] text-[#102A43]/80 flex items-start gap-2.5">
              <Lock className="w-4 h-4 text-[#F07832] shrink-0 mt-0.5" />
              <p>
                {adminSession.initialized
                  ? 'Ingrese sus credenciales administrativas para publicar datos y gestionar la conexión con Google Drive.'
                  : 'Configure la contraseña segura inicial para la cuenta autorizada.'}
              </p>
            </div>

            {user && user.role !== 'admin' && (
              <div className="p-3 rounded-xl bg-[#F07832]/10 border border-[#F07832]/30 text-[12.5px] text-[#102A43] flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-[#F07832] shrink-0" />
                <span>La cuenta {user.email} no cuenta con privilegios administrativos.</span>
              </div>
            )}

            <div>
              <label className="block text-[12.5px] font-semibold text-[#102A43] mb-1">
                Usuario Administrador
              </label>
              <input
                type="text"
                required
                value={loginUser}
                onChange={(e) => setLoginUser(e.target.value)}
                autoComplete="username"
                placeholder="Usuario administrador"
                className="w-full px-3.5 py-2.5 text-[14px] font-mono-tabular bg-[#F8F7F2] border border-[#102A43]/15 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#F07832]/40"
              />
            </div>

            <div>
              <label className="block text-[12.5px] font-semibold text-[#102A43] mb-1">
                {adminSession.initialized ? 'Contraseña' : 'Nueva contraseña inicial'}
              </label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  required
                  value={loginPass}
                  onChange={(e) => setLoginPass(e.target.value)}
                  autoComplete={adminSession.initialized ? 'current-password' : 'new-password'}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 pr-10 text-[14px] bg-[#F8F7F2] border border-[#102A43]/15 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#F07832]/40"
                />
                <button
                  type="button"
                  onClick={() => setShowPass((p) => !p)}
                  aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#102A43]/50 hover:text-[#102A43] cursor-pointer"
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {!adminSession.initialized && (
              <div>
                <label className="block text-[12.5px] font-semibold text-[#102A43] mb-1">
                  Confirmar contraseña
                </label>
                <input
                  type={showPass ? 'text' : 'password'}
                  required
                  value={confirmPass}
                  onChange={(e) => setConfirmPass(e.target.value)}
                  autoComplete="new-password"
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 text-[14px] bg-[#F8F7F2] border border-[#102A43]/15 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#F07832]/40"
                />
              </div>
            )}

            {authError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-[13px] font-medium text-red-800">
                {authError}
              </div>
            )}

            <button
              type="submit"
              disabled={authSubmitting}
              className="w-full inline-flex items-center justify-center gap-2 bg-[#102A43] hover:bg-[#183B5E] text-white font-semibold text-[14px] py-3 rounded-xl transition-colors cursor-pointer disabled:opacity-60"
            >
              {authSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ShieldCheck className="w-4 h-4 text-[#F07832]" />
              )}
              <span>{authSubmitting ? 'Verificando...' : 'Ingresar a Administración'}</span>
            </button>
          </form>
        </div>
      </div>
    );
  }

  const currentStep = !selectedFile ? 1 : progress.stage === 'completado' || progress.stage === 'observaciones' ? 3 : validatedExcel || validatedDocInfo ? 2 : 1;
  const lastDriveDate = driveSyncHistory[0]?.timestamp || null;
  const readyToPublish = Boolean(selectedFile && !validationError && (validatedExcel || validatedDocInfo) && !isBusy);

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="card-premium rounded-2xl p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <img
            src={BRAND_LOGOS.cursoVidaAdulto}
            alt="Curso de Vida Adulto"
            className="h-12 sm:h-14 w-auto object-contain shrink-0 drop-shadow-[0_4px_8px_rgba(16,42,67,0.2)]"
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-[#102A43] text-white text-[11px] font-bold">
                <ShieldCheck className="w-3.5 h-3.5 text-[#F07832]" />
                <span>ADMIN {adminSession.username}</span>
              </span>
              <span className="text-[12px] font-medium text-[#102A43]/65">
                Red Integrada de Salud San Ignacio
              </span>
            </div>
            <h1 className="font-display text-xl sm:text-2xl font-bold text-[#102A43] mt-1">
              ACTUALIZACIÓN DE INFORMACIÓN
            </h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              setPwdMessage(null);
              setPwdModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#102A43]/15 bg-[#F8F7F2] hover:bg-white text-[12.5px] font-semibold text-[#102A43] cursor-pointer"
          >
            <KeyRound className="w-3.5 h-3.5 text-[#F07832]" />
            <span>Cambiar contraseña</span>
          </button>
          <button
            type="button"
            onClick={handleAdminLogout}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#102A43] hover:bg-[#183B5E] text-white text-[12.5px] font-semibold cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5 text-[#F07832]" />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </div>

      {/* Global Feedback Alert */}
      {notice && (
        <div
          className={`p-4 rounded-2xl border text-[13.5px] font-medium flex items-center justify-between gap-3 ${
            notice.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : notice.type === 'warning'
              ? 'bg-[#F07832]/12 border-[#F07832]/35 text-[#102A43]'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {notice.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-[#F07832] shrink-0" />
            )}
            <span>{notice.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="text-[#102A43]/50 hover:text-[#102A43] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 1. CONEXIÓN GOOGLE DRIVE + SELECCIÓN DE ARCHIVOS                     */}
      {/* ==================================================================== */}
      <section className="rounded-2xl bg-gradient-to-br from-[#102A43] via-[#153554] to-[#0B1F33] text-white p-5 sm:p-6 shadow-md space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold tracking-[0.08em] text-[#F07832] uppercase">
                CONEXIÓN CON GOOGLE DRIVE
              </span>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                  driveConnected
                    ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/35'
                    : 'bg-white/10 text-slate-200 border border-white/20'
                }`}
              >
                {driveConnected ? 'CONECTADO' : 'DESCONECTADO'}
              </span>
              {lastDriveDate && (
                <span className="text-[11.5px] text-slate-300 font-mono-tabular">
                  · Última sync: {new Date(lastDriveDate).toLocaleString('es-PE')}
                </span>
              )}
            </div>
            <p className="text-[13px] text-slate-200/85">
              Carpeta institucional:{' '}
              <a
                href={DRIVE_ROOT_FOLDER_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="underline text-white hover:text-[#F07832] inline-flex items-center gap-1"
              >
                <span>Abrir en Drive</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={syncingDrive}
              onClick={handleConnectDrive}
              className="inline-flex items-center gap-1.5 bg-[#F07832] hover:bg-[#D96420] disabled:opacity-60 text-white font-bold text-[12.5px] px-4 py-2.5 rounded-xl cursor-pointer"
            >
              {syncingDrive ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FolderSync className="w-4 h-4" />
              )}
              <span>
                {syncingDrive
                  ? 'Sincronizando...'
                  : driveConnected
                  ? 'Actualizar lista de Drive'
                  : 'Conectar con Google Drive'}
              </span>
            </button>

            {driveConnected && (
              <button
                type="button"
                onClick={handleDisconnectDrive}
                className="inline-flex items-center gap-1.5 bg-white/10 hover:bg-white/15 border border-white/20 text-white font-semibold text-[12.5px] px-3.5 py-2.5 rounded-xl cursor-pointer"
              >
                <CloudOff className="w-4 h-4" />
                <span>Desconectar</span>
              </button>
            )}
          </div>
        </div>

        {syncError && (
          <div className="p-3 rounded-xl bg-[#F07832]/15 border border-[#F07832]/40 text-[12.5px] text-white">
            {syncError}
          </div>
        )}

        {driveFiles.length > 0 && (
          <div className="bg-white/8 border border-white/12 rounded-xl p-3.5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <p className="text-[12.5px] font-bold text-slate-100">
                Archivos disponibles en Drive ({filteredDriveFiles.length})
              </p>
              <input
                type="text"
                value={driveSearch}
                onChange={(e) => setDriveSearch(e.target.value)}
                placeholder="Filtrar archivo de Drive..."
                className="px-3 py-1.5 rounded-lg bg-[#0B1F33]/70 border border-white/20 text-[12.5px] text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-[#F07832]"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-[210px] overflow-y-auto pr-1">
              {filteredDriveFiles.map((f) => {
                const isLoadingThis = loadingDriveFileId === f.fileId;
                const isSelectedThis = selectedDriveSource?.fileId === f.fileId;
                return (
                  <div
                    key={f.fileId}
                    className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 transition-colors ${
                      isSelectedThis
                        ? 'bg-[#F07832]/20 border-[#F07832]'
                        : 'bg-[#0B1F33]/50 border-white/12 hover:border-white/30'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-[12.5px] font-semibold text-white truncate" title={f.name}>
                        {f.name}
                      </p>
                      <p className="text-[11px] text-slate-300 truncate">
                        {f.category} · {f.targetModule}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => onPreviewFile(f)}
                        title="Vista previa"
                        className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={!driveConnected || isLoadingThis || isBusy}
                        onClick={() => handleChooseDriveFile(f)}
                        className="px-2.5 py-1.5 rounded-lg bg-[#F07832] hover:bg-[#D96420] disabled:opacity-45 text-white text-[11px] font-bold cursor-pointer"
                      >
                        {isLoadingThis ? 'Cargando...' : 'Seleccionar'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* ==================================================================== */}
      {/* 2. FLUJO DE PUBLICACIÓN EN 3 PASOS: SELECCIONAR → VALIDAR → PUBLICAR */}
      {/* ==================================================================== */}
      <section className="card-premium rounded-2xl p-5 sm:p-6 space-y-5">
        {/* 3-Step Indicator */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#102A43]/10 pb-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#F07832]">
              Publicación Rápida de Datos
            </p>
            <h2 className="font-display text-lg font-bold text-[#102A43]">
              Seleccione, valide y publique en un solo paso
            </h2>
          </div>

          <div className="flex items-center gap-2 text-[12px] font-bold">
            {[
              { step: 1, label: '1. SELECCIONAR' },
              { step: 2, label: '2. VALIDAR' },
              { step: 3, label: '3. PUBLICAR' },
            ].map((s, idx) => {
              const active = currentStep >= s.step;
              return (
                <React.Fragment key={s.step}>
                  <span
                    className={`px-3 py-1 rounded-full border ${
                      active
                        ? 'bg-[#102A43] text-white border-[#102A43]'
                        : 'bg-[#F8F7F2] text-[#102A43]/55 border-[#102A43]/15'
                    }`}
                  >
                    {s.label}
                  </span>
                  {idx < 2 && <span className="text-[#102A43]/30">→</span>}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left: Module, Period & File Dropzone */}
          <div className="lg:col-span-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[12px] font-semibold text-[#102A43] mb-1">
                  Módulo de destino
                </label>
                <select
                  value={targetModule}
                  disabled={isBusy}
                  onChange={(e) => handleChangeModule(e.target.value as DataModuleKey)}
                  className="w-full px-3.5 py-2.5 text-[13px] font-semibold bg-white border border-[#102A43]/20 rounded-xl text-[#102A43]"
                >
                  {MODULE_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[12px] font-semibold text-[#102A43] mb-1">
                  Periodo de información
                </label>
                <input
                  type="month"
                  value={period}
                  disabled={isBusy}
                  onChange={(e) => setPeriod(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-[13px] font-mono-tabular bg-white border border-[#102A43]/20 rounded-xl text-[#102A43]"
                />
              </div>
            </div>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragActive(false);
                handleChooseLocalFile(e.dataTransfer.files?.[0]);
              }}
              onClick={() => !isBusy && fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-6 text-center transition-colors cursor-pointer ${
                dragActive
                  ? 'border-[#F07832] bg-[#F07832]/10'
                  : 'border-[#102A43]/25 hover:border-[#F07832] bg-[#F8F7F2]/60'
              }`}
            >
              <FileSpreadsheet className="w-9 h-9 text-[#F07832] mx-auto mb-2.5" />
              <p className="text-[14px] font-bold text-[#102A43] break-all">
                {selectedFile
                  ? selectedFile.name
                  : 'Arrastre un archivo o haga clic para seleccionar desde su equipo'}
              </p>
              <p className="text-[12px] text-[#102A43]/65 mt-1">
                Excel (.xlsx, .xls, .csv), PDF, imagen, Word o PowerPoint · Máx. 15 MB
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv,.pdf,.png,.jpg,.jpeg,.webp,.docx,.doc,.pptx,.ppt"
                onChange={(e) => handleChooseLocalFile(e.target.files?.[0])}
                className="sr-only"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                disabled={isBusy}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 bg-[#F8F7F2] hover:bg-white border border-[#102A43]/20 text-[#102A43] font-bold text-[12.5px] px-3.5 py-2.5 rounded-xl cursor-pointer disabled:opacity-50"
              >
                <Upload className="w-4 h-4 text-[#F07832]" />
                <span>Seleccionar archivo</span>
              </button>

              <button
                type="button"
                disabled={!selectedFile || isBusy}
                onClick={() => selectedFile && void runValidationForFile(selectedFile, targetModule)}
                className="inline-flex items-center gap-1.5 bg-[#102A43] hover:bg-[#183B5E] disabled:opacity-45 text-white font-bold text-[12.5px] px-3.5 py-2.5 rounded-xl cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4 text-[#F07832]" />
                <span>Validar datos</span>
              </button>

              {selectedFile && !isBusy && (
                <button
                  type="button"
                  onClick={handleResetSelection}
                  className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-[#102A43]/70 hover:text-[#102A43] px-2.5 py-2 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                  <span>Limpiar</span>
                </button>
              )}
            </div>
          </div>

          {/* Right: Simple Preview Card + Real Progress + Publish / Retry */}
          <div className="lg:col-span-6 flex flex-col justify-between gap-4 rounded-2xl border border-[#102A43]/12 bg-[#F8F7F2]/65 p-5">
            <div className="space-y-3">
              <h3 className="font-display text-base font-bold text-[#102A43]">
                Resumen de Validación y Publicación
              </h3>

              {/* Simple Preview Card */}
              <div className="bg-white rounded-xl border border-[#102A43]/10 p-4 grid grid-cols-2 gap-3 text-[12.5px]">
                <div className="col-span-2 sm:col-span-1">
                  <p className="text-[#102A43]/60 font-medium">Nombre del archivo</p>
                  <p className="font-bold text-[#102A43] truncate">
                    {selectedFile?.name || 'Ninguno seleccionado'}
                  </p>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <p className="text-[#102A43]/60 font-medium">Tipo de archivo</p>
                  <p className="font-semibold text-[#102A43]">
                    {selectedFile ? detectCategoryFromFile(selectedFile) : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-[#102A43]/60 font-medium">Periodo</p>
                  <p className="font-mono-tabular font-semibold text-[#102A43]">{period}</p>
                </div>
                <div>
                  <p className="text-[#102A43]/60 font-medium">Módulo de destino</p>
                  <p className="font-bold text-[#F07832]">{MODULE_LABELS[targetModule]}</p>
                </div>
                <div>
                  <p className="text-[#102A43]/60 font-medium">Cantidad de registros</p>
                  <p className="font-mono-tabular font-bold text-[#102A43]">
                    {validatedExcel
                      ? `${validatedExcel.rowCount.toLocaleString('es-PE')} válidos`
                      : validatedDocInfo
                      ? `1 documento (${validatedDocInfo.sizeKb})`
                      : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-[#102A43]/60 font-medium">Estado de validación</p>
                  <p
                    className={`font-bold ${
                      validationError
                        ? 'text-red-700'
                        : validatedExcel
                        ? validatedExcel.errorCount > 0
                          ? 'text-[#B84F14]'
                          : 'text-emerald-700'
                        : validatedDocInfo
                        ? 'text-emerald-700'
                        : 'text-[#102A43]/60'
                    }`}
                  >
                    {validationError
                      ? 'Con errores'
                      : validatedExcel
                      ? validatedExcel.errorCount > 0
                        ? `Observado (${validatedExcel.errorCount} obs.)`
                        : 'Válido para publicar'
                      : validatedDocInfo
                      ? 'Documento válido'
                      : 'Pendiente'}
                  </p>
                </div>
              </div>

              {/* Real Progress Bar & Counters */}
              <div className="bg-white rounded-xl border border-[#102A43]/10 p-4 space-y-2.5">
                <div className="flex items-center justify-between gap-2 text-[12.5px]">
                  <span className="font-bold text-[#102A43] flex items-center gap-1.5">
                    {isBusy && <Loader2 className="w-3.5 h-3.5 animate-spin text-[#F07832]" />}
                    <span>{progress.label}</span>
                  </span>
                  <span className="font-mono-tabular font-extrabold text-[#102A43]">
                    {progress.percent}%
                  </span>
                </div>

                <div className="w-full h-2.5 rounded-full bg-[#102A43]/10 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-200 ${
                      progress.stage === 'error'
                        ? 'bg-red-600'
                        : progress.stage === 'completado'
                        ? 'bg-emerald-600'
                        : 'bg-[#F07832]'
                    }`}
                    style={{ width: `${progress.percent}%` }}
                  />
                </div>

                <div className="grid grid-cols-3 gap-2 text-[11.5px] font-mono-tabular text-[#102A43]/75 pt-0.5">
                  <span>Procesados: {progress.processed.toLocaleString('es-PE')}</span>
                  <span>Pendientes: {progress.pending.toLocaleString('es-PE')}</span>
                  <span>Obs./Errores: {progress.errors.toLocaleString('es-PE')}</span>
                </div>
              </div>

              {validationError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-[12.5px] text-red-800">
                  {validationError}
                </div>
              )}
            </div>

            {/* Publish / Retry Buttons */}
            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <button
                type="button"
                disabled={!readyToPublish}
                onClick={() => void handlePublish(false)}
                className="flex-1 inline-flex items-center justify-center gap-2 bg-[#F07832] hover:bg-[#D96420] disabled:opacity-45 text-white font-bold text-[13.5px] px-5 py-3 rounded-xl shadow-sm transition-colors cursor-pointer"
              >
                {isBusy ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                <span>{isBusy ? 'Publicando información...' : 'Publicar información'}</span>
              </button>

              {canRetry && (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => void handlePublish(true)}
                  className="inline-flex items-center gap-1.5 bg-[#102A43] hover:bg-[#183B5E] text-white font-bold text-[13px] px-4 py-3 rounded-xl cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4 text-[#F07832]" />
                  <span>Reintentar</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ==================================================================== */}
      {/* 3. HISTORIAL DE PUBLICACIONES                                        */}
      {/* ==================================================================== */}
      <section className="card-premium rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#102A43]/10 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-[#F07832]" />
            <h2 className="font-display text-base font-bold text-[#102A43]">
              Historial de Publicaciones ({historyRows.length})
            </h2>
          </div>

          <div className="flex items-center gap-2">
            {publishedDocs.length > 0 && (
              <button
                type="button"
                onClick={() => setShowDocsManager((v) => !v)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#102A43]/15 text-[12px] font-semibold text-[#102A43] hover:bg-[#F8F7F2] cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5 text-[#F07832]" />
                <span>Documentos adjuntos ({publishedDocs.length})</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => void loadAdminHistory()}
              aria-label="Recargar historial"
              className="p-1.5 rounded-lg border border-[#102A43]/15 text-[#102A43]/75 hover:text-[#102A43] cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingHistory ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Optional Compact Published Docs drawer */}
        {showDocsManager && publishedDocs.length > 0 && (
          <div className="px-5 py-3 bg-[#F8F7F2] border-b border-[#102A43]/10 space-y-2">
            <p className="text-[12px] font-bold text-[#102A43]">
              Documentos publicados disponibles en los módulos:
            </p>
            <div className="flex flex-wrap gap-2">
              {publishedDocs.map((doc) => (
                <div
                  key={doc.id}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white border border-[#102A43]/12 text-[12px]"
                >
                  <span className="font-semibold text-[#102A43] truncate max-w-[200px]">
                    {doc.title}
                  </span>
                  <span className="text-[#102A43]/60">
                    ({MODULE_LABELS[doc.targetModule] || doc.targetModule})
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleDeletePublishedDoc(doc)}
                    title="Eliminar documento"
                    className="text-[#F07832] hover:text-red-700 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {historyRows.length === 0 ? (
          <div className="p-8 text-center text-sm text-[#102A43]/65">
            Aún no se registran publicaciones de datos.
          </div>
        ) : (
          <>
            {/* Mobile compact cards */}
            <div className="md:hidden divide-y divide-[#102A43]/10">
              {historyRows.slice(0, 30).map((item) => {
                const dt = formatDateTimeParts(item.uploadedAt);
                const isErr = item.status === 'Error de publicación';
                const isObs = item.status === 'Publicado con observaciones';
                return (
                  <div key={item.historyId} className="p-4 space-y-1.5 text-[12.5px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-[#102A43] truncate">{item.fileName}</span>
                      <span className="font-mono-tabular text-[11px] text-[#102A43]/65 shrink-0">
                        {dt.fecha} · {dt.hora}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[#102A43]/75">
                        {MODULE_LABELS[item.module] || item.module} ·{' '}
                        <strong className="font-mono-tabular">
                          {Number(item.rowCount || 0).toLocaleString('es-PE')}
                        </strong>{' '}
                        reg.
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                          isErr
                            ? 'bg-red-50 text-red-700 border border-red-200'
                            : isObs
                            ? 'bg-[#F07832]/15 text-[#B84F14] border border-[#F07832]/30'
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        }`}
                      >
                        {item.status}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop/Tablet Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse text-[13px]">
                <thead>
                  <tr className="bg-[#F8F7F2] border-b border-[#102A43]/12 text-[#102A43]/80">
                    <th className="px-4 py-3 font-semibold">Fecha</th>
                    <th className="px-4 py-3 font-semibold">Hora</th>
                    <th className="px-4 py-3 font-semibold">Archivo</th>
                    <th className="px-4 py-3 font-semibold">Módulo actualizado</th>
                    <th className="px-4 py-3 font-semibold text-right">Cantidad de registros</th>
                    <th className="px-4 py-3 font-semibold">Usuario administrador</th>
                    <th className="px-4 py-3 font-semibold">Resultado de publicación</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#102A43]/8">
                  {historyRows.slice(0, 50).map((item) => {
                    const dt = formatDateTimeParts(item.uploadedAt);
                    const isErr = item.status === 'Error de publicación';
                    const isObs = item.status === 'Publicado con observaciones';
                    return (
                      <tr key={item.historyId} className="hover:bg-[#F8F7F2]/60">
                        <td className="px-4 py-3 font-mono-tabular whitespace-nowrap">{dt.fecha}</td>
                        <td className="px-4 py-3 font-mono-tabular whitespace-nowrap">{dt.hora}</td>
                        <td className="px-4 py-3 font-medium text-[#102A43] max-w-[240px] truncate">
                          {item.fileName}
                        </td>
                        <td className="px-4 py-3 text-[#102A43]/85">
                          {MODULE_LABELS[item.module] || item.module}
                        </td>
                        <td className="px-4 py-3 text-right font-mono-tabular font-semibold">
                          {Number(item.rowCount || 0).toLocaleString('es-PE')}
                        </td>
                        <td className="px-4 py-3 text-[#102A43]/75">{item.uploadedByName}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span
                              className={`inline-block px-2.5 py-0.5 rounded-full text-[11.5px] font-bold border ${
                                isErr
                                  ? 'bg-red-50 text-red-700 border-red-200'
                                  : isObs
                                  ? 'bg-[#F07832]/15 text-[#B84F14] border-[#F07832]/30'
                                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              }`}
                            >
                              {item.status}
                            </span>
                            {(item.errorMessage || item.validationNotes) && (
                              <button
                                type="button"
                                onClick={() => setSelectedErrorDetail(item)}
                                className="text-[11.5px] font-semibold text-[#102A43]/70 hover:text-[#F07832] underline cursor-pointer"
                              >
                                Detalle
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {/* Modal: History Error / Observation Detail */}
      {selectedErrorDetail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0B1F33]/65 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md bg-white rounded-2xl border border-[#102A43]/15 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 bg-[#102A43] text-white flex items-center justify-between">
              <h3 className="font-display font-bold text-base">Detalle de Publicación</h3>
              <button
                type="button"
                onClick={() => setSelectedErrorDetail(null)}
                className="text-slate-300 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-3 text-[13px] text-[#102A43]">
              <p>
                <strong>Archivo:</strong> {selectedErrorDetail.fileName}
              </p>
              <p>
                <strong>Resultado:</strong> {selectedErrorDetail.status}
              </p>
              <div className="p-3 rounded-xl bg-[#F8F7F2] border border-[#102A43]/12">
                {selectedErrorDetail.errorMessage ||
                  selectedErrorDetail.validationNotes ||
                  'Sin observaciones adicionales.'}
              </div>
            </div>
            <div className="px-5 py-3 bg-[#F8F7F2] border-t border-[#102A43]/10 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedErrorDetail(null)}
                className="px-4 py-2 rounded-xl bg-[#102A43] text-white text-[12.5px] font-semibold cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Change Admin Password */}
      {pwdModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0B1F33]/65 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handlePasswordChange}
            className="w-full max-w-md bg-white rounded-2xl border border-[#102A43]/15 shadow-2xl overflow-hidden"
          >
            <div className="px-5 py-4 bg-[#102A43] text-white flex items-center justify-between">
              <h3 className="font-display font-bold text-base">Cambiar Contraseña</h3>
              <button
                type="button"
                onClick={() => setPwdModalOpen(false)}
                className="text-slate-300 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-3.5">
              <div>
                <label className="block text-[12px] font-semibold text-[#102A43] mb-1">
                  Contraseña actual
                </label>
                <input
                  type="password"
                  required
                  value={currPwd}
                  onChange={(e) => setCurrPwd(e.target.value)}
                  className="w-full px-3 py-2 text-[13px] border border-[#102A43]/15 rounded-xl"
                />
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-[#102A43] mb-1">
                  Nueva contraseña (mínimo 8 caracteres)
                </label>
                <input
                  type="password"
                  required
                  value={nextPwd}
                  onChange={(e) => setNextPwd(e.target.value)}
                  className="w-full px-3 py-2 text-[13px] border border-[#102A43]/15 rounded-xl"
                />
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-[#102A43] mb-1">
                  Confirmar nueva contraseña
                </label>
                <input
                  type="password"
                  required
                  value={confirmNextPwd}
                  onChange={(e) => setConfirmNextPwd(e.target.value)}
                  className="w-full px-3 py-2 text-[13px] border border-[#102A43]/15 rounded-xl"
                />
              </div>
              {pwdMessage && (
                <div
                  className={`p-3 rounded-xl text-[12.5px] font-medium ${
                    pwdMessage.type === 'success'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-[#F07832]/12 text-[#102A43] border border-[#F07832]/30'
                  }`}
                >
                  {pwdMessage.text}
                </div>
              )}
            </div>
            <div className="px-5 py-3.5 bg-[#F8F7F2] border-t border-[#102A43]/10 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPwdModalOpen(false)}
                className="px-3.5 py-2 rounded-xl border border-[#102A43]/15 text-[12.5px] font-semibold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={pwdSubmitting}
                className="px-4 py-2 rounded-xl bg-[#F07832] text-white text-[12.5px] font-semibold cursor-pointer disabled:opacity-60"
              >
                {pwdSubmitting ? 'Guardando...' : 'Actualizar'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
