/** Privacy boundary for every client-side analytics integration. */

type MetaPixelFunction = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  loaded?: boolean;
  push?: MetaPixelFunction;
  queue?: unknown[][];
  version?: string;
};

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    fbq?: MetaPixelFunction;
    _fbq?: MetaPixelFunction;
    NativeAnalyticsBridge?: {
      logEvent(eventName: string, parametersJson: string): void;
      logStripeInAppPurchase(transactionId: string, value: number, currency: string, itemName: string): boolean;
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
export type CheckoutAttribution = { clientId?: string; sessionId?: number; sessionNumber?: number };

const env: Record<string, string | undefined> = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env ?? {};
const ALLOWED_PARAMETERS = new Set(['method', 'plan_id', 'plan_name', 'value', 'currency', 'payment_provider', 'input_mode', 'is_first_activation', 'professional_segment', 'work_context', 'transaction_id', 'page_location', 'page_title', 'day']);
const ALLOWED_USER_PROPERTIES = new Set(['professional_segment', 'work_context', 'subscription_plan', 'app_environment']);
const SENSITIVE_VALUE_PATTERN = /(patient|evolution|clinical|diagnos|transcri|document|drive|https?:\/\/|email|phone|token|secret|access[_-]?token|record|cid)/i;
const EVENT_NAME_PATTERN = /^[a-z][a-z0-9_]{0,39}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_STRING_LENGTH = 100;
const DEFAULT_ATTRIBUTION_TIMEOUT_MS = 2_000;
const DEFAULT_ATTRIBUTION_RETRY_DELAY_MS = 250;
const DEFAULT_META_READY_TIMEOUT_MS = 5_000;
const MARKETING_EVENT_NAMES = new Set(['begin_checkout']);
const META_EXACT_ALLOWED_PATHS = new Set(['/', '/login', '/checkout', '/checkout/success', '/checkout/sucess']);
const META_CONTROLLED_CHECKOUT_PATH = '/painel/subscription';
const META_REGISTRATION_EVENT_ID_PATTERN = /^registration-[a-f0-9]{32}$/;
const sentDedupeKeys = new Set<string>();
let initialized = false;
let gtmLoaded = false;
let ga4Loaded = false;
let metaLoaded = false;
let dynamicConfigLoaded = false;
let dynamicConfig: { gtmId?: string; metaPixelId?: string } = {};
let testConfig: { gtmId?: string; gaMeasurementId?: string; directGa4?: boolean; metaPixelId?: string; attributionTimeoutMs?: number; metaReadyTimeoutMs?: number } | null = null;
let pendingUser: { id: string | null; properties: Record<string, string | null> } = { id: null, properties: {} };
let lastMetaPageKey: string | null = null;

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

export const isMetaAllowedPathname = (pathname: string) => {
  const normalized = pathname.trim() || '/';
  return META_EXACT_ALLOWED_PATHS.has(normalized) || normalized === '/jornada' || normalized.startsWith('/jornada/');
};
const hasCleanCurrentMarketingUrl = () => isBrowser() && window.location.search === '' && window.location.hash === '';
const isMetaPageContextAllowed = () => isBrowser() && isMetaAllowedPathname(window.location.pathname) && hasCleanCurrentMarketingUrl();
const isControlledMetaCheckoutContext = () => isBrowser() && window.location.pathname === META_CONTROLLED_CHECKOUT_PATH && hasCleanCurrentMarketingUrl();
const effectiveMarketingConsent = (preferences: ConsentPreferences) => preferences.marketing && isMetaPageContextAllowed();

const googleConsent = (preferences: ConsentPreferences, command: 'default' | 'update') => {
  if (!isBrowser()) return;
  const marketingGranted = effectiveMarketingConsent(preferences);
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || ((...args: unknown[]) => window.dataLayer?.push(args));
  window.gtag('consent', command, {
    analytics_storage: preferences.analytics ? 'granted' : 'denied',
    ad_storage: marketingGranted ? 'granted' : 'denied',
    ad_user_data: marketingGranted ? 'granted' : 'denied',
    ad_personalization: marketingGranted ? 'granted' : 'denied'
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
const getGoogleCookieAttribution = (measurementId: string): CheckoutAttribution | undefined => {
  if (!isBrowser()) return undefined;
  const cookies = new Map(document.cookie.split(';').map((part) => {
    const separator = part.indexOf('=');
    if (separator < 0) return [part.trim(), ''];
    return [part.slice(0, separator).trim(), decodeURIComponent(part.slice(separator + 1))];
  }));
  const clientMatch = cookies.get('_ga')?.match(/^GA\d+\.\d+\.(\d+)\.(\d+)$/);
  const result: CheckoutAttribution = {};
  if (clientMatch) result.clientId = `${clientMatch[1]}.${clientMatch[2]}`;

  const sessionCookie = cookies.get(`_ga_${measurementId.replace(/^G-/, '')}`);
  const taggedSessionId = sessionCookie?.match(/(?:^|[.$])s(\d+)(?:\$|$)/)?.[1];
  const taggedSessionNumber = sessionCookie?.match(/(?:^|[.$])o(\d+)(?:\$|$)/)?.[1];
  const legacyParts = sessionCookie?.match(/^GS\d+\.\d+\.(.+)$/)?.[1].split('.');
  const sessionId = Number(taggedSessionId || legacyParts?.[0]);
  const sessionNumber = Number(taggedSessionNumber || legacyParts?.[1]);
  if (Number.isSafeInteger(sessionId) && sessionId > 0) result.sessionId = sessionId;
  if (Number.isSafeInteger(sessionNumber) && sessionNumber > 0) result.sessionNumber = sessionNumber;
  return Object.keys(result).length ? result : undefined;
};
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
const initializeMeta = (allowControlledCheckout = false) => {
  const pixelId = cleanId(testConfig?.metaPixelId) || cleanId(dynamicConfig.metaPixelId);
  const routeAllowed = isMetaPageContextAllowed() || (allowControlledCheckout && isControlledMetaCheckoutContext());
  if (!pixelId || !routeAllowed || !isBrowser()) return false;
  if (metaLoaded) return true;
  const fbq = window.fbq || (() => {
    const queuedFbq = ((...args: unknown[]) => {
      if (queuedFbq.callMethod) queuedFbq.callMethod(...args);
      else (queuedFbq.queue = queuedFbq.queue || []).push(args);
    }) as MetaPixelFunction;
    queuedFbq.push = queuedFbq;
    queuedFbq.loaded = true;
    queuedFbq.version = '2.0';
    queuedFbq.queue = [];
    return queuedFbq;
  })();
  window.fbq = fbq;
  // O bootstrap oficial mantém os dois aliases idênticos. Sem `_fbq`, o
  // próprio fbevents.js interpreta a página como duas versões conflitantes.
  window._fbq = fbq;
  window.fbq('consent', 'grant');
  window.fbq('set', 'autoConfig', false, pixelId);
  window.fbq('init', pixelId);
  metaLoaded = loadScriptOnce('https://connect.facebook.net/en_US/fbevents.js', 'analytics-meta-pixel') || Boolean(document.getElementById('analytics-meta-pixel'));
  return metaLoaded;
};
const waitForMetaPixelReady = async () => {
  if (!isBrowser()) return false;
  const timeoutMs = testConfig?.metaReadyTimeoutMs ?? DEFAULT_META_READY_TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    if (typeof window.fbq?.callMethod === 'function') return true;
    await new Promise((resolve) => window.setTimeout(resolve, 50));
  }
  return false;
};
const grantMeta = () => { try { window.fbq?.('consent', 'grant'); } catch { /* the Pixel may not be loaded */ } };
const revokeMeta = () => {
  try { window.fbq?.('consent', 'revoke'); } catch { /* the Pixel may not be loaded */ }
};
const trackMetaPageView = () => {
  if (getConsentPreferences()?.marketing !== true || !isMetaPageContextAllowed()) return false;
  const pageKey = window.location.pathname;
  if (lastMetaPageKey === pageKey || !initializeMeta()) return false;
  try {
    grantMeta();
    window.fbq?.('track', 'PageView');
    lastMetaPageKey = pageKey;
    return true;
  } catch { return false; }
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
    if (preferences?.analytics || effectiveMarketingConsent(preferences)) initializeGtm();
    if (preferences?.analytics) initializeDirectGa4();
    if (effectiveMarketingConsent(preferences)) trackMetaPageView();
  } catch { /* dynamic IDs are optional */ }
};
const applyConsent = (preferences: ConsentPreferences, command: 'default' | 'update') => {
  googleConsent(preferences, command);
  try { nativeBridge()?.setAnalyticsCollectionEnabled(preferences.analytics); } catch { /* optional bridge */ }
  if (!preferences.analytics) clearNativeIdentity();
  if (preferences.analytics || effectiveMarketingConsent(preferences)) { initializeGtm(); void loadDynamicIds(); }
  if (preferences.analytics) { applyPendingUser(); initializeDirectGa4(); }
  if (effectiveMarketingConsent(preferences)) { grantMeta(); trackMetaPageView(); void loadDynamicIds(); }
  else { lastMetaPageKey = null; revokeMeta(); }
};
export const refreshMarketingAnalyticsForCurrentRoute = () => {
  if (!isBrowser()) return;
  const preferences = preferencesFromStorage() ?? { necessary: true, analytics: false, marketing: false };
  googleConsent(preferences, 'update');
  if (!effectiveMarketingConsent(preferences)) {
    lastMetaPageKey = null;
    revokeMeta();
    return;
  }
  initializeGtm();
  grantMeta();
  trackMetaPageView();
  void loadDynamicIds();
};
export const sanitizeCurrentMarketingUrl = () => {
  if (!isBrowser() || !isMetaAllowedPathname(window.location.pathname) || hasCleanCurrentMarketingUrl()) return false;
  window.history.replaceState(window.history.state, document.title, window.location.pathname);
  return true;
};
export const setConsentPreferences = (preferences: Omit<ConsentPreferences, 'necessary'>) => {
  if (!isBrowser()) return;
  const next: ConsentPreferences = { necessary: true, analytics: preferences.analytics === true, marketing: preferences.marketing === true };
  const current = preferencesFromStorage();
  if (current && current.analytics === next.analytics && current.marketing === next.marketing) return;
  try { window.localStorage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, JSON.stringify(next)); } catch { /* runtime consent still applies */ }
  applyConsent(next, 'update');
  void syncAnalyticsConsentForCurrentUser();
  window.dispatchEvent(new CustomEvent(ANALYTICS_CONSENT_EVENT, { detail: next }));
};
export const syncAnalyticsConsentForCurrentUser = async (knownUserId?: string) => {
  const preferences = preferencesFromStorage();
  if (!preferences) return false;
  try {
    const { supabase } = await import('../supabaseClient');
    const userId = knownUserId || (await supabase.auth.getUser()).data.user?.id;
    if (!userId || !UUID_PATTERN.test(userId)) return false;
    const { error } = await supabase.from('analytics_consents').upsert({
      user_id: userId,
      analytics_granted: preferences.analytics,
      marketing_granted: preferences.marketing,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });
    return !error;
  } catch { return false; }
};
export const initAnalytics = () => {
  if (!isBrowser()) return;
  if (!initialized) {
    initialized = true;
    // This is synchronous and always precedes any Google script/config/event.
    googleConsent({ necessary: true, analytics: false, marketing: false }, 'default');
  }
  const preferences = preferencesFromStorage();
  if (preferences) applyConsent(preferences, 'update');
  else { try { nativeBridge()?.setAnalyticsCollectionEnabled(false); clearNativeIdentity(); } catch { /* optional bridge */ } }
};
export const configureAnalyticsForTests = (config: { gtmId?: string; gaMeasurementId?: string; directGa4?: boolean; metaPixelId?: string; attributionTimeoutMs?: number; metaReadyTimeoutMs?: number } | null) => { testConfig = config; };
export const resetAnalyticsForTests = () => {
  initialized = false;
  gtmLoaded = false;
  ga4Loaded = false;
  metaLoaded = false;
  dynamicConfigLoaded = false;
  dynamicConfig = {};
  pendingUser = { id: null, properties: {} };
  lastMetaPageKey = null;
  sentDedupeKeys.clear();
};
export const getCheckoutAttribution = async (): Promise<CheckoutAttribution | undefined> => {
  if (!isBrowser() || getAnalyticsConsent() !== 'granted') return undefined;
  // This is the GA4 destination configured by the Google Tag in GTM. Reading
  // attribution never enables direct GA4; VITE_ANALYTICS_DIRECT_GA4 remains the
  // only switch for that independent loading path.
  const measurementId = cleanId(testConfig?.gaMeasurementId) || cleanId(env.VITE_GA_MEASUREMENT_ID);
  if (!measurementId) return undefined;
  const cookieAttribution = getGoogleCookieAttribution(measurementId);
  if (cookieAttribution?.clientId && cookieAttribution.sessionId) return cookieAttribution;
  if (typeof window.gtag !== 'function') return cookieAttribution;
  const timeoutMs = Number.isFinite(testConfig?.attributionTimeoutMs) && Number(testConfig?.attributionTimeoutMs) > 0
    ? Number(testConfig?.attributionTimeoutMs)
    : DEFAULT_ATTRIBUTION_TIMEOUT_MS;
  const read = <T,>(field: 'client_id' | 'session_id' | 'session_number') => new Promise<T | undefined>((resolve) => {
    let settled = false;
    const finish = (value: T | undefined) => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timer);
      resolve(value);
    };
    const timer = globalThis.setTimeout(() => {
      console.warn(`[analytics] Google tag attribution field timed out: ${field}`);
      finish(undefined);
    }, timeoutMs);
    try { window.gtag?.('get', measurementId, field, (value: T) => finish(value)); } catch { finish(undefined); }
  });
  const [clientId, sessionId, sessionNumber] = await Promise.all([read<string>('client_id'), read<number | string>('session_id'), read<number | string>('session_number')]);
  const normalizedClientId = typeof clientId === 'string' && /^\d+\.\d+$/.test(clientId) ? clientId : undefined;
  const normalizedSessionId = Number(sessionId);
  const normalizedSessionNumber = Number(sessionNumber);
  const result: CheckoutAttribution = { ...cookieAttribution };
  if (normalizedClientId) result.clientId = normalizedClientId;
  if (Number.isSafeInteger(normalizedSessionId) && normalizedSessionId > 0) result.sessionId = normalizedSessionId;
  if (Number.isSafeInteger(normalizedSessionNumber) && normalizedSessionNumber > 0) result.sessionNumber = normalizedSessionNumber;
  return Object.keys(result).length ? result : undefined;
};

