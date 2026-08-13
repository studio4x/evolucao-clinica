import assert from 'node:assert/strict';

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

type NativeBridgeMock = {
  logEvent(eventName: string, parametersJson: string): void;
  logStripeInAppPurchase(transactionId: string, value: number, currency: string, itemName: string): boolean;
  setUserId(userId: string | null): void;
  setUserProperty(name: string, value: string | null): void;
  setAnalyticsCollectionEnabled(enabled: boolean): void;
};

const scripts = new Map<string, { id: string; src: string; async: boolean }>();
const listeners = new Map<string, Set<() => void>>();
const storage = new MemoryStorage();
const fbqCalls: unknown[][] = [];
const windowMock = {
  localStorage: storage,
  dataLayer: [] as unknown[],
  gtag: undefined as ((...args: unknown[]) => void) | undefined,
  fbq: undefined as ((...args: unknown[]) => void) | undefined,
  NativeAnalyticsBridge: undefined as NativeBridgeMock | undefined,
  addEventListener(name: string, listener: () => void) { const set = listeners.get(name) ?? new Set<() => void>(); set.add(listener); listeners.set(name, set); },
  removeEventListener() {},
  dispatchEvent(event: { type: string }) { listeners.get(event.type)?.forEach((listener) => listener()); return true; }
};
const documentMock = {
  title: 'Teste',
  head: { appendChild(node: { id: string; src: string; async: boolean }) { scripts.set(node.id, node); } },
  getElementById(id: string) { return scripts.get(id) ?? null; },
  createElement() { return { id: '', src: '', async: false }; }
};
(globalThis as unknown as { window: typeof windowMock }).window = windowMock;
(globalThis as unknown as { document: typeof documentMock }).document = documentMock;
(globalThis as unknown as { CustomEvent: typeof CustomEvent }).CustomEvent = class { type: string; constructor(type: string) { this.type = type; } } as typeof CustomEvent;

const analytics = await import('../src/services/analytics');
const defaultConfig = { gtmId: 'GTM-TEST', gaMeasurementId: 'G-TEST', directGa4: false, metaPixelId: 'PIXEL-TEST', attributionTimeoutMs: 25 };

function resetRuntime(config: typeof defaultConfig | Partial<typeof defaultConfig> = defaultConfig) {
  storage.clear();
  scripts.clear();
  fbqCalls.length = 0;
  windowMock.dataLayer.length = 0;
  windowMock.gtag = undefined;
  windowMock.fbq = (...args: unknown[]) => { fbqCalls.push(args); };
  delete windowMock.NativeAnalyticsBridge;
  analytics.resetAnalyticsForTests();
  analytics.configureAnalyticsForTests(config);
}

function trackedDataLayerEvents() {
  return windowMock.dataLayer.filter((entry): entry is Record<string, unknown> => Boolean(entry && !Array.isArray(entry) && typeof entry === 'object' && 'event' in entry));
}

