import React from 'react';
import {
  Activity,
  BarChart2,
  BookOpen,
  ClipboardCheck,
  Home,
  Lock,
  LogIn,
  LogOut,
  Settings,
  Users,
  X,
} from 'lucide-react';
import { ModuleId, UserProfile } from '../types';

interface SidebarProps {
  activeModule: ModuleId;
  onSelectModule: (module: ModuleId) => void;
  user: UserProfile | null;
  onOpenAuth: () => void;
  onSignOut: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const NAV_ITEMS: {
  id: ModuleId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  adminLock?: boolean;
}[] = [
  { id: 'inicio', label: 'Inicio / Panel principal', icon: Home },
  { id: 'pacientes', label: 'Seguimiento por pacientes', icon: Users },
  { id: 'calidad', label: 'Control de calidad', icon: ClipboardCheck },
  { id: 'morbilidades', label: 'Reporte de morbilidades', icon: Activity },
  { id: 'indicadores', label: 'Monitoreo de indicadores', icon: BarChart2 },
  { id: 'cartilla', label: 'Cartilla de registro', icon: BookOpen },
  { id: 'admin', label: 'Administración', icon: Settings, adminLock: true },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeModule,
  onSelectModule,
  user,
  onOpenAuth,
  onSignOut,
  mobileOpen,
  onCloseMobile,
}) => {
  const isAdmin = user?.role === 'admin';

  const sidebarContent = (
    <aside className="w-[252px] h-full bg-[#0F375D] text-white flex flex-col shrink-0 select-none">
      {/* Brand Lockup */}
      <div className="px-4 py-4 border-b border-white/10 flex items-center justify-between gap-2.5">
        <button
          type="button"
          onClick={() => {
            onSelectModule('inicio');
            onCloseMobile();
          }}
          className="flex items-center gap-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E7B83D] rounded-lg"
        >
          <div className="w-9 h-9 rounded-lg bg-white p-0.5 flex items-center justify-center shrink-0 shadow-sm overflow-hidden">
            <img
              src="/assets/aistudio/emblem_ris_san_ignacio_1795206825601_f641f244.jpg"
              alt="Emblema RIS San Ignacio"
              referrerPolicy="no-referrer"
              className="w-full h-full object-contain"
            />
          </div>
          <div className="min-w-0">
            <p className="text-[10.5px] font-bold tracking-[0.08em] text-[#E7B83D] uppercase leading-tight whitespace-nowrap">
              RIS SAN IGNACIO
            </p>
            <p className="text-[14.5px] font-bold text-white leading-snug whitespace-nowrap">
              Curso de Vida Adulto
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Cerrar menú"
          className="lg:hidden p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Navigation Links */}
      <nav aria-label="Navegación principal" className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeModule === item.id;
          const showLock = item.adminLock && !isAdmin;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onSelectModule(item.id);
                onCloseMobile();
              }}
              className={`w-full flex items-center justify-between gap-2.5 px-3.5 py-2.5 rounded-xl text-[13.5px] transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E7B83D] ${
                isActive
                  ? 'bg-[#F5F3EE] text-[#123B72] font-semibold shadow-sm'
                  : 'text-slate-100/90 font-medium hover:bg-white/10 hover:text-white'
              }`}
            >
              <span className="flex items-center gap-3 min-w-0">
                <Icon
                  className={`w-[17px] h-[17px] shrink-0 ${
                    isActive ? 'text-[#123B72]' : 'text-slate-300'
                  }`}
                />
                <span className="truncate whitespace-nowrap">{item.label}</span>
              </span>
              {showLock && (
                <Lock
                  className={`w-3.5 h-3.5 shrink-0 ${
                    isActive ? 'text-[#123B72]/70' : 'text-slate-300/70'
                  }`}
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom Auth / Institutional Footer */}
      <div className="bg-[#0C2F50] border-t border-white/10 p-4 space-y-3">
        {!user ? (
          <>
            <p className="text-[11.5px] leading-relaxed text-slate-200/85">
              Acceso libre a indicadores, morbilidades, pacientes y cartilla. Inicie sesión para
              detalle de calidad o administración.
            </p>
            <button
              type="button"
              onClick={onOpenAuth}
              className="w-full flex items-center justify-center gap-2 bg-[#25804A] hover:bg-[#1f6d3f] text-white font-semibold text-[13px] py-2.5 px-3 rounded-xl transition-colors shadow-sm whitespace-nowrap cursor-pointer"
            >
              <LogIn className="w-4 h-4 shrink-0" />
              <span>Iniciar sesión institucional</span>
            </button>
          </>
        ) : (
          <div className="space-y-2.5">
            <div className="px-2.5 py-2 rounded-xl bg-white/8 border border-white/10">
              <p className="text-[12.5px] font-semibold text-white truncate">
                {user.displayName}
              </p>
              <p className="text-[11px] text-[#E7B83D] font-medium truncate">
                {user.role === 'admin'
                  ? 'Administrador RIS'
                  : user.nominalAccess
                  ? 'Consultor · Acceso Nominal'
                  : 'Consultor Institucional'}
              </p>
            </div>
            <button
              type="button"
              onClick={onSignOut}
              className="w-full flex items-center justify-center gap-2 bg-white/10 hover:bg-white/15 text-white font-medium text-[12.5px] py-2 px-3 rounded-xl transition-colors whitespace-nowrap cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5 shrink-0" />
              <span>Cerrar sesión</span>
            </button>
          </div>
        )}

        <p className="text-[11px] text-slate-300/75 text-center leading-snug pt-0.5">
          Cajamarca, Perú · Juntos por el Cuidado Integral
        </p>
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop Fixed Sidebar */}
      <div className="hidden lg:block h-screen sticky top-0 shrink-0">{sidebarContent}</div>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/55 backdrop-blur-[1px]"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative z-10 h-full shadow-2xl">{sidebarContent}</div>
        </div>
      )}
    </>
  );
};
