import { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { AnimatePresence, motion } from 'motion/react';
import { AdminModule } from './components/AdminModule';
import { AuthModal } from './components/AuthModal';
import { CartillaModule } from './components/CartillaModule';
import { DashboardHome } from './components/DashboardHome';
import { ErrorBoundary } from './components/ErrorBoundary';
import { IndicatorsModule } from './components/IndicatorsModule';
import { MorbiditiesModule } from './components/MorbiditiesModule';
import { PatientsModule } from './components/PatientsModule';
import { QualityModule } from './components/QualityModule';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { auth, googleProvider, testConnection } from './firebase';
import {
  ensureUserProfile,
  fetchAllPublicManifests,
  fetchPublishedCartillaResources,
} from './services/firestoreService';
import {
  CartillaResource,
  ModuleId,
  PublicManifest,
  PublicModuleKey,
  UserProfile,
} from './types';

function MainApp() {
  const [activeModule, setActiveModule] = useState<ModuleId>('inicio');
  const [indicatorMicroredFilter, setIndicatorMicroredFilter] = useState<string | undefined>(
    undefined
  );
  const [user, setUser] = useState<UserProfile | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [manifests, setManifests] = useState<Partial<Record<PublicModuleKey, PublicManifest>>>({});
  const [cartillaResources, setCartillaResources] = useState<CartillaResource[]>([]);

  const loadPublicData = useCallback(async () => {
    setRefreshing(true);
    try {
      const [man, cartilla] = await Promise.all([
        fetchAllPublicManifests(),
        fetchPublishedCartillaResources(),
      ]);
      setManifests(man);
      setCartillaResources(cartilla);
    } catch (error) {
      console.error('Error sincronizando datos públicos:', error);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    testConnection();
    loadPublicData();

    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) {
        setUser(null);
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
  }, [loadPublicData]);

  const handleGoogleSignIn = async () => {
    const cred = await signInWithPopup(auth, googleProvider);
    if (cred.user) {
      const profile = await ensureUserProfile(cred.user);
      setUser(profile);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    setUser(null);
    if (activeModule === 'admin') {
      setActiveModule('inicio');
    }
  };

  const handleNavigate = (module: ModuleId, microredFilter?: string) => {
    if (module === 'indicadores') {
      setIndicatorMicroredFilter(microredFilter);
    }
    setActiveModule(module);
  };

  return (
    <div className="min-h-screen bg-[#F5F3EE] text-slate-900 flex">
      <Sidebar
        activeModule={activeModule}
        onSelectModule={(mod) => handleNavigate(mod)}
        user={user}
        onOpenAuth={() => setAuthModalOpen(true)}
        onSignOut={handleSignOut}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar
          activeModule={activeModule}
          user={user}
          refreshing={refreshing}
          onRefresh={loadPublicData}
          onOpenAuth={() => setAuthModalOpen(true)}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
        />

        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 max-w-[1440px] w-full mx-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeModule}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            >
              {activeModule === 'inicio' && (
                <DashboardHome manifests={manifests} onNavigate={handleNavigate} />
              )}
              {activeModule === 'pacientes' && (
                <PatientsModule
                  manifest={manifests.pacientes_resumen}
                  user={user}
                  onOpenAuth={() => setAuthModalOpen(true)}
                  onNavigate={handleNavigate}
                />
              )}
              {activeModule === 'calidad' && (
                <QualityModule
                  manifest={manifests.calidad_resumen}
                  user={user}
                  onOpenAuth={() => setAuthModalOpen(true)}
                  onNavigate={handleNavigate}
                />
              )}
              {activeModule === 'morbilidades' && (
                <MorbiditiesModule
                  manifest={manifests.morbilidades}
                  user={user}
                  onNavigate={handleNavigate}
                />
              )}
              {activeModule === 'indicadores' && (
                <IndicatorsModule
                  manifest={manifests.indicadores}
                  initialMicrored={indicatorMicroredFilter}
                  user={user}
                  onNavigate={handleNavigate}
                />
              )}
              {activeModule === 'cartilla' && (
                <CartillaModule firestoreResources={cartillaResources} />
              )}
              {activeModule === 'admin' && (
                <AdminModule
                  user={user}
                  onOpenAuth={() => setAuthModalOpen(true)}
                  onDataPublished={loadPublicData}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        user={user}
        onGoogleSignIn={handleGoogleSignIn}
        onSignOut={handleSignOut}
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
