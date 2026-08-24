import { supabase } from '../supabaseClient';
import { getConsentPreferences } from '../services/analytics';
import {
  type AcquisitionData,
  calculateAcquisitionChannel,
  hasAttributableSignal,
  isGenericAppFallback,
  isLikelyOAuthReturn,
  isValidAcquisitionData,
  resolveAcquisitionTouches,
  sanitizeTrackingUrl,
} from './acquisitionAttribution';

export type { AcquisitionData } from './acquisitionAttribution';
export { calculateAcquisitionChannel } from './acquisitionAttribution';

const LEGACY_STORAGE_KEY = 'evolucao-clinica:acquisition';
const FIRST_TOUCH_STORAGE_KEY = 'evolucao-clinica:acquisition:first-touch';
const CURRENT_TOUCH_STORAGE_KEY = 'evolucao-clinica:acquisition:current-touch';
const SIGNUP_PENDING_PREFIX = 'evolucao-clinica:acquisition:signup-pending';
const NEW_ACCOUNT_WINDOW_MS = 2 * 60 * 60 * 1000;
const NATIVE_REFERRER_ATTEMPTS = 10;
const NATIVE_REFERRER_RETRY_MS = 300;

type NativeInstallAttributionPayload = {
  status?: 'pending' | 'ready' | 'unavailable';
  install_referrer?: string;
  referrer_click_timestamp_seconds?: number;
  install_begin_timestamp_seconds?: number;
};

declare global {
  interface Window {
    NativeAcquisitionBridge?: {
      getInstallAttribution: () => string;
      requestInstallAttribution: () => void;
    };
  }
}

const safeRead = (key: string): AcquisitionData | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isValidAcquisitionData(parsed) ? parsed : null;
  } catch (error) {
    console.warn('[AcquisitionTracking] Não foi possível ler dados locais de aquisição.', error);
    return null;
  }
};

const safeWrite = (key: string, data: AcquisitionData): void => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(data));
  } catch (error) {
    console.warn('[AcquisitionTracking] Não foi possível persistir dados locais de aquisição.', error);
  }
};

const safeRemove = (key: string): void => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Falha de limpeza não pode afetar autenticação ou navegação.
  }
};

const getSignupPendingKey = (userId: string) => `${SIGNUP_PENDING_PREFIX}:${userId}`;

const readFirstTouch = (): AcquisitionData | null => {
  const current = safeRead(FIRST_TOUCH_STORAGE_KEY);
  if (current) return current;

  const legacy = safeRead(LEGACY_STORAGE_KEY);
  if (legacy) {
    safeWrite(FIRST_TOUCH_STORAGE_KEY, legacy);
    return legacy;
  }

  return null;
};

const buildCurrentTouch = (): AcquisitionData => {
  const urlParams = new URLSearchParams(window.location.search);
  const externalReferrer = document.referrer && !document.referrer.includes(window.location.hostname)
    ? sanitizeTrackingUrl(document.referrer)
    : undefined;

  const data: AcquisitionData = {
    utm_source: urlParams.get('utm_source') || undefined,
    utm_medium: urlParams.get('utm_medium') || undefined,
    utm_campaign: urlParams.get('utm_campaign') || undefined,
    utm_term: urlParams.get('utm_term') || undefined,
    utm_content: urlParams.get('utm_content') || undefined,
    gclid: urlParams.get('gclid') || undefined,
    fbclid: urlParams.get('fbclid') || undefined,
    referrer: externalReferrer,
    landing_page: sanitizeTrackingUrl(window.location.href, window.location.origin),
    first_seen_at: new Date().toISOString(),
    attribution_method: 'url',
  };

  data.channel = calculateAcquisitionChannel(data);
  return data;
};

const persistAcquisitionCandidate = (
  candidate: AcquisitionData,
  returningFromOAuth = false
): AcquisitionData => {
  const existingFirstTouch = readFirstTouch();
  const existingCurrentTouch = safeRead(CURRENT_TOUCH_STORAGE_KEY);
  const { firstTouch, currentTouch } = resolveAcquisitionTouches({
    existingFirstTouch,
    existingCurrentTouch,
    candidate,
    returningFromOAuth,
  });

  if (!existingFirstTouch || firstTouch !== existingFirstTouch) {
    safeWrite(FIRST_TOUCH_STORAGE_KEY, firstTouch);
    safeWrite(LEGACY_STORAGE_KEY, firstTouch);
  }

  safeWrite(CURRENT_TOUCH_STORAGE_KEY, currentTouch);
  return firstTouch;
};

