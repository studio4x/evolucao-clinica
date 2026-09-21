const OPTIONAL_RESOURCE_PATTERNS = [
  /relation .* does not exist/i,
  /could not find the table/i,
  /schema cache/i,
  /pgrst205/i,
  /42p01/i
];

export function isOptionalSupabaseResourceMissing(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as Record<string, unknown>;
  const values = [candidate.code, candidate.message, candidate.details, candidate.hint]
    .filter((value) => value !== undefined && value !== null)
    .map((value) => String(value));
  return OPTIONAL_RESOURCE_PATTERNS.some((pattern) => values.some((value) => pattern.test(value)));
}

export function sanitizeSupabaseError(error: unknown) {
  const candidate = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const code = String(candidate.code || "unknown").replace(/[^a-zA-Z0-9_.-]/g, "").slice(0, 32);
  const message = String(candidate.message || error || "unknown error")
    .replace(/bearer\s+[a-z0-9._-]+/ig, "bearer [redacted]")
    .replace(/([\w.+-]+@[\w.-]+\.[a-z]{2,})/ig, "[redacted-email]")
    .replace(/\s+/g, " ")
    .slice(0, 240);
  return { code, message };
}

export function logAdminSupabaseFailure(endpoint: string, stage: string, error: unknown) {
  const safe = sanitizeSupabaseError(error);
  console.error("[AdminSupabase]", { endpoint, stage, errorCode: safe.code, errorMessage: safe.message });
}