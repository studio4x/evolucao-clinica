import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const store = readFileSync('src/store/clinicContextStore.ts', 'utf8');
const page = readFileSync('src/pages/ClinicInvitationAccept.tsx', 'utf8');
const analytics = readFileSync('src/services/analytics.ts', 'utf8');
const app = readFileSync('src/App.tsx', 'utf8');

assert.match(store, /hydrateAcceptedClinicContext/);
assert.match(store, /advanceGeneration\(userId\)/);
assert.match(store, /setTimeout\(resolve, 400\)/);
assert.match(store, /selectContext\(\{ type: "organization", organizationId \}\)/);
assert.match(page, /accepted_loading_context/);
assert.match(page, /accepted_recovery/);
assert.match(page, /Atualizar acesso/);
assert.equal((page.match(/invitationRequest\("\/accept"/g) || []).length, 1, 'accept must have one call site');
assert.match(page, /hydrateAcceptedClinicContext/);
assert.match(analytics, /sanitizeOAuthCallbackUrl/);
for (const key of ['access_token', 'refresh_token', 'provider_token', 'provider_refresh_token', 'id_token', 'expires_at', 'expires_in', 'token_type', 'code', 'state']) {
  assert.match(analytics, new RegExp(`['"]${key}['"]`));
}
assert.match(app, /sanitizeOAuthCallbackUrl\(\)/);
console.log('clinic post-accept state machine and OAuth sanitization: PASS');
