import assert from 'node:assert/strict';
import { getHistoryPatientPath } from '../src/utils/clinicHistoryRouting';

const patientsMap = {
  'patient-123': {
    organizationPatientId: 'org-patient-987',
  },
};

assert.equal(
  getHistoryPatientPath('patient-123', false, patientsMap),
  '/painel/patients/patient-123',
);
assert.equal(
  getHistoryPatientPath('patient-123', true, patientsMap),
  '/painel/clinica/pacientes/org-patient-987',
);
assert.notEqual(
  getHistoryPatientPath('patient-123', true, patientsMap),
  '/painel/clinica/pacientes/patient-123',
);

console.log('clinic History patient routing with distinct IDs: PASS');
