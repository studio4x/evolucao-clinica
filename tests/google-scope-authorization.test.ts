import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isGoogleScopeError, validateGoogleAccessTokenScopes } from '../src/utils/googleScopes';

const clinicalScopes = ['https://www.googleapis.com/auth/drive.file'];

const originalFetch = globalThis.fetch;

try {
  globalThis.fetch = (async () => new Response(JSON.stringify({
    scope: `${clinicalScopes[0]} https://www.googleapis.com/auth/userinfo.email`,
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;

  const authorized = await validateGoogleAccessTokenScopes('opaque-token', clinicalScopes);
  assert.equal(authorized.status, 'authorized');
  assert.deepEqual(authorized.missingScopes, []);

  globalThis.fetch = (async () => new Response(JSON.stringify({
    scope: 'https://www.googleapis.com/auth/userinfo.email',
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;

  const partial = await validateGoogleAccessTokenScopes('opaque-token', clinicalScopes);
  assert.equal(partial.status, 'missing_scopes');
  assert.deepEqual(partial.missingScopes, clinicalScopes);
} finally {
  globalThis.fetch = originalFetch;
}

assert.equal(isGoogleScopeError(new Error('ACCESS_TOKEN_SCOPE_INSUFFICIENT')), true);
assert.equal(isGoogleScopeError('403 insufficientPermissions'), true);
assert.equal(isGoogleScopeError('403 file is not accessible to this user'), false);

const appSource = fs.readFileSync('src/App.tsx', 'utf8');
assert.match(appSource, /validateGoogleAccessTokenScopes\(session\.provider_token, pendingScopes\)/);
assert.doesNotMatch(appSource, /currentState\.googleGrantedScopes,?\s*\.\.\.pendingScopes/);

const patientFormSource = fs.readFileSync('src/pages/PatientForm.tsx', 'utf8');
assert.match(patientFormSource, /GooglePermissionRecoveryModal/);
assert.match(patientFormSource, /executeGoogleReauthentication\(true\)/);
assert.match(patientFormSource, /prompt: 'consent'/);
assert.match(patientFormSource, /persistDraftNow\(\)/);

console.log('Google scope authorization tests passed.');
