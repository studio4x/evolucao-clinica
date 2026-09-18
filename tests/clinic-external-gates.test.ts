import assert from 'node:assert/strict';
import { externalGatePlan, assertTestResource } from '../scripts/clinic-external-gates.js';
import { registerClinicContextRoutes } from '../server/clinic/clinicContextRoutes.js';

for (const plan of [externalGatePlan(false), externalGatePlan(true), externalGatePlan(true, true)]) {
  assert.equal(plan.CLINIC_INVITATION_DELIVERY_ENABLED, 'false');
  assert.equal(plan.GOOGLE_INTEGRATIONS_ENABLED, 'false');
  assert.equal(plan.VITE_GOOGLE_INTEGRATIONS_ENABLED, 'false');
}
assert.throws(() => externalGatePlan(false, true));
assert.throws(() => assertTestResource({ livemode: true, currency: 'brl' }));
assert.throws(() => assertTestResource({ currency: 'brl' }));
assert.throws(() => assertTestResource({ livemode: false, currency: 'usd' }));
assertTestResource({ livemode: false, currency: 'brl' });
let handler: any, body: any, status = 200, failRpc = false;
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const address = String(input);
  assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer synthetic-context-test');
  if (address.includes('/rpc/get_pending_organization_checkout_contexts')) return new Response(JSON.stringify(failRpc ? { code: '42501', message: 'denied' } : [{ id: 'pending-owner', name: 'Synthetic pending', trade_name: null, operational_status: 'pending_setup' }]), { status: failRpc ? 403 : 200, headers: { 'Content-Type': 'application/json' } });
  assert.ok(address.includes('/organization_memberships'));
  return new Response('[]', { headers: { 'Content-Type': 'application/json' } });
};
try {
  registerClinicContextRoutes({ get: (_path: string, _middleware: any, callback: any) => { handler = callback; } }, { requireAuth: () => {}, supabaseUrl: 'https://staging.example.invalid', supabaseAnonKey: 'synthetic-anon', clinicFeatureEnabled: true });
  const response = { setHeader: () => {}, status: (value: number) => { status = value; return response; }, json: (value: any) => { body = value; } };
  await handler({ headers: { authorization: 'Bearer synthetic-context-test' }, user: { id: 'owner' } }, response);
  assert.equal(status, 200); assert.equal(body.organizations.length, 1);
  assert.equal(body.organizations[0].membershipRole, 'owner'); assert.equal(body.organizations[0].clinicalAccessEnabled, false); assert.equal(body.personal.available, true);
  failRpc = true;
  await handler({ headers: { authorization: 'Bearer synthetic-context-test' }, user: { id: 'owner' } }, response);
  assert.equal(status, 503); assert.equal(body.error, 'context_resolution_failed');
} finally { globalThis.fetch = originalFetch; }
console.log('clinic external gate safety and pending context handler PASS');
