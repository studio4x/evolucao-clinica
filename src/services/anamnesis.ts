import { supabase } from '../supabaseClient';
import type {
  AnamnesisField,
  AnamnesisFieldType,
  AnamnesisSection,
  AnamnesisTemplateSchema,
  AnamnesisPatientContext,
} from './anamnesisSchema';
import { validateAnamnesisSchema } from './anamnesisSchema';

export type { AnamnesisField, AnamnesisFieldType, AnamnesisSection, AnamnesisTemplateSchema } from './anamnesisSchema';

export type AnamnesisTemplate = {
  id: string;
  templateKey: string;
  name: string;
  professionalGroup: string;
  professionalTitles: string[];
  version: number;
  schema: AnamnesisTemplateSchema;
  kind?: 'system' | 'custom' | 'derived';
  status?: 'active' | 'archived';
  currentVersionId?: string | null;
};

export type AnamnesisAnswers = Record<string, string | string[] | number | boolean | null>;

export type PatientAnamnesis = {
  id: string;
  patientId: string;
  professionalId: string;
  templateId: string;
  templateKey: string;
  templateName: string;
  templateVersion: number;
  templateSnapshot: AnamnesisTemplateSchema;
  templateVersionId?: string | null;
  answers: AnamnesisAnswers;
  patientContextSnapshot?: AnamnesisPatientContext | null;
  clinicalVersionNumber?: number | null;
  status: 'draft' | 'completed';
  isCurrent: boolean;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PatientAnamnesisRevision = {
  id: string;
  anamnesisId: string;
  patientId: string;
  professionalId: string;
  changedBy: string | null;
  eventType: 'answers_updated' | 'completed' | 'reopened' | 'archived';
  previousAnswers: AnamnesisAnswers;
  newAnswers: AnamnesisAnswers;
  previousStatus: 'draft' | 'completed';
  newStatus: 'draft' | 'completed';
  changedAt: string;
};

type TemplateRow = {
  id: string;
  template_key: string;
  name: string;
  professional_group: string;
  professional_titles: string[] | null;
  version: number;
  schema: AnamnesisTemplateSchema;
  kind?: AnamnesisTemplate['kind'];
  status?: AnamnesisTemplate['status'];
  current_version_id?: string | null;
};

export type PatientAnamnesisVersion = {
  id: string;
  patientAnamnesisId: string;
  patientId: string;
  professionalId: string;
  versionNumber: number;
  templateVersionId: string | null;
  templateKey: string;
  templateName: string;
  templateVersion: number;
  templateSnapshot: AnamnesisTemplateSchema;
  answersSnapshot: AnamnesisAnswers;
  patientContextSnapshot: AnamnesisPatientContext;
  createdBy: string | null;
  createdAt: string;
  completedAt: string;
};

type AnamnesisRow = {
  id: string;
  patient_id: string;
  professional_id: string;
  template_id: string;
  template_key: string;
  template_name: string;
  template_version: number;
  template_snapshot: AnamnesisTemplateSchema;
  template_version_id?: string | null;
  answers: AnamnesisAnswers | null;
  patient_context_snapshot?: AnamnesisPatientContext | null;
  clinical_version_number?: number | null;
  status: 'draft' | 'completed';
  is_current: boolean;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

type RevisionRow = {
  id: string;
  anamnesis_id: string;
  patient_id: string;
  professional_id: string;
  changed_by: string | null;
  event_type: PatientAnamnesisRevision['eventType'];
  previous_answers: AnamnesisAnswers | null;
  new_answers: AnamnesisAnswers | null;
  previous_status: 'draft' | 'completed';
  new_status: 'draft' | 'completed';
  changed_at: string;
};

type ClinicalVersionRow = {
  id: string;
  patient_anamnesis_id: string;
  patient_id: string;
  professional_id: string;
  version_number: number;
  template_version_id: string | null;
  template_key: string;
  template_name: string;
  template_version: number;
  template_snapshot: AnamnesisTemplateSchema;
  answers_snapshot: AnamnesisAnswers;
  patient_context_snapshot: AnamnesisPatientContext;
  created_by: string | null;
  created_at: string;
  completed_at: string;
};

const mapTemplate = (row: TemplateRow): AnamnesisTemplate => ({
  id: row.id,
  templateKey: row.template_key,
  name: row.name,
  professionalGroup: row.professional_group,
  professionalTitles: row.professional_titles || [],
  version: row.version,
  schema: row.schema,
  kind: row.kind,
  status: row.status,
  currentVersionId: row.current_version_id,
});

const mapAnamnesis = (row: AnamnesisRow): PatientAnamnesis => ({
  id: row.id,
  patientId: row.patient_id,
  professionalId: row.professional_id,
  templateId: row.template_id,
  templateKey: row.template_key,
  templateName: row.template_name,
  templateVersion: row.template_version,
  templateSnapshot: row.template_snapshot,
  templateVersionId: row.template_version_id,
  answers: row.answers || {},
  patientContextSnapshot: row.patient_context_snapshot || null,
  clinicalVersionNumber: row.clinical_version_number ?? null,
  status: row.status,
  isCurrent: row.is_current,
  completedAt: row.completed_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapRevision = (row: RevisionRow): PatientAnamnesisRevision => ({
  id: row.id,
  anamnesisId: row.anamnesis_id,
  patientId: row.patient_id,
  professionalId: row.professional_id,
  changedBy: row.changed_by,
  eventType: row.event_type,
  previousAnswers: row.previous_answers || {},
  newAnswers: row.new_answers || {},
  previousStatus: row.previous_status,
  newStatus: row.new_status,
  changedAt: row.changed_at,
});

const mapClinicalVersion = (row: ClinicalVersionRow): PatientAnamnesisVersion => ({
  id: row.id,
  patientAnamnesisId: row.patient_anamnesis_id,
  patientId: row.patient_id,
  professionalId: row.professional_id,
  versionNumber: row.version_number,
  templateVersionId: row.template_version_id,
  templateKey: row.template_key,
  templateName: row.template_name,
  templateVersion: row.template_version,
  templateSnapshot: row.template_snapshot,
  answersSnapshot: row.answers_snapshot || {},
  patientContextSnapshot: row.patient_context_snapshot,
  createdBy: row.created_by,
  createdAt: row.created_at,
  completedAt: row.completed_at,
});

export function getRecommendedAnamnesisTemplate(
  templates: AnamnesisTemplate[],
  professionalTitle?: string | null
) {
  const normalized = String(professionalTitle || '').trim().toLocaleLowerCase('pt-BR');
  if (normalized) {
    const matched = templates.find((template) =>
      template.professionalTitles.some(
        (title) => title.trim().toLocaleLowerCase('pt-BR') === normalized
      )
    );
    if (matched) return matched;
  }
  return templates.find((template) => template.templateKey === 'general') || templates[0] || null;
}

export function hasMeaningfulAnamnesisAnswers(answers: AnamnesisAnswers) {
  return Object.values(answers || {}).some((value) => {
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'string') return value.trim().length > 0;
    return value !== null && value !== undefined && value !== false;
  });
}

export async function fetchAnamnesisTemplates() {
  const { data, error } = await supabase
    .from('anamnesis_templates')
    .select('id, template_key, name, professional_group, professional_titles, version, schema, kind, status, current_version_id')
    .eq('is_active', true)
    .eq('status', 'active')
    .order('name', { ascending: true });

  if (error) throw error;
  return (data || []).map((row) => {
    const mapped = mapTemplate(row as TemplateRow);
    const validation = validateAnamnesisSchema(mapped.schema, { legacy: !mapped.schema.sections.some((section) => section.id) });
    if (!validation.valid) throw new Error(`Modelo de Anamnese inválido: ${validation.errors.join(' ')}`);
    return mapped;
  });
}

export async function fetchCurrentPatientAnamnesis(patientId: string) {
  const { data, error } = await supabase
    .from('patient_anamneses')
    .select('*')
    .eq('patient_id', patientId)
    .eq('is_current', true)
    .maybeSingle();

  if (error) throw error;
  return data ? mapAnamnesis(data as AnamnesisRow) : null;
}

export async function fetchPatientAnamnesisHistory(patientId: string) {
  const { data, error } = await supabase
    .from('patient_anamneses')
    .select('*')
    .eq('patient_id', patientId)
    .eq('is_current', false)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []).map((row) => mapAnamnesis(row as AnamnesisRow));
}

export async function fetchPatientAnamnesisRevisions(patientId: string, limit = 30) {
  const { data, error } = await supabase
    .from('patient_anamnesis_revisions')
    .select('*')
    .eq('patient_id', patientId)
    .order('changed_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data || []).map((row) => mapRevision(row as RevisionRow));
}

export async function startPatientAnamnesis(
  patientId: string,
  templateId: string,
  archiveCurrent = false
) {
  const { data, error } = await supabase.rpc('start_patient_anamnesis', {
    p_patient_id: patientId,
    p_template_id: templateId,
    p_archive_current: archiveCurrent,
  });

  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('Não foi possível iniciar a anamnese.');
  return mapAnamnesis(row as AnamnesisRow);
}

export async function fetchPatientAnamnesisVersions(patientId: string, limit = 30) {
  const { data, error } = await supabase
    .from('patient_anamnesis_versions')
    .select('*')
    .eq('patient_id', patientId)
    .order('completed_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).map((row) => mapClinicalVersion(row as ClinicalVersionRow));
}

export async function completePatientAnamnesis(id: string) {
  const { data, error } = await supabase.rpc('complete_patient_anamnesis', { p_anamnesis_id: id });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('Não foi possível concluir a anamnese.');
  return mapAnamnesis(row as AnamnesisRow);
}

export async function reopenPatientAnamnesis(id: string) {
  const { data, error } = await supabase.rpc('reopen_patient_anamnesis', { p_anamnesis_id: id });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('Não foi possível reabrir a anamnese.');
  return mapAnamnesis(row as AnamnesisRow);
}

export async function savePatientAnamnesis(
  id: string,
  input: {
    answers?: AnamnesisAnswers;
    status?: 'draft' | 'completed';
    completedAt?: string | null;
  }
) {
  const changes: Record<string, unknown> = {};
  if (input.answers !== undefined) changes.answers = input.answers;
  if (input.status !== undefined) changes.status = input.status;
  if (input.completedAt !== undefined) changes.completed_at = input.completedAt;

  const { data, error } = await supabase
    .from('patient_anamneses')
    .update(changes)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;
  return mapAnamnesis(data as AnamnesisRow);
}
