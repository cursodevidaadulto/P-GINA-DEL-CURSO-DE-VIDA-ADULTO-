import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { BRAND_LOGOS } from '../types';

export interface PdfReportOptions {
  fileName: string;
  moduleName: string;
  subtitle?: string;
  period: string;
  appliedFilters: string;
  dataSource: string;
  orientation?: 'portrait' | 'landscape';
  kpis?: { label: string; value: string }[];
  narrativeTitle?: string;
  narrativeParagraphs?: string[];
  sections: {
    title: string;
    columns: string[];
    rows: (string | number)[][];
  }[];
}

async function loadImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function exportInstitutionalPdf(options: PdfReportOptions): Promise<void> {
  const orientation = options.orientation || 'landscape';
  const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;

  const [logoRis, logoCurso, logoOite] = await Promise.all([
    loadImageAsDataUrl(BRAND_LOGOS.ris),
    loadImageAsDataUrl(BRAND_LOGOS.cursoVidaAdulto),
    loadImageAsDataUrl(BRAND_LOGOS.oite),
  ]);

  const generatedAt = new Date().toLocaleString('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  // Header band
  doc.setFillColor(16, 42, 67); // Zafiro Profundo #102A43
  doc.rect(0, 0, pageWidth, 24, 'F');
  doc.setFillColor(240, 120, 50); // Naranja Brasa #F07832
  doc.rect(0, 24, pageWidth, 1.5, 'F');

  if (logoRis) {
    doc.addImage(logoRis, 'PNG', margin, 4, 16, 16);
  }
  if (logoCurso) {
    doc.setFillColor(248, 247, 242);
    doc.roundedRect(margin + 19, 3.5, 34, 17, 2, 2, 'F');
    doc.addImage(logoCurso, 'PNG', margin + 20.5, 5, 31, 14);
  }
  if (logoOite) {
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(pageWidth - margin - 34, 4, 34, 16, 2, 2, 'F');
    doc.addImage(logoOite, 'PNG', pageWidth - margin - 32.5, 5.2, 31, 13.5);
  }

  const textStartX = margin + 57;
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('RED INTEGRADA DE SALUD SAN IGNACIO · CURSO DE VIDA ADULTO', textStartX, 10.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(240, 190, 150);
  doc.text(options.moduleName.toUpperCase(), textStartX, 16.5);

  if (options.subtitle) {
    doc.setFontSize(8);
    doc.setTextColor(225, 232, 240);
    doc.text(options.subtitle.slice(0, 110), textStartX, 21.2);
  }

  // Metadata Box
  let cursorY = 30;
  doc.setFillColor(248, 247, 242);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin, cursorY, pageWidth - margin * 2, 16, 2, 2, 'FD');

  doc.setTextColor(16, 42, 67);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text(`Fecha de generación:`, margin + 3, cursorY + 5);
  doc.setFont('helvetica', 'normal');
  doc.text(generatedAt, margin + 35, cursorY + 5);

  doc.setFont('helvetica', 'bold');
  doc.text(`Periodo consultado:`, margin + 92, cursorY + 5);
  doc.setFont('helvetica', 'normal');
  doc.text(options.period.slice(0, 36), margin + 123, cursorY + 5);

  doc.setFont('helvetica', 'bold');
  doc.text(`Fuente:`, margin + 175, cursorY + 5);
  doc.setFont('helvetica', 'normal');
  doc.text(options.dataSource.slice(0, 48), margin + 188, cursorY + 5);

  doc.setFont('helvetica', 'bold');
  doc.text(`Filtros aplicados:`, margin + 3, cursorY + 11.5);
  doc.setFont('helvetica', 'normal');
  doc.text(options.appliedFilters.slice(0, 145), margin + 31, cursorY + 11.5);

  cursorY += 21;

  // Optional KPI Strip
  if (options.kpis && options.kpis.length > 0) {
    const kpiCount = Math.min(4, options.kpis.length);
    const gap = 3;
    const cardW = (pageWidth - margin * 2 - gap * (kpiCount - 1)) / kpiCount;

    options.kpis.slice(0, 4).forEach((kpi, idx) => {
      const x = margin + idx * (cardW + gap);
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(203, 213, 225);
      doc.roundedRect(x, cursorY, cardW, 14, 1.5, 1.5, 'FD');

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(71, 85, 105);
      doc.text(kpi.label.slice(0, 34), x + 3, cursorY + 5);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(16, 42, 67);
      doc.text(String(kpi.value).slice(0, 24), x + 3, cursorY + 11.2);
    });
    cursorY += 18;
  }

  // Optional Executive Statistical Analysis Narrative
  if (options.narrativeParagraphs && options.narrativeParagraphs.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(16, 42, 67);
    doc.text(options.narrativeTitle || 'ANÁLISIS EJECUTIVO DE RESULTADOS', margin, cursorY + 3);
    cursorY += 6;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.2);
    doc.setTextColor(30, 41, 59);
    for (const para of options.narrativeParagraphs) {
      const lines = doc.splitTextToSize(`• ${para}`, pageWidth - margin * 2 - 4);
      if (cursorY + lines.length * 4 > pageHeight - 20) {
        doc.addPage();
        cursorY = 16;
      }
      doc.text(lines, margin + 2, cursorY);
      cursorY += lines.length * 4 + 1.5;
    }
    cursorY += 3;
  }

  // Data Sections (AutoTable)
  for (const section of options.sections) {
    if (cursorY > pageHeight - 28) {
      doc.addPage();
      cursorY = 16;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(16, 42, 67);
    doc.text(section.title, margin, cursorY + 3);
    cursorY += 5;

    autoTable(doc, {
      startY: cursorY,
      head: [section.columns],
      body: section.rows.map((r) => r.map((c) => String(c ?? '—'))),
      margin: { left: margin, right: margin, bottom: 16 },
      styles: {
        font: 'helvetica',
        fontSize: 7.2,
        cellPadding: 1.8,
        textColor: [16, 42, 67],
        lineColor: [226, 232, 240],
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: [16, 42, 67],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      alternateRowStyles: {
        fillColor: [248, 247, 242],
      },
    });

    const finalY = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY;
    cursorY = (finalY || cursorY) + 8;
  }

  // Footer with page numbering across all pages
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, pageHeight - 10, pageWidth - margin, pageHeight - 10);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      'Plataforma Virtual Curso de Vida Adulto · Red Integrada de Salud San Ignacio — Juntos por el Cuidado Integral',
      margin,
      pageHeight - 6
    );
    doc.text(`Página ${i} de ${totalPages}`, pageWidth - margin, pageHeight - 6, {
      align: 'right',
    });
  }

  doc.save(`${options.fileName}.pdf`);
}

export function printInstitutionalReport(): void {
  window.print();
}
