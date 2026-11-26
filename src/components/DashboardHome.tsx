import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowRight,
  BarChart2,
  BookOpen,
  Building2,
  Calendar,
  ClipboardCheck,
  Clock,
  Database,
  FileText,
  MapPin,
  Users,
} from 'lucide-react';
import { motion } from 'motion/react';
import {
  BRAND_LOGOS,
  ContentDocumentItem,
  DriveDocumentItem,
  INSTITUTIONAL_LINKS,
  MICROREDES_RIS,
  ModuleId,
  PlatformStatusInfo,
  PublicManifest,
  PublicModuleKey,
} from '../types';

interface DashboardHomeProps {
  manifests: Partial<Record<PublicModuleKey, PublicManifest>>;
  driveFiles: DriveDocumentItem[];
  manualDocs?: ContentDocumentItem[];
  heroImageUrl?: string | null;
  publishedDocsCount: number;
  platformStatus: PlatformStatusInfo | null;
  sirLastProcess?: { fecha: string; estado: string } | null;
  onNavigate: (module: ModuleId, microredFilter?: string) => void;
}

const SHORTCUT_CARDS: {
  id: ModuleId;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  accentOrange?: boolean;
}[] = [
  {
    id: 'pacientes',
    title: 'Seguimiento por pacientes',
    description: 'Cobertura de atenciones integrales, actividades realizadas y pendientes.',
    icon: Users,
  },
  {
    id: 'calidad',
    title: 'Control de calidad',
    description: 'Auditoría HIS, observaciones por IPRESS y análisis de calidad.',
    icon: ClipboardCheck,
  },
  {
    id: 'morbilidades',
    title: 'Reporte de morbilidades',
    description: 'Análisis CIE-10 de diagnósticos frecuentes por microred y sexo.',
    icon: Activity,
  },
  {
    id: 'indicadores',
    title: 'Monitoreo de indicadores',
    description: 'Tablero de mando, CMI, tendencia y metas del adulto 30–59 años.',
    icon: BarChart2,
    accentOrange: true,
  },
];

