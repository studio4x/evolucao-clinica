import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { hasActivePaidAccess, hasActiveYearlyAccess } from '../src/utils/subscriptionAccess.js';
import {
  getSubscriptionPlanLabel,
  isPaidSubscriberForMetrics,
  normalizeManagedSubscription
} from '../src/utils/subscriptionPlans.js';
import { MONTHLY_PLAN_FEATURES, YEARLY_PLAN_FEATURES } from '../src/config/subscriptionPlans.js';

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

const yearlyAudioFeature = 'Até 60 minutos de áudio por evolução';
assert.equal(YEARLY_PLAN_FEATURES[1], yearlyAudioFeature);
assert.equal(YEARLY_PLAN_FEATURES.filter((feature) => feature === yearlyAudioFeature).length, 1);
assert.equal(MONTHLY_PLAN_FEATURES.includes(yearlyAudioFeature), false);
assert.equal(YEARLY_PLAN_FEATURES.includes('Arquivos do paciente no Google Drive'), true);
assert.equal(YEARLY_PLAN_FEATURES.includes('Geração de anamnese estruturada'), true);

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

const constraintMigrationSource = readFileSync(
  resolve('supabase/migrations/20260820180000_allow_courtesy_subscription_plan.sql'),
  'utf8'
);
assert.match(constraintMigrationSource, /DROP CONSTRAINT IF EXISTS professionals_subscription_plan_check/);
assert.match(constraintMigrationSource, /subscription_plan IN \('trial', 'monthly', 'yearly', 'courtesy', 'none'\)/);

const yearlyFeatureMigrationSource = readFileSync(
  resolve('supabase/migrations/20260917150000_add_yearly_audio_feature.sql'),
  'utf8'
);
assert.match(yearlyFeatureMigrationSource, /WHERE id = 'yearly'/);
assert.match(yearlyFeatureMigrationSource, /array_position\(features, 'Tudo do plano mensal'\)/);
assert.match(yearlyFeatureMigrationSource, /Até 60 minutos de áudio por evolução/);
assert.doesNotMatch(yearlyFeatureMigrationSource, /UPDATE public\.plans\s+SET\s+(price|original_price|equivalent_monthly_price|discount_text|tag_text)/);

const landingSource = readFileSync(resolve('src/pages/LandingPage.tsx'), 'utf8');
const subscriptionSource = readFileSync(resolve('src/pages/Subscription.tsx'), 'utf8');
assert.match(landingSource, /YEARLY_PLAN_RECENT_FEATURES\.filter/);
assert.match(landingSource, /displayedFeatures\.map/);
assert.match(subscriptionSource, /YEARLY_PLAN_RECENT_FEATURES\.filter/);
assert.match(subscriptionSource, /displayedFeatures\.map/);

console.log('Courtesy subscription plan tests passed.');
