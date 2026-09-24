import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const builder = readFileSync('src/pages/AnamnesisBuilder.tsx', 'utf8');
const models = readFileSync('src/pages/AnamnesisModels.tsx', 'utf8');
const patientAnamnesis = readFileSync('src/pages/PatientAnamnesis.tsx', 'utf8');

assert.match(patientAnamnesis, /btn-primary inline-flex items-center gap-1\.5 px-3 py-2 text-xs/);
assert.match(patientAnamnesis, /Settings2/);
assert.match(patientAnamnesis, /navigate\('\/painel\/anamnesis\/modelos', \{ state: \{ from:/);

assert.match(models, /ArrowLeft/);
assert.match(models, /navigate\(returnTo\)/);
assert.match(models, /requestedReturnTo.*startsWith\('\/painel\/'\)/s);
assert.match(models, /grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4/);
assert.equal((models.match(/grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4/g) || []).length, 2);
assert.match(models, /Editar/);
assert.match(models, /Duplicar/);
assert.match(models, /Arquivar|Restaurar/);

assert.match(builder, /writeBuilderDraft/);
assert.match(builder, /setDraftSaveState\('pending'\)/);
assert.match(builder, /Salvando rascunho/);
assert.match(builder, /Rascunho salvo/);
assert.match(builder, /Rascunho não salvo/);
assert.match(builder, /getDraftSignature/);
assert.match(builder, /persistedDraftSignatureRef/);
assert.match(builder, /await flushDraft\(\)/);
assert.match(builder, /clearBuilderDraft/);
assert.match(builder, /publishPersonalAnamnesisTemplate/);
assert.doesNotMatch(builder, /writeBuilderDraft[\s\S]{0,500}publishPersonalAnamnesisTemplate/);

console.log('Anamnesis builder UX tests passed.');
