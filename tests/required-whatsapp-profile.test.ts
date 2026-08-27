import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  formatWhatsAppNationalNumber,
  getWhatsAppCountryCallingCode,
  getWhatsAppCountryOptions,
  normalizeRequiredWhatsAppNationalNumber,
  normalizeRequiredWhatsAppNumber,
  RequiredWhatsAppNumberError,
  splitStoredWhatsAppNumber,
} from '../src/utils/whatsappNumber.js';

assert.equal(normalizeRequiredWhatsAppNumber('+55 (11) 99988-7766'), '5511999887766');
assert.throws(() => normalizeRequiredWhatsAppNumber(''), RequiredWhatsAppNumberError);
assert.throws(() => normalizeRequiredWhatsAppNumber('123'), RequiredWhatsAppNumberError);
assert.equal(getWhatsAppCountryCallingCode('BR'), '55');
assert.equal(formatWhatsAppNationalNumber('11999999999', 'BR'), '(11) 99999-9999');
assert.equal(normalizeRequiredWhatsAppNationalNumber('(11) 99999-9999', 'BR'), '5511999999999');
assert.equal(normalizeRequiredWhatsAppNationalNumber('(202) 555-0123', 'US'), '12025550123');
assert.deepEqual(splitStoredWhatsAppNumber('5511999999999'), {
  country: 'BR',
  nationalNumber: '(11) 99999-9999',
});
assert.ok(getWhatsAppCountryOptions().some((country) => (
  country.code === 'BR'
  && country.callingCode === '55'
  && country.flag === '🇧🇷'
)));
assert.throws(
  () => normalizeRequiredWhatsAppNationalNumber('11999', 'BR'),
  RequiredWhatsAppNumberError,
);

const onboardingSource = readFileSync(resolve('src/pages/Onboarding.tsx'), 'utf8');
const profileSource = readFileSync(resolve('src/pages/Profile.tsx'), 'utf8');
const preferencesSource = readFileSync(resolve('src/pages/CommunicationPreferences.tsx'), 'utf8');
const verificationFieldSource = readFileSync(resolve('src/components/common/WhatsAppVerificationField.tsx'), 'utf8');
const adminSource = readFileSync(resolve('src/pages/AdminPanel.tsx'), 'utf8');

assert.match(onboardingSource, /id="onboarding-whatsapp"[\s\S]*?type="tel"[\s\S]*?required/);
assert.match(onboardingSource, /id="onboarding-whatsapp-country"[\s\S]*?aria-label="País do WhatsApp"/);
assert.match(onboardingSource, /normalizeRequiredWhatsAppNationalNumber\(whatsappNumber, whatsappCountry\)/);
assert.match(onboardingSource, /placeholder=\{whatsappCountry === 'BR' \? '\(99\) 99999-9999'/);
assert.match(profileSource, /<WhatsAppVerificationField[\s\S]*?idPrefix="profile-whatsapp"/);
assert.match(profileSource, /whatsappVerifiedNumber !== normalizedWhatsApp/);
assert.match(preferencesSource, /<WhatsAppVerificationField[\s\S]*?idPrefix="preferences-whatsapp"/);
assert.match(preferencesSource, /preferences\.whatsapp_verified_number !== normalizedWhatsApp/);
assert.match(verificationFieldSource, /getWhatsAppCountryOptions\(\)/);
assert.match(verificationFieldSource, /placeholder=\{country === 'BR' \? '\(99\) 99999-9999'/);
assert.match(verificationFieldSource, /\/api\/onboarding\/whatsapp-verification\/request/);
assert.match(verificationFieldSource, /\/api\/onboarding\/whatsapp-verification\/verify/);
assert.match(verificationFieldSource, /autoComplete="one-time-code"/);
assert.match(verificationFieldSource, /WhatsApp verificado/);
assert.match(adminSource, /ProfessionalDetailsModal/);

console.log('Required WhatsApp and professional details tests passed.');
