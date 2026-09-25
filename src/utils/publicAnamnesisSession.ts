export const PUBLIC_ANAMNESIS_SESSION_KEY = 'evolucao-clinica-anamnesis-public-session';

export type PublicAnamnesisLoadPlan =
  | { mode: 'bootstrap'; token: string }
  | { mode: 'resume'; session: string }
  | { mode: 'unavailable' };

export function resolvePublicAnamnesisLoadPlan(token: unknown, session: unknown): PublicAnamnesisLoadPlan {
  const normalizedToken = typeof token === 'string' ? token.trim() : '';
  if (normalizedToken) return { mode: 'bootstrap', token: normalizedToken };

  const normalizedSession = typeof session === 'string' ? session.trim() : '';
  if (normalizedSession) return { mode: 'resume', session: normalizedSession };

  return { mode: 'unavailable' };
}

export function isPublicAnamnesisSubmittedStatus(value: unknown): boolean {
  return value === 'submitted' || value === 'responded' || value === 'incorporated';
}
