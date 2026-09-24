import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  getPatientGoogleSetupAlert,
  getPatientGoogleSetupState,
} from '../src/utils/patientGoogleSetup.js';

assert.equal(getPatientGoogleSetupState({}), 'missing-both');
assert.equal(getPatientGoogleSetupState({ target_folder_id: 'folder-1' }), 'missing-document');
assert.equal(getPatientGoogleSetupState({ google_doc_id: 'doc-1' }), 'missing-folder');
assert.equal(getPatientGoogleSetupState({ target_folder_id: 'folder-1', google_doc_id: 'doc-1' }), 'complete');
assert.equal(getPatientGoogleSetupState({ target_folder_id: '  ', google_doc_id: null }), 'missing-both');

assert.match(getPatientGoogleSetupAlert('missing-both').message, /e, em seguida/);
assert.match(getPatientGoogleSetupAlert('missing-folder').message, /selecione ou crie uma pasta/);
assert.match(getPatientGoogleSetupAlert('missing-document').message, /A pasta do Google Drive já está definida/);

const patientFormSource = readFileSync('src/pages/PatientForm.tsx', 'utf8');
const validationPosition = patientFormSource.indexOf('const googleSetupState = getPatientGoogleSetupState(formData);');
const persistencePosition = patientFormSource.indexOf('const patientData: any = {');
assert.ok(validationPosition >= 0, 'submit central deve validar a configuração Google');
assert.ok(validationPosition < persistencePosition, 'a validação Google deve ocorrer antes da persistência');
assert.match(patientFormSource, /legacyGoogleSetupPendingRef/);
assert.match(patientFormSource, /data-google-folder-control/);
assert.match(patientFormSource, /data-google-document-control/);
assert.doesNotMatch(readFileSync('src/utils/patientFormDraft.ts', 'utf8'), /provider_token|access_token|refresh_token|JWT/);

console.log('patient-google-setup.test.ts: all assertions passed');
