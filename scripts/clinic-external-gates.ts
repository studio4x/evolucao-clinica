import assert from 'node:assert/strict';

export function externalGatePlan(enabled: boolean, billingTest = false) {
  assert.ok(!billingTest || enabled, 'Test billing requires the temporary staging application gate');
  return {
    CLINIC_FEATURE_ENABLED: String(enabled),
    VITE_CLINIC_FEATURE_ENABLED: String(enabled),
    CLINIC_INVITATION_DELIVERY_ENABLED: 'false',
    CLINIC_BILLING_ENABLED: String(billingTest),
    GOOGLE_INTEGRATIONS_ENABLED: 'false',
    VITE_GOOGLE_INTEGRATIONS_ENABLED: 'false',
  };
}

export function assertTestResource(resource: any) {
  assert.equal(resource.livemode, false, 'ABORT: resource must explicitly be Stripe Test');
  if (resource.currency !== undefined) assert.equal(resource.currency, 'brl');
}
