import { jsPDF } from 'jspdf';
import { drawDocumentLogo } from './documentLogo';
import { downloadPdfFile } from './prontuarioPdf';
import type { PatientSession } from '../services/patientSessions';

type SignatureImageMap = Record<string, string | undefined>;

type PatientSessionsPdfInput = {
  patientName: string;
  professionalName: string;
  professionalRegister?: string | null;
  professionalTitle?: string | null;
  month: Date;
  periodLabel?: string;
  sessions: PatientSession[];
  signatureImages: SignatureImageMap;
  siteConfig?: any;
  logoBase64?: string | null;
  customLogoSettings?: unknown;
};

const formatDate = (value: string) => value.split('-').reverse().join('/');
const formatTime = (value: string | null) => value ? value.slice(0, 5) : 'Não informado';

const hexToRgb = (hex: string) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
  return result
    ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
    : null;
};

const normalizePdfText = (value: string) => String(value || '')
  .replace(/\r\n?/g, '\n')
  .replace(/[‐‑‒–—―]/gu, '-')
  .replace(/[“”]/gu, '"')
  .replace(/[‘’]/gu, "'")
  .replace(/…/gu, '...')
  .replace(/[^\u0000-\u00FF\u2022\n]/gu, '');

const statusLabel = (status: PatientSession['status']) => {
  if (status === 'completed') return 'Realizada';
  if (status === 'scheduled') return 'Agendada';
  if (status === 'cancelled') return 'Cancelada';
  return 'Falta';
};

const signatureRoleLabel = (session: PatientSession) => (
  session.signature?.signerType === 'responsible' ? 'Responsável' : 'Paciente'
);

const signatureImageFormat = (dataUrl: string) => {
  if (/^data:image\/webp/i.test(dataUrl)) return 'WEBP';
  if (/^data:image\/jpe?g/i.test(dataUrl)) return 'JPEG';
  return 'PNG';
};

export const getPatientSessionsPdfFileName = (patientName: string, month: Date) => {
  const safe = (patientName || 'Paciente')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_');
  const period = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;
  return `Controle_Sessoes_${safe}_${period}.pdf`;
};

