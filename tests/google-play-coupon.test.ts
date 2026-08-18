import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [migration, admin, subscription, button, billing, launcher, verifier, rtdn] = await Promise.all([
  readFile(new URL('../supabase/migrations/20260818130000_add_google_play_offer_to_subscription_coupons.sql', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/admin/SubscriptionCouponsAdmin.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/pages/Subscription.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/payments/StripeSubscriptionButton.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/services/billing.ts', import.meta.url), 'utf8'),
  readFile(new URL('../app/src/main/java/com/evolucaoclinica/app/LauncherActivity.java', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/functions/verify-google-play-subscription/index.ts', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/functions/google-play-rtdn/index.ts', import.meta.url), 'utf8'),
]);

assert.match(migration, /ADD COLUMN IF NOT EXISTS google_play_offer_id text/);
assert.match(admin, /googlePlayOfferId/);
assert.match(admin, /google_play_offer_id: form\.googlePlayOfferId\.trim\(\) \|\| null/);
assert.match(admin, /editingCouponId/);
assert.match(admin, /update\(\{ \.\.\.validated\.payload, updated_at:/);
assert.match(admin, />Editar<\/button>/);
assert.match(subscription, /handleSaveCoupon/);
assert.match(subscription, /setCouponCode\(normalized\)/);
assert.match(subscription, /Cupom removido do checkout/);
assert.match(subscription, />Salvar cupom<\/button>/);
assert.match(button, /resolveGooglePlayOffer\(planId, normalizedCouponCode\)/);
assert.match(button, /startSubscription\(planId, user\.id, googlePlayOfferId\)/);
assert.match(button, /couponCode: checkoutContext\?\.couponCode/);
assert.match(billing, /resolve-google-play-offer/);
assert.match(launcher, /pendingGooglePlayOfferId\.equals\(offer\.getOfferId\(\)\)/);
assert.match(verifier, /parsed\.offerIds\.includes\(googlePlayOfferId\)/);
assert.match(verifier, /googlePlayCouponAmount: amount/);
assert.match(rtdn, /subscriptionMetadata\.googlePlayCouponAmount/);
assert.doesNotMatch(button, /trackBeginCheckout\(planId[\s\S]*resolveGooglePlayOffer/, 'begin_checkout não pode disparar antes de validar o cupom');

console.log('google-play-coupon.test.ts: OK');
