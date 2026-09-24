import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isCompletePostalCode, formatPostalCode } from '../src/services/cep';

const patientFormSource = readFileSync(new URL('../src/pages/PatientForm.tsx', import.meta.url), 'utf8');
const typedValues = ['0', '01', '013', '0131', '01310', '01310-1', '01310-10', '01310-100'];
const formattedValues = typedValues.map(formatPostalCode);

assert.equal(formattedValues.at(-1), '01310-100');
assert.equal(isCompletePostalCode(formattedValues.at(-2) || ''), false);
assert.equal(isCompletePostalCode(formattedValues.at(-1) || ''), true);
assert.match(patientFormSource, /if \(isCompletePostalCode\(postal_code\)\) void lookupPostalCode\(postal_code\);/);
assert.match(patientFormSource, /street: address\.street/);
assert.match(patientFormSource, /neighborhood: address\.neighborhood/);
assert.match(patientFormSource, /city: address\.city/);
assert.match(patientFormSource, /state: address\.state/);

console.log('Patient address autocomplete contract tests passed');