export function generatePatientSessionsPdf(input: PatientSessionsPdfInput) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  const primary = hexToRgb(input.siteConfig?.colors?.primary || '#005C13') || { r: 0, g: 92, b: 19 };
  const appName = input.siteConfig?.pwa_app_name || 'Evolução Clínica';
  const period = input.periodLabel || new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(input.month);

  // Cabeçalho timbrado: mesmo padrão visual dos relatórios.
  let taglineX = margin;
  if (input.logoBase64) {
    try {
      taglineX = drawDocumentLogo(doc, input.logoBase64, input.customLogoSettings, margin, 7);
    } catch (error) {
      console.warn('[PatientSessionsPDF] Não foi possível inserir o logotipo:', error);
    }
  }

  if (!input.logoBase64 || taglineX === margin) {
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(primary.r, primary.g, primary.b);
    doc.text(appName, margin, 20);

    const appNameWidth = doc.getTextWidth(appName);
    doc.setDrawColor(200, 195, 190);
    doc.setLineWidth(0.25);
    doc.line(margin + appNameWidth + 5, 11, margin + appNameWidth + 5, 25);
    taglineX = margin + appNameWidth + 9;
  }

  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(28, 25, 22);
  doc.text('Plataforma Inteligente de Acompanhamento Terapêutico', taglineX, 16);

  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(120, 113, 108);
  doc.text('Emitido por evolucaoclinica.app.br', taglineX, 21);

  doc.setDrawColor(primary.r, primary.g, primary.b);
  doc.setLineWidth(0.5);
  doc.line(margin, 28, pageWidth - margin, 28);

  // Identificação do documento: mesma hierarquia dos relatórios.
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(primary.r, primary.g, primary.b);
  doc.text('Controle de Sessões', margin, 38);

  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(28, 25, 22);

  let y = 46;
  doc.text(`Paciente: ${normalizePdfText(input.patientName || 'Não informado')}`, margin, y);
  doc.text(`Profissional: ${normalizePdfText(input.professionalName || 'Não informado')}`, margin + contentWidth / 2, y);

  y += 6;
  if (input.professionalRegister) {
    doc.text(`Registro Profissional: ${normalizePdfText(input.professionalRegister)}`, margin, y);
  } else if (input.professionalTitle) {
    doc.text(`Especialidade: ${normalizePdfText(input.professionalTitle)}`, margin, y);
  }
  doc.text(`Período: ${normalizePdfText(period)}`, margin + contentWidth / 2, y);

  y += 8;
  doc.setDrawColor(231, 229, 228);
  doc.setLineWidth(0.2);
  doc.line(margin, y, pageWidth - margin, y);
  y += 10;

  const ensureSpace = (required = 8) => {
    if (y + required > pageHeight - 28) {
      doc.addPage();
      y = 20;
    }
  };

  input.sessions.forEach((session, index) => {
    const noteLines = session.notes
      ? doc.splitTextToSize(normalizePdfText(session.notes), contentWidth)
      : [];
    const hasSignatureImage = Boolean(session.signature && input.signatureImages[session.signature.id]);
    const estimatedHeight = 18 + noteLines.length * 5 + (hasSignatureImage ? 25 : 8);

    ensureSpace(Math.min(estimatedHeight, 55));

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(primary.r, primary.g, primary.b);
    doc.text(
      `SESSÃO ${String(index + 1).padStart(2, '0')} - ${formatDate(session.sessionDate)} - ${formatTime(session.sessionTime)}`,
      margin,
      y
    );
    y += 6;

    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(28, 25, 22);
    doc.text(`Situação: ${statusLabel(session.status)}`, margin, y);
    y += 5;

    if (session.notes) {
      doc.setFont('Helvetica', 'bold');
      doc.text('Observação:', margin, y);
      y += 5;
      doc.setFont('Helvetica', 'normal');
      for (const line of noteLines) {
        ensureSpace(6);
        doc.text(line, margin, y);
        y += 5;
      }
      y += 1;
    }

    if (session.signature) {
      const role = signatureRoleLabel(session);
      const signer = session.signature.signerName
        ? `${role}: ${normalizePdfText(session.signature.signerName)}`
        : role;
      const signedAt = new Date(session.signature.signedAt).toLocaleString('pt-BR');
      const image = input.signatureImages[session.signature.id];

      ensureSpace(image ? 31 : 13);
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(28, 25, 22);
      doc.text('Assinatura da sessão', margin, y);
      y += 5;

      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(87, 83, 78);
      doc.text(`Assinante: ${signer}`, margin, y);
      y += 4.5;
      doc.text(`Registrada em: ${signedAt}`, margin, y);

      if (image) {
        try {
          const imageWidth = 58;
          const imageHeight = 20;
          const imageY = y + 3;
          doc.setDrawColor(231, 229, 228);
          doc.setLineWidth(0.2);
          doc.rect(margin, imageY, imageWidth, imageHeight);
          doc.addImage(
            image,
            signatureImageFormat(image),
            margin + 2,
            imageY + 2,
            imageWidth - 4,
            imageHeight - 4,
            undefined,
            'FAST'
          );
          y = imageY + imageHeight + 3;
        } catch (error) {
          console.warn('[PatientSessionsPDF] Não foi possível inserir a assinatura:', error);
          y += 6;
        }
      } else {
        y += 6;
      }
    } else {
      ensureSpace(8);
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(120, 113, 108);
      doc.text('Assinatura da sessão: não registrada', margin, y);
      y += 6;
    }

    doc.setDrawColor(231, 229, 228);
    doc.setLineWidth(0.2);
    doc.line(margin, y, pageWidth - margin, y);
    y += 8;
  });

  if (input.sessions.length === 0) {
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(120, 113, 108);
    doc.text('Nenhuma sessão registrada neste período.', margin, y);
    y += 8;
  }

  // Assinatura do profissional: mesma composição dos relatórios não assinados.
  ensureSpace(30);
  y += 8;
  doc.setDrawColor(87, 83, 78);
  doc.setLineWidth(0.3);
  doc.line(pageWidth / 2 - 30, y, pageWidth / 2 + 30, y);

  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(28, 25, 22);
  doc.text(normalizePdfText(input.professionalName || 'Profissional de Saúde'), pageWidth / 2, y + 5, { align: 'center' });
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(normalizePdfText(input.professionalRegister || input.professionalTitle || ''), pageWidth / 2, y + 9, { align: 'center' });

  // Rodapé: mesma linha, tipografia e paginação dos relatórios.
  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(231, 229, 228);
    doc.setLineWidth(0.2);
    doc.line(margin, 281, pageWidth - margin, 281);

    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(120, 113, 108);
    doc.text('Controle de Sessões - Emitido por evolucaoclinica.app.br', margin, 289);
    doc.text(`Página ${page} de ${totalPages}`, pageWidth - margin, 289, { align: 'right' });
  }

  return doc;
}

export async function downloadPatientSessionsPdf(doc: jsPDF, fileName: string) {
  return downloadPdfFile(doc, fileName);
}
