import React from 'react';
import { FileSpreadsheet, FileText, Printer } from 'lucide-react';

interface ExportToolbarProps {
  onExportExcel?: () => void;
  onExportPdf?: () => void | Promise<void>;
  onPrint?: () => void;
  disabledExcel?: boolean;
  disabledPdf?: boolean;
  loadingPdf?: boolean;
  excelLabel?: string;
  pdfLabel?: string;
}

export const ExportToolbar: React.FC<ExportToolbarProps> = ({
  onExportExcel,
  onExportPdf,
  onPrint,
  disabledExcel = false,
  disabledPdf = false,
  loadingPdf = false,
  excelLabel = 'EXPORTAR EXCEL',
  pdfLabel = 'EXPORTAR PDF',
}) => {
  return (
    <div className="flex flex-wrap items-center gap-2 no-print">
      {onExportExcel && (
        <button
          type="button"
          onClick={onExportExcel}
          disabled={disabledExcel}
          className="inline-flex items-center gap-1.5 bg-[#F8F7F2] hover:bg-white border border-[#102A43]/15 text-[#102A43] font-bold text-[11.5px] tracking-wide px-3.5 py-2 rounded-xl transition-colors whitespace-nowrap cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
        >
          <FileSpreadsheet className="w-3.5 h-3.5 text-[#102A43]" />
          <span>{excelLabel}</span>
        </button>
      )}

      {onExportPdf && (
        <button
          type="button"
          onClick={onExportPdf}
          disabled={disabledPdf || loadingPdf}
          className="inline-flex items-center gap-1.5 bg-[#F07832] hover:bg-[#D96420] text-white font-bold text-[11.5px] tracking-wide px-3.5 py-2 rounded-xl transition-colors shadow-xs whitespace-nowrap cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
        >
          <FileText className="w-3.5 h-3.5" />
          <span>{loadingPdf ? 'GENERANDO PDF...' : pdfLabel}</span>
        </button>
      )}

      {onPrint && (
        <button
          type="button"
          onClick={onPrint}
          className="inline-flex items-center gap-1.5 bg-[#102A43] hover:bg-[#183B5E] text-white font-bold text-[11.5px] tracking-wide px-3.5 py-2 rounded-xl transition-colors whitespace-nowrap cursor-pointer"
        >
          <Printer className="w-3.5 h-3.5 text-[#F07832]" />
          <span>IMPRIMIR REPORTE</span>
        </button>
      )}
    </div>
  );
};
