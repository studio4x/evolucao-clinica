import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { classifyPaymentConfirmation, confirmedConversionKey } from '../src/utils/paymentConfirmation';

const [app, button, success, launcher, verifier, rtdn, mobileFunction, analytics] = await Promise.all([
  readFile(new URL('../src/App.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/payments/StripeSubscriptionButton.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/pages/SuccessPage.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../app/src/main/java/com/evolucaoclinica/app/LauncherActivity.java', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/functions/verify-google-play-subscription/index.ts', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/functions/google-play-rtdn/index.ts', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/functions/create-stripe-mobile-subscription/index.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/services/analytics.ts', import.meta.url), 'utf8')
]);

const future = '2099-01-01T00:00:00.000Z';
assert.equal(classifyPaymentConfirmation({ provider: 'google_play', status: 'active', current_period_end: future }), 'active', 'aprovação imediata deve ativar');
assert.equal(classifyPaymentConfirmation({ provider: 'google_play', status: 'pending' }), 'pending', 'Pix pendente não deve ativar');
assert.deepEqual(
  ['pending', 'active'].map((status) => classifyPaymentConfirmation({ provider: 'google_play', status, current_period_end: status === 'active' ? future : null })),
  ['pending', 'active'],
  'polling deve aceitar aprovação posterior'
);
assert.equal(classifyPaymentConfirmation({ provider: 'google_play', status: 'canceled' }), 'cancelled', 'compra cancelada sem vigência não deve ativar');
assert.equal(classifyPaymentConfirmation({ provider: 'google_play', status: 'active', current_period_end: future }), 'active', 'página reaberta deve reconstruir o sucesso pelo snapshot autoritativo');
assert.equal(
  confirmedConversionKey('google_play', 'GPA.123'),
  confirmedConversionKey('google_play', 'GPA.123'),
  'reload e RTDN repetida devem produzir a mesma chave de conversão'
);

assert.match(app, /\['play_purchase', 'play_purchase_pending'\]\.includes\(event\.type\)/, 'restauração global deve reconciliar compras pendentes e aprovadas');
assert.match(button, /event\.type === 'play_purchase' \|\| event\.type === 'play_purchase_pending'/, 'o retorno pendente deve abrir a confirmação, não um erro');
assert.match(success, /waitForConfirmedSubscription\(user\.id, planId, 40,[\s\S]*expectedProvider\)/, 'a consulta automática deve ter intervalo e limite');
assert.match(success, /restorePurchases[\s\S]*visibilitychange/, 'o retorno ao aplicativo deve reconciliar a compra');
assert.match(success, /getConfirmedGooglePlayTransaction/, 'o sucesso Google Play deve usar uma transação paga real');
assert.match(success, /Não é necessário atualizar a página\./, 'a interface deve orientar que não é preciso recarregar');
assert.match(success, /className="min-w-0 break-all">Assinatura:/, 'o identificador longo da assinatura deve quebrar dentro do resumo');
assert.match(launcher, /protected void onResume\(\)[\s\S]*restoreNativePurchases/, 'o Android deve consultar compras novamente no onResume');
assert.match(launcher, /for \(Purchase purchase : purchases\) dispatchPlayPurchase\(purchase, true\)/, 'a reconciliação nativa deve incluir PURCHASED e PENDING');
assert.match(verifier, /if \(parsed\.entitled && parsed\.acknowledgementState/, 'uma compra pendente não pode ser reconhecida nem liberar benefício');
assert.match(verifier, /purchase:google_play:\$\{parsed\.latestOrderId\}/, 'a conversão deve usar o orderId confirmado');
assert.match(rtdn, /purchase:google_play:\$\{parsed\.latestOrderId\}/, 'RTDN deve reutilizar a mesma chave idempotente');
assert.doesNotMatch(verifier, /purchase_stripe/, 'verificação Google Play nunca pode produzir purchase_stripe');
assert.doesNotMatch(rtdn, /purchase_stripe/, 'RTDN Google Play nunca pode produzir purchase_stripe');
assert.match(mobileFunction, /ga4ClientId[\s\S]*checkoutAttemptId/, 'o checkout móvel deve preservar atribuição para o webhook');
assert.match(analytics, /marketing-purchase:\$\{transactionId\}/, 'Meta deve deduplicar pelo identificador confirmado');
assert.match(analytics, /\^\[A-Za-z0-9\._-\]/, 'orderIds GPA com pontos devem ser aceitos na conversão');
assert.match(analytics, /getConsentPreferences\(\)\?\.marketing !== true/, 'mídia deve respeitar consentimento de marketing');
assert.doesNotMatch(analytics, /event: 'purchase',[\s\S]*marketing_destination: true/, 'a compra cliente não pode duplicar GA4 ou Google Ads');

console.log('payment-confirmation.test.ts: OK');
