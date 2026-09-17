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

// Base64 expands the bytes by roughly one third. Keeping inline requests at
// 14 MiB leaves room for the prompt and JSON under Gemini's audio request cap.
export const INLINE_AUDIO_MAX_RAW_BYTES = 14 * 1024 * 1024;

export type AudioLimitPolicy = typeof AUDIO_LIMITS.conservative | typeof AUDIO_LIMITS.yearly;

export const getAudioLimitPolicy = (plan: AudioSubscriptionPlan): AudioLimitPolicy => {
  return plan === 'yearly' ? AUDIO_LIMITS.yearly : AUDIO_LIMITS.conservative;
};

export const getAudioLimitLabel = (policy: AudioLimitPolicy) => Math.round(policy.maxDurationSeconds / 60);

export const isAudioDurationAllowed = (currentSeconds: number, additionalSeconds: number, policy: AudioLimitPolicy) =>
  currentSeconds + additionalSeconds <= policy.maxDurationSeconds;

export const isAudioFileSizeAllowed = (bytes: number, policy: AudioLimitPolicy) => bytes <= policy.maxFileBytes;
