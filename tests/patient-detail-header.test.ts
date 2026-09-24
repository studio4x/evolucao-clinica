import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/pages/PatientDetail.tsx', 'utf8');

assert.match(source, /line-clamp-2[\s\S]*patient\.full_name/, 'O nome deve ocupar no máximo duas linhas no mobile.');
assert.match(source, /xl:truncate xl:text-3xl/, 'O comportamento desktop do título deve permanecer compacto.');
assert.match(source, /aria-label="Mais ações do paciente"[\s\S]*aria-haspopup="menu"[\s\S]*aria-expanded=\{showPatientActionsMenu\}/, 'O menu mobile deve ser acessível.');
assert.match(source, /role="menu" aria-label="Mais ações do paciente"[\s\S]*role="menuitem"[\s\S]*Excluir paciente/, 'A exclusão deve ficar no menu de mais ações no mobile.');
assert.match(source, /className="[^"]*hidden[^"]*xl:inline-flex/, 'Excluir deve continuar visível diretamente no desktop.');
assert.match(source, /const patientMobileTabs[\s\S]*Resumo[\s\S]*Histórico[\s\S]*Arquivos[\s\S]*Lembretes[\s\S]*Relatórios/, 'A navegação das abas deve permanecer preservada.');

console.log('Patient detail header responsive tests passed.');
