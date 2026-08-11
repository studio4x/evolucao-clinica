import { supabase } from '../supabaseClient';
import {
  type AcquisitionData,
  calculateAcquisitionChannel,
  hasAttributableSignal,
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
  };

  data.channel = calculateAcquisitionChannel(data);
  return data;
};

/**
 * Captura first touch e o touch da sessão atual.
 * O first touch é imutável; o current touch é atualizado a cada nova sessão,
 * exceto no retorno de OAuth, quando preservamos a origem anterior.
 */
export function captureAcquisitionData(): AcquisitionData {
  if (typeof window === 'undefined') return {};

  const existingFirstTouch = readFirstTouch();
  const existingCurrentTouch = safeRead(CURRENT_TOUCH_STORAGE_KEY);
  const candidate = buildCurrentTouch();

  const pendingOAuth = Boolean(
    window.localStorage.getItem('oauth_redirect_path') ||
    window.localStorage.getItem('evolucao-clinica:google-oauth-scopes')
  );
  const returningFromOAuth = isLikelyOAuthReturn(window.location.href, document.referrer) || pendingOAuth;
  const { firstTouch, currentTouch } = resolveAcquisitionTouches({
    existingFirstTouch,
    existingCurrentTouch,
    candidate,
    returningFromOAuth,
  });

  if (!existingFirstTouch) {
    safeWrite(FIRST_TOUCH_STORAGE_KEY, firstTouch);
    // Mantém compatibilidade com visitantes que já utilizam a chave antiga.
    safeWrite(LEGACY_STORAGE_KEY, firstTouch);
  }

  // A sessão atual também pode ser tráfego direto; isso é relevante para signup touch.
  safeWrite(CURRENT_TOUCH_STORAGE_KEY, currentTouch);

  return firstTouch;
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
    if (!isValidAcquisitionData(currentInfo) && isValidAcquisitionData(firstTouch)) {
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

    if (isValidAcquisitionData(profile?.signup_acquisition_info)) {
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
