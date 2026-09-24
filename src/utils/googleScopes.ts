export type GoogleScopeValidationResult = {
  status: 'authorized' | 'missing_scopes' | 'token_expired' | 'network_error';
  grantedScopes: string[];
  missingScopes: string[];
};

const normalizeScopes = (scopes: string[]) => Array.from(new Set(scopes.filter(Boolean)));

export const parseGoogleScopes = (value?: string | null) => {
  if (!value) return [];
  return normalizeScopes(
    value
      .split(/\s+/)
      .map((scope) => scope.trim())
      .filter(Boolean)
  );
};

export const isGoogleScopeError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error || '');
  return /ACCESS_TOKEN_SCOPE_INSUFFICIENT|insufficientPermissions|insufficient permission|INSUFFICIENT_SCOPES/i.test(message);
};

export const validateGoogleAccessTokenScopes = async (
  accessToken: string,
  requiredScopes: ReadonlyArray<string>
): Promise<GoogleScopeValidationResult> => {
  try {
    const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`, {
      method: 'GET',
      cache: 'no-store',
    });

    if (!response.ok) {
      return { status: 'token_expired', grantedScopes: [], missingScopes: [...requiredScopes] };
    }

    const payload = await response.json() as { scope?: string };
    const grantedScopes = parseGoogleScopes(payload.scope);
    const missingScopes = requiredScopes.filter((scope) => !grantedScopes.includes(scope));
    return {
      status: missingScopes.length > 0 ? 'missing_scopes' : 'authorized',
      grantedScopes,
      missingScopes,
    };
  } catch {
    return { status: 'network_error', grantedScopes: [], missingScopes: [...requiredScopes] };
  }
};
