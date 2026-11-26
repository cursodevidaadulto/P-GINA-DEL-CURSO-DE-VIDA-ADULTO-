import React, { useMemo, useState } from 'react';
import { BookOpen, Check, Copy, ExternalLink, FileText, Search, X } from 'lucide-react';
import { BUILT_IN_CARTILLA_RESOURCES } from '../data/cartillaNormativa';
import { exportRowsToExcel } from '../services/excelAnalyzers';
import { exportInstitutionalPdf, printInstitutionalReport } from '../services/pdfExportService';
import {
  CartillaResource,
  CartillaTopic,
  ContentDocumentItem,
  DriveDocumentItem,
} from '../types';
import { ExportToolbar } from './ExportToolbar';
import { ModuleDrivePanel } from './ModuleDrivePanel';

interface CartillaModuleProps {
  firestoreResources: CartillaResource[];
  driveFiles: DriveDocumentItem[];
  manualDocs: ContentDocumentItem[];
  onPreviewFile: (file: DriveDocumentItem) => void;
}

const TOPICS: ('Todos' | CartillaTopic)[] = [
  'Todos',
  'Códigos HIS',
  'Ejemplos de registros correctos',
  'Laboratorios',
  'Procedimientos',
  'Diagnósticos',
  'Errores frecuentes',
  'Criterios de registro',
  'Recomendaciones de indicadores',
];

