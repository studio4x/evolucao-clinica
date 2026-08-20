import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  addAvatarCacheBuster,
  getProfessionalInitials,
  JOURNEY_GROUP_BATCH_CONCURRENCY,
  runWithConcurrency,
  sortProfessionals
} from '../src/utils/adminProfessionals.js';

assert.equal(getProfessionalInitials('Rodolfo Medeiros'), 'RM');
assert.equal(getProfessionalInitials('Thamiris'), 'TH');
assert.equal(getProfessionalInitials(''), '?');

const refreshedAvatar = new URL(addAvatarCacheBuster('https://lh3.googleusercontent.com/avatar=s96-c', 'build-811'));
assert.equal(refreshedAvatar.searchParams.get('ec_avatar_refresh'), 'build-811');

let activeWorkers = 0;
let maximumActiveWorkers = 0;
const processed: number[] = [];
await runWithConcurrency([1, 2, 3, 4, 5, 6, 7], JOURNEY_GROUP_BATCH_CONCURRENCY, async (item) => {
  activeWorkers += 1;
  maximumActiveWorkers = Math.max(maximumActiveWorkers, activeWorkers);
  await new Promise(resolveTimeout => setTimeout(resolveTimeout, 5));
  processed.push(item);
  activeWorkers -= 1;
});

assert.equal(maximumActiveWorkers, JOURNEY_GROUP_BATCH_CONCURRENCY);
assert.deepEqual(processed.sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7]);

const sortableProfessionals = [
  { id: '3', full_name: 'Álvaro', created_at: '2026-08-10T10:00:00Z', subscription_ends_at: undefined },
  { id: '2', full_name: 'Bruna', created_at: undefined, subscription_ends_at: '2026-09-30T10:00:00Z' },
  { id: '1', full_name: 'ana', created_at: '2026-08-18T10:00:00Z', subscription_ends_at: '2026-08-30T10:00:00Z' }
];

assert.deepEqual(
  sortProfessionals(sortableProfessionals, 'name', 'asc').map(professional => professional.id),
  ['3', '1', '2']
);
assert.deepEqual(
  sortProfessionals(sortableProfessionals, 'created_at', 'desc').map(professional => professional.id),
  ['1', '3', '2'],
  'cadastros sem data devem permanecer no final'
);
assert.deepEqual(
  sortProfessionals(sortableProfessionals, 'expiration', 'asc').map(professional => professional.id),
  ['1', '2', '3'],
  'assinaturas sem vencimento devem permanecer no final'
);

const adminSource = readFileSync(resolve('src/pages/AdminPanel.tsx'), 'utf8');
assert.match(adminSource, /handleCheckAllJourneyGroupMembership/);
assert.match(adminSource, /'Verificar todos'/);
assert.match(adminSource, /handleProfessionalSort\('name'\)/);
assert.match(adminSource, /handleProfessionalSort\('created_at'\)/);
assert.match(adminSource, /handleProfessionalSort\('expiration'\)/);
assert.match(adminSource, /aria-sort=/);
assert.match(adminSource, /onError=\{handleImageError\}/);
assert.match(adminSource, /data-testid="professional-actions-grid"/);
assert.match(adminSource, /inline-grid grid-cols-3 gap-1\.5/);
assert.doesNotMatch(adminSource, /ui-avatars\.com/);

console.log('Admin professionals batch and avatar tests passed.');
