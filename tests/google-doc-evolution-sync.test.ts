import assert from 'node:assert/strict';
import { parseGoogleDocEvolutionEntries } from '../src/services/googleDocs';

const evolutionId = '4c7c5f0a-4d64-44a7-b07a-1a15e2f07b61';
const secondEvolutionId = '892e8973-c024-4a3b-9d50-11754f67a4d0';

const paragraph = (...runs: Array<{ content: string; textStyle?: Record<string, unknown> }>) => ({
  paragraph: {
    elements: runs.map((run) => ({ textRun: run })),
  },
});

const doc = {
  body: {
    content: [
      paragraph({ content: '📅 DATA DA SESSÃO: 14/08/2026 às 10:30\n\nEvolução:\n' }),
      paragraph(
        { content: 'Texto ', textStyle: {} },
        { content: 'editado', textStyle: { bold: true } },
        { content: ' no Google Docs.\nOutra linha que menciona Evolução: sem iniciar um novo bloco.\n\n' },
      ),
      paragraph({ content: '────────────────────────────────────────────────────────\n🔒 REGISTRO DE INSERÇÃO SISTÊMICA\n' }),
      paragraph({ content: `• Chave de autenticidade: ${evolutionId}\n────────────────────────────────────────────────────────\n\n\n` }),
      paragraph({ content: '📅 DATA DA SESSÃO: 13/08/2026 às 09:00\n\nEvolução:\nSegundo texto.\n\n' }),
      paragraph({ content: '────────────────────────────────────────────────────────\n🔒 REGISTRO DE INSERÇÃO SISTÊMICA\n' }),
      paragraph({ content: `• Chave de autenticidade: ${secondEvolutionId}\n────────────────────────────────────────────────────────\n` }),
    ],
  },
};

const entries = parseGoogleDocEvolutionEntries(doc);
assert.deepEqual(entries, [
  { evolutionId, text: 'Texto **editado** no Google Docs.\nOutra linha que menciona Evolução: sem iniciar um novo bloco.' },
  { evolutionId: secondEvolutionId, text: 'Segundo texto.' },
]);

const malformedDoc = {
  body: {
    content: [paragraph({ content: `Texto sem delimitadores\nChave de autenticidade: ${evolutionId}` })],
  },
};
assert.deepEqual(parseGoogleDocEvolutionEntries(malformedDoc), []);

console.log('Google Docs evolution sync parser tests passed.');
