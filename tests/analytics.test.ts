import assert from 'node:assert/strict';
import {
  getAnalyticsConsent,
  sanitizeAnalyticsParameters,
  setAnalyticsConsent,
  setAnalyticsUser,
  trackEvent,
  trackPurchaseOnce,
} from '../src/services/analytics';

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const listeners = new Map<string, Set<() => void>>();
const storage = new MemoryStorage();
const windowMock = {
  localStorage: storage,
  dataLayer: [] as unknown[],
  NativeAnalyticsBridge: undefined as {
    logEvent(eventName: string, parametersJson: string): void;
    setUserId(userId: string | null): void;
    setUserProperty(name: string, value: string): void;
    setAnalyticsCollectionEnabled(enabled: boolean): void;
  } | undefined,
  addEventListener(name: string, listener: () => void) {
    const set = listeners.get(name) ?? new Set<() => void>();
    set.add(listener);
    listeners.set(name, set);
  },
  removeEventListener() { /* test mock */ },
  dispatchEvent(event: { type: string }) {
    listeners.get(event.type)?.forEach((listener) => listener());
    return true;
  },
};

(globalThis as unknown as { window: typeof windowMock }).window = windowMock;
(globalThis as unknown as { document: { title: string } }).document = { title: 'Teste' };
(globalThis as unknown as { CustomEvent: typeof CustomEvent }).CustomEvent = class {
  type: string;
  constructor(type: string) { this.type = type; }
} as typeof CustomEvent;

assert.equal(getAnalyticsConsent(), 'unknown');
assert.equal(trackEvent('login', { method: 'google' }), false, 'sem consentimento nada deve ser enviado');

assert.deepEqual(
  sanitizeAnalyticsParameters({ method: 'google', value: 39, patient_id: 'patient-secret', clinical_text: 'não enviar' }),
  { method: 'google', value: 39 },
  'parâmetros clínicos e identificadores devem ser removidos'
);

setAnalyticsConsent('granted');
assert.equal(getAnalyticsConsent(), 'granted');
assert.equal(trackEvent('login', { method: 'google', patient_id: 'never' }), true);
assert.deepEqual(windowMock.dataLayer.at(-1), { event: 'login', method: 'google' });

let bridgePayload = '';
windowMock.NativeAnalyticsBridge = {
  logEvent: (_name: string, payload: string) => { bridgePayload = payload; },
  setUserId: (id: string | null) => assert.equal(id, '550e8400-e29b-41d4-a716-446655440000'),
  setUserProperty: (name: string) => assert.ok(['work_context'].includes(name)),
  setAnalyticsCollectionEnabled: (enabled: boolean) => assert.equal(enabled, true),
};
setAnalyticsUser('550e8400-e29b-41d4-a716-446655440000', { work_context: 'independent' });
assert.equal(trackEvent('evolution_completed', { input_mode: 'audio' }), true);
assert.deepEqual(JSON.parse(bridgePayload), { input_mode: 'audio' });

delete windowMock.NativeAnalyticsBridge;
trackPurchaseOnce({ transactionId: 'stripe-tx-1', planId: 'monthly', planName: 'Plano Mensal', amount: 39, paymentProvider: 'stripe' });
assert.equal(trackPurchaseOnce({ transactionId: 'stripe-tx-1', planId: 'monthly', planName: 'Plano Mensal', amount: 39 }), false, 'purchase deve ser idempotente');

setAnalyticsConsent('denied');
assert.equal(trackEvent('purchase', { transaction_id: 'blocked' }), false, 'revogar consentimento deve bloquear coleta');

console.log('analytics.test.ts: OK');