export const CartillaModule: React.FC<CartillaModuleProps> = ({
  firestoreResources,
  driveFiles,
  manualDocs,
  onPreviewFile,
}) => {
  const [selectedTopic, setSelectedTopic] = useState<'Todos' | CartillaTopic>('Todos');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeGuide, setActiveGuide] = useState<CartillaResource | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);

  const allResources = useMemo(() => {
    const customIds = new Set(firestoreResources.map((r) => r.resourceId));
    return [
      ...firestoreResources,
      ...BUILT_IN_CARTILLA_RESOURCES.filter((b) => !customIds.has(b.resourceId)),
    ];
  }, [firestoreResources]);

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return allResources.filter((res) => {
      const matchTopic = selectedTopic === 'Todos' || res.topic === selectedTopic;
      const codes = (res.hisCodes || []).join(' ').toLowerCase();
      const matchQ =
        !q ||
        res.title.toLowerCase().includes(q) ||
        res.summary.toLowerCase().includes(q) ||
        res.content.toLowerCase().includes(q) ||
        codes.includes(q);
      return matchTopic && matchQ;
    });
  }, [allResources, selectedTopic, searchTerm]);

  const handleCopyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 1500);
    } catch {
      // Clipboard fallback ignored
    }
  };

  const handleExportExcel = () => {
    exportRowsToExcel(
      filtered.map((r) => ({
        Tema: r.topic,
        Tipo: r.resourceType,
        Titulo: r.title,
        Codigos_HIS: (r.hisCodes || []).join(', '),
        Resumen: r.summary,
        Criterio_Normativo: r.content,
      })),
      'RIS_San_Ignacio_Cartilla_HIS_Adulto',
      'Cartilla HIS',
      {
        modulo: 'Cartilla Digital de Registro HIS · Adulto (30–59 años)',
        periodo: 'Normativa Vigente',
        filtros: `Categoría: ${selectedTopic}${searchTerm ? ` · Búsqueda: ${searchTerm}` : ''}`,
        fuente: 'Normativa HIS MINSA / RIS San Ignacio',
      }
    );
  };

  const handleExportPdf = async () => {
    setExportingPdf(true);
    try {
      await exportInstitutionalPdf({
        fileName: 'RIS_San_Ignacio_Cartilla_HIS_Adulto',
        moduleName: 'Cartilla Digital de Registro HIS · Adulto (30–59 años)',
        subtitle: 'Guía oficial de códigos HIS, CIE-10, CPMS, campo LAB y criterios de calidad',
        period: 'Normativa Vigente',
        appliedFilters: `Categoría: ${selectedTopic}${searchTerm ? ` · Búsqueda: ${searchTerm}` : ''}`,
        dataSource: 'Lineamientos oficiales RIS San Ignacio',
        kpis: [
          { label: 'Guías Filtradas', value: String(filtered.length) },
          { label: 'Categoría Activa', value: selectedTopic },
        ],
        sections: [
          {
            title: 'Compendio de Criterios y Códigos HIS',
            columns: ['Categoría', 'Título', 'Códigos HIS / CPMS', 'Resumen Operativo'],
            rows: filtered.map((r) => [
              r.topic,
              r.title,
              (r.hisCodes || []).join(', ') || '—',
              r.summary,
            ]),
          },
        ],
      });
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="card-premium rounded-2xl p-5 sm:p-6">
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
          <div>
            <h1 className="font-display text-xl sm:text-2xl font-bold text-[#102A43]">
              Cartilla Digital de Registro HIS · Adulto (30–59 años)
            </h1>
            <p className="text-[13.5px] text-[#102A43]/70 mt-1">
              Guía oficial de códigos HIS, CIE-10, procedimientos CPMS, llenado de campo LAB y
              criterios de calidad para las IPRESS de la RIS San Ignacio.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="relative w-full sm:w-72 shrink-0 no-print">
              <Search className="w-4 h-4 text-[#102A43]/45 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar código (ej. C8002, 82947) o tema..."
                className="w-full pl-10 pr-4 py-2 text-[13.5px] bg-[#F8F7F2] border border-[#102A43]/15 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#F07832]/40"
              />
            </div>

            <ExportToolbar
              onExportExcel={filtered.length > 0 ? handleExportExcel : undefined}
              onExportPdf={filtered.length > 0 ? handleExportPdf : undefined}
              onPrint={printInstitutionalReport}
              loadingPdf={exportingPdf}
            />
          </div>
        </div>

        {/* Interactive Topic Filter Bar */}
        <div className="mt-5 flex items-center gap-1.5 overflow-x-auto pb-1 no-print">
          {TOPICS.map((topic) => (
            <button
              key={topic}
              type="button"
              onClick={() => setSelectedTopic(topic)}
              className={`px-3.5 py-1.5 rounded-xl text-[12.5px] font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                selectedTopic === topic
                  ? 'bg-[#102A43] text-white shadow-xs'
                  : 'bg-[#F8F7F2] text-[#102A43]/75 hover:text-[#102A43] hover:bg-[#102A43]/8'
              }`}
            >
              {topic}
            </button>
          ))}
        </div>
      </div>

      {/* Resource Grid */}
      {filtered.length === 0 ? (
        <div className="card-premium rounded-2xl p-10 text-center">
          <BookOpen className="w-10 h-10 text-[#102A43]/25 mx-auto mb-3" />
          <h2 className="font-display text-base font-bold text-[#102A43]">
            No se encontraron guías para su búsqueda
          </h2>
          <p className="text-sm text-[#102A43]/65 mt-1">
            Intente con otro código HIS o seleccione la categoría &ldquo;Todos&rdquo;.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((res) => (
            <article
              key={res.resourceId}
              className="card-premium-interactive rounded-2xl p-5 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center gap-2 text-[12px] text-[#102A43]/65 mb-2">
                  <span className="font-bold text-[#F07832]">{res.topic}</span>
                  <span aria-hidden="true">·</span>
                  <span>{res.resourceType}</span>
                </div>
                <h2 className="font-display text-[15.5px] font-bold text-[#102A43] leading-snug mb-2">
                  {res.title}
                </h2>
                <p className="text-[13px] text-[#102A43]/75 leading-relaxed mb-4">{res.summary}</p>

                {res.hisCodes && res.hisCodes.length > 0 && (
                  <p className="text-[12px] text-[#102A43]/65 font-mono-tabular mb-4">
                    Códigos: {res.hisCodes.join(' · ')}
                  </p>
                )}
              </div>

              <div className="pt-3 border-t border-[#102A43]/10 flex items-center justify-between gap-2 no-print">
                <button
                  type="button"
                  onClick={() => setActiveGuide(res)}
                  className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#102A43] hover:text-[#F07832] transition-colors cursor-pointer"
                >
                  <FileText className="w-4 h-4 text-[#F07832]" />
                  <span>Ver criterio completo</span>
                </button>
                {res.fileUrl && (
                  <a
                    href={res.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#F07832] hover:underline"
                  >
                    <span>Adjunto</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Published Normative Documents */}
      <ModuleDrivePanel
        targetModule="cartilla"
        moduleLabel="Cartilla Normativa y Capacitación"
        driveFiles={driveFiles}
        manualDocs={manualDocs}
        onPreviewFile={onPreviewFile}
      />

      {/* Detail Modal */}
      {activeGuide && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0B1F33]/65 backdrop-blur-xs no-print"
          role="dialog"
          aria-modal="true"
          aria-labelledby="guide-modal-title"
        >
          <div className="w-full max-w-2xl max-h-[88vh] bg-white rounded-2xl border border-[#102A43]/15 shadow-2xl flex flex-col overflow-hidden">
            <div className="px-6 py-4 bg-gradient-to-r from-[#102A43] to-[#183B5E] text-white flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-bold tracking-[0.06em] text-[#F07832] uppercase">
                  {activeGuide.topic} · {activeGuide.resourceType}
                </p>
                <h2 id="guide-modal-title" className="font-display text-lg font-bold mt-1">
                  {activeGuide.title}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setActiveGuide(null)}
                aria-label="Cerrar guía"
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5 bg-white">
              <p className="text-[14px] text-[#102A43]/85 leading-relaxed whitespace-pre-line">
                {activeGuide.content}
              </p>

              {activeGuide.hisCodes && activeGuide.hisCodes.length > 0 && (
                <div>
                  <h3 className="text-[12.5px] font-bold text-[#102A43] uppercase tracking-wide mb-2.5">
                    Códigos HIS / CPMS de referencia (clic para copiar)
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {activeGuide.hisCodes.map((code) => (
                      <button
                        key={code}
                        type="button"
                        onClick={() => handleCopyCode(code)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#F8F7F2] hover:bg-[#102A43] hover:text-white text-[#102A43] font-mono-tabular text-[12.5px] font-semibold border border-[#102A43]/15 transition-colors cursor-pointer"
                      >
                        <span>{code}</span>
                        {copiedCode === code ? (
                          <Check className="w-3.5 h-3.5 text-[#F07832]" />
                        ) : (
                          <Copy className="w-3.5 h-3.5 opacity-60" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {activeGuide.examples && activeGuide.examples.length > 0 && (
                <div>
                  <h3 className="text-[12.5px] font-bold text-[#102A43] uppercase tracking-wide mb-2.5">
                    Ejemplo de llenado en Ficha HIS
                  </h3>
                  <div className="border border-[#102A43]/15 rounded-xl overflow-hidden">
                    <table className="w-full text-left border-collapse text-[13px]">
                      <thead>
                        <tr className="bg-[#F8F7F2] border-b border-[#102A43]/12 text-[#102A43]/80">
                          <th className="px-3.5 py-2.5 font-semibold">Diagnóstico / Actividad</th>
                          <th className="px-3.5 py-2.5 font-semibold text-center">TD</th>
                          <th className="px-3.5 py-2.5 font-semibold text-center">LAB</th>
                          <th className="px-3.5 py-2.5 font-semibold text-right">Código</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#102A43]/8">
                        {activeGuide.examples.map((ex, i) => (
                          <tr key={i}>
                            <td className="px-3.5 py-2.5 text-[#102A43]">{ex.diagnostico}</td>
                            <td className="px-3.5 py-2.5 text-center font-mono-tabular font-bold text-[#102A43]">
                              {ex.tipo}
                            </td>
                            <td className="px-3.5 py-2.5 text-center font-mono-tabular text-[#102A43]/80">
                              {ex.lab || '—'}
                            </td>
                            <td className="px-3.5 py-2.5 text-right font-mono-tabular font-bold text-[#F07832]">
                              {ex.codigo}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-3.5 bg-[#F8F7F2] border-t border-[#102A43]/12 flex justify-end">
              <button
                type="button"
                onClick={() => setActiveGuide(null)}
                className="px-4 py-2 rounded-xl bg-[#102A43] hover:bg-[#183B5E] text-white text-[13px] font-semibold cursor-pointer"
              >
                Cerrar guía
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
