import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isRequestExpired, statusFor } from '../server/anamnesisLinkForms';
import { isPublicAnamnesisSubmittedStatus, PUBLIC_ANAMNESIS_SESSION_KEY, resolvePublicAnamnesisLoadPlan } from '../src/utils/publicAnamnesisSession';

assert.deepEqual(resolvePublicAnamnesisLoadPlan('  raw-token  ', 'existing-session'), { mode: 'bootstrap', token: 'raw-token' });
assert.deepEqual(resolvePublicAnamnesisLoadPlan('', ' existing-session '), { mode: 'resume', session: 'existing-session' });
assert.deepEqual(resolvePublicAnamnesisLoadPlan('', ''), { mode: 'unavailable' });
assert.equal(isPublicAnamnesisSubmittedStatus('responded'), true);
assert.equal(isPublicAnamnesisSubmittedStatus('submitted'), true);
assert.equal(isPublicAnamnesisSubmittedStatus('awaiting'), false);

const now = Date.parse('2026-09-25T15:00:00.000Z');
assert.equal(isRequestExpired({ expires_at: '2026-09-25T15:00:00.001Z' }, now), false);
assert.equal(statusFor({ expires_at: '2026-09-25T15:00:00.001Z', revoked_at: null, submitted_at: null }, { revision: 2 }, false, now), 'in_progress');
assert.equal(statusFor({ expires_at: '2026-09-25T14:59:59.999Z', revoked_at: null, submitted_at: null }, { revision: 2 }, false, now), 'expired');
assert.equal(statusFor({ expires_at: '2026-09-25T15:00:00.001Z', revoked_at: new Date(now).toISOString(), submitted_at: null }, { revision: 2 }, false, now), 'revoked');
assert.equal(statusFor({ expires_at: '2026-09-25T15:00:00.001Z', revoked_at: null, submitted_at: new Date(now).toISOString() }, { revision: 2 }, false, now), 'responded');

const pageSource = readFileSync('src/pages/PublicAnamnesisForm.tsx', 'utf8');
const serverSource = readFileSync('server/anamnesisLinkForms.ts', 'utf8');
assert.match(pageSource, /PUBLIC_ANAMNESIS_SESSION_KEY/);
assert.match(pageSource, /\/api\/public\/anamnesis-link\/form/);
assert.match(pageSource, /Authorization: `Bearer \$\{plan\.session\}`/);
assert.match(pageSource, /window\.history\.replaceState/);
assert.match(pageSource, /setAnswers\(boot\.draft \|\| \{\}\)/);
assert.match(pageSource, /setRevision\(boot\.revision \|\| 0\)/);
assert.doesNotMatch(pageSource, /localStorage/);
assert.match(serverSource, /app\.get\('\/api\/public\/anamnesis-link\/form'/);
assert.match(serverSource, /found\.request\.revoked_at \|\| isRequestExpired/);
assert.match(serverSource, /statusFor\(found\.request, found\.response/);
assert.match(serverSource, /branding: publicContext\.branding/);

console.log(`public anamnesis refresh tests passed (${PUBLIC_ANAMNESIS_SESSION_KEY})`);
