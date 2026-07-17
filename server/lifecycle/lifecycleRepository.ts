import { createHash, randomBytes } from "node:crypto";
import { DEFAULT_RUNTIME_CONFIG, LIFECYCLE_COMPLETION_WINDOW_DAYS, LIFECYCLE_TIMEZONE, type LifecycleRuntimeConfig } from "./lifecycleConstants.js";
import { LIFECYCLE_EVENT_NAMES, type LifecycleDependencies, type LifecycleEventName, type LifecycleEventSource, type LifecycleState } from "./lifecycleTypes.js";

const LIFECYCLE_FAILURE_ALERT_STATE_ID = "lifecycle_failure_alert_state";

export type LifecycleFailureAlertState = {
  consecutive_failures: number;
  last_failure_at: string | null;
  last_failure_reason: string | null;
  last_failure_dispatch_id: string | null;
  last_alert_attempt_at: string | null;
  last_alert_sent_at: string | null;
};

const DEFAULT_FAILURE_ALERT_STATE: LifecycleFailureAlertState = {
  consecutive_failures: 0,
  last_failure_at: null,
  last_failure_reason: null,
  last_failure_dispatch_id: null,
  last_alert_attempt_at: null,
  last_alert_sent_at: null
};

export async function getLifecycleFailureAlertState(deps: LifecycleDependencies): Promise<LifecycleFailureAlertState> {
  const { data, error } = await deps.supabaseAdmin
    .from("settings")
    .select("api_key")
    .eq("id", LIFECYCLE_FAILURE_ALERT_STATE_ID)
    .maybeSingle();

  if (error || !data?.api_key) {
    if (error) console.warn("[Lifecycle Alert] Não foi possível ler o estado de falhas:", error.message || error);
    return { ...DEFAULT_FAILURE_ALERT_STATE };
  }

  try {
    const parsed = JSON.parse(data.api_key);
    return {
      consecutive_failures: Math.max(0, Number(parsed.consecutive_failures) || 0),
      last_failure_at: parsed.last_failure_at || null,
      last_failure_reason: parsed.last_failure_reason || null,
      last_failure_dispatch_id: parsed.last_failure_dispatch_id || null,
      last_alert_attempt_at: parsed.last_alert_attempt_at || null,
      last_alert_sent_at: parsed.last_alert_sent_at || null
    };
  } catch {
    console.warn("[Lifecycle Alert] Estado de falhas inválido; usando estado inicial.");
    return { ...DEFAULT_FAILURE_ALERT_STATE };
  }
}

export async function saveLifecycleFailureAlertState(deps: LifecycleDependencies, state: LifecycleFailureAlertState) {
  const { error } = await deps.supabaseAdmin
    .from("settings")
    .upsert({
      id: LIFECYCLE_FAILURE_ALERT_STATE_ID,
      api_key: JSON.stringify(state),
      updated_at: new Date().toISOString(),
      updated_by: "lifecycle-worker"
    }, { onConflict: "id" });

  if (error) throw new Error(error.message || "Falha ao persistir o estado de alertas lifecycle.");
}

export function sanitizeLifecycleMetadata(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const allowedKeys = new Set(["status", "source", "feature", "duration_seconds", "count", "result", "route", "days", "has_google_doc"]);
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!allowedKeys.has(key)) continue;
    if (["string", "number", "boolean"].includes(typeof value)) output[key] = value;
  }
  return output;
}

export async function getLifecycleRuntimeConfig(deps: LifecycleDependencies): Promise<LifecycleRuntimeConfig> {
  const fallback: LifecycleRuntimeConfig = {
    ...DEFAULT_RUNTIME_CONFIG,
    send_enabled: process.env.LIFECYCLE_SEND_ENABLED === "true",
    dry_run: process.env.LIFECYCLE_DRY_RUN !== "false"
  };
  const { data, error } = await deps.supabaseAdmin.from("settings").select("api_key").eq("id", "lifecycle_config").maybeSingle();
  if (error || !data?.api_key) return fallback;
  try {
    const parsed = JSON.parse(data.api_key);
    return {
      send_enabled: parsed.send_enabled === true,
      dry_run: parsed.dry_run !== false,
      max_batch_size: Math.min(Math.max(Number(parsed.max_batch_size) || fallback.max_batch_size, 1), 100)
    };
  } catch {
    return fallback;
  }
}