/**
 * Captura first touch e o touch da sessão atual.
 * O first touch é imutável; o current touch é atualizado a cada nova sessão,
 * exceto no retorno de OAuth, quando preservamos a origem anterior.
 */
export function captureAcquisitionData(): AcquisitionData {
  if (typeof window === 'undefined') return {};

  const candidate = buildCurrentTouch();

  const pendingOAuth = Boolean(
    window.localStorage.getItem('oauth_redirect_path') ||
    window.localStorage.getItem('evolucao-clinica:google-oauth-scopes')
  );
  const returningFromOAuth = isLikelyOAuthReturn(window.location.href, document.referrer) || pendingOAuth;
  return persistAcquisitionCandidate(candidate, returningFromOAuth);
}

const timestampSecondsToIso = (value?: number): string | undefined => {
  if (!Number.isFinite(value) || Number(value) <= 0) return undefined;
  return new Date(Number(value) * 1000).toISOString();
};

const nativePayloadToAcquisition = (payload: NativeInstallAttributionPayload): AcquisitionData | null => {
  if (payload.status !== 'ready' || !payload.install_referrer) return null;

  const params = new URLSearchParams(payload.install_referrer.replace(/^\?/, ''));
  const data: AcquisitionData = {
    utm_source: params.get('utm_source') || undefined,
    utm_medium: params.get('utm_medium') || undefined,
    utm_campaign: params.get('utm_campaign') || undefined,
    utm_term: params.get('utm_term') || undefined,
    utm_content: params.get('utm_content') || undefined,
    gclid: params.get('gclid') || undefined,
    fbclid: params.get('fbclid') || undefined,
    landing_page: typeof window !== 'undefined'
      ? sanitizeTrackingUrl(window.location.href, window.location.origin)
      : undefined,
    first_seen_at: timestampSecondsToIso(payload.referrer_click_timestamp_seconds) || new Date().toISOString(),
    attribution_method: 'google_play_install_referrer',
    referrer_click_at: timestampSecondsToIso(payload.referrer_click_timestamp_seconds),
    install_begin_at: timestampSecondsToIso(payload.install_begin_timestamp_seconds),
  };

  data.channel = calculateAcquisitionChannel(data);
  return hasAttributableSignal(data) ? data : null;
};

const wait = (milliseconds: number) => new Promise(resolve => window.setTimeout(resolve, milliseconds));
let nativeAttributionPromise: Promise<AcquisitionData | null> | null = null;

/**
 * Recupera a referência de instalação do Google Play no aplicativo Android.
 * O bridge devolve somente o conteúdo oficial do Install Referrer; a aplicação
 * persiste apenas UTMs e click IDs já aceitos pelo modelo de aquisição.
 */
export function captureNativeInstallAttribution(): Promise<AcquisitionData | null> {
  if (
    typeof window === 'undefined'
    || getConsentPreferences()?.marketing !== true
    || !window.NativeAcquisitionBridge?.getInstallAttribution
  ) {
    return Promise.resolve(null);
  }
  if (nativeAttributionPromise) return nativeAttributionPromise;

  nativeAttributionPromise = (async () => {
    window.NativeAcquisitionBridge?.requestInstallAttribution();
    for (let attempt = 0; attempt < NATIVE_REFERRER_ATTEMPTS; attempt += 1) {
      try {
        const raw = window.NativeAcquisitionBridge?.getInstallAttribution();
        const payload = raw ? JSON.parse(raw) as NativeInstallAttributionPayload : null;
        const acquisition = payload ? nativePayloadToAcquisition(payload) : null;
        if (acquisition) {
          persistAcquisitionCandidate(acquisition);
          return acquisition;
        }
        if (payload?.status === 'unavailable') return null;
      } catch (error) {
        console.warn('[AcquisitionTracking] Referência nativa de instalação inválida.', error);
        return null;
      }
      await wait(NATIVE_REFERRER_RETRY_MS);
    }
    return null;
  })();

  return nativeAttributionPromise;
}

/**
 * Compatibilidade: retorna o first touch.
 */
