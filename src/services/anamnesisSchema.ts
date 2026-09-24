export const ANAMNESIS_FIELD_TYPES = [
  'text',
  'textarea',
  'date',
  'number',
  'select',
  'multiselect',
  'yes_no',
  'scale',
] as const;

export type AnamnesisFieldType = (typeof ANAMNESIS_FIELD_TYPES)[number];

export type AnamnesisPatientReference =
  | 'full_name'
  | 'birth_date'
  | 'cpf'
  | 'phone'
  | 'postal_code'
  | 'street'
  | 'address_number'
  | 'address_complement'
  | 'neighborhood'
  | 'city'
  | 'state';

export type AnamnesisField = {
  id?: string;
  key: string;
  label: string;
  type: AnamnesisFieldType;
  required?: boolean;
  order?: number;
  placeholder?: string;
  helpText?: string;
  options?: string[];
  min?: number;
  max?: number;
  native?: boolean;
  patientReference?: AnamnesisPatientReference;
  metadata?: Record<string, unknown>;
};

export type AnamnesisSection = {
  id?: string;
  key: string;
  title: string;
  description?: string;
  order?: number;
  kind?: 'standard' | 'basic_information';
  fields: AnamnesisField[];
};

export type AnamnesisTemplateSchema = {
  schemaVersion?: 1;
  sections: AnamnesisSection[];
};

export type AnamnesisPatientContext = {
  full_name: string | null;
  birth_date: string | null;
  cpf: string | null;
  phone: string | null;
  postal_code: string | null;
  street: string | null;
  address_number: string | null;
  address_complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
};

export const BASIC_INFORMATION_SECTION_KEY = 'basic_information';
export const OCCUPATION_FIELD_KEY = 'occupation';

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const hasText = (value: unknown) => typeof value === 'string' && value.trim().length > 0;

export function isAnamnesisFieldType(value: unknown): value is AnamnesisFieldType {
  return typeof value === 'string' && (ANAMNESIS_FIELD_TYPES as readonly string[]).includes(value);
}

export function validateAnamnesisSchema(schema: unknown, options: { legacy?: boolean } = {}) {
  const errors: string[] = [];
  if (!isObject(schema) || !Array.isArray(schema.sections)) {
    return { valid: false, errors: ['schema.sections deve ser uma lista.'] };
  }

  const sectionIds = new Set<string>();
  const fieldIds = new Set<string>();
  const basicSections = schema.sections.filter((section) => isObject(section) && section.kind === 'basic_information');
  if (basicSections.length > 1) errors.push('O schema pode conter apenas uma seção Informações básicas.');

  schema.sections.forEach((rawSection, sectionIndex) => {
    if (!isObject(rawSection)) {
      errors.push(`sections[${sectionIndex}] deve ser um objeto.`);
      return;
    }
    if (!hasText(rawSection.key)) errors.push(`sections[${sectionIndex}].key é obrigatório.`);
    if (!hasText(rawSection.title)) errors.push(`sections[${sectionIndex}].title é obrigatório.`);
    if (!Array.isArray(rawSection.fields)) errors.push(`sections[${sectionIndex}].fields deve ser uma lista.`);
    if (!options.legacy && !hasText(rawSection.id)) errors.push(`sections[${sectionIndex}].id é obrigatório em schemas novos.`);
    if (hasText(rawSection.id)) {
      const sectionId = String(rawSection.id);
      if (sectionIds.has(sectionId)) errors.push(`ID de seção duplicado: ${sectionId}.`);
      sectionIds.add(sectionId);
    }

    if (!Array.isArray(rawSection.fields)) return;
    rawSection.fields.forEach((rawField, fieldIndex) => {
      if (!isObject(rawField)) {
        errors.push(`sections[${sectionIndex}].fields[${fieldIndex}] deve ser um objeto.`);
        return;
      }
      if (!hasText(rawField.key)) errors.push(`Campo ${sectionIndex}/${fieldIndex} sem key.`);
      if (!hasText(rawField.label)) errors.push(`Campo ${sectionIndex}/${fieldIndex} sem label.`);
      if (!isAnamnesisFieldType(rawField.type)) errors.push(`Tipo inválido no campo ${String(rawField.key || `${sectionIndex}/${fieldIndex}`)}.`);
      if (!options.legacy && !hasText(rawField.id)) errors.push(`Campo ${String(rawField.key || `${sectionIndex}/${fieldIndex}`)} sem id.`);
      if (hasText(rawField.id)) {
        const fieldId = String(rawField.id);
        if (fieldIds.has(fieldId)) errors.push(`ID de campo duplicado: ${fieldId}.`);
        fieldIds.add(fieldId);
      }
      if (['select', 'multiselect'].includes(String(rawField.type)) && !Array.isArray(rawField.options)) {
        errors.push(`Campo ${String(rawField.key)} exige options.`);
      }
      if (rawField.patientReference && !isPatientReference(rawField.patientReference)) {
        errors.push(`Referência de paciente inválida no campo ${String(rawField.key)}.`);
      }
    });
  });

  return { valid: errors.length === 0, errors };
}

export function isPatientReference(value: unknown): value is AnamnesisPatientReference {
  return [
    'full_name', 'birth_date', 'cpf', 'phone', 'postal_code', 'street',
    'address_number', 'address_complement', 'neighborhood', 'city', 'state',
  ].includes(String(value));
}

export function normalizeAnamnesisSchema(schema: AnamnesisTemplateSchema): AnamnesisTemplateSchema {
  return {
    schemaVersion: 1,
    sections: [...(schema.sections || [])]
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((section, sectionIndex) => ({
        ...section,
        order: section.order ?? sectionIndex,
        fields: [...(section.fields || [])]
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          .map((field, fieldIndex) => ({
            ...field,
            order: field.order ?? fieldIndex,
            required: field.required ?? false,
          })),
      })),
  };
}

export function getPatientContextSnapshot(patient: Partial<AnamnesisPatientContext> | null | undefined): AnamnesisPatientContext {
  return {
    full_name: patient?.full_name ?? null,
    birth_date: patient?.birth_date ?? null,
    cpf: patient?.cpf ?? null,
    phone: patient?.phone ?? null,
    postal_code: patient?.postal_code ?? null,
    street: patient?.street ?? null,
    address_number: patient?.address_number ?? null,
    address_complement: patient?.address_complement ?? null,
    neighborhood: patient?.neighborhood ?? null,
    city: patient?.city ?? null,
    state: patient?.state ?? null,
  };
}
