import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  Presentation,
} from 'lucide-react';
import { ContentDocumentItem, DriveDocumentItem, DriveTargetModule } from '../types';

interface ModuleDrivePanelProps {
  targetModule: DriveTargetModule;
  moduleLabel: string;
  driveFiles: DriveDocumentItem[];
  manualDocs?: ContentDocumentItem[];
  onPreviewFile: (file: DriveDocumentItem) => void;
}

export const ModuleDrivePanel: React.FC<ModuleDrivePanelProps> = ({
  targetModule,
  moduleLabel,
  driveFiles,
  manualDocs = [],
  onPreviewFile,
}) => {
  const [expanded, setExpanded] = useState(true);

  const moduleDriveDocs = driveFiles.filter(
    (f) => f.targetModule === targetModule || (targetModule === 'cartilla' && f.targetModule === 'general')
  );

  const moduleManualDocs = manualDocs.filter(
    (d) =>
      d.published &&
      (d.targetModule === targetModule || (targetModule === 'cartilla' && d.targetModule === 'general'))
  );

  const totalDocs = moduleDriveDocs.length + moduleManualDocs.length;

  const getIcon = (category: string) => {
    switch (category) {
      case 'Imagen':
        return ImageIcon;
      case 'Presentación':
        return Presentation;
      case 'Hoja de cálculo':
        return FileSpreadsheet;
      default:
        return FileText;
    }
  };

  if (totalDocs === 0) {
    return null;
  }

  return (
    <section className="card-premium rounded-2xl overflow-hidden no-print">
      <div className="px-5 py-4 bg-gradient-to-r from-[#102A43] to-[#183B5E] text-white flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#F07832] text-white flex items-center justify-center shrink-0">
            <FolderOpen className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-display text-[15px] font-bold leading-tight">
              Documentos de Consulta · {moduleLabel}
            </h2>
            <p className="text-[12px] text-slate-200/85">
              {totalDocs} documento(s) oficiales disponibles para visualización y descarga
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          aria-label={expanded ? 'Contraer documentos' : 'Expandir documentos'}
          className="p-2 rounded-xl text-white/80 hover:text-white hover:bg-white/10 cursor-pointer"
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {expanded && (
        <div className="p-4 sm:p-5 bg-[#F8F7F2]/60 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {moduleManualDocs.map((docItem) => {
            const Icon = getIcon(docItem.category);
            const fileUrl = docItem.storedFileName
              ? `/api/content/file/${encodeURIComponent(docItem.id)}`
              : undefined;

            return (
              <div
                key={docItem.id}
                className="card-premium-interactive rounded-xl p-4 flex items-start justify-between gap-3"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-[#102A43]/8 text-[#102A43] flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold text-[#F07832]">
                      {docItem.category} · {docItem.period}
                    </p>
                    <h3 className="text-[13.5px] font-bold text-[#102A43] truncate">
                      {docItem.title}
                    </h3>
                    <p className="text-[11.5px] text-[#102A43]/65 truncate mt-0.5">
                      {docItem.description || docItem.fileName}
                    </p>
                  </div>
                </div>

                {fileUrl && (
                  <a
                    href={fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#102A43] hover:bg-[#F07832] text-white text-[12px] font-semibold transition-colors shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Abrir</span>
                  </a>
                )}
              </div>
            );
          })}

          {moduleDriveDocs.map((docItem) => {
            const Icon = getIcon(docItem.category);
            return (
              <div
                key={docItem.fileId}
                className="card-premium-interactive rounded-xl p-4 flex items-start justify-between gap-3"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-[#102A43]/8 text-[#102A43] flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold text-[#F07832]">{docItem.category}</p>
                    <h3 className="text-[13.5px] font-bold text-[#102A43] truncate">
                      {docItem.name}
                    </h3>
                    <p className="text-[11.5px] text-[#102A43]/65 truncate mt-0.5">
                      {docItem.folderPath}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onPreviewFile(docItem)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#102A43] hover:bg-[#F07832] text-white text-[12px] font-semibold transition-colors shrink-0 cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Ver</span>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
