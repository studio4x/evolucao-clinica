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

type MetaPixelMock = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
};

const scripts = new Map<string, { id: string; src: string; async: boolean }>();
const listeners = new Map<string, Set<() => void>>();
const storage = new MemoryStorage();
const fbqCalls: unknown[][] = [];
const windowMock = {
  localStorage: storage,
  location: { pathname: '/', search: '', hash: '' },
  history: {
    state: null,
    replaceState(_state: unknown, _title: string, url: string) {
      const parsed = new URL(url, 'https://evolucaoclinica.app.br');
      windowMock.location.pathname = parsed.pathname;
      windowMock.location.search = parsed.search;
      windowMock.location.hash = parsed.hash;
    }
  },
  dataLayer: [] as unknown[],
  gtag: undefined as ((...args: unknown[]) => void) | undefined,
  fbq: undefined as MetaPixelMock | undefined,
  _fbq: undefined as MetaPixelMock | undefined,
  NativeAnalyticsBridge: undefined as NativeBridgeMock | undefined,
  addEventListener(name: string, listener: () => void) { const set = listeners.get(name) ?? new Set<() => void>(); set.add(listener); listeners.set(name, set); },
  removeEventListener() {},
  dispatchEvent(event: { type: string }) { listeners.get(event.type)?.forEach((listener) => listener()); return true; },
  setTimeout(callback: () => void, delay: number) { return globalThis.setTimeout(callback, delay); }
};
const documentMock = {
  title: 'Teste',
  cookie: '',
  head: { appendChild(node: { id: string; src: string; async: boolean }) { scripts.set(node.id, node); } },
  getElementById(id: string) { return scripts.get(id) ?? null; },
  createElement() { return { id: '', src: '', async: false }; }
};
(globalThis as unknown as { window: typeof windowMock }).window = windowMock;
(globalThis as unknown as { document: typeof documentMock }).document = documentMock;
(globalThis as unknown as { CustomEvent: typeof CustomEvent }).CustomEvent = class { type: string; constructor(type: string) { this.type = type; } } as typeof CustomEvent;

const analytics = await import('../src/services/analytics');
const defaultConfig = { gtmId: 'GTM-TEST', gaMeasurementId: 'G-TEST', directGa4: false, metaPixelId: 'PIXEL-TEST', attributionTimeoutMs: 25, metaReadyTimeoutMs: 25 };

function createFbqMock() {
  const fbq = ((...args: unknown[]) => { fbqCalls.push(args); }) as MetaPixelMock;
  fbq.callMethod = () => undefined;
  return fbq;
}

function resetRuntime(config: typeof defaultConfig | Partial<typeof defaultConfig> = defaultConfig) {
  storage.clear();
  scripts.clear();
  fbqCalls.length = 0;
  windowMock.dataLayer.length = 0;
  windowMock.gtag = undefined;
  windowMock.fbq = createFbqMock();
  windowMock._fbq = undefined;
  windowMock.location.pathname = '/';
  windowMock.location.search = '';
  windowMock.location.hash = '';
  documentMock.cookie = '';
  delete windowMock.NativeAnalyticsBridge;
  analytics.resetAnalyticsForTests();
  analytics.configureAnalyticsForTests(config);
}

