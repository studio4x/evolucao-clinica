import { supabase } from '../supabaseClient';

export type OnboardingStep = 'intro' | 'patient' | 'evolution' | 'agenda' | 'complete';

export interface OnboardingState {
  step: OnboardingStep;
  patientId?: string;
  patientName?: string;
  agendaSyncedAt?: string;
  startedAt?: string;
  updatedAt?: string;
  completedAt?: string;
}

const ONBOARDING_STORAGE_PREFIX = 'evolucao-clinica:onboarding';

const getStorageKey = (userId: string) => `${ONBOARDING_STORAGE_PREFIX}:${userId}`;

const safeParse = (value: string | null): OnboardingState | null => {
  if (!value) return null;

  try {
    return JSON.parse(value) as OnboardingState;
  } catch {
    return null;
  }
};

export const getOnboardingState = (userId?: string | null): OnboardingState | null => {
  if (!userId || typeof window === 'undefined') return null;
  return safeParse(window.localStorage.getItem(getStorageKey(userId)));
};

export const ensureOnboardingState = (userId?: string | null): OnboardingState | null => {
  if (!userId || typeof window === 'undefined') return null;

  const current = getOnboardingState(userId);
  if (current) return current;

  const initialState: OnboardingState = {
    step: 'intro',
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  window.localStorage.setItem(getStorageKey(userId), JSON.stringify(initialState));
  return initialState;
};

export const setOnboardingState = (
  userId: string,
  patch: Partial<OnboardingState>
): OnboardingState => {
  const current = ensureOnboardingState(userId) || { step: 'intro' };
  const nextState: OnboardingState = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString()
  };

  window.localStorage.setItem(getStorageKey(userId), JSON.stringify(nextState));
  return nextState;
};

export const isOnboardingComplete = (userId?: string | null): boolean => {
  const state = getOnboardingState(userId);
  return Boolean(state?.completedAt || state?.step === 'complete');
};

export const clearOnboardingState = (userId?: string | null) => {
  if (!userId || typeof window === 'undefined') return;
  window.localStorage.removeItem(getStorageKey(userId));
};

export const completeOnboarding = (userId: string): OnboardingState => {
  const nextState = setOnboardingState(userId, {
    step: 'complete',
    completedAt: new Date().toISOString()
  });

  // Atualiza assincronamente no banco de dados
  supabase
    .from('professionals')
    .update({ onboarding_completed: true })
    .eq('id', userId)
    .then(({ error }) => {
      if (error) {
        console.error('Erro ao marcar onboarding como completo no banco de dados:', error);
      }
    });

  return nextState;
};

export const getOnboardingDestination = (userId?: string | null): string => {
  const state = ensureOnboardingState(userId);

  if (!state) {
    return '/onboarding';
  }

  if (state.step === 'patient') {
    return '/painel/patients/new?onboarding=1';
  }

  if (state.step === 'evolution' && state.patientId) {
    return `/painel/patients/${state.patientId}/evolutions/new?onboarding=1`;
  }

  if (state.step === 'agenda') {
    return '/onboarding?step=agenda';
  }

  if (state.step === 'complete') {
    return '/painel/dashboard';
  }

  return '/onboarding';
};
