import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [app, button, success, mobileFunction, analytics] = await Promise.all([
  readFile(new URL('../src/App.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/payments/StripeSubscriptionButton.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/pages/SuccessPage.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/functions/create-stripe-mobile-subscription/index.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/services/analytics.ts', import.meta.url), 'utf8')
]);

assert.match(app, /location\.pathname\.startsWith\('\/checkout'\)/, 'a confirmação deve permanecer acessível antes da projeção do plano');
assert.match(button, /presentStripePaymentSheet[\s\S]*onPendingConfirmation\?\./, 'a página de confirmação deve ser preparada por baixo do PaymentSheet');
assert.match(success, /waitForConfirmedSubscription\(user\.id, planId, 120,[\s\S]*expectedSubscriptionId\)/, 'a página deve aguardar automaticamente a assinatura exata');
assert.match(success, /getConfirmedStripeTransaction\(confirmed\.provider_subscription_id, planId\)/, 'o sucesso deve usar uma invoice paga real');
assert.match(success, /Não é necessário atualizar a página\./, 'a interface deve orientar que não é preciso recarregar');
assert.match(mobileFunction, /ga4ClientId[\s\S]*checkoutAttemptId/, 'o checkout móvel deve preservar atribuição para o webhook');
assert.match(analytics, /marketing-purchase:\$\{transactionId\}/, 'a conversão de mídia deve ser deduplicada pela invoice');
assert.match(analytics, /analytics_destination: false,[\s\S]*marketing_destination: true/, 'a compra cliente não pode duplicar o GA4 server-side');

console.log('payment-confirmation.test.ts: OK');