export function getLocalAcquisitionData(): AcquisitionData {
  return readFirstTouch() || captureAcquisitionData();
}

export function getCurrentAcquisitionData(): AcquisitionData {
  if (typeof window === 'undefined') return {};
  const stored = safeRead(CURRENT_TOUCH_STORAGE_KEY);
  if (stored) return stored;
  captureAcquisitionData();
  return safeRead(CURRENT_TOUCH_STORAGE_KEY) || getLocalAcquisitionData();
}

const isRecentlyCreatedAccount = (createdAt?: string | null): boolean => {
  if (!createdAt) return false;
  const createdAtMs = new Date(createdAt).getTime();
  if (!Number.isFinite(createdAtMs)) return false;
  return Date.now() - createdAtMs >= 0 && Date.now() - createdAtMs <= NEW_ACCOUNT_WINDOW_MS;
};

const isMissingColumnError = (message?: string | null, columnName?: string): boolean => {
  const normalized = String(message || '').toLowerCase();
  if (!columnName) return false;
  return normalized.includes(columnName.toLowerCase()) && (
    normalized.includes('column') ||
    normalized.includes('schema cache') ||
    normalized.includes('does not exist')
  );
};

/**
 * Sincroniza first touch e signup touch com o perfil no Supabase.
 * Tracking é best-effort: falhas nunca bloqueiam login/onboarding.
 */
export async function syncAcquisitionWithDatabase(
  userId: string,
  currentInfo?: AcquisitionData | null
): Promise<void> {
  if (!userId) return;

  const firstTouch = getLocalAcquisitionData();
  const currentTouch = getCurrentAcquisitionData();

  try {
    const shouldUpgradeFirstTouch = isGenericAppFallback(currentInfo) && !isGenericAppFallback(firstTouch);
    if ((!isValidAcquisitionData(currentInfo) || shouldUpgradeFirstTouch) && isValidAcquisitionData(firstTouch)) {
      const { error } = await supabase
        .from('professionals')
        .update({ acquisition_info: firstTouch })
        .eq('id', userId);

      if (error) {
        console.warn('[AcquisitionTracking] Falha ao registrar first touch:', error.message);
      }
    }

    const pendingKey = getSignupPendingKey(userId);
    let pendingSignupTouch = safeRead(pendingKey);

    if (!pendingSignupTouch) {
      const { data: authData } = await supabase.auth.getUser();
      const authUser = authData?.user;
      if (authUser?.id === userId && isRecentlyCreatedAccount(authUser.created_at) && isValidAcquisitionData(currentTouch)) {
        pendingSignupTouch = currentTouch;
        safeWrite(pendingKey, currentTouch);
      }
    }

    if (!pendingSignupTouch) return;

    const { data: profile, error: profileError } = await supabase
      .from('professionals')
      .select('signup_acquisition_info')
      .eq('id', userId)
      .maybeSingle();

    if (profileError) {
      if (!isMissingColumnError(profileError.message, 'signup_acquisition_info')) {
        console.warn('[AcquisitionTracking] Falha ao consultar signup touch:', profileError.message);
      }
      return;
    }

    const shouldUpgradeSignupTouch = isGenericAppFallback(profile?.signup_acquisition_info)
      && !isGenericAppFallback(pendingSignupTouch);
    if (isValidAcquisitionData(profile?.signup_acquisition_info) && !shouldUpgradeSignupTouch) {
      safeRemove(pendingKey);
      return;
    }

    const { error: signupError } = await supabase
      .from('professionals')
      .update({ signup_acquisition_info: pendingSignupTouch })
      .eq('id', userId);

    if (signupError) {
      if (!isMissingColumnError(signupError.message, 'signup_acquisition_info')) {
        console.warn('[AcquisitionTracking] Falha ao registrar signup touch:', signupError.message);
      }
      return;
    }

    safeRemove(pendingKey);
  } catch (error) {
    console.warn('[AcquisitionTracking] Sincronização de aquisição indisponível; acesso preservado.', error);
  }
}

export const __acquisitionTrackingInternals = {
  LEGACY_STORAGE_KEY,
  FIRST_TOUCH_STORAGE_KEY,
  CURRENT_TOUCH_STORAGE_KEY,
  SIGNUP_PENDING_PREFIX,
  hasAttributableSignal,
};
