import { jsPDF } from 'jspdf';
import { downloadPdfFile } from './prontuarioPdf';
import type { PatientSession } from '../services/patientSessions';

type SignatureImageMap = Record<string, string | undefined>;

const formatDate = (value: string) => value.split('-').reverse().join('/');
const formatTime = (value: string | null) => value ? value.slice(0, 5) : '—';

export const getPatientSessionsPdfFileName = (patientName: string, month: Date) => {
  const safe = (patientName || 'Paciente')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_');
  const period = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;
  return `Controle_Sessoes_${safe}_${period}.pdf`;
};

export function generatePatientSessionsPdf(input: {
  patientName: string;
  professionalName: string;
  professionalRegister?: string | null;
  month: Date;
  sessions: PatientSession[];
  signatureImages: SignatureImageMap;
}) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const width = doc.internal.pageSize.getWidth();
  const margin = 16;
  const primary = { r: 16, g: 85, b: 118 };
  let y = 18;

  doc.setTextColor(primary.r, primary.g, primary.b);
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(17);
  doc.text('Evolução Clínica', margin, y);
  y += 8;
  doc.setFontSize(13);
  doc.text('Controle de Sessões', margin, y);
  y += 7;

  doc.setTextColor(40, 40, 40);
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Paciente: ${input.patientName}`, margin, y);
  y += 5;
  doc.text(`Profissional: ${input.professionalName}`, margin, y);
  if (input.professionalRegister) doc.text(`Registro: ${input.professionalRegister}`, width - margin, y, { align: 'right' });
  y += 5;
  const period = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(input.month);
  doc.text(`Período: ${period}`, margin, y);
  y += 7;

  doc.setDrawColor(210);
  doc.line(margin, y, width - margin, y);
  y += 7;

  const ensureSpace = (height: number) => {
    if (y + height > 280) {
      doc.addPage();
      y = 18;
    }
  };

  input.sessions.forEach((session, index) => {
    ensureSpace(30);
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(primary.r, primary.g, primary.b);
    doc.text(`${index + 1}. ${formatDate(session.sessionDate)} • ${formatTime(session.sessionTime)}`, margin, y);
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(60, 60, 60);
    const statusLabel = session.status === 'completed' ? 'Realizada' : session.status === 'scheduled' ? 'Agendada' : session.status === 'cancelled' ? 'Cancelada' : 'Falta';
    doc.text(`Situação: ${statusLabel}`, margin, y + 5);

    if (session.signature) {
      const image = input.signatureImages[session.signature.id];
      doc.text(`Assinatura registrada em ${new Date(session.signature.signedAt).toLocaleString('pt-BR')}`, margin, y + 10);
      if (image) {
        try { doc.addImage(image, 'PNG', width - margin - 52, y - 3, 48, 18); } catch { /* mantém texto de confirmação */ }
      }
    } else {
      doc.text('Assinatura: não registrada', margin, y + 10);
    }

    if (session.notes) {
      const notes = doc.splitTextToSize(`Observação: ${session.notes}`, 115);
      doc.text(notes, margin, y + 15);
    }
    y += 27;
    doc.setDrawColor(235);
    doc.line(margin, y, width - margin, y);
    y += 5;
  });

  if (input.sessions.length === 0) {
    doc.setTextColor(100);
    doc.text('Nenhuma sessão registrada neste período.', margin, y);
  }

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.setFontSize(7);
    doc.setTextColor(120);
    doc.text(`Página ${page} de ${pages}`, width - margin, 290, { align: 'right' });
  }
  return doc;
}

export async function downloadPatientSessionsPdf(doc: jsPDF, fileName: string) {
  return downloadPdfFile(doc, fileName);
}
