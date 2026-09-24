import assert from 'node:assert/strict';
import {
  PATIENT_FORM_DRAFT_TTL_MS,
  clearPatientFormDraft,
  getPatientFormDraftKey,
  getLegacyPatientFormDraftKey,
  readPatientFormDraft,
  writePatientFormDraft,
} from '../src/utils/patientFormDraft.js';

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const now = Date.parse('2026-09-24T15:00:00.000Z');
const key = getPatientFormDraftKey('professional-1', undefined, true);
const draft = {
  patientId: null,
  formData: { full_name: 'Paciente OAuth', postal_code: '01001-000', session_schedule: [{ weekday: 1, time: '08:00' }] },
  ddi: '+55',
  phoneCountry: 'BR',
  savedAt: new Date(now).toISOString(),
};

const local = new MemoryStorage();
assert.equal(writePatientFormDraft(key, draft, local), true);
assert.deepEqual(readPatientFormDraft<typeof draft.formData>(key, now, local, null)?.formData, draft.formData);

const legacy = new MemoryStorage();
assert.deepEqual(readPatientFormDraft<typeof draft.formData>(key, now, new MemoryStorage(), legacy), null);
legacy.setItem(key, JSON.stringify(draft));
const migrated = new MemoryStorage();
assert.deepEqual(readPatientFormDraft<typeof draft.formData>(key, now, migrated, legacy)?.formData, draft.formData);
assert.notEqual(migrated.getItem(key), null);

const expired = { ...draft, savedAt: new Date(now - PATIENT_FORM_DRAFT_TTL_MS - 1).toISOString() };
local.setItem(key, JSON.stringify(expired));
assert.equal(readPatientFormDraft(key, now, local, null), null);

local.setItem(key, JSON.stringify(draft));
clearPatientFormDraft(key, local, legacy);
assert.equal(local.getItem(key), null);
assert.equal(legacy.getItem(key), null);

const standardKey = getPatientFormDraftKey('professional-1');
const editKey = getPatientFormDraftKey('professional-1', 'patient-1');
const legacyKey = getLegacyPatientFormDraftKey('professional-1', '/painel/patients/new');
assert.notEqual(standardKey, editKey);
assert.notEqual(standardKey, key);
assert.equal(legacyKey, 'evolucao-clinica:patient-form-draft:professional-1:/painel/patients/new');

console.log('patient-form-draft.test.ts: all assertions passed');
