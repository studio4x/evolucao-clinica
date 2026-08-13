/** Privacy boundary for every client-side analytics integration. */

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
    NativeAnalyticsBridge?: {
      logEvent(eventName: string, parametersJson: string): void;
      setUserId(userId: string | null): void;
      setUserProperty(name: string, value: string | null): void;
      setAnalyticsCollectionEnabled(enabled: boolean): void;
    };
  }
}

export const ANALYTICS_CONSENT_EVENT = 'analytics-consent-changed';
export const ANALYTICS_CONSENT_STORAGE_KEY = 'cookie-consent';
export type AnalyticsConsent = 'unknown' | 'granted' | 'denied';
export type ConsentPreferences = { necessary: true; analytics: boolean; marketing: boolean };
export type AnalyticsEventName =
  | 'sign_up' | 'login' | 'onboarding_begin' | 'onboarding_complete' | 'professional_profile_complete'
  | 'patient_created' | 'evolution_started' | 'evolution_completed' | 'audio_evolution_completed'
  | 'begin_checkout' | 'purchase' | 'subscription_started' | 'subscription_renewed' | 'subscription_cancelled'
  | 'page_view' | 'journey_view' | 'journey_direct_link_view' | 'journey_header_trial_click'
  | 'journey_start_click' | 'journey_hero_trial_click' | 'journey_start_box_click'
  | 'journey_day_trial_click' | 'journey_day_support_click' | 'journey_footer_support_click';
export type AnalyticsParameters = Record<string, string | number | boolean | undefined | null>;

const env: Record<string, string | undefined> = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env ?? {};
const ALLOWED_PARAMETERS = new Set(['method', 'plan_id', 'plan_name', 'value', 'currency', 'payment_provider', 'input_mode', 'is_first_activation', 'professional_segment', 'work_context', 'transaction_id', 'page_location', 'page_title', 'day']);
const ALLOWED_USER_PROPERTIES = new Set(['professional_segment', 'work_context', 'subscription_plan', 'app_environment']);
const SENSITIVE_VALUE_PATTERN = /(patient|evolution|clinical|diagnos|transcri|document|drive|https?:\/\/|email|phone|token|secret|access[_-]?token|record|cid)/i;
const EVENT_NAME_PATTERN = /^[a-z][a-z0-9_]{0,39}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_STRING_LENGTH = 100;
const sentDedupeKeys = new Set<string>();
let initialized = false;
let gtmLoaded = false;
let ga4Loaded = false;
let metaLoaded = false;
let dynamicConfigLoaded = false;
let dynamicConfig: { gtmId?: string; metaPixelId?: string } = {};
let testConfig: { gtmId?: string; gaMeasurementId?: string; directGa4?: boolean; metaPixelId?: string } | null = null;
let pendingUser: { id: string | null; properties: Record<string, string | null> } = { id: null, properties: {} };

const isBrowser = () => typeof window !== 'undefined' && typeof document !== 'undefined';
const cleanId = (value: unknown) => typeof value === 'string' ? value.trim().replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80) : '';
const preferencesFromStorage = (): ConsentPreferences | null => {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { necessary?: unknown; analytics?: unknown; marketing?: unknown };
    return { necessary: true, analytics: parsed.analytics === true, marketing: parsed.marketing === true };
  } catch { return null; }
};
export const getConsentPreferences = (): ConsentPreferences | null => preferencesFromStorage();
export const getAnalyticsConsent = (): AnalyticsConsent => {
  const preferences = preferencesFromStorage();
  return preferences === null ? 'unknown' : preferences.analytics ? 'granted' : 'denied';
};

const googleConsent = (preferences: ConsentPreferences, command: 'default' | 'update') => {
  if (!isBrowser()) return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || ((...args: unknown[]) => window.dataLayer?.push(args));
  window.gtag('consent', command, {
    analytics_storage: preferences.analytics ? 'granted' : 'denied',
    ad_storage: preferences.marketing ? 'granted' : 'denied',
    ad_user_data: preferences.marketing ? 'granted' : 'denied',
    ad_personalization: preferences.marketing ? 'granted' : 'denied'
  });
};

