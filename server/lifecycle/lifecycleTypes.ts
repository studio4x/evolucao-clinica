export const LIFECYCLE_EVENT_NAMES = [
  "user_registered", "user_activated", "user_logged_in", "profile_updated", "profession_selected",
  "onboarding_started", "onboarding_completed", "patient_created", "patient_record_linked",
  "evolution_started", "evolution_completed", "evolution_failed", "audio_evolution_completed",
  "patient_history_viewed", "report_generated", "migration_requested", "migration_completed",
  "backup_configured", "custom_logo_added", "digital_signature_used", "feature_discovered",
  "document_area_viewed", "subscription_page_viewed", "support_opened", "trial_started",
  "trial_expiring", "trial_expired", "subscription_started", "subscription_renewed",
  "subscription_status_changed", "subscription_cancel_requested", "subscription_cancelled",
  "account_inactive", "account_reactivated", "account_deleted", "email_unsubscribed"
] as const;

export type LifecycleEventName = typeof LIFECYCLE_EVENT_NAMES[number];
export type LifecycleEventSource = "database_trigger" | "backend" | "frontend" | "webhook" | "admin";

export type LifecycleState = {
  userId: string;
  fullName: string;
  email: string;
  profession: string;
  professionSegment: string;
  activationLevel: number;
  activationStatus: string;
  firstLoginAt: string | null;
  lastLoginAt: string | null;
  lastActivityAt: string | null;
  usageDaysCount: number;
  patientsCount: number;
  linkedRecordsCount: number;
  evolutionsCount: number;
  processingEvolutionsCount: number;
  failedEvolutionsCount: number;
  audioEvolutionsCount: number;
  reportsCount: number;
  migrationsCount: number;
  resourcesCount: number;
  onboardingCompletedAt: string | null;
  subscriptionPlan: string | null;
  subscriptionStatus: string | null;
  trialEndsAt: string | null;
  subscriptionStartedAt: string | null;
  subscriptionCancelledAt: string | null;
  lastRelationshipEmailAt: string | null;
  nextRelationshipEmailEligibleAt: string | null;
  firstEvolutionCompletedAt: string | null;
  latestEvolutionAt: string | null;
  firstPatientAt: string | null;
  firstRecordLinkedAt: string | null;
  distinctActivityDays: string[];
};

export type LifecycleRule = {
  id: string;
  rule_key: string;
  name: string;
  description?: string | null;
  trigger_event?: string | null;
  rule_type: "event" | "inactivity" | "deadline" | "state";
  priority: number;
  cooldown_hours: number;
  delay_minutes: number;
  condition_config?: Record<string, unknown> | null;
  message_config?: Record<string, unknown> | null;
  enabled: boolean;
};

export type LifecycleStep = {
  id: string;
  campaign_id: string;
  step_key: string;
  eligibility_rule_key?: string | null;
  skip_rule_key?: string | null;
  position: number;
  wait_minutes: number;
  send_time?: string | null;
  category: string;
  priority: number;
  status: "draft" | "active" | "paused" | "archived";
  subject_template: string;
  preheader_template?: string | null;
  body_markdown: string;
  cta_label_template?: string | null;
  cta_route_template?: string | null;
  fallback_cta_route?: string | null;
  enabled: boolean;
};

export type LifecycleCampaign = {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  campaign_type: "sequence" | "conditional" | "reactivation" | "customer";
  status: "draft" | "active" | "paused" | "archived";
  enrollment_mode: "new_users_only" | "selected_users" | "all_eligible_users";
  eligible_from: string;
  timezone: string;
  default_send_time: string;
  max_messages_per_24h: number;
  completion_window_days: number;
};

export type LifecycleCandidate = {
  messageKey: string;
  priority: number;
  dispatchType: "sequence" | "conditional" | "transactional_bridge";
  category: string;
  commercial: boolean;
  rule?: LifecycleRule;
  step?: LifecycleStep;
  subjectTemplate: string;
  preheaderTemplate: string;
  bodyTemplate: string;
  ctaLabelTemplate: string;
  ctaRouteTemplate: string;
  dedupePeriodKey: string;
  reason: string;
};

export type LifecycleDecision = {
  candidate: LifecycleCandidate | null;
  outcome: "scheduled" | "deferred" | "skipped" | "suppressed" | "dry_run" | "completed";
  reason: string;
};

export type LifecycleEmailInput = {
  userId: string;
  recipientEmail: string;
  recipientName: string;
  subject: string;
  preheader: string;
  textContent: string;
  ctaLabel: string;
  ctaUrl: string;
  category: string;
  commercial: boolean;
};

export type LifecycleDependencies = {
  supabaseAdmin: any;
  productionOrigin: string;
  cronSecret?: string;
  getNotificationSettings: () => Promise<any>;
  getEmailTheme: () => Promise<any>;
  buildEmailShell: (theme: any, options: any) => string;
  buildEmailButton: (theme: any, href: string, label: string) => string;
  sendTransactionalEmail: (settings: any, input: any) => Promise<{ provider: "smtp" | "brevo"; messageId: string | null; emailDeliveryId: string | null }>;
  getAdminRecipients?: () => Promise<Array<{ id?: string; full_name?: string | null; google_email?: string | null }>>;
  sendPushNotification?: (userId: string, title: string, content: string, link?: string, imageUrl?: string) => Promise<boolean>;
  sendWhatsAppNotification?: (userId: string, phone: string, text: string) => Promise<boolean>;
};
