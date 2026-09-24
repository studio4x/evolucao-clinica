import assert from 'node:assert/strict';
import {
  BASIC_INFORMATION_SECTION_KEY,
  OCCUPATION_FIELD_KEY,
  validateAnamnesisSchema,
  normalizeAnamnesisSchema,
} from '../src/services/anamnesisSchema';
import { buildPatientContextSnapshot, getAnamnesisFieldAnswerKey, resolveAnamnesisFieldValue } from '../src/services/anamnesisValueResolver';
import { buildAnamnesisPdfContent } from '../src/utils/anamnesisPdf';

const legacy = {
  sections: [{ key: 'history', title: 'Histórico', fields: [{ key: 'notes', label: 'Notas', type: 'textarea' }] }],
};

assert.equal(validateAnamnesisSchema(legacy, { legacy: true }).valid, true);
assert.equal(validateAnamnesisSchema(legacy).valid, false);

const modern = {
  schemaVersion: 1 as const,
  sections: [{
    id: 'section-1', key: BASIC_INFORMATION_SECTION_KEY, title: 'Informações básicas', kind: 'basic_information' as const, order: 0,
    fields: [
      { id: 'field-native', key: 'patient_name', label: 'Nome', type: 'text' as const, required: false, order: 0, native: true, patientReference: 'full_name' as const },
      { id: 'field-occupation', key: OCCUPATION_FIELD_KEY, label: 'Profissão/Ocupação', type: 'text' as const, required: false, order: 1 },
    ],
  }],
};

assert.equal(validateAnamnesisSchema(modern).valid, true);
assert.equal(normalizeAnamnesisSchema(modern).sections[0].fields[0].required, false);
assert.equal(getAnamnesisFieldAnswerKey(modern.sections[0].fields[1]), 'field-occupation');
assert.equal(resolveAnamnesisFieldValue(modern.sections[0].fields[0], {}, { full_name: 'Maria' }), 'Maria');
assert.equal(resolveAnamnesisFieldValue(modern.sections[0].fields[1], { 'field-occupation': 'Professora' }, null), 'Professora');

assert.deepEqual(buildPatientContextSnapshot({
  full_name: 'Maria',
  phone: '5511999999999',
  city: 'São Paulo',
  state: 'SP',
  google_doc_id: 'must-not-be-included',
} as any), {
  full_name: 'Maria', birth_date: null, cpf: null, phone: '5511999999999', postal_code: null,
  street: null, address_number: null, address_complement: null, neighborhood: null, city: 'São Paulo', state: 'SP',
});

const legacyCompatibilitySchema = {
  sections: [{
    key: 'history',
    title: 'Histórico legado',
    fields: [
      { key: 'legacy_notes', label: 'Notas do registro legado', type: 'textarea' as const },
      { key: 'legacy_scale', label: 'Escala legada', type: 'scale' as const, min: 1, max: 5 },
    ],
  }],
};
const legacyCompatibilityAnswers = { legacy_notes: 'Resposta legada QA', legacy_scale: 4 };
const legacyCompatibilityRecord = {
  templateName: 'Geral',
  templateVersion: 1,
  status: 'completed',
  createdAt: '2026-09-24T17:47:46.887Z',
  updatedAt: '2026-09-24T17:47:46.887Z',
  completedAt: '2026-09-24T17:47:46.887Z',
  templateSnapshot: legacyCompatibilitySchema,
  answers: legacyCompatibilityAnswers,
  patientContextSnapshot: null,
} as any;

assert.equal(validateAnamnesisSchema(legacyCompatibilitySchema, { legacy: true }).valid, true);
assert.equal(legacyCompatibilitySchema.sections.some((section) => section.key === BASIC_INFORMATION_SECTION_KEY), false);
assert.equal(getAnamnesisFieldAnswerKey(legacyCompatibilitySchema.sections[0].fields[0]), 'legacy_notes');
assert.equal(resolveAnamnesisFieldValue(legacyCompatibilitySchema.sections[0].fields[0], legacyCompatibilityAnswers, null), 'Resposta legada QA');
assert.equal(resolveAnamnesisFieldValue(legacyCompatibilitySchema.sections[0].fields[1], legacyCompatibilityAnswers, null), 4);
assert.equal(legacyCompatibilityRecord.patientContextSnapshot, null);
const legacyPdfContent = buildAnamnesisPdfContent(legacyCompatibilityRecord);
assert.match(legacyPdfContent, /Histórico legado/);
assert.match(legacyPdfContent, /Resposta legada QA/);
assert.match(legacyPdfContent, /Escala legada/);
assert.match(legacyPdfContent, /\n4\n/);
assert.doesNotMatch(legacyPdfContent, /Informações básicas/);

console.log('Anamnesis foundation tests passed.');