function setRoute(pathname: string, search = '', hash = '') {
  windowMock.location.pathname = pathname;
  windowMock.location.search = search;
  windowMock.location.hash = hash;
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

resetRuntime();
analytics.initAnalytics();
analytics.setConsentPreferences({ analytics: false, marketing: true });
assert.equal(windowMock._fbq, windowMock.fbq, 'bootstrap do Meta deve manter fbq e _fbq na mesma versão');
const autoConfigIndex = fbqCalls.findIndex((call) => call[0] === 'set' && call[1] === 'autoConfig');
const initIndex = fbqCalls.findIndex((call) => call[0] === 'init');
const pageViewIndex = fbqCalls.findIndex((call) => call[0] === 'track' && call[1] === 'PageView');
assert.ok(autoConfigIndex >= 0 && autoConfigIndex < initIndex, 'autoConfig=false deve anteceder o init da Meta');
assert.ok(initIndex < pageViewIndex, 'PageView dedicado deve ocorrer somente depois do init');
assert.deepEqual(fbqCalls[autoConfigIndex], ['set', 'autoConfig', false, 'PIXEL-TEST']);

for (const blockedPath of ['/painel/dashboard', '/admin/professionals', '/public/reports/550e8400-e29b-41d4-a716-446655440000']) {
  resetRuntime();
  setRoute(blockedPath);
  analytics.initAnalytics();
  analytics.setConsentPreferences({ analytics: false, marketing: true });
  assert.equal(scripts.has('analytics-meta-pixel'), false, `Pixel não pode carregar em ${blockedPath}`);
  assert.equal(fbqCalls.some((call) => call[0] === 'track' && call[1] === 'PageView'), false, `PageView Meta não pode ocorrer em ${blockedPath}`);
}

resetRuntime();
analytics.initAnalytics();
analytics.setConsentPreferences({ analytics: false, marketing: true });
const pageViewsBeforeClinicalRoute = fbqCalls.filter((call) => call[0] === 'track' && call[1] === 'PageView').length;
setRoute('/painel/patients/550e8400-e29b-41d4-a716-446655440000');
analytics.refreshMarketingAnalyticsForCurrentRoute();
assert.equal(fbqCalls.at(-1)?.[1], 'revoke', 'navegação SPA clínica deve revogar imediatamente a Meta');
assert.equal(fbqCalls.filter((call) => call[0] === 'track' && call[1] === 'PageView').length, pageViewsBeforeClinicalRoute);
setRoute('/');
analytics.refreshMarketingAnalyticsForCurrentRoute();
assert.ok(fbqCalls.some((call) => call[0] === 'consent' && call[1] === 'grant'), 'retorno à landing restaura Meta com consentimento persistido');
assert.equal(fbqCalls.filter((call) => call[0] === 'track' && call[1] === 'PageView').length, pageViewsBeforeClinicalRoute + 1);

resetRuntime();
analytics.initAnalytics();
analytics.setConsentPreferences({ analytics: false, marketing: false });
setRoute('/painel/dashboard');
analytics.refreshMarketingAnalyticsForCurrentRoute();
setRoute('/');
analytics.refreshMarketingAnalyticsForCurrentRoute();
assert.equal(fbqCalls.some((call) => call[0] === 'consent' && call[1] === 'grant'), false, 'retorno à landing não concede Meta sem consentimento persistido');

resetRuntime();
setRoute('/login', '?code=oauth-secret&token=secret&session_id=cs_test&patient_id=550e8400-e29b-41d4-a716-446655440000', '#access_token=secret');
analytics.initAnalytics();
analytics.setConsentPreferences({ analytics: false, marketing: true });
assert.equal(fbqCalls.some((call) => call[0] === 'track' && call[1] === 'PageView'), false, 'URL com query/hash não pode gerar PageView');
assert.equal(analytics.sanitizeCurrentMarketingUrl(), true);
analytics.refreshMarketingAnalyticsForCurrentRoute();
assert.deepEqual(windowMock.location, { pathname: '/login', search: '', hash: '' });
assert.equal(fbqCalls.filter((call) => call[0] === 'track' && call[1] === 'PageView').length, 1);
assert.equal(JSON.stringify(fbqCalls).includes('oauth-secret'), false, 'code/token nunca podem entrar em fbq');
assert.equal(JSON.stringify(fbqCalls).includes('550e8400-e29b-41d4-a716-446655440000'), false, 'UUID nunca pode entrar em fbq');

const registrationEventId = 'registration-0123456789abcdef0123456789abcdef';
assert.equal(await analytics.trackCompleteRegistrationOnce(registrationEventId), true, 'cadastro confirmado deve emitir CompleteRegistration');
const registrationCall = fbqCalls.find((call) => call[0] === 'track' && call[1] === 'CompleteRegistration');
assert.deepEqual(registrationCall?.[2], { content_name: 'Cadastro Evolução Clínica' });
assert.deepEqual(registrationCall?.[3], { eventID: registrationEventId });
assert.equal(await analytics.trackCompleteRegistrationOnce(registrationEventId), false, 'Strict Mode/repetição não pode duplicar cadastro');
analytics.resetAnalyticsForTests();
analytics.configureAnalyticsForTests(defaultConfig);
windowMock.fbq = createFbqMock();
assert.equal(await analytics.trackCompleteRegistrationOnce(registrationEventId), false, 'reload/nova inicialização respeita deduplicação persistente');

resetRuntime();
setRoute('/login');
analytics.initAnalytics();
analytics.setConsentPreferences({ analytics: true, marketing: true });
const originalFetch = globalThis.fetch;
const registrationRequests: Array<{ url: string; body: Record<string, unknown> | null }> = [];
let registrationDelivered = false;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input);
  const body = typeof init?.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : null;
  registrationRequests.push({ url, body });
  if (url.endsWith('/pending')) {
    return new Response(JSON.stringify(registrationDelivered ? { eventId: null, status: 'not_pending' } : { eventId: registrationEventId, status: 'pending' }), { status: 200 });
  }
  assert.ok(url.endsWith('/complete'));
  registrationDelivered = true;
  return new Response(JSON.stringify({ eventId: registrationEventId, status: 'delivered' }), { status: 200 });
}) as typeof fetch;