export async function recordLifecycleEvent(
  deps: LifecycleDependencies,
  input: {
    userId: string;
    eventName: LifecycleEventName;
    source: LifecycleEventSource;
    entityType?: string;
    entityId?: string | null;
    metadata?: Record<string, unknown>;
    idempotencyKey?: string | null;
    occurredAt?: string;
  }
): Promise<string | null> {
  if (!LIFECYCLE_EVENT_NAMES.includes(input.eventName)) throw new Error("Evento lifecycle não permitido.");
  const row = {
    user_id: input.userId,
    event_name: input.eventName,
    source: input.source,
    entity_type: input.entityType || null,
    entity_id: input.entityId || null,
    occurred_at: input.occurredAt || new Date().toISOString(),
    idempotency_key: input.idempotencyKey || null,
    metadata: sanitizeLifecycleMetadata(input.metadata)
  };
  const { data, error } = await deps.supabaseAdmin.from("lifecycle_events").insert(row).select("id").maybeSingle();
  if (!error && data?.id) return data.id;
  if (error?.code === "23505" && row.idempotency_key) {
    const { data: existing } = await deps.supabaseAdmin.from("lifecycle_events").select("id").eq("idempotency_key", row.idempotency_key).maybeSingle();
    return existing?.id || null;
  }
  if (error) throw new Error(error.message || "Falha ao registrar evento lifecycle.");
  return null;
}

export async function getLifecyclePreferences(deps: LifecycleDependencies, userId: string) {
  const { data, error } = await deps.supabaseAdmin.from("communication_preferences").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(error.message || "Falha ao consultar preferências de comunicação.");
  if (data) return data;
  const { data: created, error: createError } = await deps.supabaseAdmin.from("communication_preferences").insert({ user_id: userId }).select("*").single();
  if (createError) throw new Error(createError.message || "Falha ao criar preferências de comunicação.");
  return created;
}

export async function updateLifecyclePreferences(deps: LifecycleDependencies, userId: string, values: Record<string, unknown>) {
  const allowed = ["product_education_enabled", "lifecycle_enabled", "commercial_enabled", "preferred_send_time", "timezone", "email_enabled", "push_enabled", "whatsapp_enabled", "whatsapp_number"];
  const update: Record<string, unknown> = {};
  for (const key of allowed) if (key in values) update[key] = values[key];
  if (update.timezone && typeof update.timezone !== "string") throw new Error("Fuso horário inválido.");
  if (typeof update.timezone === "string") {
    try { new Intl.DateTimeFormat("en-US", { timeZone: update.timezone }).format(); }
    catch { throw new Error("Fuso horário inválido."); }
  }
  if (update.preferred_send_time && !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(String(update.preferred_send_time))) throw new Error("Horário preferido inválido.");
  const { data, error } = await deps.supabaseAdmin.from("communication_preferences").upsert({ user_id: userId, ...update }, { onConflict: "user_id" }).select("*").single();
  if (error) throw new Error(error.message || "Falha ao atualizar preferências.");
  return data;
}

export async function getLifecycleState(deps: LifecycleDependencies, userId: string): Promise<LifecycleState | null> {
  const { data, error } = await deps.supabaseAdmin.from("lifecycle_user_state").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(error.message || "Falha ao consultar estado lifecycle.");
  if (!data) return null;
  return mapState(data);
}

export function mapState(row: any): LifecycleState {
  return {
    userId: row.user_id,
    fullName: row.full_name || "Profissional",
    email: row.email || "",
    profession: row.profession || "",
    professionSegment: row.profession_segment || "other",
    activationLevel: Number(row.activation_level || 0),
    activationStatus: row.activation_status || "registered",
    firstLoginAt: row.first_login_at || null,
    lastLoginAt: row.last_login_at || null,
    lastActivityAt: row.last_activity_at || null,
    usageDaysCount: Number(row.usage_days_count || 0),
    patientsCount: Number(row.patients_count || 0),
    linkedRecordsCount: Number(row.linked_records_count || 0),
    evolutionsCount: Number(row.evolutions_count || 0),
    processingEvolutionsCount: Number(row.processing_evolutions_count || 0),
    failedEvolutionsCount: Number(row.failed_evolutions_count || 0),
    audioEvolutionsCount: Number(row.audio_evolutions_count || 0),
    reportsCount: Number(row.reports_count || 0),
    migrationsCount: Number(row.migrations_count || 0),
    resourcesCount: Number(row.resources_count || 0),
    onboardingCompletedAt: row.onboarding_completed_at || null,
    subscriptionPlan: row.subscription_plan || null,
    subscriptionStatus: row.subscription_status || null,
    trialEndsAt: row.trial_ends_at || null,
    subscriptionStartedAt: row.subscription_started_at || null,
    subscriptionCancelledAt: row.subscription_cancelled_at || null,
    lastRelationshipEmailAt: row.last_relationship_email_at || null,
    nextRelationshipEmailEligibleAt: row.next_relationship_email_eligible_at || null,
    firstEvolutionCompletedAt: row.first_evolution_completed_at || null,
    latestEvolutionAt: row.latest_evolution_at || null,
    firstPatientAt: row.first_patient_at || null,
    firstRecordLinkedAt: row.first_record_linked_at || null,
    distinctActivityDays: Array.isArray(row.distinct_activity_days) ? row.distinct_activity_days : []
  };
}

