import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const selectorSource = readFileSync('src/components/anamnesis/AnamnesisTemplateSelect.tsx', 'utf8');
const pageSource = readFileSync('src/pages/PatientAnamnesis.tsx', 'utf8');

assert.match(selectorSource, /ownerProfessionalId && template\.ownerProfessionalId === ownerProfessionalId/);
assert.match(selectorSource, /Criada por você/);
assert.match(selectorSource, /aria-haspopup="listbox"/);
assert.match(selectorSource, /aria-expanded=\{open\}/);
assert.match(selectorSource, /role="listbox"/);
assert.match(selectorSource, /role="option"/);
assert.match(selectorSource, /aria-selected=\{isSelected\}/);
assert.match(selectorSource, /event\.key === 'Escape'/);
assert.match(selectorSource, /event\.key === 'ArrowDown'/);
assert.match(selectorSource, /event\.key === 'ArrowUp'/);
assert.match(selectorSource, /event\.key === 'Enter' \|\| event\.key === ' '/);
assert.match(selectorSource, /pointerdown/);
assert.doesNotMatch(selectorSource, /startsWith\(['"]Cópia de/);
assert.doesNotMatch(selectorSource, /includes\(['"]Cópia/);

assert.match(pageSource, /<AnamnesisTemplateSelect/);
assert.match(pageSource, /ownerProfessionalId=\{user\?\.id\}/);
assert.match(pageSource, /onChange=\{\(templateId\) => void handleTemplateChange\(templateId\)\}/);
assert.match(pageSource, /disabled=\{switchingTemplate \|\| startingNew \|\| templates\.length === 0\}/);
assert.match(pageSource, /ownerProfessionalId: null/);
assert.match(pageSource, /name: `\$\{current\.templateName\} · versão utilizada`/);

console.log('Anamnesis template selector tests passed.');