const registrationTracksBeforeConfirmedFlow = fbqCalls.filter((call) => call[0] === 'track' && call[1] === 'CompleteRegistration').length;
assert.equal(await analytics.trackConfirmedMetaRegistrationOnce('access-token-test'), true, 'prepare → fbq pronto → complete confirma a entrega');
assert.deepEqual(registrationRequests.map((request) => request.url), [
  '/api/analytics/meta-registration/pending',
  '/api/analytics/meta-registration/complete'
]);
assert.deepEqual(registrationRequests[0]?.body, { analyticsGranted: true, marketingGranted: true });
assert.deepEqual(registrationRequests[1]?.body, { eventId: registrationEventId });
assert.equal(
  fbqCalls.filter((call) => call[0] === 'track' && call[1] === 'CompleteRegistration').length,
  registrationTracksBeforeConfirmedFlow + 1
);
assert.equal(await analytics.trackConfirmedMetaRegistrationOnce('access-token-test'), false, 'servidor entregue não retorna novo marcador');
assert.equal(
  fbqCalls.filter((call) => call[0] === 'track' && call[1] === 'CompleteRegistration').length,
  registrationTracksBeforeConfirmedFlow + 1
);

resetRuntime();
setRoute('/login');
analytics.initAnalytics();
analytics.setConsentPreferences({ analytics: false, marketing: true });
let completeAttempts = 0;
globalThis.fetch = (async (input: string | URL | Request) => {
  const url = String(input);
  if (url.endsWith('/pending')) {
    return new Response(JSON.stringify({ eventId: registrationEventId, status: 'pending' }), { status: 200 });
  }
  completeAttempts += 1;
  return completeAttempts === 1
    ? new Response('{}', { status: 503 })
    : new Response(JSON.stringify({ eventId: registrationEventId, status: 'delivered' }), { status: 200 });
}) as typeof fetch;
assert.equal(await analytics.trackConfirmedMetaRegistrationOnce('access-token-test'), false, 'falha de acknowledgement mantém o marcador recuperável');
assert.equal(await analytics.trackConfirmedMetaRegistrationOnce('access-token-test'), true, 'retry reutiliza o mesmo eventID e conclui no servidor');
const retryRegistrationCalls = fbqCalls.filter((call) => call[0] === 'track' && call[1] === 'CompleteRegistration');
assert.equal(retryRegistrationCalls.length, 2, 'perda de acknowledgement pode reenviar para deduplicação por eventID');
assert.deepEqual(retryRegistrationCalls.map((call) => call[3]), [
  { eventID: registrationEventId },
  { eventID: registrationEventId }
]);
globalThis.fetch = originalFetch;

