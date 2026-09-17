export type AudioSubscriptionPlan = 'trial' | 'monthly' | 'yearly' | 'courtesy' | 'none' | null | undefined;

export const AUDIO_LIMITS = {
  conservative: {
    maxDurationSeconds: 20 * 60,
    maxFileBytes: 20 * 1024 * 1024,
  },
  yearly: {
    maxDurationSeconds: 50 * 60,
    maxFileBytes: 60 * 1024 * 1024,
  },
} as const;

// Base64 expande os bytes em aproximadamente um terço. O limite de 14 MiB
// deixa espaço para prompt e JSON dentro do limite específico de áudio do Gemini.
export const INLINE_AUDIO_MAX_RAW_BYTES = 14 * 1024 * 1024;

export type AudioLimitPolicy = typeof AUDIO_LIMITS.conservative | typeof AUDIO_LIMITS.yearly;

export const getAudioLimitPolicy = (plan: AudioSubscriptionPlan): AudioLimitPolicy => {
  return plan === 'yearly' ? AUDIO_LIMITS.yearly : AUDIO_LIMITS.conservative;
};

export const isAudioDurationAllowed = (currentSeconds: number, additionalSeconds: number, policy: AudioLimitPolicy) =>
  currentSeconds + additionalSeconds <= policy.maxDurationSeconds;

export const isAudioFileSizeAllowed = (bytes: number, policy: AudioLimitPolicy) => bytes <= policy.maxFileBytes;
