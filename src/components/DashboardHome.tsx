import React from 'react';
import {
  Activity,
  ArrowRight,
  BarChart2,
  BookOpen,
  Building2,
  Calendar,
  ClipboardCheck,
  Database,
  MapPin,
  Users,
} from 'lucide-react';
import { motion } from 'motion/react';
import { MICROREDES_RIS, ModuleId, PublicManifest, PublicModuleKey } from '../types';

interface DashboardHomeProps {
  manifests: Partial<Record<PublicModuleKey, PublicManifest>>;
  onNavigate: (module: ModuleId, microredFilter?: string) => void;
}

const SHORTCUT_CARDS: {
  id: ModuleId;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  iconColor: string;
}[] = [
  {
    id: 'pacientes',
    title: 'Seguimiento por pacientes',
    description: 'Cobertura de atenciones integrales, paquetes iniciados y tamizajes.',
    icon: Users,
    iconBg: 'bg-[#123B72]/8',
    iconColor: 'text-[#123B72]',
  },
  {
    id: 'calidad',
    title: 'Control de calidad',
    description: 'Auditoría HIS, detección de observaciones y conformidad por IPRESS.',
    icon: ClipboardCheck,
    iconBg: 'bg-[#25804A]/10',
    iconColor: 'text-[#25804A]',
  },
  {
    id: 'morbilidades',
    title: 'Reporte de morbilidades',
    description: 'Análisis CIE-10 de diagnósticos frecuentes por microred y sexo.',
    icon: Activity,
    iconBg: 'bg-[#C74747]/10',
    iconColor: 'text-[#C74747]',
  },
  {
    id: 'indicadores',
    title: 'Monitoreo de indicadores',
    description: 'Avance porcentual frente a metas anuales del adulto 30–59 años.',
    icon: BarChart2,
    iconBg: 'bg-[#E7B83D]/15',
    iconColor: 'text-[#A67C0E]',
  },
  {
    id: 'cartilla',
    title: 'Cartilla de registro',
    description: 'Guías normativas HIS, códigos CPMS/CIE-10 y criterios oficiales.',
    icon: BookOpen,
    iconBg: 'bg-[#123B57]/10',
    iconColor: 'text-[#123B57]',
  },
];

