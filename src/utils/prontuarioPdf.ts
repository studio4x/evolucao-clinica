import { jsPDF } from 'jspdf';

type ProntuarioPdfOptions = {
  content: string;
  patient?: any;
  professional?: any;
  siteConfig?: any;
  documentType?: string;
  periodLabel?: string;
  logoBase64?: string | null;
};

const hexToRgb = (hex: string) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
  return result
    ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
    : null;
};

const sanitizeFileName = (value: string) => {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'Paciente';
};

export const generateProntuarioPDF = ({
  content,
  patient,
  professional,
  siteConfig,
  documentType = 'Prontuário de Evoluções Clínicas',
  periodLabel,
  logoBase64
}: ProntuarioPdfOptions) => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  const primary = hexToRgb(siteConfig?.colors?.primary || '#005C13') || { r: 0, g: 92, b: 19 };
  const appName = siteConfig?.pwa_app_name || 'Evolução Clínica';

  let headerTextX = margin;
  if (logoBase64) {
    try {
      doc.addImage(logoBase64, 'PNG', margin, 10, 40, 14, undefined, 'FAST');
      doc.setDrawColor(200, 195, 190);
      doc.setLineWidth(0.25);
      doc.line(margin + 44, 10, margin + 44, 24);
      headerTextX = margin + 48;
    } catch (error) {
      console.warn('[PDF] Não foi possível inserir o logotipo:', error);
    }
  }

  if (!logoBase64 || headerTextX === margin) {
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(primary.r, primary.g, primary.b);
    doc.text(appName, margin, 19);
    headerTextX = margin + doc.getTextWidth(appName) + 9;
  }

  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(28, 25, 22);
  doc.text('Plataforma Inteligente de Acompanhamento Terapêutico', headerTextX, 15);
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(120, 113, 108);
  doc.text('Emitido por evolucaoclinica.app.br', headerTextX, 20);

  doc.setDrawColor(primary.r, primary.g, primary.b);
  doc.setLineWidth(0.5);
  doc.line(margin, 28, pageWidth - margin, 28);

  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(primary.r, primary.g, primary.b);
  doc.text(documentType, margin, 39);

  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(28, 25, 22);
  let y = 47;
  doc.text(`Paciente: ${patient?.full_name || 'Não informado'}`, margin, y);
  doc.text(`Profissional: ${professional?.full_name || 'Não informado'}`, margin + contentWidth / 2, y);
  y += 6;
  if (professional?.professional_register) {
    doc.text(`Registro Profissional: ${professional.professional_register}`, margin, y);
  }
  if (periodLabel) {
    doc.text(`Período: ${periodLabel}`, margin + contentWidth / 2, y);
  }

  y += 8;
  doc.setDrawColor(231, 229, 228);
  doc.setLineWidth(0.2);
  doc.line(margin, y, pageWidth - margin, y);
  y += 9;

  const ensureSpace = (required = 6) => {
    if (y > pageHeight - 30 - required) {
      doc.addPage();
      y = 20;
    }
  };

  const lines = String(content || '').replace(/\r\n/g, '\n').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      y += 4;
      continue;
    }

    if (/^={5,}$/.test(trimmed) || /^-{5,}$/.test(trimmed)) {
      ensureSpace(4);
      doc.setDrawColor(210, 205, 200);
      doc.setLineWidth(0.2);
      doc.line(margin, y, pageWidth - margin, y);
      y += 5;
      continue;
    }

    const isHeading = /^(#{1,6}\s+|EVOLUÇÃO CLÍNICA\b)/i.test(trimmed);
    const text = trimmed.replace(/^#{1,6}\s+/, '').replace(/\*\*([^*]+)\*\*/g, '$1');
    doc.setFont('Helvetica', isHeading ? 'bold' : 'normal');
    doc.setFontSize(isHeading ? 10.5 : 9.5);
    doc.setTextColor(isHeading ? primary.r : 28, isHeading ? primary.g : 25, isHeading ? primary.b : 22);

    const wrapped = doc.splitTextToSize(text, contentWidth);
    for (const wrappedLine of wrapped) {
      ensureSpace(6);
      doc.text(wrappedLine, margin, y);
      y += isHeading ? 6 : 5;
    }
    y += isHeading ? 2 : 1.5;
  }

  ensureSpace(28);
  y += 8;
  doc.setDrawColor(87, 83, 78);
  doc.setLineWidth(0.3);
  doc.line(pageWidth / 2 - 30, y, pageWidth / 2 + 30, y);
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(28, 25, 22);
  doc.text(professional?.full_name || 'Profissional de Saúde', pageWidth / 2, y + 5, { align: 'center' });
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(professional?.professional_register || '', pageWidth / 2, y + 9, { align: 'center' });

  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(231, 229, 228);
    doc.setLineWidth(0.2);
    doc.line(margin, pageHeight - 15, pageWidth - margin, pageHeight - 15);
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(120, 113, 108);
    doc.text(`Página ${page} de ${totalPages}`, pageWidth - margin, pageHeight - 9, { align: 'right' });
  }

  return doc;
};

export const downloadPdfFile = (doc: jsPDF, fileName: string) => {
  const blob = doc.output('blob');
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
};

export const getProntuarioPdfFileName = (patientName?: string) => {
  return `Prontuario_Evolucoes_${sanitizeFileName(patientName || 'Paciente')}.pdf`;
};
