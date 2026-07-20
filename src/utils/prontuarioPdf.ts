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

const normalizePdfText = (value: string) => {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    // The standard jsPDF fonts use WinAnsi and cannot render emoji or box-drawing glyphs.
    .replace(/📅/gu, '')
    .replace(/🔒/gu, '')
    .replace(/[─━═]/gu, '-')
    .replace(/[‐‑‒–—―]/gu, '-')
    .replace(/[“”]/gu, '"')
    .replace(/[‘’]/gu, "'")
    .replace(/…/gu, '...')
    // Keep Latin-1 characters (including Portuguese accents) and the supported bullet.
    .replace(/[^\u0000-\u00FF\u2022\n]/gu, '');
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

  const lines = normalizePdfText(content).split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      y += 3;
      continue;
    }

    if (/^[=_-]{5,}$/.test(trimmed)) {
      ensureSpace(4);
      doc.setDrawColor(210, 205, 200);
      doc.setLineWidth(0.2);
      doc.line(margin, y, pageWidth - margin, y);
      y += 4;
      continue;
    }

    const text = trimmed
      .replace(/^#{1,6}\s+/, '')
      .replace(/\*\*([^*]+)\*\*/g, '$1');
    const isSessionHeading = /^DATA DA SESSÃO\s*:/i.test(text);
    const isSystemHeading = /^REGISTRO DE INSERÇÃO SISTÊMICA\b/i.test(text);
    const isSectionHeading = /^(EVOLUÇÃO(?: CLÍNICA)?\s*:|TRANSCRIÇÃO DO TRECHO\s*:|EVOLUÇÃO CLÍNICA\s*-)/i.test(text);
    const isHeading = isSessionHeading || isSystemHeading || isSectionHeading;
    const isSignedNotice = /^\[Documento Assinado|^\[Rascunho\]/i.test(text);
    const fontStyle = isHeading ? 'bold' : isSignedNotice ? 'italic' : 'normal';
    const fontSize = isSessionHeading ? 10.5 : isHeading ? 10 : 9.5;
    doc.setFont('Helvetica', fontStyle);
    doc.setFontSize(fontSize);
    doc.setTextColor(isHeading ? primary.r : 28, isHeading ? primary.g : 25, isHeading ? primary.b : 22);

    const wrapped = doc.splitTextToSize(text, contentWidth);
    for (const wrappedLine of wrapped) {
      ensureSpace(6);
      doc.text(wrappedLine, margin, y);
      y += isHeading ? 5.5 : 5;
    }
    y += isHeading ? 2.5 : 1.5;
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

const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      resolve(dataUrl.split(',')[1] || '');
    };
    reader.onerror = () => reject(reader.error || new Error('Não foi possível preparar o arquivo para download.'));
    reader.readAsDataURL(blob);
  });
};

export const downloadPdfFile = async (doc: jsPDF, fileName: string): Promise<boolean> => {
  const blob = doc.output('blob');
  const isAndroidWebView = /Android/i.test(navigator.userAgent) && (/\bwv\b/i.test(navigator.userAgent) || !('chrome' in window));
  const nativeDownload = (window as Window & {
    NativeFileDownload?: {
      saveFile?: (name: string, mimeType: string, base64Data: string) => boolean;
    };
  }).NativeFileDownload;

  if (typeof nativeDownload?.saveFile === 'function') {
    try {
      const saved = nativeDownload.saveFile(fileName, 'application/pdf', await blobToBase64(blob));
      if (saved) return true;
    } catch (error) {
      console.error('[PDF] Falha no salvamento nativo:', error);
    }
  }

  // A WebView Android não garante o download de URLs blob pelo clique em um <a>.
  // Retornar falha aqui evita mostrar sucesso quando o arquivo não foi salvo.
  if (isAndroidWebView) {
    return false;
  }

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
  return true;
};

export const getProntuarioPdfFileName = (patientName?: string) => {
  return `Prontuario_Evolucoes_${sanitizeFileName(patientName || 'Paciente')}.pdf`;
};