resetRuntime();
setRoute('/painel/subscription');
analytics.initAnalytics();
analytics.setConsentPreferences({ analytics: false, marketing: true });
assert.equal(analytics.trackBeginCheckout('monthly', 'Plano Mensal', 39, 'stripe', 'controlled-subscription'), true, 'assinatura pode emitir apenas InitiateCheckout explícito');
assert.equal(fbqCalls.filter((call) => call[0] === 'track' && call[1] === 'PageView').length, 0, 'assinatura autenticada nunca emite PageView Meta');
assert.equal(fbqCalls.filter((call) => call[0] === 'track' && call[1] === 'InitiateCheckout').length, 1);
assert.equal(fbqCalls.at(-1)?.[1], 'revoke', 'Meta volta ao estado revogado após o checkout explícito autenticado');

resetRuntime();
analytics.initAnalytics();
analytics.setConsentPreferences({ analytics: false, marketing: true });
const metaTracksBeforeClinicalEvents = fbqCalls.filter((call) => call[0] === 'track').length;
for (const clinicalEvent of [
  'patient_created',
  'evolution_started',
  'evolution_completed',
  'audio_evolution_completed',
  'professional_profile_complete',
  'onboarding_begin',
  'onboarding_complete'
]) {
  assert.equal(analytics.trackEvent(clinicalEvent), false, `${clinicalEvent} nunca pode ser Marketing`);
}
assert.equal(fbqCalls.filter((call) => call[0] === 'track').length, metaTracksBeforeClinicalEvents, 'nenhum evento clínico chega ao fbq');

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
const signUpUserId = '550e8400-e29b-41d4-a716-446655440000';
assert.equal(analytics.trackSignUpOnce(signUpUserId, 'google'), true, 'cadastro confirmado deve emitir sign_up uma vez');
analytics.resetAnalyticsForTests();
assert.equal(analytics.trackSignUpOnce(signUpUserId, 'google'), false, 'recarregar a primeira sessão não pode duplicar sign_up persistido');
assert.equal(analytics.trackSignUpOnce('identificador-invalido', 'google'), false, 'identificador inválido não pode criar chave de deduplicação');
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

documentMock.cookie = '_ga=GA1.1.888888888.999999999; _ga_TEST=GS2.1.s1700000000$o5$g1$t1700000123';
windowMock.gtag = undefined;
assert.deepEqual(
  await analytics.getCheckoutAttribution(),
  { clientId: '888888888.999999999', sessionId: 1700000000, sessionNumber: 5 },
  'o WebView deve reutilizar somente a atribuição real gravada pela tag do Google'
);
documentMock.cookie = '';

let attributionRead = 0;
windowMock.gtag = (...args: unknown[]) => {
  if (args[0] !== 'get') return;
  const field = args[2];
  const callback = args[3] as (value: unknown) => void;
  if (field === 'client_id') {
    attributionRead += 1;
    if (attributionRead === 2) callback('444444444.555555555');
  }
  if (field === 'session_id') callback(attributionRead === 2 ? 777 : 666);
};
assert.deepEqual(
  await analytics.getCheckoutAttributionWithRetry(Promise.resolve(undefined)),
  { clientId: '444444444.555555555', sessionId: 777 },
  'o retorno do provedor deve recapturar atribuição quando a leitura inicial expirou'
);

windowMock.gtag = () => undefined;
const timeoutStartedAt = Date.now();
assert.equal(await analytics.getCheckoutAttribution(), undefined, 'callback ausente deve terminar sem inventar client_id');
assert.ok(Date.now() - timeoutStartedAt < 250, 'checkout não pode ficar bloqueado pelo Google tag');
assert.equal(await analytics.getCheckoutAttributionWithRetry(undefined, 1), undefined, 'retry também não pode inventar client_id');
assert.ok(warnings.every((warning) => !warning.includes('222222222') && !warning.includes('333333333')), 'diagnóstico de timeout não contém identificadores');
console.warn = originalWarn;

windowMock.gtag = undefined;
assert.equal(await analytics.getCheckoutAttribution(), undefined, 'gtag ausente retorna imediatamente');
analytics.configureAnalyticsForTests({ gtmId: 'GTM-TEST', directGa4: false, attributionTimeoutMs: 25 });
windowMock.gtag = () => undefined;
assert.equal(await analytics.getCheckoutAttribution(), undefined, 'ID GA4 ausente retorna imediatamente');

console.log('analytics.test.ts: OK');
