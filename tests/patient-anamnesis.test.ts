import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync('src/App.tsx', 'utf8');
const patientDetailSource = readFileSync('src/pages/PatientDetail.tsx', 'utf8');
const anamnesisPageSource = readFileSync('src/pages/PatientAnamnesis.tsx', 'utf8');
const anamnesisServiceSource = readFileSync('src/services/anamnesis.ts', 'utf8');
const anamnesisCardSource = readFileSync('src/components/patients/PatientAnamnesisSummaryCard.tsx', 'utf8');
const migrationSource = readFileSync('supabase/migrations/20260918192205_add_versioned_patient_anamnesis.sql', 'utf8');

assert.match(appSource, /PatientAnamnesis/);
assert.match(appSource, /patients\/:id\/anamnesis/);

assert.match(patientDetailSource, /Abrir anamnese/);
assert.match(patientDetailSource, /hidden xl:flex/);
assert.match(patientDetailSource, /<PatientAnamnesisSummaryCard/);
assert.match(patientDetailSource, /xl:hidden/);

assert.match(anamnesisPageSource, /Modelo do formulário/);
assert.match(anamnesisPageSource, /900/);
assert.match(anamnesisPageSource, /Salvo automaticamente/);
assert.match(anamnesisPageSource, /Concluir anamnese/);
assert.match(anamnesisPageSource, /Trocar modelo de anamnese/);
assert.match(anamnesisPageSource, /A anamnese atual será preservada no histórico/);
assert.match(anamnesisPageSource, /Modelos anteriores/);
assert.doesNotMatch(anamnesisPageSource, /Gemini|inteligência artificial|\bIA\b/);

assert.match(anamnesisServiceSource, /getRecommendedAnamnesisTemplate/);
assert.match(anamnesisServiceSource, /templateKey === 'general'/);
assert.match(anamnesisServiceSource, /start_patient_anamnesis/);
assert.match(anamnesisServiceSource, /is_current/);

assert.match(anamnesisCardSource, /Não iniciada|Preencher anamnese/);
assert.match(anamnesisCardSource, /Rascunho/);
assert.match(anamnesisCardSource, /Concluída/);

assert.match(migrationSource, /create table if not exists public\.anamnesis_templates/);
assert.match(migrationSource, /create table if not exists public\.patient_anamneses/);
assert.match(migrationSource, /template_snapshot jsonb/);
assert.match(migrationSource, /patient_anamneses_one_current_idx/);
assert.match(migrationSource, /security invoker/);
assert.match(migrationSource, /patient_anamneses_owner_select/);
assert.match(migrationSource, /patient_anamneses_owner_insert/);
assert.match(migrationSource, /patient_anamneses_owner_update/);
assert.match(migrationSource, /grant select on table public\.anamnesis_templates to authenticated/);
assert.match(migrationSource, /Terapia Ocupacional/);
assert.match(migrationSource, /Psicologia \/ Psicoterapia/);
assert.match(migrationSource, /Fonoaudiologia/);
assert.match(migrationSource, /Fisioterapia/);
assert.match(migrationSource, /Psicopedagogia/);
assert.match(migrationSource, /Nutrição/);
assert.match(migrationSource, /Medicina/);
assert.match(migrationSource, /Enfermagem/);
assert.match(migrationSource, /Odontologia/);
assert.match(migrationSource, /Serviço Social/);
assert.match(migrationSource, /Educação Física/);
assert.match(migrationSource, /Arteterapeuta/);

console.log('Patient anamnesis tests passed.');
