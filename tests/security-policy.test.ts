import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const indexHtml = readFileSync(resolve('index.html'), 'utf8');
const serviceWorker = readFileSync(resolve('public/sw.js'), 'utf8');
const adminSource = readFileSync(resolve('src/pages/AdminPanel.tsx'), 'utf8');
const vercelConfig = JSON.parse(readFileSync(resolve('vercel.json'), 'utf8')) as {
  headers: Array<{ headers: Array<{ key: string; value: string }> }>;
};

assert.match(indexHtml, /<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com\/css2/);
assert.doesNotMatch(indexHtml, /\sonload=/i, 'HTML não deve depender de handlers inline bloqueados pela CSP');

assert.match(
  serviceWorker,
  /if \(url\.origin !== self\.location\.origin && !isBrandStorageAsset\) \{\s*return;\s*\}/,
  'service worker deve ignorar recursos externos que não sejam assets de marca'
);

const contentSecurityPolicy = vercelConfig.headers
  .flatMap(group => group.headers)
  .find(header => header.key === 'Content-Security-Policy')?.value || '';

for (const destination of [
  'https://analytics.google.com',
  'https://www.google-analytics.com',
  'https://region1.google-analytics.com',
  'https://www.google.com',
  'https://www.google.com.br',
  'https://stats.g.doubleclick.net'
]) {
  assert.ok(contentSecurityPolicy.includes(destination), `CSP deve permitir ${destination}`);
}

assert.match(
  adminSource,
  /placeholder="Mínimo 6 caracteres"\s+autoComplete="new-password"/,
  'senha de novo profissional deve declarar autocomplete apropriado'
);

console.log('Security policy and external resource tests passed.');
