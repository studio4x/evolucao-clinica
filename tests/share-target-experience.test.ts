import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('src/pages/ShareTarget.tsx', 'utf8');

assert.doesNotMatch(
  source,
  /Reprodução nativa do aplicativo Android/,
  'O player do áudio recebido não deve exibir texto técnico de implementação.'
);
assert.match(
  source,
  /nativeAppInfoBridge\?\.setPullToRefreshEnabled\?\.\(false\)/,
  'A página do áudio recebido deve desativar o pull-to-refresh nativo.'
);
assert.match(
  source,
  /nativeAppInfoBridge\?\.setPullToRefreshEnabled\?\.\(true\)/,
  'A página deve restaurar o comportamento ao sair da rota.'
);
assert.match(
  source,
  /replaceEvolutionInGoogleDoc\(googleAccessToken, patient\.google_doc_id, modalEvolutionId, modalText\)/,
  'O modal deve atualizar apenas a evolução processada no Google Docs.'
);
assert.doesNotMatch(
  source,
  /updateGoogleDocContent/,
  'O modal não pode substituir o conteúdo completo do prontuário.'
);
assert.match(source, /<RichTextEditor/);
assert.match(source, /Converter para outro modelo/);

console.log('Share target experience tests passed.');
