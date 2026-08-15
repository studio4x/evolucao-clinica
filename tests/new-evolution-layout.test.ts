import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve('src/pages/NewEvolution.tsx'), 'utf8');

assert.match(
  source,
  /grid grid-cols-2 gap-3 md:grid-cols-3/,
  'session date and time share one row on mobile',
);
assert.match(
  source,
  /col-span-2 md:col-span-1/,
  'the template field uses the full mobile row without changing the desktop grid',
);
assert.match(
  source,
  /useState<EvolutionInputMode>\('audio'\)/,
  'audio remains the default evolution input mode',
);
assert.match(
  source,
  /<select[\s\S]*?id="evolution-input-mode"[\s\S]*?value=\{inputMode\}[\s\S]*?<option value="audio">Áudio<\/option>[\s\S]*?<option value="text">Texto<\/option>[\s\S]*?<option value="hybrid">Híbrido<\/option>/,
  'the evolution input mode is rendered as a dropdown with all supported options',
);
assert.doesNotMatch(source, /role="radiogroup" aria-label="Tipo de evolução"/);

console.log('New evolution layout tests passed.');
