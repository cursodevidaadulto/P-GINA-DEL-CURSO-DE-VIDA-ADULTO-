import { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { AnimatePresence, motion } from 'motion/react';
import { AdminModule } from './components/AdminModule';
import { AuthModal } from './components/AuthModal';
import { DriveDocumentPreviewModal } from './components/DriveDocumentPreviewModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { IndicatorsModule } from './components/IndicatorsModule';
import { MorbiditiesModule } from './components/MorbiditiesModule';
import { PatientsModule } from './components/PatientsModule';
import { QualityModule } from './components/QualityModule';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import {
  auth,
  clearDriveAccessToken,
  getDriveAccessToken,
  signInWithGoogleDrive,
  testConnection,
} from './firebase';
import {
  fetchAdminAuthStatus,
  fetchContentDocuments,
  fetchPlatformStatus,
  fetchServerPublicManifests,
  getAdminBearerToken,
  savePlatformHeroImage,
} from './services/adminApiService';
import {
  ensureUserProfile,
  fetchAllPublicManifests,
  fetchDriveCatalog,
  fetchDriveSyncStates,
  saveDriveCatalogToFirestore,
} from './services/firestoreService';
import {
  fetchDriveFileBlob,
  listDriveRepositoryFiles,
} from './services/googleDriveService';
import {
  AdminSessionState,
  ContentDocumentItem,
  DriveDocumentItem,
  DriveSyncState,
  ModuleId,
  PlatformStatusInfo,
  PublicManifest,
  PublicModuleKey,
  UserProfile,
} from './types';

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.onerror = () => reject(new Error('No se pudo convertir la imagen de Drive.'));
    reader.readAsDataURL(blob);
  });
}

function withFastTimeout<T>(promise: Promise<T>, ms = 4000): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Timeout')), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