function formatDateTimeEsPe(raw: string | undefined): string {
  if (!raw) return 'Pendiente';
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return raw;
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const yyyy = dt.getFullYear();
  const hh = String(dt.getHours()).padStart(2, '0');
  const min = String(dt.getMinutes()).padStart(2, '0');
  const ss = String(dt.getSeconds()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${min}:${ss}`;
}

function getLatestTimestamp(
  manifests: Partial<Record<PublicModuleKey, PublicManifest>>,
  platformStatus: PlatformStatusInfo | null,
  sirLastProcess?: { fecha: string; estado: string } | null
): { label: string; state: string } {
  let bestMs = 0;
  let bestStr = '';

  if (platformStatus?.lastUpdatedAt) {
    const ms = new Date(platformStatus.lastUpdatedAt).getTime();
    if (!Number.isNaN(ms) && ms > bestMs) {
      bestMs = ms;
      bestStr = formatDateTimeEsPe(platformStatus.lastUpdatedAt);
    }
  }

  for (const m of Object.values(manifests).filter(Boolean) as PublicManifest[]) {
    const ts = m.updatedAt as { toDate?: () => Date } | string | undefined;
    let ms = 0;
    let iso = '';
    if (ts && typeof ts === 'object' && typeof ts.toDate === 'function') {
      const d = ts.toDate();
      ms = d.getTime();
      iso = d.toISOString();
    } else if (typeof ts === 'string') {
      ms = new Date(ts).getTime();
      iso = ts;
    }
    if (ms > bestMs) {
      bestMs = ms;
      bestStr = formatDateTimeEsPe(iso);
    }
  }

  if (!bestStr && sirLastProcess?.fecha) {
    return {
      label: formatDateTimeEsPe(sirLastProcess.fecha),
      state: sirLastProcess.estado || 'COMPLETADO',
    };
  }

  if (!bestStr) {
    return {
      label: 'Sin actualizaciones registradas',
      state: platformStatus?.status || 'PENDIENTE',
    };
  }

  return {
    label: bestStr,
    state: platformStatus?.status || 'COMPLETADO',
  };
}

export const DashboardHome: React.FC<DashboardHomeProps> = ({
  manifests,
  driveFiles,
  manualDocs = [],
  heroImageUrl,
  publishedDocsCount,
  platformStatus,
  sirLastProcess,
  onNavigate,
}) => {
  const manifestList = Object.values(manifests).filter(Boolean) as PublicManifest[];
  const totalRecords = manifestList.reduce((sum, m) => sum + (m.rowCount || 0), 0);
  const maxEstablishments = manifestList.reduce(
    (max, m) => Math.max(max, m.establishmentCount || 0),
    0
  );
  const totalDocsPublished = driveFiles.length + publishedDocsCount;
  const updateBanner = getLatestTimestamp(manifests, platformStatus, sirLastProcess);

  const driveHeroCandidate = useMemo(() => {
    const images = driveFiles.filter((f) => f.category === 'Imagen');
    if (images.length === 0) return null;
    const preferred = images.find((f) =>
      /portada|banner|hero|panel|principal|inicio|adulto|san.?ignacio/i.test(
        `${f.name} ${f.folderPath}`
      )
    );
    return preferred || images[0];
  }, [driveFiles]);

  const manualHeroCandidate = useMemo(() => {
    const images = manualDocs.filter((d) => d.published && d.category === 'Imagen' && d.storedFileName);
    if (images.length === 0) return null;
    const preferred = images.find((d) =>
      /portada|banner|hero|panel|principal|inicio/i.test(`${d.title} ${d.fileName}`)
    );
    return preferred || images[0];
  }, [manualDocs]);

  const computedHeroSrc = useMemo(() => {
    if (heroImageUrl) return heroImageUrl;
    if (driveHeroCandidate) {
      if (driveHeroCandidate.thumbnailLink) {
        return driveHeroCandidate.thumbnailLink.replace(/=s\d+/, '=s1600');
      }
      return `https://drive.google.com/thumbnail?id=${encodeURIComponent(
        driveHeroCandidate.fileId
      )}&sz=w1600`;
    }
    if (manualHeroCandidate) {
      return `/api/content/file/${encodeURIComponent(manualHeroCandidate.id)}`;
    }
    return BRAND_LOGOS.cursoVidaAdulto;
  }, [heroImageUrl, driveHeroCandidate, manualHeroCandidate]);

  const [heroSrc, setHeroSrc] = useState(computedHeroSrc);
  useEffect(() => {
    setHeroSrc(computedHeroSrc);
  }, [computedHeroSrc]);

  const isDriveOrCustomHero =
    Boolean(heroImageUrl) || Boolean(driveHeroCandidate) || Boolean(manualHeroCandidate);

  return (
    <div className="space-y-6">
      {/* Corner Institutional 3D Logos Row (Top-Left RIS & Top-Right OITE, larger, no contour) */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 px-1">
        <div className="w-full md:w-auto flex items-center justify-between gap-4">
          <a
            href={INSTITUTIONAL_LINKS.risUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Red Integrada de Salud San Ignacio — Portal Oficial"
            className="inline-flex items-center justify-center transform-gpu transition-all duration-300 hover:scale-105 hover:-translate-y-1"
            style={{
              filter:
                'drop-shadow(0 12px 18px rgba(16,42,67,0.34)) drop-shadow(0 4px 6px rgba(16,42,67,0.20))',
            }}
          >
            <img
              src={BRAND_LOGOS.ris}
              alt="Red Integrada de Salud San Ignacio"
              className="h-20 sm:h-24 w-auto object-contain select-none"
            />
          </a>

          {/* Mobile-only right corner OITE */}
          <a
            href={INSTITUTIONAL_LINKS.oiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Oficina de Estadística e Informática (OITE) — Tablero Oficial"
            className="md:hidden inline-flex items-center justify-center transform-gpu transition-all duration-300 hover:scale-105 hover:-translate-y-1"
            style={{
              filter:
                'drop-shadow(0 12px 18px rgba(16,42,67,0.32)) drop-shadow(0 4px 6px rgba(16,42,67,0.18))',
            }}
          >
            <img
              src={BRAND_LOGOS.oite}
              alt="Oficina de Estadística e Informática OITE San Ignacio"
              className="h-14 sm:h-16 w-auto object-contain select-none"
            />
          </a>
        </div>

        {/* Center Update Status Banner */}
        <div className="flex flex-col items-center gap-1.5 text-center">
          <div className="inline-flex flex-wrap items-center justify-center gap-2 px-4 py-2 rounded-xl bg-white border border-[#102A43]/12 shadow-2xs text-[12.5px] text-[#102A43]">
            <Clock className="w-4 h-4 text-[#F07832] shrink-0" />
            <span className="font-medium text-[#102A43]/75">Última actualización:</span>
            <strong className="font-mono-tabular font-bold text-[#102A43]">
              {updateBanner.label}
            </strong>
            <span className="text-[#102A43]/30" aria-hidden="true">
              ·
            </span>
            <span className="text-[#102A43]/75 font-medium">Estado:</span>
            <span
              className={`font-bold tracking-wide ${
                updateBanner.state === 'COMPLETADO' ? 'text-[#102A43]' : 'text-[#F07832]'
              }`}
            >
              {updateBanner.state}
            </span>
          </div>
          <span className="text-[12px] font-semibold text-[#102A43]/65">
            Red Integrada de Salud San Ignacio · Cajamarca, Perú
          </span>
        </div>

        {/* Desktop Top-Right Corner OITE 3D Logo */}
        <a
          href={INSTITUTIONAL_LINKS.oiteUrl}
          target="_blank"
          rel="noopener noreferrer"
          title="Oficina de Estadística e Informática (OITE) — Tablero Oficial"
          className="hidden md:inline-flex items-center justify-center transform-gpu transition-all duration-300 hover:scale-105 hover:-translate-y-1"
          style={{
            filter:
              'drop-shadow(0 12px 18px rgba(16,42,67,0.32)) drop-shadow(0 4px 6px rgba(16,42,67,0.18))',
          }}
        >
          <img
            src={BRAND_LOGOS.oite}
            alt="Oficina de Estadística e Informática OITE San Ignacio"
            className="h-16 lg:h-20 w-auto object-contain select-none"
          />
        </a>
      </div>

      {/* Hero Split Card */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="card-premium rounded-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-12 items-stretch"
      >
        <div className="lg:col-span-7 p-6 sm:p-8 lg:p-9 flex flex-col justify-center bg-white">
          <div className="flex flex-col sm:flex-row sm:items-center gap-5 mb-5">
            <img
              src={BRAND_LOGOS.cursoVidaAdulto}
              alt="Logotipo Oficial Curso de Vida Adulto RIS San Ignacio"
              className="h-24 sm:h-28 w-auto object-contain shrink-0 self-start sm:self-center transform-gpu transition-transform duration-300 hover:scale-105"
              style={{
                filter:
                  'drop-shadow(0 14px 22px rgba(16,42,67,0.24)) drop-shadow(0 4px 8px rgba(16,42,67,0.14))',
              }}
            />
            <div>
              <div className="flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-[#F07832]" aria-hidden="true" />
                <p className="text-[11px] font-bold tracking-[0.07em] text-[#F07832] uppercase">
                  RED INTEGRADA DE SALUD SAN IGNACIO
                </p>
              </div>
              <h1 className="font-display text-[26px] sm:text-[32px] font-extrabold tracking-tight text-[#102A43] leading-[1.12] mt-1">
                CURSO DE VIDA ADULTO
              </h1>
            </div>
          </div>

          <p className="text-[14.5px] sm:text-[15px] text-[#102A43]/75 leading-relaxed max-w-2xl mb-6">
            Plataforma Virtual de la Red Integrada de Salud San Ignacio para centralizar el
            monitoreo de indicadores, seguimiento nominal de pacientes, control de calidad HIS,
            análisis de morbilidades y cartilla normativa del adulto de 30 a 59 años en nuestras
            siete microredes.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => onNavigate('indicadores')}
              className="inline-flex items-center gap-2 bg-[#102A43] hover:bg-[#183B5E] text-white font-semibold text-[13.5px] px-5 py-2.5 rounded-xl transition-all shadow-sm whitespace-nowrap cursor-pointer"
            >
              <span>Ver Monitoreo de Indicadores</span>
              <ArrowRight className="w-4 h-4 text-[#F07832] shrink-0" />
            </button>
            <button
              type="button"
              onClick={() => onNavigate('calidad')}
              className="inline-flex items-center gap-2 bg-[#F07832] hover:bg-[#D96420] text-white font-semibold text-[13.5px] px-5 py-2.5 rounded-xl transition-all shadow-sm whitespace-nowrap cursor-pointer"
            >
              <ClipboardCheck className="w-4 h-4 shrink-0" />
              <span>Control de Calidad</span>
            </button>
          </div>
        </div>

        <div className="lg:col-span-5 relative min-h-[250px] sm:min-h-[290px] lg:min-h-[330px] bg-gradient-to-br from-[#F8F7F2] via-white to-[#EEF2F6] flex items-center justify-center overflow-hidden">
          <img
            src={heroSrc}
            alt={
              driveHeroCandidate?.name ||
              manualHeroCandidate?.title ||
              'Curso de Vida Adulto — Red Integrada de Salud San Ignacio'
            }
            referrerPolicy="no-referrer"
            onError={() => {
              if (heroSrc !== BRAND_LOGOS.cursoVidaAdulto) {
                setHeroSrc(BRAND_LOGOS.cursoVidaAdulto);
              }
            }}
            className={
              isDriveOrCustomHero && heroSrc !== BRAND_LOGOS.cursoVidaAdulto
                ? 'w-full h-full object-cover'
                : 'w-[92%] max-h-[290px] object-contain p-4 transform-gpu transition-transform duration-300 hover:scale-[1.03]'
            }
            style={
              heroSrc === BRAND_LOGOS.cursoVidaAdulto
                ? { filter: 'drop-shadow(0 16px 26px rgba(16,42,67,0.22))' }
                : undefined
            }
          />
          {isDriveOrCustomHero && heroSrc !== BRAND_LOGOS.cursoVidaAdulto && (
            <>
              <div
                className="absolute inset-0 bg-gradient-to-t from-[#0B1F33]/75 via-transparent to-transparent pointer-events-none"
                aria-hidden="true"
              />
              <div className="absolute bottom-4 left-5 right-5 flex items-end justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[#F07832]">
                    Red Integrada de Salud San Ignacio
                  </p>
                  <p className="text-[#F8F7F2] font-semibold text-[14.5px] drop-shadow-sm">
                    “Juntos por el Cuidado Integral”
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      </motion.section>

      {/* 4-Column KPI Strip */}
      <section
        aria-label="Resumen de indicadores de plataforma"
        className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4"
      >
        <div className="card-premium rounded-2xl p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13px] font-medium text-[#102A43]/70">Registros disponibles</span>
            <Database className="w-[18px] h-[18px] text-[#102A43] shrink-0" />
          </div>
          <div className="mt-2.5">
            <p className="font-mono-tabular text-[26px] font-bold text-[#102A43] leading-none">
              {totalRecords.toLocaleString('es-PE')}
            </p>
            <p className="text-[12px] text-[#102A43]/65 mt-2">
              {totalRecords > 0
                ? `${manifestList.length} módulo(s) con información vigente`
                : 'Pendiente de publicación inicial'}
            </p>
          </div>
        </div>

        <div className="card-premium rounded-2xl p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13px] font-medium text-[#102A43]/70">
              Documentos publicados
            </span>
            <FileText className="w-[18px] h-[18px] text-[#F07832] shrink-0" />
          </div>
          <div className="mt-2.5">
            <p className="font-mono-tabular text-[26px] font-bold text-[#102A43] leading-none">
              {totalDocsPublished.toLocaleString('es-PE')}
            </p>
            <p className="text-[12px] text-[#102A43]/65 mt-2">
              Guías normativas, anexos y reportes oficiales
            </p>
          </div>
        </div>

        <div className="card-premium rounded-2xl p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13px] font-medium text-[#102A43]/70">Total de microredes</span>
            <MapPin className="w-[18px] h-[18px] text-[#102A43] shrink-0" />
          </div>
          <div className="mt-2.5">
            <p className="leading-none">
              <span className="font-mono-tabular text-[26px] font-bold text-[#102A43]">7</span>
              <span className="font-mono-tabular text-[13px] text-[#F07832] font-semibold ml-1.5">
                + externos
              </span>
            </p>
            <p className="text-[12px] text-[#102A43]/65 mt-2 leading-snug">
              Huarango, San José, La Coipa, Tamborapa, San Ignacio, Chirinos y Namballe
            </p>
          </div>
        </div>

        <div className="card-premium rounded-2xl p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13px] font-medium text-[#102A43]/70">Establecimientos</span>
            <Calendar className="w-[18px] h-[18px] text-[#F07832] shrink-0" />
          </div>
          <div className="mt-2.5">
            <p className="font-mono-tabular text-[26px] font-bold text-[#102A43] leading-none">
              {maxEstablishments}
            </p>
            <p className="text-[12px] text-[#102A43]/65 mt-2 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-[#102A43]/50 shrink-0" />
              <span>IPRESS activas en plataforma</span>
            </p>
          </div>
        </div>
      </section>

      {/* Operational Module Shortcuts (5 clean Health Staff Modules) */}
      <section aria-labelledby="shortcuts-heading" className="pt-1">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3.5">
          <h2 id="shortcuts-heading" className="font-display text-[17px] font-bold text-[#102A43]">
            Accesos directos a módulos operativos
          </h2>
          <p className="text-[12.5px] text-[#102A43]/65">
            Seleccione un módulo para consultar reportes, indicadores y normativas
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {SHORTCUT_CARDS.map((card) => {
            const Icon = card.icon;
            return (
              <button
                key={card.id}
                type="button"
                onClick={() => onNavigate(card.id)}
                className="group card-premium-interactive rounded-2xl p-5 text-left flex flex-col justify-between cursor-pointer"
              >
                <div>
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 transition-transform duration-150 group-hover:scale-105 ${
                      card.accentOrange
                        ? 'bg-[#F07832]/15 text-[#F07832]'
                        : 'bg-[#102A43]/8 text-[#102A43]'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <h3 className="font-display text-[14.5px] font-bold text-[#102A43] leading-snug mb-1.5">
                    {card.title}
                  </h3>
                  <p className="text-[12.5px] text-[#102A43]/70 leading-relaxed">
                    {card.description}
                  </p>
                </div>
                <span className="mt-4 inline-flex items-center gap-1 text-[12px] font-semibold text-[#F07832] group-hover:text-[#D96420]">
                  <span>Abrir módulo</span>
                  <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Territorial Coverage Strip for the 7 Microredes */}
      <section className="card-premium rounded-2xl p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div>
            <h2 className="font-display text-[15.5px] font-bold text-[#102A43]">
              Cobertura Territorial · Siete Microredes de San Ignacio
            </h2>
            <p className="text-[12.5px] text-[#102A43]/70 mt-0.5">
              Seleccione una microred para consultar directamente su monitoreo de indicadores
            </p>
          </div>
          <span className="text-[12px] font-semibold text-[#F07832]">
            Población objetivo: Adultos de 30 a 59 años
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
          {MICROREDES_RIS.map((mr) => (
            <button
              key={mr}
              type="button"
              onClick={() => onNavigate('indicadores', mr)}
              className="px-3.5 py-2.5 rounded-xl bg-[#F8F7F2] hover:bg-[#102A43] border border-[#102A43]/12 text-left transition-colors group cursor-pointer"
            >
              <p className="text-[11px] font-medium text-[#102A43]/60 group-hover:text-[#F07832]">
                Microred
              </p>
              <p className="text-[13px] font-bold text-[#102A43] group-hover:text-white truncate mt-0.5">
                {mr}
              </p>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
};
