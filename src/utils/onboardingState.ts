export type OnboardingStep = 'intro' | 'patient' | 'evolution' | 'agenda' | 'complete';
export type OnboardingStatus = 'not_started' | 'in_progress' | 'deferred' | 'completed';
export type OnboardingMode = 'guided' | 'explore';

export interface OnboardingState {
  step: OnboardingStep;
  status: OnboardingStatus;
  mode?: OnboardingMode;
  patientId?: string;
  patientName?: string;
  agendaSyncedAt?: string;
  startedAt?: string;
  choiceAt?: string;
  deferredAt?: string;
  updatedAt?: string;
  completedAt?: string;
}

export type RemoteOnboardingProfile = {
  onboarding_completed?: boolean | null;
  onboarding_status?: string | null;
  onboarding_mode?: string | null;
  onboarding_current_step?: string | null;
  onboarding_choice_at?: string | null;
  onboarding_deferred_at?: string | null;
};

const ONBOARDING_STEPS: readonly OnboardingStep[] = ['intro', 'patient', 'evolution', 'agenda', 'complete'];
const ONBOARDING_STATUSES: readonly OnboardingStatus[] = ['not_started', 'in_progress', 'deferred', 'completed'];
const ONBOARDING_MODES: readonly OnboardingMode[] = ['guided', 'explore'];

export const isOnboardingStep = (value: unknown): value is OnboardingStep => (
  typeof value === 'string' && ONBOARDING_STEPS.includes(value as OnboardingStep)
);

export const isOnboardingStatus = (value: unknown): value is OnboardingStatus => (
  typeof value === 'string' && ONBOARDING_STATUSES.includes(value as OnboardingStatus)
);

export const isOnboardingMode = (value: unknown): value is OnboardingMode => (
  typeof value === 'string' && ONBOARDING_MODES.includes(value as OnboardingMode)
);

export const normalizeOnboardingState = (value: Partial<OnboardingState> | null | undefined): OnboardingState => {
  const step = isOnboardingStep(value?.step) ? value.step : 'intro';
  const inferredStatus: OnboardingStatus = step === 'complete'
    ? 'completed'
    : 'not_started';
  const status = isOnboardingStatus(value?.status) ? value.status : inferredStatus;
  const mode = isOnboardingMode(value?.mode) ? value.mode : undefined;

  return {
    ...value,
    step: status === 'completed' ? 'complete' : step,
    status,
    mode,
  };
};

export const hydrateOnboardingState = (
  localState: Partial<OnboardingState> | null | undefined,
  profile: RemoteOnboardingProfile
): OnboardingState => {
  const local = normalizeOnboardingState(localState);

  if (profile.onboarding_completed === true || profile.onboarding_status === 'completed') {
    return {
      ...local,
      step: 'complete',
      status: 'completed',
      mode: isOnboardingMode(profile.onboarding_mode) ? profile.onboarding_mode : local.mode || 'guided',
    };
  }

  const remoteStatus = isOnboardingStatus(profile.onboarding_status)
    ? profile.onboarding_status
    : null;

  // Preserva progresso local legado quando a migração ainda conhece o usuário
  // apenas como "não iniciado".
  if (
    (!remoteStatus || remoteStatus === 'not_started')
    && (local.status !== 'not_started' || local.step !== 'intro' || Boolean(local.patientId))
  ) {
    return local;
  }

  const remoteStep = isOnboardingStep(profile.onboarding_current_step)
    ? profile.onboarding_current_step
    : local.step;

  return normalizeOnboardingState({
    ...local,
    status: remoteStatus || local.status,
    step: remoteStep,
    mode: isOnboardingMode(profile.onboarding_mode) ? profile.onboarding_mode : local.mode,
    choiceAt: profile.onboarding_choice_at || local.choiceAt,
    deferredAt: profile.onboarding_deferred_at || local.deferredAt,
  });
};

export const canAccessApplicationDuringOnboarding = (state: OnboardingState | null | undefined): boolean => {
  const normalized = normalizeOnboardingState(state);
  return normalized.status === 'deferred' || normalized.status === 'completed';
};

export const isOnboardingChoiceRequired = (state: OnboardingState | null | undefined): boolean => {
  const normalized = normalizeOnboardingState(state);
  return normalized.status === 'not_started' && !normalized.mode;
};

export const getOnboardingDestinationForState = (state: OnboardingState): string => {
  if (state.status === 'deferred' || state.status === 'completed' || state.step === 'complete') {
    return '/painel/dashboard';
  }

  if (state.step === 'patient') {
    return state.patientId
      ? `/painel/patients/${state.patientId}/edit?onboarding=1`
      : '/painel/patients/new?onboarding=1';
  }

  if (state.step === 'evolution' && state.patientId) {
    return `/painel/patients/${state.patientId}/evolutions/new?onboarding=1`;
  }

  if (state.step === 'agenda') {
    return '/onboarding?step=agenda';
  }

  return '/onboarding';
};

export const classifyOnboardingError = (error: unknown, fallback = 'unknown'): string => {
  const message = error instanceof Error ? error.message : String(error || '');
  const normalized = message.toLowerCase();

  if (normalized.includes('insufficient_scopes')) return 'google_insufficient_scopes';
  if (normalized.includes('unauthenticated') || normalized.includes('invalid credentials') || normalized.includes('401')) return 'google_unauthenticated';
  if (normalized.includes('429') || normalized.includes('rate') || normalized.includes('quota')) return 'provider_rate_limited';
  if (normalized.includes('403') || normalized.includes('forbidden')) return 'google_forbidden';
  if (normalized.includes('404') || normalized.includes('file not found')) return 'google_resource_not_found';
  if (normalized.includes('network') || normalized.includes('failed to fetch') || normalized.includes('offline')) return 'network_unavailable';
  return fallback;
};
