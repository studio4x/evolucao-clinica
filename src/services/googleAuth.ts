import { supabase } from '../supabaseClient';
import { getInstalledAppInfo } from '../utils/installedAppInfo';
import { assertPublicEffectEnabled } from '../config/publicFlags';
export {
  isGoogleScopeError,
  parseGoogleScopes,
  validateGoogleAccessTokenScopes,
  type GoogleScopeValidationResult,
} from '../utils/googleScopes';
import { parseGoogleScopes } from '../utils/googleScopes';

export const GOOGLE_SCOPES = {
  driveFile: 'https://www.googleapis.com/auth/drive.file',
  calendarEventsReadonly: 'https://www.googleapis.com/auth/calendar.events.readonly',
} as const;

export const GOOGLE_SCOPE_SETS = {
  login: [GOOGLE_SCOPES.driveFile],
  clinicalDocs: [
    GOOGLE_SCOPES.driveFile,
  ],
  calendarReadOnly: [GOOGLE_SCOPES.calendarEventsReadonly],
} as const;

export type GoogleScopeSetName = keyof typeof GOOGLE_SCOPE_SETS;

export type GoogleAuthorizationStatus = 'unknown' | 'authorized' | 'missing_scopes' | 'auth_required' | 'token_expired' | 'network_error';


const PENDING_GOOGLE_SCOPES_KEY = 'evolucao-clinica:google-oauth-scopes';
export const NATIVE_GOOGLE_OAUTH_REDIRECT_URL = 'evolucaoclinica://auth-callback';
const MIN_NATIVE_GOOGLE_OAUTH_CALLBACK_VERSION = 72;

export const isNativeGoogleOAuthClient = () => (
  typeof navigator !== 'undefined' && /EvolucaoClinicaApp/i.test(navigator.userAgent)
);

export const canUseNativeGoogleOAuthCallback = () => {
  if (!isNativeGoogleOAuthClient()) return true;
  const { versionCode } = getInstalledAppInfo();
  return versionCode !== null && versionCode >= MIN_NATIVE_GOOGLE_OAUTH_CALLBACK_VERSION;
};

const normalizeScopes = (scopes: string[]) => Array.from(new Set(scopes.filter(Boolean)));

export const hasGoogleScopes = (
  grantedScopes: ReadonlyArray<string>,
  requiredScopes: ReadonlyArray<string>
) => requiredScopes.every((scope) => grantedScopes.includes(scope));

export const mergeGoogleScopes = (...scopeLists: Array<string[] | string | null | undefined>) => {
  const merged = scopeLists.flatMap((item) => {
    if (!item) return [];
    if (Array.isArray(item)) return item;
    return parseGoogleScopes(item);
  });

  return normalizeScopes(merged);
};

export const getGoogleScopeSet = (scopeSet: GoogleScopeSetName) => [...GOOGLE_SCOPE_SETS[scopeSet]];

export const buildGoogleScopes = (
  requiredScopes: string[] | GoogleScopeSetName,
  currentGrantedScopes: string[] = []
) => {
  const required = Array.isArray(requiredScopes)
    ? requiredScopes
    : getGoogleScopeSet(requiredScopes);

  return mergeGoogleScopes(currentGrantedScopes, required);
};

export const storePendingGoogleScopes = (scopes: string[]) => {
  localStorage.setItem(PENDING_GOOGLE_SCOPES_KEY, JSON.stringify(normalizeScopes(scopes)));
};

export const readPendingGoogleScopes = () => {
  const raw = localStorage.getItem(PENDING_GOOGLE_SCOPES_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return normalizeScopes(parsed.filter((scope): scope is string => typeof scope === 'string'));
  } catch {
    return [];
  }
};

export const clearPendingGoogleScopes = () => {
  localStorage.removeItem(PENDING_GOOGLE_SCOPES_KEY);
};

export const getCurrentGoogleOAuthRedirectUrl = () => {
  if (typeof window === 'undefined') return '';
  if (isNativeGoogleOAuthClient()) return NATIVE_GOOGLE_OAUTH_REDIRECT_URL;
  return `${window.location.origin}${window.location.pathname}${window.location.search}`;
};

