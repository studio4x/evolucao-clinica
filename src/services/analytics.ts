/**
 * Analytics is intentionally the only tracking interface used by the app.
 *
 * The allow-list below is a privacy boundary, not only a typing convenience:
 * clinical content, patient/evolution identifiers and provider URLs never
 * cross this module, even if a caller accidentally includes them.
 */

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
    NativeAnalyticsBridge?: {
      logEvent(eventName: string, parametersJson: string): void;
      setUserId(userId: string | null): void;
      setUserProperty(name: string, value: string): void;
      setAnalyticsCollectionEnabled(enabled: boolean): void;
    };
  }
}

export const ANALYTICS_CONSENT_EVENT = 'analytics-consent-changed';
export const ANALYTICS_CONSENT_STORAGE_KEY = 'cookie-consent';

export type AnalyticsConsent = 'unknown' | 'granted' | 'denied';
export type AnalyticsEventName =
  | 'sign_up'
  | 'login'
  | 'onboarding_begin'
  | 'onboarding_complete'
  | 'professional_profile_complete'
  | 'patient_created'
  | 'evolution_started'
  | 'evolution_completed'
  | 'audio_evolution_completed'
  | 'begin_checkout'
  | 'purchase'
  | 'subscription_started'
  | 'subscription_renewed'
  | 'subscription_cancelled'
  | 'page_view'
  | 'journey_view'
  | 'journey_direct_link_view'
  | 'journey_header_trial_click'
  | 'journey_start_click'
  | 'journey_hero_trial_click'
  | 'journey_start_box_click'
  | 'journey_day_trial_click'
  | 'journey_day_support_click'
  | 'journey_footer_support_click';

export type AnalyticsParameters = Record<string, string | number | boolean | undefined | null>;

const runtimeEnv: Record<string, string | undefined> = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env ?? {};
const GA_MEASUREMENT_ID = runtimeEnv.VITE_GA_MEASUREMENT_ID;
const GTM_ID = runtimeEnv.VITE_GTM_ID;
const DIRECT_GA4_ENABLED = runtimeEnv.VITE_ANALYTICS_DIRECT_GA4 === 'true' && !GTM_ID;
const IS_NATIVE_WEBVIEW = typeof navigator !== 'undefined' && /EvolucaoClinicaApp/i.test(navigator.userAgent);

const ALLOWED_PARAMETERS = new Set([
  'method',
  'plan_id',
  'plan_name',
  'value',
  'currency',
  'payment_provider',
  'input_mode',
  'is_first_activation',
  'professional_segment',
  'work_context',
  'transaction_id',
  'page_location',
  'page_title',
  'day'
]);

const ALLOWED_USER_PROPERTIES = new Set([
  'professional_segment',
  'work_context',
  'subscription_plan',
  'app_environment'
]);

const SENSITIVE_KEY_PATTERN = /(patient|evolution|clinical|diagnos|transcri|document|drive|url|email|phone|name|text|content|token|secret|access|record|cid)/i;
const EVENT_NAME_PATTERN = /^[a-z][a-z0-9_]{0,39}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_STRING_LENGTH = 100;
const sentDedupeKeys = new Set<string>();
let initialized = false;
let gtmLoaded = false;

const isBrowser = () => typeof window !== 'undefined' && typeof document !== 'undefined';

const readConsent = (): AnalyticsConsent => {
  if (!isBrowser()) return 'unknown';
  try {
    const raw = window.localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY);
    if (!raw) return 'unknown';
    const parsed = JSON.parse(raw) as { analytics?: unknown };
    return parsed.analytics === true ? 'granted' : 'denied';
  } catch {
    return 'unknown';
  }
};

export const getAnalyticsConsent = (): AnalyticsConsent => readConsent();

export const setAnalyticsConsent = (consent: Exclude<AnalyticsConsent, 'unknown'>) => {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, JSON.stringify({ necessary: true, analytics: consent === 'granted' }));
  } catch {
    // Storage can be disabled; consent still applies for this runtime.
  }
  window.dispatchEvent(new CustomEvent(ANALYTICS_CONSENT_EVENT, { detail: consent }));
  applyConsent(consent);
};

