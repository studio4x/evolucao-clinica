import type { AnamnesisField, AnamnesisSection, AnamnesisTemplateSchema } from './anamnesisSchema';
import { BASIC_INFORMATION_SECTION_KEY, OCCUPATION_FIELD_KEY, validateAnamnesisSchema } from './anamnesisSchema';

const BUILDER_DRAFT_PREFIX = 'evolucao-clinica:anamnesis-builder:';

export const createStableId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `qa-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

export const createFieldKey = (label: string, fallback = 'campo') => {
  const normalized = String(label || fallback)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || fallback;
  return `${normalized}_${createStableId().replace(/-/g, '').slice(0, 8)}`;
};

const nativeField = (key: string, label: string, patientReference?: AnamnesisField['patientReference']): AnamnesisField => ({
  id: createStableId(), key, label, type: key === OCCUPATION_FIELD_KEY ? 'text' : key === 'patient_birth_date' ? 'date' : 'text',
  required: false, order: 0, native: Boolean(patientReference), patientReference,
});

export const createBasicInformationSection = (): AnamnesisSection => ({
  id: createStableId(), key: BASIC_INFORMATION_SECTION_KEY, title: 'Informações básicas',
  description: 'Reutilize os dados básicos já cadastrados no perfil do paciente.', order: 0, kind: 'basic_information',
  fields: [
    nativeField('patient_full_name', 'Nome', 'full_name'),
    nativeField('patient_birth_date', 'Data de nascimento', 'birth_date'),
    nativeField('patient_cpf', 'CPF', 'cpf'),
    nativeField('patient_phone', 'Telefone', 'phone'),
    nativeField('patient_postal_code', 'CEP', 'postal_code'),
    nativeField('patient_street', 'Logradouro', 'street'),
    nativeField('patient_address_number', 'Número', 'address_number'),
    nativeField('patient_address_complement', 'Complemento', 'address_complement'),
    nativeField('patient_neighborhood', 'Bairro', 'neighborhood'),
    nativeField('patient_city', 'Cidade', 'city'),
    nativeField('patient_state', 'UF', 'state'),
    nativeField(OCCUPATION_FIELD_KEY, 'Profissão/Ocupação'),
  ].map((field, index) => ({ ...field, order: index })),
});

export const createEmptyBuilderSchema = (): AnamnesisTemplateSchema => ({ schemaVersion: 1, sections: [] });

export const hasBasicInformationSection = (schema: AnamnesisTemplateSchema) =>
  schema.sections.some((section) => section.kind === 'basic_information' || section.key === BASIC_INFORMATION_SECTION_KEY);

export const cloneSchemaWithFreshIds = (schema: AnamnesisTemplateSchema): AnamnesisTemplateSchema => ({
  schemaVersion: 1,
  sections: schema.sections.map((section, sectionIndex) => ({
    ...section,
    id: createStableId(),
    order: sectionIndex,
    fields: section.fields.map((field, fieldIndex) => ({ ...field, id: createStableId(), order: fieldIndex })),
  })),
});

export const normalizeBuilderSchema = (schema: AnamnesisTemplateSchema): AnamnesisTemplateSchema => ({
  schemaVersion: 1,
  sections: schema.sections.map((section, sectionIndex) => ({
    ...section,
    order: sectionIndex,
    fields: section.fields.map((field, fieldIndex) => ({ ...field, order: fieldIndex, required: field.required ?? false })),
  })),
});

export const validateBuilderSchema = (name: string, schema: AnamnesisTemplateSchema) => {
  const errors: string[] = [];
  if (!name.trim()) errors.push('Informe um nome para o modelo.');
  if (!schema.sections.length) errors.push('Adicione pelo menos uma seção.');
  const validation = validateAnamnesisSchema(schema);
  errors.push(...validation.errors.map((error) => error.replace(/schema|sections|fields|id|key/g, 'estrutura')));
  return Array.from(new Set(errors));
};

export const readBuilderDraft = (userId: string, templateId: string | null) => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(`${BUILDER_DRAFT_PREFIX}${userId}:${templateId || 'new'}`);
    return raw ? JSON.parse(raw) as { name: string; schema: AnamnesisTemplateSchema } : null;
  } catch { return null; }
};

export const writeBuilderDraft = (userId: string, templateId: string | null, value: { name: string; schema: AnamnesisTemplateSchema }) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(`${BUILDER_DRAFT_PREFIX}${userId}:${templateId || 'new'}`, JSON.stringify(value));
};

export const clearBuilderDraft = (userId: string, templateId: string | null) => {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(`${BUILDER_DRAFT_PREFIX}${userId}:${templateId || 'new'}`);
};
