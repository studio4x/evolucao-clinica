import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  formatWhatsAppNationalNumber,
  getWhatsAppCountryOptions,
  splitStoredWhatsAppNumber,
} from '../src/utils/whatsappNumber.js';

const countries = getWhatsAppCountryOptions();

assert.ok(countries.length > 200, 'A lista deve incluir o catálogo internacional de países');
for (const countryCode of ['BR', 'PT', 'US', 'AO', 'JP']) {
  const country = countries.find((option) => option.code === countryCode);
  assert.ok(country, `O país ${countryCode} deve estar disponível`);
  assert.ok(country.flag, `O país ${countryCode} deve exibir sua bandeira`);
  assert.ok(country.callingCode, `O país ${countryCode} deve exibir seu DDI`);
}

assert.equal(formatWhatsAppNationalNumber('912345678', 'PT'), '912 345 678');
assert.deepEqual(splitStoredWhatsAppNumber('+351 912 345 678'), {
  country: 'PT',
  nationalNumber: '912 345 678',
});
assert.deepEqual(splitStoredWhatsAppNumber('(11) 99999-9999'), {
  country: 'BR',
  nationalNumber: '(11) 99999-9999',
});
assert.deepEqual(splitStoredWhatsAppNumber('+1 416 555-0123'), {
  country: 'CA',
  nationalNumber: '(416) 555-0123',
});

const patientFormSource = readFileSync('src/pages/PatientForm.tsx', 'utf8');

assert.match(patientFormSource, /PATIENT_PHONE_COUNTRY_OPTIONS = getWhatsAppCountryOptions\(\)/);
assert.match(patientFormSource, /country\.flag\} \{country\.name\} \(\+\{country\.callingCode\}\)/);
assert.match(patientFormSource, /aria-label="País e DDI do telefone do paciente"/);
assert.match(patientFormSource, /type="tel"/);
assert.match(patientFormSource, /formatWhatsAppNationalNumber\(e\.target\.value, phoneCountry\)/);
assert.match(patientFormSource, /splitStoredWhatsAppNumber\(/);
assert.doesNotMatch(patientFormSource, /const COUNTRIES = \[/);
assert.doesNotMatch(patientFormSource, /const formatPhoneNumber =/);

console.log('Patient international phone tests passed.');