export const getCheckoutAttributionWithRetry = async (
  initial?: Promise<CheckoutAttribution | undefined> | CheckoutAttribution,
  freshAttempts = 2
): Promise<CheckoutAttribution | undefined> => {
  let result = await initial;
  if (result?.clientId) return result;

  for (let attempt = 0; attempt < freshAttempts; attempt += 1) {
    if (attempt > 0) {
      await new Promise((resolve) => globalThis.setTimeout(resolve, DEFAULT_ATTRIBUTION_RETRY_DELAY_MS));
    }
    const refreshed = await getCheckoutAttribution();
    result = refreshed ? { ...result, ...refreshed } : result;
    if (result?.clientId) return result;
  }

  return result;
};

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
  if (!isBrowser()) return false;
  const preferences = getConsentPreferences();
  const normalized = normalizeEventName(eventName);
  const analyticsAllowed = preferences?.analytics === true;
  const marketingAllowed = preferences?.marketing === true
    && MARKETING_EVENT_NAMES.has(normalized || '')
    && (isMetaPageContextAllowed() || isControlledMetaCheckoutContext());
  if (!normalized || (!analyticsAllowed && !marketingAllowed) || (options.dedupeKey && sentDedupeKeys.has(options.dedupeKey))) return false;
  if (options.dedupeKey && options.persistDedupe) { try { if (window.localStorage.getItem(`analytics:dedupe:${options.dedupeKey}`) === '1') return false; } catch { /* memory dedupe */ } }
  const sanitized = sanitizeAnalyticsParameters(parameters);
  const bridge = nativeBridge();
  let emitted = false;

  if (analyticsAllowed && bridge) {
    try { bridge.logEvent(normalized, JSON.stringify(sanitized)); emitted = true; } catch { /* native analytics never affects the app */ }
  }

  const analyticsThroughGtm = analyticsAllowed && !bridge && Boolean(activeGtmId());
  const marketingThroughGtm = marketingAllowed && isMetaPageContextAllowed() && Boolean(activeGtmId());
  if (analyticsThroughGtm || marketingThroughGtm) {
    try {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({
        event: normalized,
        ...sanitized,
        analytics_destination: analyticsThroughGtm,
        marketing_destination: marketingThroughGtm
      });
      emitted = true;
    } catch { /* a container failure must not affect billing or navigation */ }
  }

  if (analyticsAllowed && !bridge && directGa4Enabled() && typeof window.gtag === 'function') {
    try { window.gtag('event', normalized, sanitized); emitted = true; } catch { /* direct GA4 is optional */ }
  }

  if (marketingAllowed && initializeMeta(isControlledMetaCheckoutContext())) {
    try {
      grantMeta();
      window.fbq?.('track', 'InitiateCheckout', sanitized);
      emitted = true;
    } catch { /* Meta is optional */ }
    if (!isMetaPageContextAllowed()) revokeMeta();
  }

  if (emitted && options.dedupeKey) {
    sentDedupeKeys.add(options.dedupeKey);
    if (options.persistDedupe) try { window.localStorage.setItem(`analytics:dedupe:${options.dedupeKey}`, '1'); } catch { /* optional */ }
  }
  return emitted;
};
export const trackPageView = (pathname: string, title = typeof document !== 'undefined' ? document.title : '') => trackEvent('page_view', { page_location: pathname.split('?')[0].split('#')[0].slice(0, 200) || '/', page_title: title.slice(0, MAX_STRING_LENGTH) });
export const trackSignUpOnce = (userId: string, method: string) => {
  const normalizedUserId = userId.trim().toLowerCase();
  if (!UUID_PATTERN.test(normalizedUserId)) return false;
  return trackEvent('sign_up', { method }, {
    dedupeKey: `sign_up:${normalizedUserId}`,
    persistDedupe: true
  });
};
export const setAnalyticsUser = (userId: string | null, properties: Partial<Record<'professional_segment' | 'work_context' | 'subscription_plan' | 'app_environment', string | null>> = {}) => {
  const validId = userId && UUID_PATTERN.test(userId) ? userId : null;
  pendingUser = { id: validId, properties: Object.fromEntries(Object.entries(properties).filter(([name, value]) => ALLOWED_USER_PROPERTIES.has(name) && (value === null || (typeof value === 'string' && !SENSITIVE_VALUE_PATTERN.test(value) && value.length <= 36)))) };
  if (!validId) { clearNativeIdentity(); return; }
  applyPendingUser();
};
export const trackBeginCheckout = (planId: string, planName: string, price: number, paymentProvider?: string, attemptId = `${Date.now()}-${Math.random().toString(36).slice(2)}`) => trackEvent('begin_checkout', { plan_id: planId, plan_name: planName, value: price, currency: 'BRL', payment_provider: paymentProvider }, { dedupeKey: `begin_checkout:${attemptId}` });
export const trackConfirmedMarketingPurchaseOnce = async (input: { transactionId: string; planId: string; planName: string; amount: number; paymentProvider: string }) => {
  if (!isBrowser() || getConsentPreferences()?.marketing !== true || !isMetaPageContextAllowed() || !['stripe', 'google_play'].includes(input.paymentProvider)) return false;
  const transactionId = input.transactionId.trim();
  const planId = input.planId.trim().slice(0, MAX_STRING_LENGTH);
  const planName = input.planName.trim().slice(0, MAX_STRING_LENGTH);
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(transactionId) || !planId || !planName || !Number.isFinite(input.amount) || input.amount <= 0) return false;
  const dedupeKey = `marketing-purchase:${transactionId}`;
  if (sentDedupeKeys.has(dedupeKey)) return false;
  try { if (window.localStorage.getItem(`analytics:dedupe:${dedupeKey}`) === '1') return false; } catch { /* memory dedupe */ }

  await loadDynamicIds();
  initializeMeta();
  let emitted = false;
  if (metaLoaded) {
    try {
      window.fbq?.('track', 'Purchase', {
        value: input.amount,
        currency: 'BRL',
        content_name: planName,
        content_category: 'Subscription',
        content_ids: [planId],
        content_type: 'product'
      }, { eventID: `purchase-${transactionId}` });
      emitted = true;
    } catch { /* Meta Pixel is optional */ }
  }
  if (emitted) {
    sentDedupeKeys.add(dedupeKey);
    try { window.localStorage.setItem(`analytics:dedupe:${dedupeKey}`, '1'); } catch { /* optional */ }
  }
  return emitted;
};
const markCompleteRegistrationDelivered = (eventId: string) => {
  const dedupeKey = `meta-complete-registration:${eventId}`;
  sentDedupeKeys.add(dedupeKey);
  try { window.localStorage.setItem(`analytics:dedupe:${dedupeKey}`, '1'); } catch { /* server delivery remains authoritative */ }
};

