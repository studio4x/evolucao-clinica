import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { loadRuntime, sql } from '../scripts/clinic-preproduction-runtime.js';
const runtime = loadRuntime();
assert.ok(process.env.F6B_CHECKPOINT_FILE);
const fixture = JSON.parse(readFileSync(process.env.F6B_CHECKPOINT_FILE!, 'utf8'));
assert.match(fixture.organizationId, /^[0-9a-f-]{36}$/);
const owner = createClient(`https://${runtime.ref}.supabase.co`, runtime.anonKey, { global: { headers: { Authorization: `Bearer ${fixture.accessToken}` } }, auth: { persistSession: false } });
const user = await owner.auth.getUser(fixture.accessToken); assert.ok(user.data.user?.email?.endsWith('@example.invalid'));
const anonymous = createClient(`https://${runtime.ref}.supabase.co`, runtime.anonKey, { auth: { persistSession: false } });
try {
  const enabled = await owner.rpc('get_pending_organization_checkout_contexts'); assert.ifError(enabled.error); assert.equal(enabled.data.length, 1); assert.equal(enabled.data[0].id, fixture.organizationId);
  assert.equal((await owner.rpc('get_organization_dashboard', { p_organization_id: fixture.organizationId })).error?.code, '42501');
  assert.ok((await anonymous.rpc('get_pending_organization_checkout_contexts')).error);
  await sql(runtime, `update public.organization_feature_flags set enabled=false where organization_id='${fixture.organizationId}'`);
  assert.deepEqual((await owner.rpc('get_pending_organization_checkout_contexts')).data, []);
  await sql(runtime, `update public.organization_feature_flags set enabled=true where organization_id='${fixture.organizationId}'; update private.clinic_runtime_config set enabled=false where id=true`);
  assert.deepEqual((await owner.rpc('get_pending_organization_checkout_contexts')).data, []);
} finally {
  await sql(runtime, `update public.organization_feature_flags set enabled=true where organization_id='${fixture.organizationId}'; update private.clinic_runtime_config set enabled=true where id=true`);
}
console.log(JSON.stringify({ pendingOwnerContext: 'PASS', pendingWorkspaceDenied: 'PASS', anonDenied: 'PASS', globalAndOrganizationFlags: 'PASS' }));
