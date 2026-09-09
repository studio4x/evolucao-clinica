import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildConversionFunnel } from '../server/admin/conversionFunnel.js';
import { shouldSkipSequenceStep } from '../server/lifecycle/lifecycleRules.js';

const professionals = [
  { id: 'u1', created_at: '2026-09-01T10:00:00.000Z', onboarding_completed: true, subscription_plan: 'monthly', subscription_status: 'active', trial_ends_at: '2026-09-08T10:00:00.000Z' },
  { id: 'u2', created_at: '2026-09-02T10:00:00.000Z', onboarding_completed: false, subscription_plan: 'trial', subscription_status: 'canceled', trial_ends_at: '2026-09-05T10:00:00.000Z' },
  { id: 'u3', created_at: '2026-09-03T10:00:00.000Z', onboarding_completed: false, subscription_plan: 'trial', subscription_status: 'trialing', trial_ends_at: '2026-09-12T10:00:00.000Z' },
];

const funnel = buildConversionFunnel({
  professionals,
  patients: [{ professional_id: 'u1', google_doc_id: 'doc-1' }, { professional_id: 'u2', google_doc_id: null }],
  evolutions: [{ professional_id: 'u1', created_at: '2026-09-01T11:00:00.000Z', updated_at: '2026-09-01T12:00:00.000Z', transcription_status: 'completed', google_doc_append_status: 'completed' }],
  otps: [{ user_id: 'u1', verified_at: '2026-09-01T10:05:00.000Z' }, { user_id: 'u2', verified_at: null }],
  states: [{ user_id: 'u1', usage_days_count: 2 }, { user_id: 'u2', usage_days_count: 1 }, { user_id: 'u3', usage_days_count: 0 }],
  errors: [{ user_id: 'u2', metadata: { error_code: 'google_insufficient_scopes' } }],
  checkoutAttempts: [
    { professional_id: 'u1', status: 'paid', provider: 'stripe', created_at: '2026-09-01T12:00:00.000Z' },
    { professional_id: 'u2', status: 'failed', provider: 'stripe', created_at: '2026-09-04T12:00:00.000Z' },
  ],
  since: '2026-09-01T00:00:00.000Z',
  now: new Date('2026-09-10T00:00:00.000Z'),
});

assert.equal(funnel.stages.registered, 3);
assert.equal(funnel.stages.withPatient, 2);
assert.equal(funnel.stages.withLinkedRecord, 1);
assert.equal(funnel.stages.withFirstEvolution, 1);
assert.equal(funnel.stages.firstEvolutionWithin48h, 1);
assert.equal(funnel.stages.returnedSecondDay, 1);
assert.equal(funnel.stages.matured, 2);
assert.equal(funnel.stages.paid, 1);
assert.equal(funnel.rates.paidConversion, 50);
assert.equal(funnel.blockers.googleScopeErrors, 1);
assert.deepEqual(funnel.checkout.byStatus, { paid: 1, failed: 1 });

const expiredTrialState: any = {
  subscriptionPlan: 'trial',
  subscriptionStatus: 'canceled',
  trialEndsAt: '2026-09-01T00:00:00.000Z',
  patientsCount: 0,
  linkedRecordsCount: 0,
  evolutionsCount: 0,
};
const step: any = { step_key: 'day_08', status: 'active', enabled: true };
assert.match(shouldSkipSequenceStep(step, expiredTrialState, new Date('2026-09-10T00:00:00.000Z')) || '', /sequência educativa finalizada/);

const migration = readFileSync('supabase/migrations/20260909131327_activation_conversion_foundation.sql', 'utf8');
assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.checkout_attempts/);
assert.match(migration, /ALTER TABLE public\.checkout_attempts ENABLE ROW LEVEL SECURITY/);
assert.match(migration, /trial_activation_deadline_at/);
assert.match(migration, /activate_trial_after_first_evolution/);
assert.match(migration, /guided_demo_completed/);
assert.match(migration, /status = 'draft'/, 'mensagem condicional deve continuar em rascunho');

const checkoutButton = readFileSync('src/components/payments/StripeSubscriptionButton.tsx', 'utf8');
assert.match(checkoutButton, /recordClientCheckoutAttempt/);
assert.match(checkoutButton, /status: 'provider_opened'/);
assert.match(checkoutButton, /status: 'cancelled'/);

const stripeCheckout = readFileSync('supabase/functions/create-stripe-checkout-session/index.ts', 'utf8');
assert.match(stripeCheckout, /recordCheckoutAttempt/);
assert.match(stripeCheckout, /status: "session_created"/);
assert.match(stripeCheckout, /attempt_id=/);

const webhook = readFileSync('supabase/functions/stripe-webhook/index.ts', 'utf8');
assert.match(webhook, /status: "paid"/);
assert.match(webhook, /normalizeCheckoutAttemptId/);

console.log('activation-conversion.test.ts: OK');