const emitCompleteRegistration = async (eventId: string, usePersistentDedupe: boolean) => {
  if (!isBrowser() || getConsentPreferences()?.marketing !== true || !isMetaPageContextAllowed() || !META_REGISTRATION_EVENT_ID_PATTERN.test(eventId)) return false;
  const dedupeKey = `meta-complete-registration:${eventId}`;
  if (sentDedupeKeys.has(dedupeKey)) return false;
  if (usePersistentDedupe) {
    try { if (window.localStorage.getItem(`analytics:dedupe:${dedupeKey}`) === '1') return false; } catch { /* server delivery remains authoritative */ }
  }

  await loadDynamicIds();
  if (!initializeMeta() || !await waitForMetaPixelReady() || !isMetaPageContextAllowed()) return false;
  try {
    grantMeta();
    window.fbq?.('track', 'CompleteRegistration', {
      content_name: 'Cadastro Evolução Clínica'
    }, { eventID: eventId });
    if (usePersistentDedupe) markCompleteRegistrationDelivered(eventId);
    return true;
  } catch { return false; }
};

export const trackCompleteRegistrationOnce = async (eventId: string) => emitCompleteRegistration(eventId, true);

export const trackConfirmedMetaRegistrationOnce = async (knownAccessToken?: string) => {
  const preferences = getConsentPreferences();
  if (!isBrowser() || preferences?.marketing !== true || !isMetaPageContextAllowed()) return false;
  try {
    let accessToken = knownAccessToken;
    if (!accessToken) {
      const { supabase } = await import('../supabaseClient');
      accessToken = (await supabase.auth.getSession()).data.session?.access_token;
    }
    if (!accessToken) return false;

    const pendingResponse = await fetch('/api/analytics/meta-registration/pending', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        analyticsGranted: preferences.analytics,
        marketingGranted: preferences.marketing
      })
    });
    if (!pendingResponse.ok) return false;
    const pendingPayload = await pendingResponse.json() as { eventId?: unknown };
    if (typeof pendingPayload.eventId !== 'string' || !META_REGISTRATION_EVENT_ID_PATTERN.test(pendingPayload.eventId)) return false;

    const eventId = pendingPayload.eventId;
    // The database is authoritative here. A retry intentionally ignores local
    // dedupe and reuses the same Meta eventID if the previous acknowledgement
    // was lost after fbq accepted the event.
    sentDedupeKeys.delete(`meta-complete-registration:${eventId}`);
    if (!await emitCompleteRegistration(eventId, false)) return false;

    const completeResponse = await fetch('/api/analytics/meta-registration/complete', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ eventId })
    });
    if (!completeResponse.ok) return false;
    const completePayload = await completeResponse.json() as { eventId?: unknown; status?: unknown };
    if (completePayload.eventId !== eventId || completePayload.status !== 'delivered') return false;
    markCompleteRegistrationDelivered(eventId);
    return true;
  } catch { return false; }
};
export const trackStripeAndroidPurchaseOnce = (input: { transactionId: string; planName: string; amount: number; currency: string; paymentProvider: string; status: string; restored?: boolean }) => {
  if (!isBrowser() || getAnalyticsConsent() !== 'granted' || input.paymentProvider !== 'stripe' || input.status !== 'paid' || input.restored === true) return false;
  const transactionId = input.transactionId.trim();
  const planName = input.planName.trim().slice(0, MAX_STRING_LENGTH);
  const currency = input.currency.trim().toUpperCase();
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(transactionId) || !planName || SENSITIVE_VALUE_PATTERN.test(planName) || !Number.isFinite(input.amount) || input.amount <= 0 || currency !== 'BRL') return false;
  const dedupeKey = `firebase-in-app-purchase:${transactionId}`;
  if (sentDedupeKeys.has(dedupeKey)) return false;
  try { if (window.localStorage.getItem(`analytics:dedupe:${dedupeKey}`) === '1') return false; } catch { /* native dedupe remains authoritative */ }
  const bridge = nativeBridge();
  if (!bridge?.logStripeInAppPurchase) return false;
  try {
    if (bridge.logStripeInAppPurchase(transactionId, input.amount, currency, planName) !== true) return false;
    sentDedupeKeys.add(dedupeKey);
    try { window.localStorage.setItem(`analytics:dedupe:${dedupeKey}`, '1'); } catch { /* native persistent dedupe is sufficient */ }
    return true;
  } catch { return false; }
};
export const trackJourneyEvent = (eventName: string, params?: AnalyticsParameters) => trackEvent(eventName, params);
