import assert from 'node:assert/strict';
import { buildSnapshot, hashToken, statusFor, validateAnswers } from '../server/anamnesisLinkForms';

const definition = {
  schemaVersion: 1,
  sections: [
    { id: 'basic', key: 'basic_information', title: 'Informações básicas', kind: 'basic_information', fields: [{ id: 'phone', key: 'patient_phone', label: 'Telefone', type: 'text', patientReference: 'phone' }] },
    { id: 'clinical', key: 'clinical', title: 'Contexto', fields: [
      { id: 'name', key: 'name', label: 'Nome social', type: 'text', required: true },
      { id: 'scale', key: 'scale', label: 'Escala', type: 'scale', min: 0, max: 10 },
      { id: 'choice', key: 'choice', label: 'Escolha', type: 'select', options: ['A', 'B'] },
    ] },
  ],
};

const snapshot = buildSnapshot(definition, { templateVersionId: 'version-1', templateName: 'Modelo QA', versionNumber: 3, fieldIds: ['phone', 'name', 'scale', 'choice'] });
assert.equal(snapshot.sections[0].fields[0].patientReference, 'phone');
assert.equal((snapshot.sections[0].fields[0] as any).value, undefined);
assert.equal(validateAnswers(snapshot, { phone: 'novo', name: 'Ana', scale: 7, choice: 'B' }, true).valid, true);
assert.equal(validateAnswers(snapshot, { name: 'Ana', scale: 11, choice: 'C' }, true).valid, false);
assert.equal(validateAnswers(snapshot, { name: 'Ana', unknown: 'x' }, false).valid, false);
assert.equal(validateAnswers(snapshot, {}, true).errors.some((error) => error.fieldId === 'name'), true);
assert.equal(hashToken('token-de-teste').length, 64);
assert.notEqual(hashToken('token-de-teste'), 'token-de-teste');
assert.equal(statusFor({ revoked_at: new Date().toISOString() }, null, false), 'revoked');
assert.equal(statusFor({ expires_at: new Date(Date.now() - 1000).toISOString(), revoked_at: null, submitted_at: null }, { revision: 0 }, false), 'expired');
assert.equal(statusFor({ expires_at: new Date(Date.now() + 60_000).toISOString(), revoked_at: null, submitted_at: null }, { revision: 1 }, false), 'in_progress');
assert.equal(statusFor({ expires_at: new Date(Date.now() + 60_000).toISOString(), revoked_at: null, submitted_at: new Date().toISOString() }, { revision: 1 }, false), 'responded');
assert.equal(statusFor({ expires_at: new Date(Date.now() + 60_000).toISOString(), revoked_at: null, submitted_at: new Date().toISOString() }, { revision: 1 }, true), 'incorporated');

console.log('anamnesis-link-forms tests passed');