const setGoogleConsentMode = (granted: boolean) => {
  if (!isBrowser()) return;
  const dl = (window.dataLayer = window.dataLayer || []);
  dl.push({
    event: granted ? 'consent_update' : 'consent_default',
    analytics_storage: granted ? 'granted' : 'denied',
    ad_storage: granted ? 'granted' : 'denied',
    ad_user_data: granted ? 'granted' : 'denied',
    ad_personalization: granted ? 'granted' : 'denied'
  });
  if (typeof window.gtag === 'function') {
    window.gtag('consent', 'update', {
      analytics_storage: granted ? 'granted' : 'denied',
      ad_storage: granted ? 'granted' : 'denied',
      ad_user_data: granted ? 'granted' : 'denied',
      ad_personalization: granted ? 'granted' : 'denied'
    });
  }
};

const loadScript = (src: string, id: string) => {
  if (!isBrowser() || document.getElementById(id)) return;
  const script = document.createElement('script');
  script.id = id;
  script.async = true;
  script.src = src;
  document.head.appendChild(script);
};

const initializeGtm = () => {
  if (!GTM_ID || gtmLoaded || !isBrowser()) return;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
  loadScript(`https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(GTM_ID)}`, 'analytics-gtm');
  gtmLoaded = true;
};

const initializeDirectGa4 = () => {
  if (!GA_MEASUREMENT_ID || !DIRECT_GA4_ENABLED || !isBrowser()) return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || ((...args: unknown[]) => window.dataLayer?.push(args));
  loadScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_MEASUREMENT_ID)}`, 'analytics-ga4');
  window.gtag('js', new Date());
  window.gtag('config', GA_MEASUREMENT_ID, { send_page_view: false });
};

const nativeBridge = () => {
  if (!isBrowser() || !window.NativeAnalyticsBridge) return null;
  return window.NativeAnalyticsBridge;
};

const applyConsent = (consent: AnalyticsConsent) => {
  const granted = consent === 'granted';
  setGoogleConsentMode(granted);
  try {
    nativeBridge()?.setAnalyticsCollectionEnabled(granted);
  } catch {
    // Native analytics is optional and must never block the web app.
  }
  if (!granted) return;
  initializeGtm();
  initializeDirectGa4();
};

export const initAnalytics = () => {
  if (!isBrowser()) return;
  if (!initialized) {
    initialized = true;
    window.addEventListener(ANALYTICS_CONSENT_EVENT, () => applyConsent(readConsent()));
  }
  applyConsent(readConsent());
};

const sanitizeParameters = (parameters: AnalyticsParameters = {}): Record<string, string | number | boolean> => {
  const sanitized: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(parameters)) {
    if (!ALLOWED_PARAMETERS.has(key) || SENSITIVE_KEY_PATTERN.test(key) || value === null || value === undefined) continue;
    if (typeof value === 'string') {
      const cleanValue = value.trim().slice(0, MAX_STRING_LENGTH);
      if (cleanValue && !SENSITIVE_KEY_PATTERN.test(cleanValue)) sanitized[key] = cleanValue;
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      sanitized[key] = value;
    } else if (typeof value === 'boolean') {
      sanitized[key] = value;
    }
  }
  return sanitized;
};

export const sanitizeAnalyticsParameters = sanitizeParameters;

const normalizeEventName = (eventName: string) => {
  const normalized = eventName.trim().toLowerCase();
  return EVENT_NAME_PATTERN.test(normalized) ? normalized : null;
};

export const hasNativeAnalyticsBridge = () => Boolean(nativeBridge());

export const trackEvent = (
  eventName: AnalyticsEventName | string,
  parameters: AnalyticsParameters = {},
  options: { dedupeKey?: string; persistDedupe?: boolean } = {}
) => {
  if (!isBrowser() || readConsent() !== 'granted') return false;
  const normalizedEventName = normalizeEventName(eventName);
  if (!normalizedEventName) return false;
  if (options.dedupeKey && sentDedupeKeys.has(options.dedupeKey)) return false;
  if (options.dedupeKey && options.persistDedupe && isBrowser()) {
    try {
      if (window.localStorage.getItem(`analytics:dedupe:${options.dedupeKey}`) === '1') return false;
    } catch {
      // Continue with in-memory idempotency when storage is unavailable.
    }
  }
  const sanitized = sanitizeParameters(parameters);

  try {
    const bridge = nativeBridge();
    if (bridge) {
      bridge.logEvent(normalizedEventName, JSON.stringify(sanitized));
    } else {
      const dataLayer = (window.dataLayer = window.dataLayer || []);
      dataLayer.push({ event: normalizedEventName, ...sanitized });
      if (DIRECT_GA4_ENABLED && typeof window.gtag === 'function') {
        window.gtag('event', normalizedEventName, sanitized);
      }
      if (normalizedEventName === 'begin_checkout' && typeof window.fbq === 'function') {
        window.fbq('track', 'InitiateCheckout', sanitized);
      }
      if (normalizedEventName === 'purchase' && typeof window.fbq === 'function') {
        window.fbq('track', 'Purchase', sanitized);
      }
    }
    if (options.dedupeKey) {
      sentDedupeKeys.add(options.dedupeKey);
      if (options.persistDedupe && isBrowser()) {
        try { window.localStorage.setItem(`analytics:dedupe:${options.dedupeKey}`, '1'); } catch { /* optional */ }
      }
    }
    if (runtimeEnv.DEV) console.debug(`[Analytics] ${normalizedEventName}`, sanitized);
    return true;
  } catch (error) {
    if (runtimeEnv.DEV) console.debug('[Analytics] evento ignorado:', error);
    return false;
  }
};

export const trackPageView = (pathname: string, title = (typeof document !== 'undefined' ? document.title : '')) => {
  const safePath = pathname.split('?')[0].split('#')[0].slice(0, 200) || '/';
  return trackEvent('page_view', { page_location: safePath, page_title: title.slice(0, MAX_STRING_LENGTH) });
};

export const setAnalyticsUser = (userId: string | null, properties: Partial<Record<'professional_segment' | 'work_context' | 'subscription_plan' | 'app_environment', string | null>> = {}) => {
  try {
    const bridge = nativeBridge();
    const validUserId = userId && UUID_PATTERN.test(userId) ? userId : null;
    bridge?.setUserId(validUserId);
    if (readConsent() !== 'granted') return;
    for (const [name, value] of Object.entries(properties)) {
      if (!ALLOWED_USER_PROPERTIES.has(name) || typeof value !== 'string') continue;
      const safeValue = value.trim().slice(0, 36);
      if (safeValue && !SENSITIVE_KEY_PATTERN.test(safeValue)) bridge?.setUserProperty(name, safeValue);
      if (!bridge && DIRECT_GA4_ENABLED && typeof window.gtag === 'function') {
        window.gtag('set', 'user_properties', { [name]: safeValue });
      }
    }
  } catch {
    // Analytics must never affect authentication or the main application flow.
  }
};

export const trackBeginCheckout = (planId: string, planName: string, price: number, paymentProvider?: string) =>
  trackEvent('begin_checkout', {
    plan_id: planId,
    plan_name: planName,
    value: price,
    currency: 'BRL',
    payment_provider: paymentProvider
  }, { dedupeKey: `begin_checkout:${planId}`, persistDedupe: true });

export const trackPurchaseOnce = (input: { transactionId: string; planId: string; planName: string; amount: number; paymentProvider?: string }) =>
  trackEvent('purchase', {
    transaction_id: input.transactionId,
    plan_id: input.planId,
    plan_name: input.planName,
    value: input.amount,
    currency: 'BRL',
    payment_provider: input.paymentProvider
  }, { dedupeKey: `purchase:${input.transactionId}`, persistDedupe: true });

export const trackJourneyEvent = (eventName: string, params?: AnalyticsParameters) => trackEvent(eventName, params);
