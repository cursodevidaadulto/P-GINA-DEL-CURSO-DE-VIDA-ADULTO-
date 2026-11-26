import React from 'react';
import { Clock, LogIn, Menu, ShieldCheck } from 'lucide-react';
import {
  AdminSessionState,
  BRAND_LOGOS,
  INSTITUTIONAL_LINKS,
  ModuleId,
  PlatformStatusInfo,
  UserProfile,
} from '../types';

interface TopBarProps {
  activeModule: ModuleId;
  user: UserProfile | null;
  adminSession: AdminSessionState;
  platformStatus: PlatformStatusInfo | null;
  isPublishing?: boolean;
  onOpenMobileMenu: () => void;
  onOpenAuth: () => void;
}

const MODULE_TITLES: Record<ModuleId, string> = {
  indicadores: 'Monitoreo de indicadores',
  pacientes: 'Seguimiento',
  calidad: 'Control de calidad',
  morbilidades: 'Morbilidad',
  admin: 'Administración',
};

function formatServerDateTime(iso?: string): string {
  if (!iso) return 'Sin publicaciones registradas';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const datePart = d.toLocaleDateString('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const timePart = d.toLocaleTimeString('es-PE', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
  return `${datePart} – ${timePart}`;
}

function resolveStatusBadge(
  platformStatus: PlatformStatusInfo | null,
  isPublishing?: boolean
): {
  label: string;
  dotClass: string;
  badgeClass: string;
} {
  if (isPublishing || platformStatus?.status === 'PUBLICANDO' || platformStatus?.status === 'SINCRONIZANDO') {
    return {
      label: 'Publicación en proceso',
      dotClass: 'bg-[#F07832] animate-pulse',
      badgeClass: 'bg-[#F07832]/12 text-[#B84F14] border-[#F07832]/35',
    };
  }
  if (platformStatus?.status === 'ERROR') {
    return {
      label: 'Error de publicación',
      dotClass: 'bg-red-600',
      badgeClass: 'bg-red-50 text-red-700 border-red-200',
    };
  }
  if (platformStatus?.status === 'CON_OBSERVACIONES') {
    return {
      label: 'Publicación con observaciones',
      dotClass: 'bg-[#F07832]',
      badgeClass: 'bg-[#F07832]/12 text-[#B84F14] border-[#F07832]/35',
    };
  }
  if (platformStatus?.status === 'COMPLETADO' && platformStatus.lastUpdatedAt) {
    return {
      label: 'Información actualizada',
      dotClass: 'bg-emerald-500',
      badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    };
  }
  return {
    label: 'Sin información publicada',
    dotClass: 'bg-slate-400',
    badgeClass: 'bg-slate-100 text-slate-600 border-slate-200',
  };
}

export const TopBar: React.FC<TopBarProps> = ({
  activeModule,
  user,
  adminSession,
  platformStatus,
  isPublishing,
  onOpenMobileMenu,
  onOpenAuth,
}) => {
  const statusInfo = resolveStatusBadge(platformStatus, isPublishing);

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-[#102A43]/12 shrink-0">
      {/* Row 1: Institutional Identity + Active Module + Auth */}
      <div className="px-3 sm:px-6 lg:px-8 py-2.5 flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0">
          {/* Mobile menu drawer button */}
          <button
            type="button"
            onClick={onOpenMobileMenu}
            aria-label="Abrir menú lateral"
            className="md:hidden p-2 rounded-xl bg-[#F8F7F2] border border-[#102A43]/15 text-[#102A43] hover:bg-white shrink-0 cursor-pointer"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* 3D Institutional Logos without box contours */}
          <div className="flex items-center gap-2.5 shrink-0 pr-2.5 border-r border-[#102A43]/12">
            <a
              href={INSTITUTIONAL_LINKS.risUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Red Integrada de Salud San Ignacio — Sitio Oficial"
              className="flex items-center justify-center transition-transform duration-200 hover:scale-105"
              style={{
                filter:
                  'drop-shadow(0 5px 8px rgba(16,42,67,0.26)) drop-shadow(0 2px 3px rgba(16,42,67,0.14))',
              }}
            >
              <img
                src={BRAND_LOGOS.ris}
                alt="Red de Salud San Ignacio"
                className="h-9 w-9 sm:h-11 sm:w-11 object-contain"
              />
            </a>

            <a
              href={INSTITUTIONAL_LINKS.oiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Oficina de Estadística e Informática (OITE)"
              className="hidden sm:flex items-center justify-center transition-transform duration-200 hover:scale-105"
              style={{
                filter:
                  'drop-shadow(0 5px 8px rgba(16,42,67,0.24)) drop-shadow(0 2px 3px rgba(16,42,67,0.12))',
              }}
            >
              <img
                src={BRAND_LOGOS.oite}
                alt="Oficina de Estadística e Informática OITE"
                className="h-8 sm:h-9 w-auto object-contain"
              />
            </a>
          </div>

          <div className="min-w-0">
            <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5">
              <span className="font-display text-[13.5px] sm:text-[15.5px] font-extrabold tracking-tight text-[#102A43] whitespace-nowrap">
                CURSO DE VIDA ADULTO
              </span>
              <span className="text-[#102A43]/25 font-light select-none" aria-hidden="true">
                /
              </span>
              <span className="font-display text-[12.5px] sm:text-[14.5px] font-bold text-[#F07832] truncate">
                {MODULE_TITLES[activeModule]}
              </span>
            </div>
            <p className="hidden sm:block text-[11px] text-[#102A43]/70 truncate mt-0.5">
              Red Integrada de Salud San Ignacio · Juntos por el Cuidado Integral
            </p>
          </div>
        </div>

        {/* Right: Access button ONLY (No manual refresh/update buttons in query bar) */}
        <div className="flex items-center gap-2 shrink-0 no-print">
          <button
            type="button"
            onClick={onOpenAuth}
            className="inline-flex items-center gap-2 bg-[#102A43] hover:bg-[#183B5E] text-white font-semibold text-[12.5px] px-3.5 sm:px-4 py-2 rounded-xl transition-colors shadow-xs whitespace-nowrap shrink-0 cursor-pointer"
          >
            {adminSession.authenticated ? (
              <>
                <ShieldCheck className="w-4 h-4 shrink-0 text-[#F07832]" />
                <span>Admin {adminSession.username}</span>
              </>
            ) : user ? (
              <>
                <ShieldCheck className="w-4 h-4 shrink-0 text-[#F07832]" />
                <span className="max-w-[110px] truncate">{user.displayName.split(' ')[0]}</span>
              </>
            ) : (
              <>
                <LogIn className="w-4 h-4 shrink-0 text-[#F07832]" />
                <span>Ingresar</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Row 2: Permanent Institutional Update Status Bar (Visible in ALL modules & devices) */}
      <div
        role="status"
        aria-live="polite"
        className="bg-[#F8F7F2] border-t border-[#102A43]/10 px-3 sm:px-6 lg:px-8 py-1.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[11.5px] sm:text-[12px]"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Clock className="w-3.5 h-3.5 text-[#102A43]/70 shrink-0" />
          <span className="font-bold tracking-wide text-[#102A43]/75 uppercase whitespace-nowrap">
            ÚLTIMA ACTUALIZACIÓN:
          </span>
          <span className="font-mono-tabular font-bold text-[#102A43] truncate">
            {formatServerDateTime(platformStatus?.lastUpdatedAt)}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="hidden sm:inline font-bold tracking-wide text-[#102A43]/70 uppercase">
            ESTADO DE LA INFORMACIÓN:
          </span>
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border font-semibold text-[11px] sm:text-[11.5px] ${statusInfo.badgeClass}`}
          >
            <span className={`w-2 h-2 rounded-full shrink-0 ${statusInfo.dotClass}`} />
            <span>{statusInfo.label}</span>
          </span>
        </div>
      </div>
    </header>
  );
};
