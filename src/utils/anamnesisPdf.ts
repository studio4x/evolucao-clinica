import type { AnamnesisAnswers, AnamnesisSection, PatientAnamnesis } from '../services/anamnesis';
import { generateProntuarioPDF } from './prontuarioPdf';
import { resolveAnamnesisFieldValue } from '../services/anamnesisValueResolver';

const formatDate = (value?: string | null) => {
  if (!value) return 'Não informado';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Não informado';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const formatAnswer = (value: AnamnesisAnswers[string]) => {
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'Não informado';
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (value === null || value === undefined || value === '') return 'Não informado';
  return String(value);
};

const sanitizeFileName = (value: string) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'Paciente';

const orderSections = (sections: AnamnesisSection[] = []) => {
  const ordered = [...sections].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const goals = ordered.filter((section) => section.key === 'goals');
  const others = ordered.filter((section) => section.key !== 'goals');
  return [...others, ...goals];
};

export const filterAnamnesisAnswersForSchema = (
  answers: AnamnesisAnswers,
  sections: AnamnesisSection[] = []
): AnamnesisAnswers => {
  const allowed = new Set(
    sections.flatMap((section) => section.fields.flatMap((field) => [field.key, field.id].filter(Boolean) as string[]))
  );

  return Object.fromEntries(
    Object.entries(answers || {}).filter(([key]) => allowed.has(key))
  ) as AnamnesisAnswers;
};

export const buildAnamnesisPdfContent = (record: PatientAnamnesis) => {
  const lines: string[] = [
    `**Modelo:** ${record.templateName}`,
    `**Versão do modelo:** ${record.templateVersion}`,
    `**Status:** ${record.status === 'completed' ? 'Concluída' : 'Rascunho'}`,
    `**Criada em:** ${formatDate(record.createdAt)}`,
    `**Última atualização:** ${formatDate(record.updatedAt)}`,
  ];

  if (record.completedAt) {
    lines.push(`**Concluída em:** ${formatDate(record.completedAt)}`);
  }

  lines.push('', '----------------------------------------', '');

  for (const section of orderSections(record.templateSnapshot.sections || [])) {
    lines.push(`## ${section.title}`);
    if (section.description) lines.push(section.description, '');

    for (const field of section.fields) {
      lines.push(`**${field.label}**`);
      lines.push(formatAnswer(resolveAnamnesisFieldValue(field, record.answers, record.patientContextSnapshot)), '');
    }
  }

  return lines.join('\n');
};

type GenerateAnamnesisPdfOptions = {
  record: PatientAnamnesis;
  patient?: any;
  professional?: any;
  siteConfig?: any;
  logoBase64?: string | null;
  customLogoSettings?: unknown;
};

export const generateAnamnesisPDF = ({
  record,
  patient,
  professional,
  siteConfig,
  logoBase64,
  customLogoSettings,
}: GenerateAnamnesisPdfOptions) =>
  generateProntuarioPDF({
    content: buildAnamnesisPdfContent(record),
    patient,
    professional,
    siteConfig,
    documentType: `Anamnese — ${record.templateName}`,
    logoBase64,
    customLogoSettings,
  });

export const getAnamnesisPdfFileName = (
  patientName: string,
  record: PatientAnamnesis
) => {
  const date = record.createdAt?.slice(0, 10) || new Date().toISOString().slice(0, 10);
  return `Anamnese_${sanitizeFileName(patientName)}_${date}_${sanitizeFileName(record.templateName)}.pdf`;
};
