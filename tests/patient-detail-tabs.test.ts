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

console.log('Patient detail tabs tests passed.');
