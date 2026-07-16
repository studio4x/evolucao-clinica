export const LIFECYCLE_TIMEZONE = "America/Sao_Paulo";
export const LIFECYCLE_COOLDOWN_HOURS = 24;
export const LIFECYCLE_COMPLETION_WINDOW_DAYS = 25;
export const LIFECYCLE_DEFAULT_BATCH_SIZE = 25;
export const LIFECYCLE_MAX_ATTEMPTS = 3;
export const LIFECYCLE_RETRY_DELAYS_MINUTES = [0, 15, 120] as const;

export const LIFECYCLE_PRIORITY = {
  transactional: 100,
  technical: 95,
  trial: 90,
  activation: 85,
  reactivation: 70,
  sequence: 50,
  advanced: 40,
  promotion: 30
} as const;

export type LifecycleRuntimeConfig = {
  send_enabled: boolean;
  dry_run: boolean;
  max_batch_size: number;
};

export const DEFAULT_RUNTIME_CONFIG: LifecycleRuntimeConfig = {
  send_enabled: false,
  dry_run: true,
  max_batch_size: LIFECYCLE_DEFAULT_BATCH_SIZE
};
