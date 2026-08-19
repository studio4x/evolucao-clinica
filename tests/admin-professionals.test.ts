import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  addAvatarCacheBuster,
  getProfessionalInitials,
  JOURNEY_GROUP_BATCH_CONCURRENCY,
  runWithConcurrency
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

const adminSource = readFileSync(resolve('src/pages/AdminPanel.tsx'), 'utf8');
assert.match(adminSource, /handleCheckAllJourneyGroupMembership/);
assert.match(adminSource, /'Verificar todos'/);
assert.match(adminSource, /onError=\{handleImageError\}/);
assert.doesNotMatch(adminSource, /ui-avatars\.com/);

console.log('Admin professionals batch and avatar tests passed.');