type RequestGoogleOAuthParams = {
  requiredScopes: string[] | GoogleScopeSetName;
  currentGrantedScopes?: string[];
  redirectTo: string;
  prompt?: string;
  loginHint?: string;
};

type EnsureGoogleAccessParams = Omit<RequestGoogleOAuthParams, 'prompt'> & {
  accessToken?: string | null;
  allowInteractive?: boolean;
};

export type EnsureGoogleAccessResult =
  | { status: 'ready' }
  | { status: 'interactive_started' }
  | { status: 'interactive_required' }
  | { status: 'error'; error: Error };

let googleOAuthLaunch: Promise<Awaited<ReturnType<typeof supabase.auth.signInWithOAuth>>> | null = null;

export const isGoogleAuthenticationError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error || '');
  return /UNAUTHENTICATED|invalid authentication credentials|\b401\b/i.test(message);
};

export const requestGoogleOAuth = async ({
  requiredScopes,
  currentGrantedScopes = [],
  redirectTo,
  prompt,
  loginHint,
}: RequestGoogleOAuthParams) => {
  assertPublicEffectEnabled('google');
  if (isNativeGoogleOAuthClient() && !canUseNativeGoogleOAuthCallback()) {
    return {
      data: { provider: 'google', url: null },
      error: new Error('Atualize o aplicativo pela Play Store para concluir a conexão com o Google neste dispositivo.')
    } as Awaited<ReturnType<typeof supabase.auth.signInWithOAuth>>;
  }

  const scopes = buildGoogleScopes(requiredScopes, currentGrantedScopes);
  storePendingGoogleScopes(scopes);
  // Google already asks for consent when a scope is genuinely new. Forcing
  // consent on every clinical reauthentication defeats silent reuse.
  const resolvedPrompt = prompt ?? undefined;

  if (typeof window !== 'undefined') {
    localStorage.setItem('oauth_redirect_path', window.location.pathname + window.location.search);
  }

  const queryParams = {
    include_granted_scopes: 'true',
    access_type: 'offline',
    ...(resolvedPrompt ? { prompt: resolvedPrompt } : {}),
    ...(loginHint ? { login_hint: loginHint } : {}),
  };

  // O WebView Android abre a autorização no navegador do sistema. O deep link
  // retorna o resultado para o mesmo WebView; este caminho só deve ser chamado
  // por uma ação explícita do usuário.
  const resolvedRedirectTo = isNativeGoogleOAuthClient()
    ? NATIVE_GOOGLE_OAUTH_REDIRECT_URL
    : redirectTo;

  if (googleOAuthLaunch) return googleOAuthLaunch;

  googleOAuthLaunch = supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      scopes: scopes.join(' '),
      redirectTo: resolvedRedirectTo,
      ...(Object.keys(queryParams).length > 0 ? { queryParams } : {}),
    },
  }).finally(() => {
    googleOAuthLaunch = null;
  });

  return googleOAuthLaunch;
};

export const ensureGoogleAccess = async ({
  accessToken,
  requiredScopes,
  currentGrantedScopes = [],
  redirectTo,
  loginHint,
  allowInteractive = false,
}: EnsureGoogleAccessParams): Promise<EnsureGoogleAccessResult> => {
  const required = Array.isArray(requiredScopes)
    ? requiredScopes
    : getGoogleScopeSet(requiredScopes);

  // A locally stored issuedAt is not evidence that Google rejected the token.
  // The real Google operation must be attempted before asking the user to reconnect.
  if (accessToken && hasGoogleScopes(currentGrantedScopes, required)) {
    return { status: 'ready' };
  }

  if (!allowInteractive) return { status: 'interactive_required' };

  const { error } = await requestGoogleOAuth({
    requiredScopes,
    currentGrantedScopes,
    redirectTo,
    loginHint,
  });
  return error ? { status: 'error', error } : { status: 'interactive_started' };
};