function MainApp() {
  const [activeModule, setActiveModule] = useState<ModuleId>('indicadores');
  const [indicatorMicroredFilter, setIndicatorMicroredFilter] = useState<string | undefined>(
    undefined
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [adminSession, setAdminSession] = useState<AdminSessionState>({
    initialized: true,
    authenticated: false,
    username: null,
    token: null,
  });

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [manifests, setManifests] = useState<Partial<Record<PublicModuleKey, PublicManifest>>>({});
  const [manualDocs, setManualDocs] = useState<ContentDocumentItem[]>([]);
  const [platformStatus, setPlatformStatus] = useState<PlatformStatusInfo | null>(null);

  // Google Drive state
  const [driveAccessToken, setDriveAccessToken] = useState<string | null>(getDriveAccessToken());
  const [driveFiles, setDriveFiles] = useState<DriveDocumentItem[]>([]);
  const [driveSyncStates, setDriveSyncStates] = useState<Record<string, DriveSyncState>>({});
  const [syncingDrive, setSyncingDrive] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<DriveDocumentItem | null>(null);

  // Ultra-fast server refresh (< 30ms) used immediately after Admin publishes data
  const refreshPublishedDataFast = useCallback(async () => {
    const [srvManRes, contentRes, statusRes] = await Promise.allSettled([
      fetchServerPublicManifests(),
      fetchContentDocuments(),
      fetchPlatformStatus(),
    ]);

    if (srvManRes.status === 'fulfilled') {
      setManifests((prev) => ({
        ...prev,
        ...srvManRes.value,
      }));
    }
    if (contentRes.status === 'fulfilled') setManualDocs(contentRes.value);
    if (statusRes.status === 'fulfilled') {
      setPlatformStatus(statusRes.value.status);
    }
  }, []);

  // Initial load: server first, then non-blocking Firestore fallback with 4s timeout
  const loadInitialData = useCallback(async () => {
    await refreshPublishedDataFast();

    const [fsManRes, catalogRes, syncStatesRes] = await Promise.allSettled([
      withFastTimeout(fetchAllPublicManifests(), 4000),
      withFastTimeout(fetchDriveCatalog(), 4000),
      withFastTimeout(fetchDriveSyncStates(), 4000),
    ]);

    if (fsManRes.status === 'fulfilled') {
      setManifests((prev) => ({
        ...fsManRes.value,
        ...prev,
      }));
    }
    if (catalogRes.status === 'fulfilled' && catalogRes.value.length > 0) {
      setDriveFiles(catalogRes.value);
    }
    if (syncStatesRes.status === 'fulfilled') {
      setDriveSyncStates(syncStatesRes.value);
    }
  }, [refreshPublishedDataFast]);

  const handleSetDriveHeroImage = useCallback(
    async (file: DriveDocumentItem) => {
      if (!driveAccessToken) {
        throw new Error('Conecte primero la cuenta de Google Drive para obtener la imagen.');
      }
      const blob = await fetchDriveFileBlob(file, driveAccessToken);
      if (getAdminBearerToken()) {
        const base64Data = await blobToBase64(blob);
        await savePlatformHeroImage({
          fileName: file.name,
          mimeType: blob.type || file.mimeType || 'image/jpeg',
          base64Data,
          driveFileId: file.fileId,
        });
      }
    },
    [driveAccessToken]
  );

  const syncDriveWithToken = useCallback(
    async (token: string, profile: UserProfile | null): Promise<DriveDocumentItem[]> => {
      setSyncingDrive(true);
      setSyncError(null);
      try {
        const files = await listDriveRepositoryFiles(
          token,
          profile?.displayName || profile?.email || 'Administrador RIS'
        );
        setDriveFiles(files);

        if (profile?.role === 'admin') {
          void saveDriveCatalogToFirestore(files, profile.displayName || profile.email).catch(() => {});
          void fetchDriveSyncStates()
            .then((states) => setDriveSyncStates(states))
            .catch(() => {});
        }

        return files;
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : 'No se pudo consultar la carpeta compartida en Google Drive.';
        setSyncError(msg);
        throw err;
      } finally {
        setSyncingDrive(false);
      }
    },
    []
  );

  useEffect(() => {
    void testConnection();
    void loadInitialData();

    fetchAdminAuthStatus()
      .then((status) => setAdminSession(status))
      .catch(() => {});

    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) {
        setUser(null);
        clearDriveAccessToken();
        setDriveAccessToken(null);
        return;
      }
      try {
        const profile = await ensureUserProfile(fbUser);
        setUser(profile);
      } catch (err) {
        console.error('No se pudo sincronizar el perfil del usuario:', err);
      }
    });

    return () => unsub();
  }, [loadInitialData]);

  const handleGoogleSignIn = async () => {
    const { user: fbUser, accessToken } = await signInWithGoogleDrive();
    const profile = await ensureUserProfile(fbUser);
    setUser(profile);
    if (accessToken) {
      setDriveAccessToken(accessToken);
      if (profile.role === 'admin' || adminSession.authenticated) {
        await syncDriveWithToken(accessToken, profile).catch(() => {});
      }
    }
  };

  const handleConnectAndSyncDrive = async (): Promise<DriveDocumentItem[] | void> => {
    setSyncError(null);
    if (driveAccessToken) {
      try {
        return await syncDriveWithToken(driveAccessToken, user);
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        if (!/401|invalid authentication|expired|credentials/i.test(msg)) {
          throw err;
        }
        clearDriveAccessToken();
        setDriveAccessToken(null);
      }
    }
    try {
      setSyncingDrive(true);
      const { user: fbUser, accessToken } = await signInWithGoogleDrive();
      const profile = await ensureUserProfile(fbUser);
      setUser(profile);
      if (accessToken) {
        setDriveAccessToken(accessToken);
        return await syncDriveWithToken(accessToken, profile);
      }
      setSyncError('No se obtuvo autorización de lectura de Google Drive.');
    } catch (err) {
      setSyncError(
        err instanceof Error ? err.message : 'No se pudo conectar con Google Drive.'
      );
      throw err;
    } finally {
      setSyncingDrive(false);
    }
  };

  const handleDisconnectDrive = () => {
    clearDriveAccessToken();
    setDriveAccessToken(null);
    setSyncError(null);
  };

  const handleSignOut = async () => {
    await signOut(auth);
    clearDriveAccessToken();
    setDriveAccessToken(null);
    setUser(null);
  };

  const handleNavigate = (module: ModuleId, microredFilter?: string) => {
    if (module === 'indicadores') {
      setIndicatorMicroredFilter(microredFilter);
    }
    setActiveModule(module);
  };

  return (
    <div className="h-screen overflow-hidden bg-[#F8F7F2] text-[#102A43] flex">
      <Sidebar
        activeModule={activeModule}
        onSelectModule={(mod) => handleNavigate(mod)}
        user={user}
        adminSession={adminSession}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
        onOpenAuth={() => setAuthModalOpen(true)}
        onSignOut={handleSignOut}
      />

      <div className="flex-1 min-w-0 flex flex-col h-screen overflow-hidden">
        <TopBar
          activeModule={activeModule}
          user={user}
          adminSession={adminSession}
          platformStatus={platformStatus}
          isPublishing={isPublishing || syncingDrive}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          onOpenAuth={() => setAuthModalOpen(true)}
        />

        <main className="flex-1 overflow-y-auto px-3 sm:px-6 lg:px-8 py-5 pb-24 md:pb-8">
          <div className="max-w-[1440px] w-full mx-auto">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeModule}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
              >
                {activeModule === 'indicadores' && (
                  <IndicatorsModule
                    manifest={manifests.indicadores}
                    initialMicrored={indicatorMicroredFilter}
                    driveFiles={driveFiles}
                    manualDocs={manualDocs}
                    onPreviewFile={setPreviewFile}
                  />
                )}
                {activeModule === 'pacientes' && (
                  <PatientsModule
                    manifest={manifests.pacientes_resumen}
                    user={user}
                    adminSession={adminSession}
                    onOpenAuth={() => setAuthModalOpen(true)}
                    driveFiles={driveFiles}
                    manualDocs={manualDocs}
                    onPreviewFile={setPreviewFile}
                  />
                )}
                {activeModule === 'calidad' && (
                  <QualityModule
                    manifest={manifests.calidad_resumen}
                    user={user}
                    adminSession={adminSession}
                    onOpenAuth={() => setAuthModalOpen(true)}
                    driveFiles={driveFiles}
                    manualDocs={manualDocs}
                    onPreviewFile={setPreviewFile}
                  />
                )}
                {activeModule === 'morbilidades' && (
                  <MorbiditiesModule
                    manifest={manifests.morbilidades}
                    driveFiles={driveFiles}
                    manualDocs={manualDocs}
                    onPreviewFile={setPreviewFile}
                  />
                )}
                {activeModule === 'admin' && (
                  <AdminModule
                    user={user}
                    adminSession={adminSession}
                    onAdminSessionChange={setAdminSession}
                    onOpenAuth={() => setAuthModalOpen(true)}
                    onDataPublished={refreshPublishedDataFast}
                    onPublishProgressChange={setIsPublishing}
                    driveFiles={driveFiles}
                    driveSyncStates={driveSyncStates}
                    driveConnected={Boolean(driveAccessToken)}
                    driveAccessToken={driveAccessToken}
                    syncingDrive={syncingDrive}
                    syncError={syncError}
                    onConnectAndSyncDrive={handleConnectAndSyncDrive}
                    onDisconnectDrive={handleDisconnectDrive}
                    onPreviewFile={setPreviewFile}
                    onSetDriveHeroImage={handleSetDriveHeroImage}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>

      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        user={user}
        onGoogleSignIn={handleGoogleSignIn}
        onSignOut={handleSignOut}
      />

      <DriveDocumentPreviewModal
        file={previewFile}
        driveAccessToken={driveAccessToken}
        onClose={() => setPreviewFile(null)}
        onConnectDrive={async () => {
          await handleConnectAndSyncDrive();
        }}
      />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <MainApp />
    </ErrorBoundary>
  );
}