function formatManifestDate(manifests: Partial<Record<PublicModuleKey, PublicManifest>>): string {
  const entries = Object.values(manifests).filter(Boolean) as PublicManifest[];
  if (entries.length === 0) return 'Sin publicaciones aún';

  let latestMs = 0;
  for (const m of entries) {
    const ts = m.updatedAt as { toDate?: () => Date } | string | undefined;
    let ms = 0;
    if (ts && typeof ts === 'object' && typeof ts.toDate === 'function') {
      ms = ts.toDate().getTime();
    } else if (typeof ts === 'string') {
      ms = new Date(ts).getTime();
    }
    if (ms > latestMs) latestMs = ms;
  }

  if (!latestMs) return 'Sincronizado';
  return new Intl.DateTimeFormat('es-PE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(latestMs));
}

export const DashboardHome: React.FC<DashboardHomeProps> = ({ manifests, onNavigate }) => {
  const manifestList = Object.values(manifests).filter(Boolean) as PublicManifest[];
  const totalRecords = manifestList.reduce((sum, m) => sum + (m.rowCount || 0), 0);
  const maxEstablishments = manifestList.reduce(
    (max, m) => Math.max(max, m.establishmentCount || 0),
    0
  );
  const lastUpdatedLabel = formatManifestDate(manifests);

  return (
    <div className="space-y-6">
      {/* Hero Split Card — Exact replica of screenshot */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_4px_rgba(15,23,42,0.04)] overflow-hidden grid grid-cols-1 lg:grid-cols-12 items-stretch"
      >
        <div className="lg:col-span-7 p-6 sm:p-8 lg:p-9 flex flex-col justify-center">
          <p className="text-[11px] sm:text-[11.5px] font-bold tracking-[0.06em] text-[#25804A] uppercase mb-2.5">
            RED INTEGRADA DE SALUD SAN IGNACIO · CAJAMARCA, PERÚ
          </p>
          <h1 className="font-display text-[28px] sm:text-[32px] lg:text-[34px] font-extrabold tracking-tight text-[#123B72] leading-[1.15] mb-3.5 text-balance">
            CURSO DE VIDA ADULTO
          </h1>
          <p className="text-[14.5px] sm:text-[15px] text-slate-600 leading-relaxed max-w-2xl mb-6">
            Plataforma Virtual de la Red Integrada de Salud San Ignacio para centralizar el
            seguimiento, control de calidad HIS, análisis de morbilidades y monitoreo de indicadores
            del adulto de 30 a 59 años en nuestras siete microredes.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => onNavigate('indicadores')}
              className="inline-flex items-center gap-2 bg-[#123B72] hover:bg-[#0e2f5c] text-white font-semibold text-[13.5px] px-5 py-2.5 rounded-xl transition-all shadow-xs whitespace-nowrap cursor-pointer"
            >
              <span>Ver Monitoreo de Indicadores</span>
              <ArrowRight className="w-4 h-4 shrink-0" />
            </button>
            <button
              type="button"
              onClick={() => onNavigate('cartilla')}
              className="inline-flex items-center gap-2 bg-[#F8FAFC] hover:bg-slate-100 border border-slate-200 text-[#123B57] font-semibold text-[13.5px] px-5 py-2.5 rounded-xl transition-all whitespace-nowrap cursor-pointer"
            >
              <span>Consultar Cartilla HIS</span>
            </button>
          </div>
        </div>

        <div className="lg:col-span-5 relative min-h-[220px] sm:min-h-[260px] lg:min-h-[300px] bg-[#0F375D]">
          <img
            src="/assets/aistudio/hero_san_ignacio_1795206827021_3c726a5e.jpg"
            alt="Centro de Salud Comunitario en las montañas de San Ignacio, Cajamarca"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
          />
          <div
            className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-slate-950/15 to-transparent"
            aria-hidden="true"
          />
          <div className="absolute bottom-4 left-5 right-5">
            <p className="text-white font-semibold text-[14px] drop-shadow-sm">
              “Juntos por el Cuidado Integral”
            </p>
          </div>
        </div>
      </motion.section>

      {/* 4-Column KPI Strip — Exact match to screenshot */}
      <section
        aria-label="Resumen de indicadores de plataforma"
        className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4"
      >
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-[0_1px_3px_rgba(15,23,42,0.03)] flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13px] font-medium text-slate-500">Registros disponibles</span>
            <Database className="w-[18px] h-[18px] text-[#123B72] shrink-0" />
          </div>
          <div className="mt-2.5">
            <p className="font-mono-tabular text-[26px] font-bold text-[#123B57] leading-none">
              {totalRecords.toLocaleString('es-PE')}
            </p>
            <p className="text-[12px] text-slate-500 mt-2">
              {totalRecords > 0
                ? `${manifestList.length} módulo(s) sincronizados`
                : 'Pendiente de sincronización inicial'}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-[0_1px_3px_rgba(15,23,42,0.03)] flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13px] font-medium text-slate-500">
              Total de establecimientos
            </span>
            <Building2 className="w-[18px] h-[18px] text-[#25804A] shrink-0" />
          </div>
          <div className="mt-2.5">
            <p className="font-mono-tabular text-[26px] font-bold text-[#123B57] leading-none">
              {maxEstablishments.toLocaleString('es-PE')}
            </p>
            <p className="text-[12px] text-slate-500 mt-2">IPRESS con registros en plataforma</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-[0_1px_3px_rgba(15,23,42,0.03)] flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13px] font-medium text-slate-500">Total de microredes</span>
            <MapPin className="w-[18px] h-[18px] text-[#123B72] shrink-0" />
          </div>
          <div className="mt-2.5">
            <p className="leading-none">
              <span className="font-mono-tabular text-[26px] font-bold text-[#123B57]">7</span>
              <span className="font-mono-tabular text-[13px] text-slate-500 ml-1.5">+ externos</span>
            </p>
            <p className="text-[12px] text-slate-500 mt-2 leading-snug">
              Huarango, San José, La Coipa, Tamborapa, San Ignacio, Chirinos y Namballe
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-[0_1px_3px_rgba(15,23,42,0.03)] flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13px] font-medium text-slate-500">Última actualización</span>
            <Calendar className="w-[18px] h-[18px] text-[#E7B83D] shrink-0" />
          </div>
          <div className="mt-2.5">
            <p className="font-mono-tabular text-[20px] font-bold text-[#123B57] leading-tight">
              {lastUpdatedLabel}
            </p>
            <p className="text-[12px] text-slate-500 mt-2">
              Carga manual aproximada cada dos días
            </p>
          </div>
        </div>
      </section>

      {/* Operational Module Shortcuts — Exact match to screenshot bottom section */}
      <section aria-labelledby="shortcuts-heading" className="pt-1">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3.5">
          <h2 id="shortcuts-heading" className="font-display text-[17px] font-bold text-[#123B57]">
            Accesos directos a módulos operativos
          </h2>
          <p className="text-[12.5px] text-slate-500">Seleccione un módulo para consultar</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {SHORTCUT_CARDS.map((card) => {
            const Icon = card.icon;
            return (
              <button
                key={card.id}
                type="button"
                onClick={() => onNavigate(card.id)}
                className="group bg-white hover:bg-[#FCFBF9] rounded-2xl border border-slate-200/80 hover:border-[#123B72]/35 p-5 text-left transition-all duration-150 shadow-[0_1px_3px_rgba(15,23,42,0.03)] hover:shadow-md flex flex-col justify-between cursor-pointer"
              >
                <div>
                  <div
                    className={`w-10 h-10 rounded-xl ${card.iconBg} ${card.iconColor} flex items-center justify-center mb-4 transition-transform duration-150 group-hover:scale-105`}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <h3 className="font-display text-[14.5px] font-bold text-[#123B57] group-hover:text-[#123B72] leading-snug mb-1.5">
                    {card.title}
                  </h3>
                  <p className="text-[12.5px] text-slate-500 leading-relaxed">{card.description}</p>
                </div>
                <span className="mt-4 inline-flex items-center gap-1 text-[12px] font-semibold text-[#123B72] opacity-80 group-hover:opacity-100">
                  <span>Abrir módulo</span>
                  <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Territorial Coverage Strip for the 7 Microredes */}
      <section className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-[0_1px_3px_rgba(15,23,42,0.03)]">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div>
            <h2 className="font-display text-[15.5px] font-bold text-[#123B57]">
              Cobertura Territorial · Siete Microredes de San Ignacio
            </h2>
            <p className="text-[12.5px] text-slate-500 mt-0.5">
              Seleccione una microred para consultar directamente su monitoreo de indicadores
            </p>
          </div>
          <span className="text-[12px] font-medium text-[#25804A]">
            Población objetivo: Adultos de 30 a 59 años
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
          {MICROREDES_RIS.map((mr) => (
            <button
              key={mr}
              type="button"
              onClick={() => onNavigate('indicadores', mr)}
              className="px-3 py-2.5 rounded-xl bg-[#F5F3EE]/80 hover:bg-[#123B72] hover:text-white border border-slate-200/80 text-left transition-colors group cursor-pointer"
            >
              <p className="text-[11px] font-medium text-slate-500 group-hover:text-slate-200">
                Microred
              </p>
              <p className="text-[13px] font-bold text-[#123B57] group-hover:text-white truncate mt-0.5">
                {mr}
              </p>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
};
