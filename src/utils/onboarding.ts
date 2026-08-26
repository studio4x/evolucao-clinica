import { supabase } from '../supabaseClient';
import { trackLifecycleEvent } from '../services/lifecycleTelemetry';
import {
  canAccessApplicationDuringOnboarding,
  getOnboardingDestinationForState,
  hydrateOnboardingState,
  normalizeOnboardingState,
  type OnboardingMode,
  type OnboardingState,
  type RemoteOnboardingProfile,
} from './onboardingState';

export type { OnboardingMode, OnboardingState, OnboardingStatus, OnboardingStep } from './onboardingState';

const ONBOARDING_STORAGE_PREFIX = 'evolucao-clinica:onboarding';

const getStorageKey = (userId: string) => `${ONBOARDING_STORAGE_PREFIX}:${userId}`;

const safeParse = (value: string | null): OnboardingState | null => {
  if (!value) return null;

  try {
    return normalizeOnboardingState(JSON.parse(value) as Partial<OnboardingState>);
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
    status: 'not_started',
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
  const current = ensureOnboardingState(userId) || normalizeOnboardingState(null);
  const stepChanged = Boolean(patch.step && patch.step !== current.step);
  const inferredStatus = patch.status || (
    patch.step === 'complete'
      ? 'completed'
      : stepChanged && patch.step !== 'intro'
        ? 'in_progress'
        : current.status
  );
  const nextState: OnboardingState = {
    ...current,
    ...patch,
    status: inferredStatus,
    updatedAt: new Date().toISOString()
  };

  window.localStorage.setItem(getStorageKey(userId), JSON.stringify(nextState));

  const databasePatch = {
    onboarding_status: nextState.status,
    onboarding_mode: nextState.mode || null,
    onboarding_current_step: nextState.step,
    onboarding_choice_at: nextState.choiceAt || null,
    onboarding_deferred_at: nextState.deferredAt || null,
  };

  void supabase
    .from('professionals')
    .update(databasePatch)
    .eq('id', userId)
    .then(({ error }) => {
      if (error) console.warn('[Onboarding] Não foi possível persistir a etapa atual:', error.message);
    });

  if (stepChanged) {
    void trackLifecycleEvent('onboarding_step_viewed', {
      metadata: { step: nextState.step, mode: nextState.mode || 'guided' },
      dedupeKey: `onboarding_step_viewed:${userId}:${nextState.step}`,
    });
  }

  return nextState;
};

export const isOnboardingComplete = (userId?: string | null): boolean => {
  const state = getOnboardingState(userId);
  return Boolean(state?.completedAt || state?.step === 'complete' || state?.status === 'completed');
};

export const canAccessApplication = (userId?: string | null): boolean => (
  canAccessApplicationDuringOnboarding(getOnboardingState(userId))
);

export const clearOnboardingState = (userId?: string | null) => {
  if (!userId || typeof window === 'undefined') return;
  window.localStorage.removeItem(getStorageKey(userId));
};

export const completeOnboarding = (userId: string): OnboardingState => {
  const nextState = setOnboardingState(userId, {
    step: 'complete',
    status: 'completed',
    completedAt: new Date().toISOString()
  });

  // Atualiza assincronamente no banco de dados
  supabase
    .from('professionals')
    .update({
      onboarding_completed: true,
      onboarding_status: 'completed',
      onboarding_current_step: 'complete',
    })
    .eq('id', userId)
    .then(({ error }) => {
      if (error) {
        console.error('Erro ao marcar onboarding como completo no banco de dados:', error);
      }
    });

  return nextState;
};

export const hydrateOnboardingFromProfile = (
  userId: string,
  profile: RemoteOnboardingProfile
): OnboardingState => {
  const current = getOnboardingState(userId);
  const hydrated = hydrateOnboardingState(current, profile);
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(getStorageKey(userId), JSON.stringify(hydrated));
  }

  if (
    profile.onboarding_completed !== true
    && profile.onboarding_status === 'not_started'
    && hydrated.status !== 'not_started'
  ) {
    void supabase.from('professionals').update({
      onboarding_status: hydrated.status,
      onboarding_mode: hydrated.mode || null,
      onboarding_current_step: hydrated.step,
      onboarding_choice_at: hydrated.choiceAt || null,
      onboarding_deferred_at: hydrated.deferredAt || null,
    }).eq('id', userId);
  }

  return hydrated;
};

export const chooseOnboardingMode = async (
  userId: string,
  mode: OnboardingMode
): Promise<OnboardingState> => {
  const now = new Date().toISOString();
  const currentStep = getOnboardingState(userId)?.step || 'intro';
  const nextStatus = mode === 'explore' ? 'deferred' : 'in_progress';
  const { data, error } = await supabase.from('professionals').update({
    onboarding_mode: mode,
    onboarding_status: nextStatus,
    onboarding_current_step: currentStep,
    onboarding_choice_at: now,
    onboarding_deferred_at: mode === 'explore' ? now : null,
  }).eq('id', userId).select('id').maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Não foi possível confirmar a escolha do onboarding.');

  const nextState = setOnboardingState(userId, {
    mode,
    status: nextStatus,
    step: currentStep,
    choiceAt: now,
    deferredAt: mode === 'explore' ? now : undefined,
  });

  await trackLifecycleEvent(mode === 'explore' ? 'onboarding_choice_explore' : 'onboarding_choice_guided', {
    metadata: { mode, step: currentStep },
    dedupeKey: `onboarding_choice:${userId}`,
  });
  return nextState;
};

export const deferOnboarding = async (
  userId: string,
  step?: OnboardingState['step']
): Promise<OnboardingState> => {
  const now = new Date().toISOString();
  const current = getOnboardingState(userId);
  const nextStep = step || current?.step || 'intro';
  const choiceAt = current?.choiceAt || now;
  const { data, error } = await supabase.from('professionals').update({
    onboarding_completed: false,
    onboarding_status: 'deferred',
    onboarding_mode: 'explore',
    onboarding_current_step: nextStep,
    onboarding_choice_at: choiceAt,
    onboarding_deferred_at: now,
  }).eq('id', userId).select('id').maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Não foi possível adiar o onboarding.');
  const nextState = setOnboardingState(userId, {
    status: 'deferred',
    mode: 'explore',
    step: nextStep,
    deferredAt: now,
    choiceAt,
  });
  return nextState;
};

export const resumeOnboarding = async (
  userId: string,
  patch: Pick<Partial<OnboardingState>, 'step' | 'patientId' | 'patientName'> = {}
): Promise<OnboardingState> => {
  const nextStep = patch.step || getOnboardingState(userId)?.step || 'intro';
  const { data, error } = await supabase.from('professionals').update({
    onboarding_status: 'in_progress',
    onboarding_mode: 'guided',
    onboarding_current_step: nextStep,
    onboarding_deferred_at: null,
  }).eq('id', userId).select('id').maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Não foi possível retomar o onboarding.');
  const nextState = setOnboardingState(userId, {
    ...patch,
    step: nextStep,
    status: 'in_progress',
    mode: 'guided',
    deferredAt: undefined,
  });
  await trackLifecycleEvent('onboarding_resumed', {
    metadata: { step: nextState.step, mode: 'guided' },
    dedupeKey: `onboarding_resumed:${userId}:${nextState.step}:${new Date().toISOString().slice(0, 10)}`,
  });
  return nextState;
};

export const getOnboardingDestination = (userId?: string | null): string => {
  const state = ensureOnboardingState(userId);

  if (!state) {
    return '/onboarding';
  }
  return getOnboardingDestinationForState(state);
};
