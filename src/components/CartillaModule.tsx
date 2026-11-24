import React, { useMemo, useState } from 'react';
import { BookOpen, Check, Copy, ExternalLink, FileText, Search, X } from 'lucide-react';
import { BUILT_IN_CARTILLA_RESOURCES } from '../data/cartillaNormativa';
import { CartillaResource, CartillaTopic } from '../types';

interface CartillaModuleProps {
  firestoreResources: CartillaResource[];
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

export const CartillaModule: React.FC<CartillaModuleProps> = ({ firestoreResources }) => {
  const [selectedTopic, setSelectedTopic] = useState<'Todos' | CartillaTopic>('Todos');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeGuide, setActiveGuide] = useState<CartillaResource | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const allResources = useMemo(() => {
    const customIds = new Set(firestoreResources.map((r) => r.resourceId));
    const merged = [
      ...firestoreResources,
      ...BUILT_IN_CARTILLA_RESOURCES.filter((b) => !customIds.has(b.resourceId)),
    ];
    return merged;
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

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="font-display text-xl sm:text-2xl font-bold text-[#123B72]">
              Cartilla Digital de Registro HIS · Adulto (30–59 años)
            </h1>
            <p className="text-[13.5px] text-slate-600 mt-1">
              Guía oficial de códigos HIS, CIE-10, procedimientos CPMS, llenado de campo LAB y
              criterios de calidad para las IPRESS de la RIS San Ignacio.
            </p>
          </div>

          <div className="relative w-full lg:w-80 shrink-0">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar código (ej. C8002, 82947) o tema..."
              className="w-full pl-10 pr-4 py-2.5 text-[13.5px] bg-[#F5F3EE]/60 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#123B72]/30"
            />
          </div>
        </div>

        {/* Interactive Topic Filter Bar */}
        <div className="mt-5 flex items-center gap-1.5 overflow-x-auto pb-1">
          {TOPICS.map((topic) => (
            <button
              key={topic}
              type="button"
              onClick={() => setSelectedTopic(topic)}
              className={`px-3.5 py-1.5 rounded-xl text-[12.5px] font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                selectedTopic === topic
                  ? 'bg-[#123B72] text-white shadow-xs'
                  : 'bg-[#F5F3EE] text-slate-600 hover:text-[#123B72] hover:bg-slate-200/60'
              }`}
            >
              {topic}
            </button>
          ))}
        </div>
      </div>

      {/* Resource Grid */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-10 text-center">
          <BookOpen className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h2 className="font-display text-base font-bold text-[#123B57]">
            No se encontraron guías para su búsqueda
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Intente con otro código HIS o seleccione la categoría &ldquo;Todos&rdquo;.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((res) => (
            <article
              key={res.resourceId}
              className="bg-white rounded-2xl border border-slate-200/80 p-5 flex flex-col justify-between hover:border-[#123B72]/35 transition-all shadow-[0_1px_3px_rgba(15,23,42,0.03)]"
            >
              <div>
                <div className="flex items-center gap-2 text-[12px] text-slate-500 mb-2">
                  <span className="font-semibold text-[#25804A]">{res.topic}</span>
                  <span aria-hidden="true">·</span>
                  <span>{res.resourceType}</span>
                </div>
                <h2 className="font-display text-[15.5px] font-bold text-[#123B72] leading-snug mb-2">
                  {res.title}
                </h2>
                <p className="text-[13px] text-slate-600 leading-relaxed mb-4">{res.summary}</p>

                {res.hisCodes && res.hisCodes.length > 0 && (
                  <p className="text-[12px] text-slate-500 font-mono-tabular mb-4">
                    Códigos: {res.hisCodes.join(' · ')}
                  </p>
                )}
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setActiveGuide(res)}
                  className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#123B72] hover:text-[#0e2f5c] cursor-pointer"
                >
                  <FileText className="w-4 h-4" />
                  <span>Ver criterio completo</span>
                </button>
                {res.fileUrl && (
                  <a
                    href={res.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[12px] font-medium text-[#25804A] hover:underline"
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

      {/* Detail Modal */}
      {activeGuide && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/55 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="guide-modal-title"
        >
          <div className="w-full max-w-2xl max-h-[88vh] bg-white rounded-2xl border border-slate-200 shadow-2xl flex flex-col overflow-hidden">
            <div className="px-6 py-4 bg-[#0F375D] text-white flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-bold tracking-[0.06em] text-[#E7B83D] uppercase">
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
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5">
              <p className="text-[14px] text-slate-700 leading-relaxed whitespace-pre-line">
                {activeGuide.content}
              </p>

              {activeGuide.hisCodes && activeGuide.hisCodes.length > 0 && (
                <div>
                  <h3 className="text-[12.5px] font-bold text-[#123B57] uppercase tracking-wide mb-2.5">
                    Códigos HIS / CPMS de referencia (clic para copiar)
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {activeGuide.hisCodes.map((code) => (
                      <button
                        key={code}
                        type="button"
                        onClick={() => handleCopyCode(code)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#F5F3EE] hover:bg-[#123B72] hover:text-white text-[#123B72] font-mono-tabular text-[12.5px] font-semibold border border-slate-200 transition-colors cursor-pointer"
                      >
                        <span>{code}</span>
                        {copiedCode === code ? (
                          <Check className="w-3.5 h-3.5 text-[#25804A]" />
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
                  <h3 className="text-[12.5px] font-bold text-[#123B57] uppercase tracking-wide mb-2.5">
                    Ejemplo de llenado en Ficha HIS
                  </h3>
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-left border-collapse text-[13px]">
                      <thead>
                        <tr className="bg-[#F5F3EE] border-b border-slate-200 text-slate-600">
                          <th className="px-3.5 py-2.5 font-semibold">Diagnóstico / Actividad</th>
                          <th className="px-3.5 py-2.5 font-semibold text-center">TD</th>
                          <th className="px-3.5 py-2.5 font-semibold text-center">LAB</th>
                          <th className="px-3.5 py-2.5 font-semibold text-right">Código</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {activeGuide.examples.map((ex, i) => (
                          <tr key={i}>
                            <td className="px-3.5 py-2.5 text-slate-800">{ex.diagnostico}</td>
                            <td className="px-3.5 py-2.5 text-center font-mono-tabular font-bold text-[#123B72]">
                              {ex.tipo}
                            </td>
                            <td className="px-3.5 py-2.5 text-center font-mono-tabular text-slate-700">
                              {ex.lab || '—'}
                            </td>
                            <td className="px-3.5 py-2.5 text-right font-mono-tabular font-bold text-[#25804A]">
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

            <div className="px-6 py-3.5 bg-[#F5F3EE] border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setActiveGuide(null)}
                className="px-4 py-2 rounded-xl bg-[#123B72] hover:bg-[#0e2f5c] text-white text-[13px] font-semibold cursor-pointer"
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
