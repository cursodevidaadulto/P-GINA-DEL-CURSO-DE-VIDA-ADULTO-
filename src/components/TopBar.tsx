import React from 'react';
import { LogIn, Menu, RefreshCw, ShieldCheck } from 'lucide-react';
import { ModuleId, UserProfile } from '../types';

interface TopBarProps {
  activeModule: ModuleId;
  user: UserProfile | null;
  refreshing: boolean;
  onRefresh: () => void;
  onOpenAuth: () => void;
  onOpenMobileMenu: () => void;
}

const MODULE_TITLES: Record<ModuleId, string> = {
  inicio: 'Inicio / Panel principal',
  pacientes: 'Seguimiento por pacientes',
  calidad: 'Control de calidad',
  morbilidades: 'Reporte de morbilidades',
  indicadores: 'Monitoreo de indicadores',
  cartilla: 'Cartilla de registro',
  admin: 'Administración',
};

export const TopBar: React.FC<TopBarProps> = ({
  activeModule,
  user,
  refreshing,
  onRefresh,
  onOpenAuth,
  onOpenMobileMenu,
}) => {
  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-slate-200/80 px-4 sm:px-6 lg:px-8 py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onOpenMobileMenu}
            aria-label="Abrir menú lateral"
            className="lg:hidden p-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 shrink-0"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="min-w-0">
            <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5">
              <span className="font-display text-[15px] sm:text-[16px] font-extrabold tracking-tight text-[#123B72] whitespace-nowrap">
                CURSO DE VIDA ADULTO
              </span>
              <span className="text-slate-300 font-light select-none" aria-hidden="true">
                /
              </span>
              <span className="font-display text-[14px] sm:text-[15px] font-semibold text-[#123B57] truncate">
                {MODULE_TITLES[activeModule]}
              </span>
            </div>
            <p className="text-[12px] text-slate-500 truncate mt-0.5">
              Plataforma Virtual de la Red Integrada de Salud San Ignacio{' '}
              <span className="mx-1 text-slate-300" aria-hidden="true">
                ·
              </span>{' '}
              <span className="text-[#25804A] font-medium">Juntos por el Cuidado Integral</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-medium text-[13px] px-3.5 py-2 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 text-slate-600 ${refreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Actualizar</span>
          </button>

          <button
            type="button"
            onClick={onOpenAuth}
            className="inline-flex items-center gap-2 bg-[#123B72] hover:bg-[#0e2f5c] text-white font-semibold text-[13px] px-4 py-2 rounded-xl transition-colors shadow-xs whitespace-nowrap shrink-0 cursor-pointer"
          >
            {user ? (
              <>
                <ShieldCheck className="w-4 h-4 shrink-0 text-[#E7B83D]" />
                <span className="max-w-[130px] truncate">{user.displayName.split(' ')[0]}</span>
              </>
            ) : (
              <>
                <LogIn className="w-4 h-4 shrink-0" />
                <span>Ingresar</span>
              </>
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
