import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const anamnesis = readFileSync('src/pages/PatientAnamnesis.tsx', 'utf8');
const anamnesisCard = readFileSync('src/components/patients/PatientAnamnesisSummaryCard.tsx', 'utf8');
const patientFilesCard = readFileSync('src/components/patients/PatientFilesCard.tsx', 'utf8');

assert.match(anamnesis, /grid grid-cols-1 gap-6 lg:grid-cols-5/, 'A Anamnese bloqueada deve usar o layout promocional de duas colunas.');
assert.match(anamnesis, /Disponível no Plano Anual/, 'A Anamnese bloqueada deve informar a disponibilidade no Plano Anual.');
assert.match(anamnesis, /Fazer Upgrade Agora/, 'A Anamnese bloqueada deve oferecer o upgrade.');
assert.match(anamnesisCard, /<Crown[^>]*fill-current/, 'O card de Anamnese deve identificar o recurso premium.');
assert.match(patientFilesCard, /<Crown[^>]*fill-current/, 'O card de Arquivos do paciente deve identificar o recurso premium.');

console.log('Annual feature access tests passed.');