export async function ensureCommunicationToken(deps: LifecycleDependencies, userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const { error } = await deps.supabaseAdmin.from("communication_preferences").upsert({
    user_id: userId,
    unsubscribe_token_hash: tokenHash,
    token_created_at: new Date().toISOString()
  }, { onConflict: "user_id" });
  if (error) throw new Error(error.message || "Falha ao criar token de comunicação.");
  return token;
}

export function hashCommunicationToken(token: string): string {
  return createHash("sha256").update(String(token || "")).digest("hex");
}

export async function suppressLifecycleDispatches(deps: LifecycleDependencies, userId: string, reason: string) {
  await deps.supabaseAdmin.from("lifecycle_dispatches").update({ status: "suppressed", skip_reason: reason, skipped_at: new Date().toISOString() }).eq("user_id", userId).in("status", ["queued", "retry", "processing"]);
}

export async function findCampaign(deps: LifecycleDependencies, key: string) {
  const { data, error } = await deps.supabaseAdmin.from("lifecycle_campaigns").select("*").eq("key", key).maybeSingle();
  if (error) throw new Error(error.message || "Falha ao consultar campanha lifecycle.");
  return data;
}

export async function ensureLifecycleEnrollment(deps: LifecycleDependencies, userId: string, options: { campaignKey?: string; force?: boolean } = {}) {
  const campaign = await findCampaign(deps, options.campaignKey || "new_user_activation_15d");
  if (!campaign || campaign.status !== "active" && !options.force) return null;
  const { data: professional, error: professionalError } = await deps.supabaseAdmin.from("professionals").select("id, status, role, created_at").eq("id", userId).maybeSingle();
  if (professionalError) throw new Error(professionalError.message);
  if (!professional || professional.status !== "active" || professional.role === "admin") return null;
  if (!options.force && campaign.enrollment_mode === "new_users_only" && new Date(professional.created_at).getTime() < new Date(campaign.eligible_from).getTime()) return null;
  const preferences = await getLifecyclePreferences(deps, userId);
  if (!options.force && preferences.lifecycle_enabled !== true) return null;
  const enrolledAt = new Date().toISOString();
  const { data, error } = await deps.supabaseAdmin.from("lifecycle_enrollments").upsert({
    user_id: userId,
    campaign_id: campaign.id,
    status: "active",
    enrolled_at: enrolledAt,
    started_at: enrolledAt,
    next_step_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    completion_deadline_at: new Date(Date.now() + LIFECYCLE_COMPLETION_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()
  }, { onConflict: "user_id,campaign_id", ignoreDuplicates: true }).select("*").maybeSingle();
  if (error && error.code !== "23505") throw new Error(error.message || "Falha ao matricular usuário lifecycle.");
  if (data) return data;
  const { data: existing } = await deps.supabaseAdmin.from("lifecycle_enrollments").select("*").eq("user_id", userId).eq("campaign_id", campaign.id).maybeSingle();
  return existing;
}

export async function getUserProfile(deps: LifecycleDependencies, userId: string) {
  const { data, error } = await deps.supabaseAdmin.from("professionals").select("id, full_name, google_email, professional_title, status, role, subscription_plan, subscription_status, subscription_ends_at, trial_ends_at, onboarding_completed, created_at, updated_at").eq("id", userId).maybeSingle();
  if (error) throw new Error(error.message || "Falha ao consultar profissional.");
  return data;
}

export function formatTrialDate(value: string | null, timeZone = LIFECYCLE_TIMEZONE): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("pt-BR", { timeZone, day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
}
