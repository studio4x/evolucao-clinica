import { jsPDF } from 'jspdf';
import { drawDocumentLogo } from './documentLogo';
import { downloadPdfFile } from './prontuarioPdf';
import type { PatientSession, PatientSessionMonthClosure } from '../services/patientSessions';

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
  monthClosure?: PatientSessionMonthClosure | null;
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

  const columnGap = 8;
  const columnWidth = (contentWidth - columnGap) / 2;
  const cardPadding = 3.5;
  const innerWidth = columnWidth - cardPadding * 2;
  const rowGap = 6;

  const getSessionLayout = (session: PatientSession) => {
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(9.3);
    const headingLines = doc.splitTextToSize(
      `SESSÃO ${String(input.sessions.indexOf(session) + 1).padStart(2, '0')} - ${formatDate(session.sessionDate)} - ${formatTime(session.sessionTime)}`,
      innerWidth
    );

    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(8.5);
    const noteLines = session.notes
      ? doc.splitTextToSize(normalizePdfText(session.notes), innerWidth)
      : [];

    const image = session.signature ? input.signatureImages[session.signature.id] : undefined;

    let height = cardPadding;
    height += headingLines.length * 4.6;
    height += 5.2; // situação

    if (session.notes) {
      height += 4.6; // label
      height += noteLines.length * 4.3;
      height += 1.5;
    }

    if (session.signature) {
      height += 4.7; // título da assinatura
      height += 4.1; // assinante
      height += 4.1; // data
      height += image ? 22.5 : 4;
    } else {
      height += 6;
    }

    height += cardPadding;
    return { headingLines, noteLines, image, height: Math.max(height, 39) };
  };

  const renderSessionCard = (
    session: PatientSession,
    sessionIndex: number,
    x: number,
    top: number,
    cardHeight: number,
    layout: ReturnType<typeof getSessionLayout>
  ) => {
    doc.setDrawColor(231, 229, 228);
    doc.setLineWidth(0.2);
    doc.roundedRect(x, top, columnWidth, cardHeight, 1.5, 1.5);

    const textX = x + cardPadding;
    let cursorY = top + cardPadding + 3.2;

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(9.3);
    doc.setTextColor(primary.r, primary.g, primary.b);
    const heading = `SESSÃO ${String(sessionIndex + 1).padStart(2, '0')} - ${formatDate(session.sessionDate)} - ${formatTime(session.sessionTime)}`;
    const headingLines = doc.splitTextToSize(heading, innerWidth);
    headingLines.forEach((line: string) => {
      doc.text(line, textX, cursorY);
      cursorY += 4.6;
    });

    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(28, 25, 22);
    doc.text(`Situação: ${statusLabel(session.status)}`, textX, cursorY);
    cursorY += 5.2;

    if (session.notes) {
      doc.setFont('Helvetica', 'bold');
      doc.text('Observação:', textX, cursorY);
      cursorY += 4.6;

      doc.setFont('Helvetica', 'normal');
      layout.noteLines.forEach((line: string) => {
        doc.text(line, textX, cursorY);
        cursorY += 4.3;
      });
      cursorY += 1.5;
    }

    if (session.signature) {
      const role = signatureRoleLabel(session);
      const signer = session.signature.signerName
        ? `${role}: ${normalizePdfText(session.signature.signerName)}`
        : role;
      const signedAt = new Date(session.signature.signedAt).toLocaleString('pt-BR');

      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(28, 25, 22);
      doc.text('Assinatura da sessão', textX, cursorY);
      cursorY += 4.7;

      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(7.8);
      doc.setTextColor(87, 83, 78);
      const signerLines = doc.splitTextToSize(`Assinante: ${signer}`, innerWidth);
      signerLines.slice(0, 2).forEach((line: string) => {
        doc.text(line, textX, cursorY);
        cursorY += 4.1;
      });
      doc.text(`Registrada em: ${signedAt}`, textX, cursorY);
      cursorY += 3.4;

      if (layout.image) {
        try {
          const imageWidth = Math.min(50, innerWidth);
          const imageHeight = 18;
          const imageY = cursorY + 2;
          doc.setDrawColor(231, 229, 228);
          doc.setLineWidth(0.2);
          doc.rect(textX, imageY, imageWidth, imageHeight);
          doc.addImage(
            layout.image,
            signatureImageFormat(layout.image),
            textX + 1.5,
            imageY + 1.5,
            imageWidth - 3,
            imageHeight - 3,
            undefined,
            'FAST'
          );
        } catch (error) {
          console.warn('[PatientSessionsPDF] Não foi possível inserir a assinatura:', error);
        }
      }
    } else {
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(7.8);
      doc.setTextColor(120, 113, 108);
      doc.text('Assinatura da sessão: não registrada', textX, cursorY);
    }
  };

  for (let index = 0; index < input.sessions.length; index += 2) {
    const leftSession = input.sessions[index];
    const rightSession = input.sessions[index + 1];

    const leftLayout = getSessionLayout(leftSession);
    const rightLayout = rightSession ? getSessionLayout(rightSession) : null;
    const rowHeight = Math.max(leftLayout.height, rightLayout?.height || 0);

    ensureSpace(rowHeight + rowGap);

    renderSessionCard(leftSession, index, margin, y, rowHeight, leftLayout);

    if (rightSession && rightLayout) {
      renderSessionCard(
        rightSession,
        index + 1,
        margin + columnWidth + columnGap,
        y,
        rowHeight,
        rightLayout
      );
    }

    y += rowHeight + rowGap;
  }

  if (input.sessions.length === 0) {
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(120, 113, 108);
    doc.text('Nenhuma sessão registrada neste período.', margin, y);
    y += 8;
  }

  if (input.monthClosure) {
    ensureSpace(50);
    y += 6;
    const closure = input.monthClosure;

    doc.setFillColor(240, 253, 244);
    doc.setDrawColor(167, 243, 208);
    doc.setLineWidth(0.3);
    doc.rect(margin, y, contentWidth, 38, 'FD');

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(4, 120, 87);
    doc.text('DOCUMENTO ASSINADO DIGITALMENTE VIA CHAVE DO APLICATIVO', margin + 5, y + 6);

    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(55, 65, 81);
    doc.text(
      `Assinado por: ${normalizePdfText(closure.signedByName)} (${normalizePdfText(closure.signedByRegister)})`,
      margin + 5,
      y + 14
    );
    doc.text(`Data/Hora: ${new Date(closure.signatureDate).toLocaleString('pt-BR')}`, margin + 5, y + 20);
    doc.text(`IP de Origem: ${closure.signatureIp}   |   Algoritmo: SHA-256`, margin + 5, y + 26);
    doc.setFont('Courier', 'normal');
    doc.setFontSize(7);
    doc.text(`Hash: ${closure.signatureHash}`, margin + 5, y + 32);
  } else {
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
  }

  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(231, 229, 228);
    doc.setLineWidth(0.2);
    doc.line(margin, 281, pageWidth - margin, 281);

    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(120, 113, 108);

    if (input.monthClosure) {
      const closure = input.monthClosure;
      const shortHash = `${closure.signatureHash.substring(0, 16)}...`;
      const formattedDate = new Date(closure.signatureDate).toLocaleDateString('pt-BR');
      doc.text(
        `Assinado Digitalmente por: ${normalizePdfText(closure.signedByName)} (${normalizePdfText(closure.signedByRegister)})`,
        margin,
        285
      );
      doc.text(`Data: ${formattedDate} | Hash: ${shortHash}`, margin, 289);
      doc.text(`Página ${page} de ${totalPages}`, pageWidth - margin, 289, { align: 'right' });
    } else {
      doc.text('Controle de Sessões - Emitido por evolucaoclinica.app.br', margin, 289);
      doc.text(`Página ${page} de ${totalPages}`, pageWidth - margin, 289, { align: 'right' });
    }
  }

  return doc;
}

export async function downloadPatientSessionsPdf(doc: jsPDF, fileName: string) {
  return downloadPdfFile(doc, fileName);
}
