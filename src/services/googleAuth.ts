import { supabase } from '../supabaseClient';

export const GOOGLE_SCOPES = {
  driveFile: 'https://www.googleapis.com/auth/drive.file',
  documents: 'https://www.googleapis.com/auth/documents',
  calendarEventsReadonly: 'https://www.googleapis.com/auth/calendar.events.readonly',
} as const;

export const GOOGLE_SCOPE_SETS = {
  login: [GOOGLE_SCOPES.driveFile],
  clinicalDocs: [
    GOOGLE_SCOPES.driveFile,
    GOOGLE_SCOPES.documents,
  ],
  calendarReadOnly: [GOOGLE_SCOPES.calendarEventsReadonly],
} as const;

export type GoogleScopeSetName = keyof typeof GOOGLE_SCOPE_SETS;

const PENDING_GOOGLE_SCOPES_KEY = 'evolucao-clinica:google-oauth-scopes';

const normalizeScopes = (scopes: string[]) => Array.from(new Set(scopes.filter(Boolean)));

export const hasGoogleScopes = (
  grantedScopes: ReadonlyArray<string>,
  requiredScopes: ReadonlyArray<string>
) => requiredScopes.every((scope) => grantedScopes.includes(scope));

export const parseGoogleScopes = (value?: string | null) => {
  if (!value) return [];
  return normalizeScopes(
    value
      .split(/\s+/)
      .map((scope) => scope.trim())
      .filter(Boolean)
  );
};

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
  return `${window.location.origin}${window.location.pathname}${window.location.search}`;
};

type RequestGoogleOAuthParams = {
  requiredScopes: string[] | GoogleScopeSetName;
  currentGrantedScopes?: string[];
  redirectTo: string;
  prompt?: string;
  loginHint?: string;
};

export const requestGoogleOAuth = async ({
  requiredScopes,
  currentGrantedScopes = [],
  redirectTo,
  prompt,
  loginHint,
}: RequestGoogleOAuthParams) => {
  const scopes = buildGoogleScopes(requiredScopes, currentGrantedScopes);
  storePendingGoogleScopes(scopes);
  const isLoginOnlyRequest = requiredScopes === 'login';
  const isExpandingScopes = scopes.some((scope) => !currentGrantedScopes.includes(scope));
  const resolvedPrompt = prompt ?? (!isLoginOnlyRequest && isExpandingScopes ? 'consent' : undefined);

  if (typeof window !== 'undefined') {
    localStorage.setItem('oauth_redirect_path', window.location.pathname + window.location.search);
  }

  const queryParams = {
    include_granted_scopes: 'true',
    access_type: 'offline',
    ...(resolvedPrompt ? { prompt: resolvedPrompt } : {}),
    ...(loginHint ? { login_hint: loginHint } : {}),
  };

  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      scopes: scopes.join(' '),
      redirectTo,
      ...(Object.keys(queryParams).length > 0 ? { queryParams } : {}),
    },
  });
};
