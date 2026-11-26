import React, { useEffect, useState } from 'react';
import {
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Loader2,
  Presentation,
  X,
} from 'lucide-react';
import { fetchDriveFileBlob, getDriveEmbedPreviewUrl } from '../services/googleDriveService';
import { DriveDocumentItem } from '../types';

interface DriveDocumentPreviewModalProps {
  file: DriveDocumentItem | null;
  driveAccessToken: string | null;
  onClose: () => void;
  onConnectDrive: () => void;
}

export const DriveDocumentPreviewModal: React.FC<DriveDocumentPreviewModalProps> = ({
  file,
  driveAccessToken,
  onClose,
  onConnectDrive,
}) => {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loadingBlob, setLoadingBlob] = useState(false);
  const [blobError, setBlobError] = useState<string | null>(null);

  useEffect(() => {
    if (!file) return;
    let revoked = false;
    let createdUrl: string | null = null;

    async function loadPreview() {
      if (!file) return;
      setBlobUrl(null);
      setBlobError(null);

      // Load authenticated blob directly for images, PDFs, or Docs/Slides when token exists
      const canFetchBlob =
        driveAccessToken &&
        (file.category === 'Imagen' ||
          file.category === 'PDF' ||
          file.category === 'Documento' ||
          file.category === 'Presentación');

      if (!canFetchBlob || !driveAccessToken) return;

      setLoadingBlob(true);
      try {
        const blob = await fetchDriveFileBlob(file, driveAccessToken);
        if (revoked) return;
        createdUrl = URL.createObjectURL(blob);
        setBlobUrl(createdUrl);
      } catch (err) {
        if (!revoked) {
          setBlobError(
            err instanceof Error ? err.message : 'No se pudo cargar la vista previa directa.'
          );
        }
      } finally {
        if (!revoked) setLoadingBlob(false);
      }
    }

    loadPreview();

    return () => {
      revoked = true;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [file, driveAccessToken]);

  if (!file) return null;

  const handleDownload = async () => {
    if (driveAccessToken) {
      try {
        const blob = await fetchDriveFileBlob(file, driveAccessToken);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        return;
      } catch {
        // Fallback to webViewLink
      }
    }
    window.open(file.webViewLink, '_blank', 'noopener,noreferrer');
  };

  const formatSize = (bytes: number) => {
    if (!bytes) return 'Documento en la nube';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-[#0B1F33]/70 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="drive-preview-title"
    >
      <div className="w-full max-w-5xl h-[88vh] bg-[#F8F7F2] rounded-2xl border border-[#102A43]/15 shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 bg-[#102A43] text-white flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#F07832] text-white flex items-center justify-center shrink-0 shadow-xs">
              {file.category === 'Imagen' ? (
                <ImageIcon className="w-5 h-5" />
              ) : file.category === 'Presentación' ? (
                <Presentation className="w-5 h-5" />
              ) : file.category === 'Hoja de cálculo' ? (
                <FileSpreadsheet className="w-5 h-5" />
              ) : (
                <FileText className="w-5 h-5" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#F07832]">
                {file.category} · {file.folderPath}
              </p>
              <h2 id="drive-preview-title" className="font-display text-base font-bold truncate">
                {file.name}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleDownload}
              className="inline-flex items-center gap-1.5 bg-[#F07832] hover:bg-[#D96420] text-white text-[12.5px] font-semibold px-3.5 py-2 rounded-xl transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Descargar</span>
            </button>
            <a
              href={file.webViewLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white text-[12.5px] font-semibold px-3.5 py-2 rounded-xl transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              <span className="hidden sm:inline">Abrir en Drive</span>
            </a>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar vista previa"
              className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Preview Canvas */}
        <div className="flex-1 min-h-0 bg-[#F8F7F2] p-3 sm:p-4 flex flex-col">
          {loadingBlob ? (
            <div className="flex-1 flex flex-col items-center justify-center text-[#102A43] gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-[#F07832]" />
              <p className="text-sm font-medium">Cargando documento desde Google Drive...</p>
            </div>
          ) : blobUrl && file.category === 'Imagen' ? (
            <div className="flex-1 min-h-0 flex items-center justify-center bg-white rounded-xl border border-[#102A43]/10 p-4 overflow-auto">
              <img
                src={blobUrl}
                alt={file.name}
                referrerPolicy="no-referrer"
                className="max-w-full max-h-full object-contain rounded-lg shadow-sm"
              />
            </div>
          ) : blobUrl ? (
            <iframe
              title={file.name}
              src={blobUrl}
              className="w-full flex-1 rounded-xl border border-[#102A43]/12 bg-white"
            />
          ) : (
            <div className="flex-1 flex flex-col gap-3 min-h-0">
              {!driveAccessToken && (
                <div className="bg-white border border-[#102A43]/12 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-[12.5px] text-[#102A43]/80">
                    Si el documento es privado en su organización, conecte su cuenta de Google Drive
                    para visualizarlo directamente aquí.
                  </p>
                  <button
                    type="button"
                    onClick={onConnectDrive}
                    className="px-3.5 py-1.5 rounded-lg bg-[#F07832] hover:bg-[#D96420] text-white text-[12px] font-semibold cursor-pointer whitespace-nowrap"
                  >
                    Conectar Google Drive
                  </button>
                </div>
              )}
              {blobError && (
                <div className="bg-[#F07832]/10 border border-[#F07832]/30 text-[#102A43] text-[12.5px] px-4 py-2.5 rounded-xl">
                  {blobError} Mostrando visor estándar de Google Drive.
                </div>
              )}
              <iframe
                title={file.name}
                src={getDriveEmbedPreviewUrl(file)}
                className="w-full flex-1 rounded-xl border border-[#102A43]/12 bg-white"
                allow="autoplay"
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-2.5 bg-white border-t border-[#102A43]/10 flex flex-wrap items-center justify-between gap-2 text-[12px] text-[#102A43]/70 shrink-0">
          <span>Tamaño: {formatSize(file.sizeBytes)}</span>
          <span className="font-mono-tabular">
            Modificado: {new Date(file.modifiedTime).toLocaleString('es-PE')}
          </span>
        </div>
      </div>
    </div>
  );
};
