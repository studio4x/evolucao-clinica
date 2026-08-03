import assert from 'node:assert/strict';
import { isRetryableChunkError } from '../src/utils/lazyWithRetry.js';

const retryableMessages = [
  'TypeError: Failed to fetch dynamically imported module: https://example.com/assets/Login-old.js',
  'TypeError: Importing a module script failed.',
  'TypeError: error loading dynamically imported module: https://example.com/assets/Login-old.js',
  'Failed to load module script: Expected a JavaScript-or-Wasm module script',
  'The server responded with a non-JavaScript MIME type of "text/html"',
  'ChunkLoadError: Loading chunk Login failed',
];

for (const message of retryableMessages) {
  assert.equal(isRetryableChunkError(new TypeError(message)), true, message);
}

assert.equal(isRetryableChunkError(new Error('Falha de autenticação')), false);
assert.equal(isRetryableChunkError(null), false);

console.log('Chunk recovery tests passed.');
