import assert from 'node:assert/strict';

class MemoryStorage { private values = new Map<string, string>(); getItem(key: string) { return this.values.get(key) ?? null; } setItem(key: string, value: string) { this.values.set(key, value); } removeItem(key: string) { this.values.delete(key); } }
const scripts = new Map<string, { id: string; src: string; async: boolean }>();
const listeners = new Map<string, Set<() => void>>();
const storage = new MemoryStorage();
const windowMock = {
  localStorage: storage, dataLayer: [] as unknown[], gtag: undefined as ((...args: unknown[]) => void) | undefined, fbq: undefined as ((...args: unknown[]) => void) | undefined,
  NativeAnalyticsBridge: undefined as { logEvent(eventName: string, parametersJson: string): void; setUserId(userId: string | null): void; setUserProperty(name: string, value: string | null): void; setAnalyticsCollectionEnabled(enabled: boolean): void } | undefined,
  addEventListener(name: string, listener: () => void) { const set = listeners.get(name) ?? new Set<() => void>(); set.add(listener); listeners.set(name, set); }, removeEventListener() {}, dispatchEvent(event: { type: string }) { listeners.get(event.type)?.forEach((listener) => listener()); return true; }
};
const documentMock = {
  title: 'Teste', head: { appendChild(node: { id: string; src: string; async: boolean }) { scripts.set(node.id, node); } },
  getElementById(id: string) { return scripts.get(id) ?? null; }, createElement() { return { id: '', src: '', async: false }; }
};
(globalThis as unknown as { window: typeof windowMock }).window = windowMock;
(globalThis as unknown as { document: typeof documentMock }).document = documentMock;
(globalThis as unknown as { CustomEvent: typeof CustomEvent }).CustomEvent = class { type: string; constructor(type: string) { this.type = type; } } as typeof CustomEvent;

const analytics = await import('../src/services/analytics');
analytics.configureAnalyticsForTests({ gtmId: 'GTM-TEST', gaMeasurementId: 'G-TEST', directGa4: true, metaPixelId: 'PIXEL-TEST' });
analytics.initAnalytics();
assert.equal(scripts.size, 0, 'GTM/GA4/Meta não podem carregar antes do consentimento');
assert.deepEqual(windowMock.dataLayer.at(-1), ['consent', 'default', { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' }], 'Consent Mode default deve ser o primeiro comando Google');
assert.equal(analytics.trackEvent('login', { method: 'google' }), false, 'sem consentimento nada deve ser enviado');

assert.deepEqual(analytics.sanitizeAnalyticsParameters({ plan_id: 'monthly', plan_name: 'Plano Mensal', value: 39, currency: 'BRL', patient_id: 'segredo', clinical_text: 'não enviar' }), { plan_id: 'monthly', plan_name: 'Plano Mensal', value: 39, currency: 'BRL' }, 'plan_name permitido deve sobreviver e dados clínicos devem ser removidos');

const bridgeCalls: string[] = [];
windowMock.NativeAnalyticsBridge = { logEvent: () => bridgeCalls.push('event'), setUserId: (id) => bridgeCalls.push(`user:${id}`), setUserProperty: (name, value) => bridgeCalls.push(`property:${name}:${value}`), setAnalyticsCollectionEnabled: (enabled) => bridgeCalls.push(`collection:${enabled}`) };
analytics.setAnalyticsUser('550e8400-e29b-41d4-a716-446655440000', { work_context: 'independent' });
assert.equal(bridgeCalls.some((call) => call.startsWith('user:550e')), false, 'userId não pode ser definido antes do consentimento');

analytics.setConsentPreferences({ analytics: true, marketing: false });
assert.equal(analytics.getAnalyticsConsent(), 'granted');
assert.ok(scripts.has('analytics-gtm'), 'GTM deve carregar após analytics consent');
assert.equal(scripts.has('analytics-ga4'), false, 'GA4 direto e GTM nunca podem carregar simultaneamente');
assert.equal(scripts.has('analytics-meta-pixel'), false, 'Meta Pixel exige consentimento de marketing');
assert.ok(bridgeCalls.includes('user:550e8400-e29b-41d4-a716-446655440000'), 'userId deve ser reaplicado após consentimento');
const gtmCount = [...scripts.values()].filter((script) => script.src.includes('gtm.js')).length;
analytics.setConsentPreferences({ analytics: true, marketing: false });
assert.equal([...scripts.values()].filter((script) => script.src.includes('gtm.js')).length, gtmCount, 'GTM só pode ser carregado uma vez');
analytics.setConsentPreferences({ analytics: true, marketing: true });
assert.ok(scripts.has('analytics-meta-pixel'), 'Meta Pixel deve carregar somente após marketing consent');

assert.equal(analytics.trackBeginCheckout('monthly', 'Plano Mensal', 39, 'stripe', 'attempt-1'), true);
assert.equal(analytics.trackBeginCheckout('monthly', 'Plano Mensal', 39, 'stripe', 'attempt-1'), false, 'repetição da mesma tentativa deve ser deduplicada');
assert.equal(analytics.trackBeginCheckout('monthly', 'Plano Mensal', 39, 'stripe', 'attempt-2'), true, 'nova tentativa legítima do mesmo plano deve ser registrada');
assert.equal(analytics.trackPurchaseOnce({ transactionId: 'stripe-invoice-1', planId: 'monthly', planName: 'Plano Mensal', amount: 39 }), true);
assert.equal(analytics.trackPurchaseOnce({ transactionId: 'stripe-invoice-1', planId: 'monthly', planName: 'Plano Mensal', amount: 39 }), false, 'purchase permanece idempotente por transaction_id');

analytics.setConsentPreferences({ analytics: false, marketing: false });
assert.ok(bridgeCalls.includes('user:null'), 'revogação deve limpar userId');
assert.ok(bridgeCalls.includes('property:work_context:null'), 'revogação deve limpar propriedades nativas');
assert.equal(analytics.trackEvent('purchase', { transaction_id: 'blocked' }), false, 'revogação deve interromper coleta');
assert.deepEqual(windowMock.dataLayer.at(-1), ['consent', 'update', { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' }], 'revogação deve enviar Consent Mode update');
delete windowMock.NativeAnalyticsBridge;
assert.doesNotThrow(() => analytics.trackEvent('login', { method: 'password' }), 'ausência da ponte Android não pode interromper o navegador');
console.log('analytics.test.ts: OK');
