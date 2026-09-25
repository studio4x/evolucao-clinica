import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildEmailShareUrl, buildWhatsAppShareUrl, isValidPatientEmail, normalizePatientEmail, normalizePatientEmailOrNull } from '../src/utils/anamnesisLinkSharing';

const link = 'https://www.evolucaoclinica.app.br/preencher/anamnese/synthetic-token';
const whatsapp = buildWhatsAppShareUrl('+55 (11) 98888-7777', link);
assert.match(whatsapp || '', /^https:\/\/wa\.me\/5511988887777\?text=/);
assert.match(decodeURIComponent((whatsapp || '').split('?text=')[1] || ''), /formulário de Anamnese/);
assert.doesNotMatch(decodeURIComponent((whatsapp || '').split('?text=')[1] || ''), /diagnóstico|CPF|respostas|clínic/);
assert.equal(buildWhatsAppShareUrl('', link), null);
assert.equal(buildWhatsAppShareUrl('123', link), null);

const email = buildEmailShareUrl('  Paciente@Example.COM ', link);
assert.match(email || '', /^mailto:Paciente%40Example\.COM\?/i);
assert.match(decodeURIComponent(email || ''), /Anamnese para preenchimento/);
assert.match(decodeURIComponent(email || ''), /formulário de Anamnese/);
assert.doesNotMatch(decodeURIComponent(email || ''), /diagnóstico|CPF|respostas|clínic/);
assert.equal(buildEmailShareUrl('sem-email', link), null);

assert.equal(normalizePatientEmail('  Pessoa@Example.COM '), 'pessoa@example.com');
assert.equal(isValidPatientEmail(''), true);
assert.equal(isValidPatientEmail('pessoa@example.com'), true);
assert.equal(isValidPatientEmail('pessoa@'), false);
assert.equal(normalizePatientEmailOrNull(''), null);
assert.equal(normalizePatientEmailOrNull('invalido'), null);
assert.equal(normalizePatientEmailOrNull('Pessoa@Example.COM'), 'pessoa@example.com');

const shareSource = readFileSync('src/components/anamnesis/AnamnesisLinkRequests.tsx', 'utf8');
const patientFormSource = readFileSync('src/pages/PatientForm.tsx', 'utf8');
const patientAnamnesisSource = readFileSync('src/pages/PatientAnamnesis.tsx', 'utf8');
const migrationSource = readFileSync('supabase/migrations/20260925190034_add_patient_email_for_link_sharing.sql', 'utf8');

assert.match(shareSource, /onEnsureCurrent/);
assert.match(shareSource, /current\?\.status === 'completed'/);
assert.match(shareSource, /Enviar pelo WhatsApp/);
assert.match(shareSource, /Enviar por e-mail/);
assert.match(shareSource, /Copiar link/);
assert.match(shareSource, /Criar outro envio/);
assert.match(shareSource, /buildWhatsAppShareUrl/);
assert.match(shareSource, /buildEmailShareUrl/);
assert.match(shareSource, /A resposta ficará pendente de revisão/);
assert.match(patientFormSource, /email: string/);
assert.match(patientFormSource, /type="email"/);
assert.match(patientFormSource, /isValidPatientEmail/);
assert.match(patientFormSource, /email: normalizedEmail \|\| null/);
assert.match(patientAnamnesisSource, /email, postal_code/);
assert.match(patientAnamnesisSource, /onEnsureCurrent=\{ensureCurrent\}/);
assert.match(migrationSource, /add column if not exists email text/);

console.log('anamnesis-link-sharing tests passed');
