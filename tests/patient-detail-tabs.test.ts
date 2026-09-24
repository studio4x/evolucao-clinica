import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/pages/PatientDetail.tsx', 'utf8');

assert.match(source, /const patientMobileTabs[\s\S]*Resumo[\s\S]*Histórico[\s\S]*Arquivos[\s\S]*Lembretes[\s\S]*Relatórios/);
assert.match(source, /<nav className="mt-3 w-full overflow-x-auto overscroll-x-contain"/);
assert.match(source, /role="tablist"/);
assert.match(source, /role="tab"/);
assert.match(source, /aria-selected=\{isActive\}/);
assert.match(source, /aria-controls=\{`patient-tabpanel-\$\{tabId\}`\}/);
assert.match(source, /id=\{`patient-tabpanel-\$\{activeMobileTab\}`\}/);
assert.match(source, /role="tabpanel"/);
assert.match(source, /const mobileTabVisibility = \(tab: PatientMobileTab\) => activeMobileTab === tab/);
assert.match(source, /const mobileTabVisibility = \(tab: PatientMobileTab\) => activeMobileTab === tab[\s\S]*?\? `block patient-mobile-tab-enter-/);
assert.doesNotMatch(source, /mobileTabVisibility\([^)]*\)[\s\S]{0,80}xl:block/);
assert.match(source, /className="w-full min-w-0 space-y-6 outline-none"/, 'O painel ativo deve ocupar toda a largura útil.');
assert.match(source, /xl:grid-cols-\[minmax\(0,1\.4fr\)_minmax\(320px,1fr\)\]/, 'O Resumo deve usar uma composição responsiva de duas colunas no desktop largo.');
assert.match(source, /xl:grid xl:w-full xl:min-w-0 xl:grid-cols-1/, 'Histórico e Relatórios devem compartilhar um container de largura total.');
assert.match(source, /btn-outline flex h-10 min-h-10[\s\S]*Editar paciente/);
assert.match(source, /btn-primary flex h-10 min-h-10[\s\S]*Nova evolução/);
assert.match(source, /btn-outline hidden h-10 min-h-10[\s\S]*Excluir paciente/);
assert.doesNotMatch(source, /xl:h-auto/, 'As ações desktop não devem depender de alturas automáticas diferentes.');
assert.doesNotMatch(
  source,
  /to=\{`\/painel\/patients\/\$\{id\}\/anamnesis`\}[\s\S]{0,500}<ClipboardList/,
  'O card Prontuário não deve conter o CTA de Anamnese.',
);
assert.match(source, /PatientSessionsSummaryCard[\s\S]*PatientAnamnesisSummaryCard/, 'O card de Anamnese deve ficar depois do Controle de Sessões.');
assert.match(source, /xl:col-start-2 xl:row-start-2[\s\S]*PatientAnamnesisSummaryCard/, 'O card de Anamnese deve ocupar a linha abaixo no desktop.');

console.log('Patient detail tabs tests passed.');