const loadScriptOnce = (src: string, id: string) => {
  if (!isBrowser() || document.getElementById(id)) return false;
  const script = document.createElement('script');
  script.id = id;
  script.async = true;
  script.src = src;
  document.head.appendChild(script);
  return true;
};
const activeGtmId = () => cleanId(testConfig?.gtmId) || cleanId(env.VITE_GTM_ID) || cleanId(dynamicConfig.gtmId);
const directGa4Enabled = () => (testConfig?.directGa4 ?? env.VITE_ANALYTICS_DIRECT_GA4 === 'true') && !activeGtmId();
const initializeGtm = () => {
  const id = activeGtmId();
  if (!id || gtmLoaded || !isBrowser()) return;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
  gtmLoaded = loadScriptOnce(`https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(id)}`, 'analytics-gtm') || Boolean(document.getElementById('analytics-gtm'));
};
const initializeDirectGa4 = () => {
  const id = cleanId(testConfig?.gaMeasurementId) || cleanId(env.VITE_GA_MEASUREMENT_ID);
  if (!id || !directGa4Enabled() || ga4Loaded || !isBrowser()) return;
  window.gtag = window.gtag || ((...args: unknown[]) => window.dataLayer?.push(args));
  ga4Loaded = loadScriptOnce(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`, 'analytics-ga4') || Boolean(document.getElementById('analytics-ga4'));
  window.gtag('js', new Date());
  window.gtag('config', id, { send_page_view: false });
};
const initializeMeta = () => {
  const pixelId = cleanId(testConfig?.metaPixelId) || cleanId(dynamicConfig.metaPixelId);
  if (!pixelId || metaLoaded || !isBrowser()) return;
  const fbq = window.fbq || ((...args: unknown[]) => { const fn = window.fbq as typeof window.fbq & { queue?: unknown[][] }; if (fn) (fn.queue = fn.queue || []).push(args); });
  window.fbq = fbq;
  window.fbq('init', pixelId);
  window.fbq('track', 'PageView');
  metaLoaded = loadScriptOnce('https://connect.facebook.net/en_US/fbevents.js', 'analytics-meta-pixel') || Boolean(document.getElementById('analytics-meta-pixel'));
};
const nativeBridge = () => isBrowser() ? window.NativeAnalyticsBridge ?? null : null;
const clearNativeIdentity = () => {
  const bridge = nativeBridge();
  try {
    bridge?.setUserId(null);
    for (const name of ALLOWED_USER_PROPERTIES) bridge?.setUserProperty(name, null);
  } catch { /* optional native integration */ }
};
const applyPendingUser = () => {
  if (getAnalyticsConsent() !== 'granted') return;
  const bridge = nativeBridge();
  try {
    bridge?.setUserId(pendingUser.id);
    for (const [name, value] of Object.entries(pendingUser.properties)) if (ALLOWED_USER_PROPERTIES.has(name)) bridge?.setUserProperty(name, value);
  } catch { /* analytics never affects the app */ }
};
const loadDynamicIds = async () => {
  if (dynamicConfigLoaded || !isBrowser()) return;
  dynamicConfigLoaded = true;
  try {
    const { supabase } = await import('../supabaseClient');
    const { data, error } = await supabase.from('settings').select('api_key').eq('id', 'tracking_settings').maybeSingle();
    if (error || !data?.api_key) return;
    const parsed = JSON.parse(data.api_key) as { gtm_id?: unknown; fb_pixel_id?: unknown };
    dynamicConfig = { gtmId: cleanId(parsed.gtm_id), metaPixelId: cleanId(parsed.fb_pixel_id) };
    const preferences = preferencesFromStorage();
    if (preferences?.analytics) { initializeGtm(); initializeDirectGa4(); }
    if (preferences?.marketing) initializeMeta();
  } catch { /* dynamic IDs are optional */ }
};
const applyConsent = (preferences: ConsentPreferences, command: 'default' | 'update') => {
  googleConsent(preferences, command);
  try { nativeBridge()?.setAnalyticsCollectionEnabled(preferences.analytics); } catch { /* optional bridge */ }
  if (!preferences.analytics) clearNativeIdentity();
  if (preferences.analytics) { applyPendingUser(); initializeGtm(); initializeDirectGa4(); void loadDynamicIds(); }
  if (preferences.marketing) { initializeMeta(); void loadDynamicIds(); }
};
export const setConsentPreferences = (preferences: Omit<ConsentPreferences, 'necessary'>) => {
  if (!isBrowser()) return;
  const next: ConsentPreferences = { necessary: true, analytics: preferences.analytics === true, marketing: preferences.marketing === true };
  try { window.localStorage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, JSON.stringify(next)); } catch { /* runtime consent still applies */ }
  applyConsent(next, 'update');
  void syncAnalyticsConsentForCurrentUser();
  window.dispatchEvent(new CustomEvent(ANALYTICS_CONSENT_EVENT, { detail: next }));
};
export const syncAnalyticsConsentForCurrentUser = async () => {
  const preferences = preferencesFromStorage();
  if (!preferences) return;
  try {
    const { supabase } = await import('../supabaseClient');
    const { data } = await supabase.auth.getUser();
    if (!data.user) return;
    await supabase.from('analytics_consents').upsert({
      user_id: data.user.id,
      analytics_granted: preferences.analytics,
      marketing_granted: preferences.marketing,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });
  } catch { /* consent storage remains local if the backend is unavailable */ }
};
export const setAnalyticsConsent = (consent: Exclude<AnalyticsConsent, 'unknown'>) => setConsentPreferences({ analytics: consent === 'granted', marketing: false });
export const initAnalytics = () => {
  if (!isBrowser()) return;
  if (!initialized) {
    initialized = true;
    // This is synchronous and always precedes any Google script/config/event.
    googleConsent({ necessary: true, analytics: false, marketing: false }, 'default');
    window.addEventListener(ANALYTICS_CONSENT_EVENT, () => { const preferences = preferencesFromStorage(); if (preferences) applyConsent(preferences, 'update'); });
  }
  const preferences = preferencesFromStorage();
  if (preferences) applyConsent(preferences, 'update');
  else { try { nativeBridge()?.setAnalyticsCollectionEnabled(false); clearNativeIdentity(); } catch { /* optional bridge */ } }
};
export const configureAnalyticsForTests = (config: { gtmId?: string; gaMeasurementId?: string; directGa4?: boolean; metaPixelId?: string } | null) => { testConfig = config; };

export const sanitizeAnalyticsParameters = (parameters: AnalyticsParameters = {}): Record<string, string | number | boolean> => {
  const sanitized: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(parameters)) {
    if (!ALLOWED_PARAMETERS.has(key) || value === null || value === undefined) continue;
    if (typeof value === 'string') {
      const clean = value.trim().slice(0, MAX_STRING_LENGTH);
      if (clean && !SENSITIVE_VALUE_PATTERN.test(clean)) sanitized[key] = clean;
    } else if (typeof value === 'number' && Number.isFinite(value)) sanitized[key] = value;
    else if (typeof value === 'boolean') sanitized[key] = value;
  }
  return sanitized;
};
const normalizeEventName = (eventName: string) => { const normalized = eventName.trim().toLowerCase(); return EVENT_NAME_PATTERN.test(normalized) ? normalized : null; };
export const hasNativeAnalyticsBridge = () => Boolean(nativeBridge());
export const trackEvent = (eventName: AnalyticsEventName | string, parameters: AnalyticsParameters = {}, options: { dedupeKey?: string; persistDedupe?: boolean } = {}) => {
  if (!isBrowser() || getAnalyticsConsent() !== 'granted') return false;
  const normalized = normalizeEventName(eventName);
  if (!normalized || (options.dedupeKey && sentDedupeKeys.has(options.dedupeKey))) return false;
  if (options.dedupeKey && options.persistDedupe) { try { if (window.localStorage.getItem(`analytics:dedupe:${options.dedupeKey}`) === '1') return false; } catch { /* memory dedupe */ } }
  const sanitized = sanitizeAnalyticsParameters(parameters);
  try {
    const bridge = nativeBridge();
    if (bridge) bridge.logEvent(normalized, JSON.stringify(sanitized));
    else {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ event: normalized, ...sanitized });
      if (directGa4Enabled() && typeof window.gtag === 'function') window.gtag('event', normalized, sanitized);
      if (getConsentPreferences()?.marketing && normalized === 'begin_checkout') window.fbq?.('track', 'InitiateCheckout', sanitized);
      if (getConsentPreferences()?.marketing && normalized === 'purchase') window.fbq?.('track', 'Purchase', sanitized);
    }
    if (options.dedupeKey) { sentDedupeKeys.add(options.dedupeKey); if (options.persistDedupe) try { window.localStorage.setItem(`analytics:dedupe:${options.dedupeKey}`, '1'); } catch { /* optional */ } }
    return true;
  } catch { return false; }
};
export const trackPageView = (pathname: string, title = typeof document !== 'undefined' ? document.title : '') => trackEvent('page_view', { page_location: pathname.split('?')[0].split('#')[0].slice(0, 200) || '/', page_title: title.slice(0, MAX_STRING_LENGTH) });
export const setAnalyticsUser = (userId: string | null, properties: Partial<Record<'professional_segment' | 'work_context' | 'subscription_plan' | 'app_environment', string | null>> = {}) => {
  const validId = userId && UUID_PATTERN.test(userId) ? userId : null;
  pendingUser = { id: validId, properties: Object.fromEntries(Object.entries(properties).filter(([name, value]) => ALLOWED_USER_PROPERTIES.has(name) && (value === null || (typeof value === 'string' && !SENSITIVE_VALUE_PATTERN.test(value) && value.length <= 36)))) };
  if (!validId) { clearNativeIdentity(); return; }
  applyPendingUser();
};
export const trackBeginCheckout = (planId: string, planName: string, price: number, paymentProvider?: string, attemptId = `${Date.now()}-${Math.random().toString(36).slice(2)}`) => trackEvent('begin_checkout', { plan_id: planId, plan_name: planName, value: price, currency: 'BRL', payment_provider: paymentProvider }, { dedupeKey: `begin_checkout:${attemptId}` });
export const trackPurchaseOnce = (input: { transactionId: string; planId: string; planName: string; amount: number; paymentProvider?: string }) => trackEvent('purchase', { transaction_id: input.transactionId, plan_id: input.planId, plan_name: input.planName, value: input.amount, currency: 'BRL', payment_provider: input.paymentProvider }, { dedupeKey: `purchase:${input.transactionId}`, persistDedupe: true });
export const trackJourneyEvent = (eventName: string, params?: AnalyticsParameters) => trackEvent(eventName, params);
