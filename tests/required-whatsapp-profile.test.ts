import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { normalizeRequiredWhatsAppNumber, RequiredWhatsAppNumberError } from '../src/utils/whatsappNumber.js';

assert.equal(normalizeRequiredWhatsAppNumber('+55 (11) 99988-7766'), '5511999887766');
assert.throws(() => normalizeRequiredWhatsAppNumber(''), RequiredWhatsAppNumberError);
assert.throws(() => normalizeRequiredWhatsAppNumber('123'), RequiredWhatsAppNumberError);

const onboardingSource = readFileSync(resolve('src/pages/Onboarding.tsx'), 'utf8');
const profileSource = readFileSync(resolve('src/pages/Profile.tsx'), 'utf8');
const adminSource = readFileSync(resolve('src/pages/AdminPanel.tsx'), 'utf8');

assert.match(onboardingSource, /id="onboarding-whatsapp"[\s\S]*?type="tel"[\s\S]*?required/);
assert.match(onboardingSource, /normalizeRequiredWhatsAppNumber\(whatsappNumber\)/);
assert.match(profileSource, /type="tel"[\s\S]*?required[\s\S]*?value=\{whatsappNumber\}/);
assert.match(adminSource, /ProfessionalDetailsModal/);

console.log('Required WhatsApp and professional details tests passed.');