resetRuntime();
analytics.initAnalytics();
assert.equal(scripts.size, 0, 'GTM/GA4/Meta não podem carregar antes do consentimento');
assert.deepEqual(windowMock.dataLayer.at(-1), ['consent', 'default', { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' }]);
assert.equal(analytics.trackEvent('login', { method: 'google' }), false, 'sem consentimento nada deve ser enviado');
assert.deepEqual(
  analytics.sanitizeAnalyticsParameters({ plan_id: 'monthly', plan_name: 'Plano Mensal', value: 39, currency: 'BRL', patient_id: 'segredo', clinical_text: 'não enviar' }),
  { plan_id: 'monthly', plan_name: 'Plano Mensal', value: 39, currency: 'BRL' },
  'dados clínicos devem ser removidos'
);

const consentMatrix = [
  { analytics: false, marketing: false, emitted: false, dataLayer: 0, analyticsDestination: undefined, marketingDestination: undefined, meta: 0 },
  { analytics: true, marketing: false, emitted: true, dataLayer: 1, analyticsDestination: true, marketingDestination: false, meta: 0 },
  { analytics: false, marketing: true, emitted: true, dataLayer: 1, analyticsDestination: false, marketingDestination: true, meta: 1 },
  { analytics: true, marketing: true, emitted: true, dataLayer: 1, analyticsDestination: true, marketingDestination: true, meta: 1 }
];

for (const [index, expectation] of consentMatrix.entries()) {
  resetRuntime();
  analytics.initAnalytics();
  analytics.setConsentPreferences({ analytics: expectation.analytics, marketing: expectation.marketing });
  const result = analytics.trackBeginCheckout('monthly', 'Plano Mensal', 39, 'stripe', `matrix-${index}`);
  const events = trackedDataLayerEvents().filter((entry) => entry.event === 'begin_checkout');
  const metaCalls = fbqCalls.filter((call) => call[0] === 'track' && call[1] === 'InitiateCheckout');
  assert.equal(result, expectation.emitted, `resultado incorreto na matriz ${index}`);
  assert.equal(events.length, expectation.dataLayer, `dataLayer incorreto na matriz ${index}`);
  assert.equal(metaCalls.length, expectation.meta, `Meta incorreto na matriz ${index}`);
  if (events[0]) {
    assert.equal(events[0].analytics_destination, expectation.analyticsDestination);
    assert.equal(events[0].marketing_destination, expectation.marketingDestination);
  }
}

resetRuntime();
const nativeEvents: string[] = [];
const nativePurchases: unknown[][] = [];
const bridgeCalls: string[] = [];
windowMock.NativeAnalyticsBridge = {
  logEvent: (name) => nativeEvents.push(name),
  logStripeInAppPurchase: (...args) => { nativePurchases.push(args); return true; },
  setUserId: (id) => bridgeCalls.push(`user:${id}`),
  setUserProperty: (name, value) => bridgeCalls.push(`property:${name}:${value}`),
  setAnalyticsCollectionEnabled: (enabled) => bridgeCalls.push(`collection:${enabled}`)
};
analytics.initAnalytics();
analytics.setAnalyticsUser('550e8400-e29b-41d4-a716-446655440000', { work_context: 'independent' });
assert.equal(bridgeCalls.some((call) => call.startsWith('user:550e')), false, 'identidade nativa exige consentimento');
analytics.setConsentPreferences({ analytics: true, marketing: false });
assert.ok(bridgeCalls.includes('user:550e8400-e29b-41d4-a716-446655440000'));
assert.equal(analytics.trackEvent('login', { method: 'google' }), true);
assert.deepEqual(nativeEvents, ['login'], 'Firebase recebe Analytics consentido');
assert.equal(trackedDataLayerEvents().filter((entry) => entry.event === 'login').length, 0, 'Firebase nativo não deve duplicar Analytics no stream web');
analytics.setConsentPreferences({ analytics: true, marketing: true });
assert.equal(analytics.trackBeginCheckout('monthly', 'Plano Mensal', 39, 'stripe', 'native-marketing'), true);
const nativeMarketingEvent = trackedDataLayerEvents().find((entry) => entry.event === 'begin_checkout');
assert.equal(nativeMarketingEvent?.analytics_destination, false, 'ponte nativa permanece o único destino de Analytics');
assert.equal(nativeMarketingEvent?.marketing_destination, true, 'GTM recebe somente a rota de Marketing no app nativo');
assert.equal(nativeEvents.filter((name) => name === 'begin_checkout').length, 1);

assert.equal(analytics.trackStripeAndroidPurchaseOnce({ transactionId: 'in_confirmed_1', planName: 'Plano Mensal', amount: 39, currency: 'brl', paymentProvider: 'stripe', status: 'paid' }), true, 'Stripe Android confirmado deve registrar in_app_purchase');
assert.equal(analytics.trackStripeAndroidPurchaseOnce({ transactionId: 'in_confirmed_1', planName: 'Plano Mensal', amount: 39, currency: 'BRL', paymentProvider: 'stripe', status: 'paid' }), false, 'a mesma transação deve ser deduplicada');
assert.equal(analytics.trackStripeAndroidPurchaseOnce({ transactionId: 'play_order_1', planName: 'Plano Mensal', amount: 39, currency: 'BRL', paymentProvider: 'google_play', status: 'paid' }), false, 'Google Play nunca recebe evento manual');
assert.equal(analytics.trackStripeAndroidPurchaseOnce({ transactionId: 'in_pending', planName: 'Plano Mensal', amount: 39, currency: 'BRL', paymentProvider: 'stripe', status: 'pending' }), false, 'pagamento pendente não é compra');
assert.equal(analytics.trackStripeAndroidPurchaseOnce({ transactionId: 'in_failed', planName: 'Plano Mensal', amount: 39, currency: 'BRL', paymentProvider: 'stripe', status: 'failed' }), false, 'pagamento falho não é compra');
assert.equal(analytics.trackStripeAndroidPurchaseOnce({ transactionId: 'in_restored', planName: 'Plano Mensal', amount: 39, currency: 'BRL', paymentProvider: 'stripe', status: 'paid', restored: true }), false, 'restauração não gera compra manual');
assert.equal(nativePurchases.length, 1, 'somente a compra Stripe confirmada e inédita chega ao Firebase');

const metaBeforePurchase = fbqCalls.length;
assert.equal(analytics.trackEvent('purchase', { transaction_id: 'in_server_only', value: 39, currency: 'BRL' }), true, 'purchase pode continuar no destino Analytics');
assert.equal(fbqCalls.slice(metaBeforePurchase).some((call) => call[0] === 'track' && call[1] === 'Purchase'), false, 'Meta Purchase não pode nascer no retorno cliente');
const dataLayerBeforeConfirmedPurchase = trackedDataLayerEvents().length;
assert.equal(await analytics.trackConfirmedMarketingPurchaseOnce({ transactionId: 'in_paid_1', planId: 'monthly', planName: 'Plano Mensal', amount: 39, paymentProvider: 'stripe' }), true, 'invoice paga confirmada deve emitir Meta com consentimento de Marketing');
assert.equal(trackedDataLayerEvents().length, dataLayerBeforeConfirmedPurchase, 'compra cliente não pode acionar Google Ads; a aquisição Stripe vem de purchase_stripe server-side');
const metaPurchase = fbqCalls.find((call) => call[0] === 'track' && call[1] === 'Purchase');
assert.deepEqual(metaPurchase?.[3], { eventID: 'purchase-in_paid_1' }, 'Meta usa eventID estável derivado da invoice');
assert.equal(await analytics.trackConfirmedMarketingPurchaseOnce({ transactionId: 'in_paid_1', planId: 'monthly', planName: 'Plano Mensal', amount: 39, paymentProvider: 'stripe' }), false, 'a mesma invoice não pode duplicar conversão de mídia');
assert.equal(await analytics.trackConfirmedMarketingPurchaseOnce({ transactionId: 'GPA.1234-5678', planId: 'monthly', planName: 'Plano Mensal', amount: 39, paymentProvider: 'google_play' }), true, 'orderId confirmado da Google Play pode alimentar Meta sem simular conversão Android');
assert.equal(trackedDataLayerEvents().length, dataLayerBeforeConfirmedPurchase, 'Google Play não pode acionar uma segunda conversão Google Ads no fluxo web');
assert.equal(await analytics.trackConfirmedMarketingPurchaseOnce({ transactionId: 'GPA.1234-5678', planId: 'monthly', planName: 'Plano Mensal', amount: 39, paymentProvider: 'google_play' }), false, 'reload não pode duplicar conversão Google Play');

analytics.setConsentPreferences({ analytics: false, marketing: true });
const nativeCountAfterAnalyticsRevoke = nativeEvents.length;
assert.equal(analytics.trackEvent('patient_created'), false, 'evento de produto não pode ser roteado para Marketing');
assert.equal(analytics.trackEvent('evolution_completed'), false, 'evento clínico não pode ser roteado para Marketing');
assert.equal(nativeEvents.length, nativeCountAfterAnalyticsRevoke);
assert.equal(analytics.trackStripeAndroidPurchaseOnce({ transactionId: 'in_denied', planName: 'Plano Mensal', amount: 39, currency: 'BRL', paymentProvider: 'stripe', status: 'paid' }), false, 'consentimento negado bloqueia compra Firebase');

analytics.setConsentPreferences({ analytics: false, marketing: false });
const dataLayerAfterRevoke = trackedDataLayerEvents().length;
const metaAfterRevoke = fbqCalls.length;
const nativeAfterRevoke = nativeEvents.length;
assert.equal(analytics.trackBeginCheckout('monthly', 'Plano Mensal', 39, 'stripe', 'after-revoke'), false);
assert.equal(await analytics.trackConfirmedMarketingPurchaseOnce({ transactionId: 'in_paid_denied', planId: 'monthly', planName: 'Plano Mensal', amount: 39, paymentProvider: 'stripe' }), false, 'sem consentimento de Marketing a compra não chega à Meta');
assert.equal(trackedDataLayerEvents().length, dataLayerAfterRevoke, 'nenhum dataLayer após revogação total');
assert.equal(fbqCalls.length, metaAfterRevoke, 'nenhum Meta após revogação total');
assert.equal(nativeEvents.length, nativeAfterRevoke, 'nenhum Firebase após revogação total');
assert.ok(fbqCalls.some((call) => call[0] === 'consent' && call[1] === 'revoke'));
assert.ok(bridgeCalls.includes('user:null'));

resetRuntime({ gaMeasurementId: 'G-DIRECT', directGa4: true, attributionTimeoutMs: 25 });
const directGaCalls: unknown[][] = [];
windowMock.gtag = (...args: unknown[]) => directGaCalls.push(args);
analytics.initAnalytics();
analytics.setConsentPreferences({ analytics: true, marketing: false });
assert.ok(scripts.has('analytics-ga4'), 'GA4 direto só carrega quando explicitamente habilitado e sem GTM');
assert.equal(analytics.trackEvent('login', { method: 'password' }), true);
assert.equal(directGaCalls.filter((call) => call[0] === 'event' && call[1] === 'login').length, 1);

resetRuntime();
windowMock.gtag = (...args: unknown[]) => {
  if (args[0] !== 'get') return;
  const field = args[2];
  const callback = args[3] as (value: unknown) => void;
  if (field === 'client_id') callback('123456789.987654321');
  if (field === 'session_id') callback('123');
  if (field === 'session_number') callback(4);
};
analytics.initAnalytics();
analytics.setConsentPreferences({ analytics: true, marketing: false });
assert.equal(scripts.has('analytics-ga4'), false, 'GTM com VITE_ANALYTICS_DIRECT_GA4=false não ativa GA4 direto');
assert.deepEqual(await analytics.getCheckoutAttribution(), { clientId: '123456789.987654321', sessionId: 123, sessionNumber: 4 }, 'GTM usa o Measurement ID apenas para ler atribuição');

const warnings: string[] = [];
const originalWarn = console.warn;
console.warn = (...args: unknown[]) => warnings.push(args.join(' '));
windowMock.gtag = (...args: unknown[]) => {
  if (args[0] !== 'get') return;
  const field = args[2];
  const callback = args[3] as (value: unknown) => void;
  if (field === 'client_id') callback('222222222.333333333');
  if (field === 'session_id') callback(999);
};
assert.deepEqual(await analytics.getCheckoutAttribution(), { clientId: '222222222.333333333', sessionId: 999 }, 'timeout preserva atribuição parcial');
windowMock.gtag = () => undefined;
const timeoutStartedAt = Date.now();
assert.equal(await analytics.getCheckoutAttribution(), undefined, 'callback ausente deve terminar sem inventar client_id');
assert.ok(Date.now() - timeoutStartedAt < 250, 'checkout não pode ficar bloqueado pelo Google tag');
assert.ok(warnings.every((warning) => !warning.includes('222222222') && !warning.includes('333333333')), 'diagnóstico de timeout não contém identificadores');
console.warn = originalWarn;

windowMock.gtag = undefined;
assert.equal(await analytics.getCheckoutAttribution(), undefined, 'gtag ausente retorna imediatamente');
analytics.configureAnalyticsForTests({ gtmId: 'GTM-TEST', directGa4: false, attributionTimeoutMs: 25 });
windowMock.gtag = () => undefined;
assert.equal(await analytics.getCheckoutAttribution(), undefined, 'ID GA4 ausente retorna imediatamente');

console.log('analytics.test.ts: OK');
