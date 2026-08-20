import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { hasActivePaidAccess, hasActiveYearlyAccess } from '../src/utils/subscriptionAccess.js';
import {
  getSubscriptionPlanLabel,
  isPaidSubscriberForMetrics,
  normalizeManagedSubscription
} from '../src/utils/subscriptionPlans.js';

const courtesy = normalizeManagedSubscription({
  subscriptionPlan: 'courtesy',
  subscriptionStatus: 'canceled',
  subscriptionEndsAt: '2026-08-21T12:00:00.000Z',
  accountStatus: 'inactive'
});

assert.deepEqual(courtesy, {
  subscriptionPlan: 'courtesy',
  subscriptionStatus: 'active',
  subscriptionEndsAt: null,
  accountStatus: 'active'
});
assert.equal(getSubscriptionPlanLabel('courtesy'), 'Plano Cortesia');
assert.equal(hasActivePaidAccess({ subscriptionPlan: 'courtesy', subscriptionStatus: 'active' }), true);
assert.equal(hasActiveYearlyAccess({ subscriptionPlan: 'courtesy', subscriptionStatus: 'active' }), true);
assert.equal(hasActiveYearlyAccess({ subscriptionPlan: 'courtesy', subscriptionStatus: 'canceled' }), false);

assert.equal(isPaidSubscriberForMetrics({
  subscription_plan: 'courtesy',
  subscription_status: 'active',
  status: 'active'
}), false, 'cortesia não pode entrar na métrica de assinantes pagos');
assert.equal(isPaidSubscriberForMetrics({
  subscription_plan: 'yearly',
  subscription_status: 'active',
  status: 'active'
}), true);

const adminSource = readFileSync(resolve('src/pages/AdminPanel.tsx'), 'utf8');
assert.match(adminSource, /option value="courtesy">Plano Cortesia \(Acesso Anual\)/);
assert.match(adminSource, /professionals\.filter\(isPaidSubscriberForMetrics\)/);
assert.match(adminSource, /disabled=\{editPlan === 'none' \|\| editPlan === 'courtesy'\}/);

const migrationSource = readFileSync(
  resolve('supabase/migrations/20260820170000_add_courtesy_subscription_plan.sql'),
  'utf8'
);
assert.match(migrationSource, /enforce_courtesy_subscription_invariants/);
assert.match(migrationSource, /subscription_plan IN \('yearly', 'courtesy'\)/);
assert.match(migrationSource, /user_plan IN \('yearly', 'courtesy', 'none'\)/);

console.log('Courtesy subscription plan tests passed.');
