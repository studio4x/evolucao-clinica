export const GOOGLE_ACCESS_TOKEN_REFRESH_AFTER_MS = 45 * 60 * 1000;

export const isGoogleAccessTokenFresh = (
  token: string | null | undefined,
  issuedAt: number | null | undefined,
  now = Date.now()
) => {
  if (!token || !issuedAt) return false;
  const age = Math.max(0, now - issuedAt);
  return age < GOOGLE_ACCESS_TOKEN_REFRESH_AFTER_MS;
};
