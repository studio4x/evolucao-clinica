import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const anamnesis = readFileSync('src/pages/PatientAnamnesis.tsx', 'utf8');
const anamnesisCard = readFileSync('src/components/patients/PatientAnamnesisSummaryCard.tsx', 'utf8');
const patientFilesCard = readFileSync('src/components/patients/PatientFilesCard.tsx', 'utf8');
const sessionsPage = readFileSync('src/pages/PatientSessions.tsx', 'utf8');
const sessionsCard = readFileSync('src/components/patients/PatientSessionsSummaryCard.tsx', 'utf8');
const subscriptionPlans = readFileSync('src/config/subscriptionPlans.ts', 'utf8');
const landingPage = readFileSync('src/pages/LandingPage.tsx', 'utf8');
const subscriptionPage = readFileSync('src/pages/Subscription.tsx', 'utf8');

assert.match(anamnesis, /grid grid-cols-1 gap-6 lg:grid-cols-5/, 'A Anamnese bloqueada deve usar o layout promocional de duas colunas.');
assert.match(anamnesis, /Disponível no Plano Anual/, 'A Anamnese bloqueada deve informar a disponibilidade no Plano Anual.');
assert.match(anamnesis, /Fazer Upgrade Agora/, 'A Anamnese bloqueada deve oferecer o upgrade.');
assert.match(anamnesisCard, /<Crown[^>]*fill-current/, 'O card de Anamnese deve identificar o recurso premium.');
assert.match(patientFilesCard, /<Crown[^>]*/, 'O card de Arquivos do paciente deve identificar o recurso premium.');
assert.match(patientFilesCard, /Como funcionam os Arquivos do paciente\?/, 'A aba Arquivos deve explicar a funcionalidade dentro da própria aba.');
assert.match(patientFilesCard, /Fazer Upgrade Agora/, 'A aba Arquivos deve oferecer o upgrade dentro da própria aba.');
assert.match(sessionsPage, /if \(!hasYearlyAccess\)/, 'O Controle de Sessões deve bloquear a página sem acesso anual.');
assert.match(sessionsPage, /Disponível no Plano Anual/, 'A página bloqueada deve informar a disponibilidade no Plano Anual.');
assert.match(sessionsCard, /if \(!hasYearlyAccess\)/, 'O resumo do Controle de Sessões não deve carregar dados sem acesso anual.');
assert.match(sessionsCard, /<Crown[^>]*fill-current/, 'O card de Controle de Sessões deve identificar o recurso premium.');
assert.match(subscriptionPlans, /Controle de sessões com assinatura e fechamento mensal/, 'O benefício deve aparecer no catálogo do Plano Anual usado na Landing e no painel.');
assert.match(landingPage, /isYearly && idx === 0 \? 'rounded-md bg-brand-primary\/10/, 'A Landing Page deve destacar o item Tudo do plano mensal.');
assert.match(subscriptionPage, /isYearly && idx === 0 \? 'rounded-md bg-brand-primary\/10/, 'O painel deve destacar o item Tudo do plano mensal.');

console.log('Annual feature access tests passed.');
