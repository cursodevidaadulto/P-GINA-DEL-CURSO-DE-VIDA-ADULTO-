import React from 'react';
import {
  Activity,
  BarChart2,
  ClipboardCheck,
  Lock,
  LogIn,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import { AdminSessionState, BRAND_LOGOS, ModuleId, UserProfile } from '../types';

interface SidebarProps {
  activeModule: ModuleId;
  onSelectModule: (module: ModuleId) => void;
  user: UserProfile | null;
  adminSession: AdminSessionState;
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onOpenAuth: () => void;
  onSignOut: () => void;
}

const NAV_ITEMS: {
  id: ModuleId;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  adminLock?: boolean;
}[] = [
  {
    id: 'indicadores',
    label: 'Monitoreo de indicadores',
    shortLabel: 'Indicadores',
    icon: BarChart2,
  },
  {
    id: 'pacientes',
    label: 'Seguimiento',
    shortLabel: 'Seguimiento',
    icon: Users,
  },
  {
    id: 'calidad',
    label: 'Control de calidad',
    shortLabel: 'Calidad',
    icon: ClipboardCheck,
  },
  {
    id: 'morbilidades',
    label: 'Morbilidad',
    shortLabel: 'Morbilidad',
    icon: Activity,
  },
  {
    id: 'admin',
    label: 'Administración',
    shortLabel: 'Admin',
    icon: Settings,
    adminLock: true,
  },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeModule,
  onSelectModule,
  user,
  adminSession,
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
  onOpenAuth,
  onSignOut,
}) => {
  const isAdmin = adminSession.authenticated || user?.role === 'admin';

  const handleSelect = (mod: ModuleId) => {
    onSelectModule(mod);
    onCloseMobile();
  };

  const renderNavLinks = (isCollapsed: boolean) => (
    <nav aria-label="Navegación principal" className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive = activeModule === item.id;
        const showLock = item.adminLock && !isAdmin;

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => handleSelect(item.id)}
            title={item.label}
            aria-current={isActive ? 'page' : undefined}
            className={`group relative w-full flex items-center ${
              isCollapsed ? 'justify-center px-2' : 'justify-between px-3.5'
            } py-3 rounded-xl text-[13.5px] transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F07832] cursor-pointer ${
              isActive
                ? 'bg-[#F8F7F2] text-[#102A43] font-bold shadow-md'
                : 'text-slate-100/90 font-medium hover:bg-white/10 hover:text-white'
            }`}
          >
            {isActive && (
              <span
                className="absolute left-1 top-2.5 bottom-2.5 w-1 rounded-full bg-[#F07832]"
                aria-hidden="true"
              />
            )}
            <span className={`flex items-center ${isCollapsed ? '' : 'gap-3 min-w-0 pl-1.5'}`}>
              <Icon
                className={`w-[18px] h-[18px] shrink-0 transition-colors ${
                  isActive ? 'text-[#F07832]' : 'text-slate-300 group-hover:text-[#F07832]'
                }`}
              />
              {!isCollapsed && <span className="truncate whitespace-nowrap">{item.label}</span>}
            </span>
            {!isCollapsed && showLock && (
              <Lock
                className={`w-3.5 h-3.5 shrink-0 ${
                  isActive ? 'text-[#102A43]/60' : 'text-slate-300/70'
                }`}
              />
            )}
          </button>
        );
      })}
    </nav>
  );

  const renderSessionFooter = (isCollapsed: boolean) => (
    <div className="bg-[#0B1F33] border-t border-white/10 p-3.5 space-y-2.5 shrink-0">
      {adminSession.authenticated ? (
        <div className="space-y-2">
          {!isCollapsed && (
            <div className="px-2.5 py-2 rounded-xl bg-[#F07832]/15 border border-[#F07832]/35">
              <p className="text-[11.5px] font-bold text-[#F07832] flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                <span>Administrador ({adminSession.username})</span>
              </p>
              <p className="text-[11px] text-slate-200/85 mt-0.5 truncate">
                Sesión administrativa activa
              </p>
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              onSignOut();
              onCloseMobile();
            }}
            title="Cerrar sesión"
            className="w-full flex items-center justify-center gap-2 bg-white/10 hover:bg-white/15 text-white font-medium text-[12.5px] py-2.5 px-3 rounded-xl transition-colors whitespace-nowrap cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5 shrink-0" />
            {!isCollapsed && <span>Cerrar sesión</span>}
          </button>
        </div>
      ) : !user ? (
        <>
          {!isCollapsed && (
            <p className="text-[11px] leading-relaxed text-slate-300/85">
              Acceso institucional para personal de salud de la RIS San Ignacio.
            </p>
          )}
          <button
            type="button"
            onClick={() => {
              onOpenAuth();
              onCloseMobile();
            }}
            title="Acceso institucional"
            className="w-full flex items-center justify-center gap-2 bg-[#F07832] hover:bg-[#D96420] text-white font-semibold text-[13px] py-2.5 px-3 rounded-xl transition-colors shadow-sm whitespace-nowrap cursor-pointer"
          >
            <LogIn className="w-4 h-4 shrink-0" />
            {!isCollapsed && <span>Acceso institucional</span>}
          </button>
        </>
      ) : (
        <div className="space-y-2">
          {!isCollapsed && (
            <div className="px-2.5 py-2 rounded-xl bg-white/8 border border-white/10">
              <p className="text-[12.5px] font-semibold text-[#F8F7F2] truncate">
                {user.displayName}
              </p>
              <p className="text-[11px] text-[#F07832] font-semibold truncate">
                {user.nominalAccess ? 'Personal · Acceso Nominal' : 'Personal de Salud'}
              </p>
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              onSignOut();
              onCloseMobile();
            }}
            title="Cerrar sesión"
            className="w-full flex items-center justify-center gap-2 bg-white/10 hover:bg-white/15 text-white font-medium text-[12.5px] py-2.5 px-3 rounded-xl transition-colors whitespace-nowrap cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5 shrink-0" />
            {!isCollapsed && <span>Cerrar sesión</span>}
          </button>
        </div>
      )}

      {!isCollapsed && (
        <p className="text-[10.5px] text-slate-300/70 text-center leading-snug">
          RIS San Ignacio · Cajamarca, Perú
        </p>
      )}
    </div>
  );

  return (
    <>
      {/* PERMANENT SIDEBAR FOR TABLET & DESKTOP (md and up) */}
      <aside
        aria-label="Barra de navegación permanente"
        className={`hidden md:flex flex-col h-screen sticky top-0 shrink-0 select-none bg-gradient-to-b from-[#102A43] via-[#102A43] to-[#0B1F33] text-white border-r border-white/10 transition-[width] duration-200 ease-out ${
          collapsed ? 'w-[82px]' : 'w-[264px]'
        }`}
      >
        <div
          className={`px-3.5 py-4 border-b border-white/10 flex items-center ${
            collapsed ? 'justify-center' : 'justify-between gap-2'
          }`}
        >
          <button
            type="button"
            onClick={() => handleSelect('indicadores')}
            title="Monitoreo de indicadores — Curso de Vida Adulto"
            className="flex items-center gap-2.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F07832] rounded-xl cursor-pointer min-w-0"
          >
            <div
              className={`flex items-center justify-center shrink-0 transition-transform hover:scale-105 ${
                collapsed ? 'w-14 h-11' : 'w-18 h-12'
              } bg-white/95 rounded-xl p-1`}
              style={{ filter: 'drop-shadow(0 6px 12px rgba(0,0,0,0.35))' }}
            >
              <img
                src={BRAND_LOGOS.cursoVidaAdulto}
                alt="Logo Oficial Curso de Vida Adulto"
                className="w-full h-full object-contain"
              />
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <p className="text-[10px] font-bold tracking-[0.08em] text-[#F07832] uppercase leading-tight whitespace-nowrap">
                  RIS SAN IGNACIO
                </p>
                <p className="text-[13.5px] font-bold text-[#F8F7F2] leading-snug whitespace-nowrap truncate">
                  Curso de Vida Adulto
                </p>
              </div>
            )}
          </button>

          {!collapsed && (
            <button
              type="button"
              onClick={onToggleCollapse}
              title="Contraer menú lateral"
              aria-label="Contraer menú lateral"
              className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors shrink-0 cursor-pointer"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          )}
        </div>

        {collapsed && (
          <div className="px-3 pt-3 flex justify-center">
            <button
              type="button"
              onClick={onToggleCollapse}
              title="Expandir menú lateral"
              aria-label="Expandir menú lateral"
              className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              <PanelLeftOpen className="w-4 h-4" />
            </button>
          </div>
        )}

        {renderNavLinks(collapsed)}
        {renderSessionFooter(collapsed)}
      </aside>

      {/* MOBILE SLIDE-OVER SIDEBAR DRAWER (< md, on demand) */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-[#102A43]/60 backdrop-blur-xs"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside
            aria-label="Menú lateral móvil"
            className="relative z-10 w-[280px] max-w-[85vw] h-full flex flex-col bg-gradient-to-b from-[#102A43] via-[#102A43] to-[#0B1F33] text-white shadow-2xl"
          >
            <div className="px-4 py-4 border-b border-white/10 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-16 h-11 bg-white/95 rounded-xl p-1 flex items-center justify-center shrink-0">
                  <img
                    src={BRAND_LOGOS.cursoVidaAdulto}
                    alt="Logo Oficial Curso de Vida Adulto"
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold tracking-[0.08em] text-[#F07832] uppercase">
                    RIS SAN IGNACIO
                  </p>
                  <p className="text-[13px] font-bold text-[#F8F7F2] truncate">
                    Curso de Vida Adulto
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onCloseMobile}
                aria-label="Cerrar menú"
                className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {renderNavLinks(false)}
            {renderSessionFooter(false)}
          </aside>
        </div>
      )}

      {/* PERMANENT MOBILE BOTTOM QUICK-NAV BAR (< md) */}
      <nav
        aria-label="Barra de navegación móvil permanente"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#102A43] border-t border-white/15 shadow-[0_-4px_20px_rgba(16,42,67,0.28)] px-1 py-1.5"
      >
        <div className="grid grid-cols-5 gap-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeModule === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelect(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`flex flex-col items-center justify-center px-1 py-1.5 rounded-xl text-[10px] transition-colors cursor-pointer min-w-0 ${
                  isActive
                    ? 'bg-[#F8F7F2] text-[#102A43] font-bold'
                    : 'text-slate-200 hover:bg-white/10 font-medium'
                }`}
              >
                <Icon
                  className={`w-4 h-4 mb-0.5 shrink-0 ${
                    isActive ? 'text-[#F07832]' : 'text-slate-300'
                  }`}
                />
                <span className="truncate max-w-full">{item.shortLabel}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
};
