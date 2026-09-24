import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const detail = readFileSync('src/pages/ClinicPatientDetail.tsx', 'utf8');
const layout = readFileSync('src/components/patients/PatientDetailLayout.tsx', 'utf8');
const version = readFileSync('src/components/layout/AppVersion.tsx', 'utf8');

assert.match(detail, /type ClinicMobileTab = "overview" \| "history" \| "files" \| "reminders" \| "reports"/);
assert.match(detail, /clinica\/pacientes\/\$\{patient\.organizationPatientId\}\/evolucoes\/nova/);
assert.match(detail, /patient\.canCreateEvolution/);
assert.match(detail, /canEdit/);
assert.match(detail, /Dados do paciente/);
assert.match(detail, /Profissionais vinculados/);
assert.match(detail, /patient\.canReadEvolutions && <ClinicPatientEvolutions/);
assert.match(detail, /Arquivos ainda não estão disponíveis neste contexto clínico/);
assert.match(detail, /Lembretes ainda precisam de um adapter clínico autorizado/);
assert.match(detail, /Relatórios pessoais não estão disponíveis neste contexto clínico/);
assert.doesNotMatch(detail, /PatientFilesCard|PatientSessionsSummaryCard|PatientAnamnesisSummaryCard/);
assert.match(layout, /PatientPhoto/);
assert.match(layout, /aria-selected=\{isActive\}/);
assert.match(layout, /aria-controls=\{`patient-tabpanel-\$\{id\}`\}/);
assert.match(layout, /xl:grid-cols-\[minmax\(0,1\.4fr\)_minmax\(320px,1fr\)\]/);
assert.match(version, /v1\.10\.920/);
assert.match(version, /1\.0\.87/);

console.log('clinic patient detail production visual parity: PASS');
