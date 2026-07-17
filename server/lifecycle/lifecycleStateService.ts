import { activationStatusForLevel, calculateActivationLevel, normalizeProfessionSegment } from "./lifecycleState.js";
import { mapState, getUserProfile } from "./lifecycleRepository.js";
import type { LifecycleDependencies, LifecycleState } from "./lifecycleTypes.js";

function latestDate(values: Array<string | null | undefined>): string | null {
  const valid = values.filter(Boolean).map((value) => String(value));
  if (!valid.length) return null;
  return valid.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] || null;
}

function dateKey(value: string, timeZone = "America/Sao_Paulo") {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

export async function recalculateLifecycleUserState(deps: LifecycleDependencies, userId: string): Promise<LifecycleState> {
  const profile = await getUserProfile(deps, userId);
  if (!profile) throw new Error("Profissional não encontrado.");

  const [patientsResult, evolutionsResult, reportsResult, migrationsResult, eventsResult, existingStateResult] = await Promise.all([
    deps.supabaseAdmin.from("patients").select("id, created_at, updated_at, google_doc_id").eq("professional_id", userId),
    deps.supabaseAdmin.from("evolutions").select("id, created_at, updated_at, transcription_status, google_doc_append_status, audio_duration_seconds").eq("professional_id", userId),
    deps.supabaseAdmin.from("patient_reports").select("id, created_at").eq("professional_id", userId),
    deps.supabaseAdmin.from("migration_requests").select("id, created_at, updated_at, status").eq("user_id", userId),
    deps.supabaseAdmin.from("lifecycle_events").select("event_name, occurred_at, metadata").eq("user_id", userId).order("occurred_at", { ascending: true }).limit(1000),
    deps.supabaseAdmin.from("lifecycle_user_state").select("last_relationship_email_at, next_relationship_email_eligible_at").eq("user_id", userId).maybeSingle()
  ]);
  for (const result of [patientsResult, evolutionsResult, reportsResult, migrationsResult, eventsResult, existingStateResult]) {
    if (result.error) throw new Error(result.error.message || "Falha ao recalcular estado lifecycle.");
  }

  const patients = patientsResult.data || [];
  const evolutions = evolutionsResult.data || [];
  const completedEvolutions = evolutions.filter((e: any) => e.transcription_status === "completed" && e.google_doc_append_status === "completed");
  const processingEvolutions = evolutions.filter((e: any) => 
    (e.transcription_status === "processing" || e.google_doc_append_status === "pending") &&
    e.created_at && (Date.now() - new Date(e.created_at).getTime()) > 30 * 60 * 1000
  );
  const failedEvolutions = evolutions.filter((e: any) => e.transcription_status === "failed" || e.google_doc_append_status === "failed");
  const linkedRecordsCount = patients.filter((p: any) => Boolean(String(p.google_doc_id || "").trim())).length;
  const events = eventsResult.data || [];
  const loginEvents = events.filter((e: any) => e.event_name === "user_logged_in");
  const completedEvents = events.filter((e: any) => e.event_name === "evolution_completed");
  const subscriptionEvent = [...events].reverse().find((e: any) => e.event_name === "subscription_started");
  const cancelledEvent = [...events].reverse().find((e: any) => e.event_name === "subscription_cancelled");
  const resourceEvents = new Set(events.filter((e: any) => ["report_generated", "migration_completed", "backup_configured", "custom_logo_added", "digital_signature_used", "feature_discovered"].includes(e.event_name)).map((e: any) => e.event_name));

  const activityDates = new Set<string>();
  for (const event of events) activityDates.add(dateKey(event.occurred_at));
  for (const row of [...patients, ...evolutions, ...(reportsResult.data || [])]) {
    if (row.created_at) activityDates.add(dateKey(row.created_at));
  }
  const latestActivity = latestDate([
    profile.updated_at,
    ...events.map((e: any) => e.occurred_at),
    ...patients.map((p: any) => p.updated_at || p.created_at),
    ...evolutions.map((e: any) => e.updated_at || e.created_at)
  ]);
  const firstLoginAt = loginEvents[0]?.occurred_at || null;
  const lastLoginAt = loginEvents.at(-1)?.occurred_at || null;
  const firstPatientAt = patients.map((p: any) => p.created_at).filter(Boolean).sort()[0] || null;
  const latestPatientAt = latestDate(patients.map((p: any) => p.created_at));
  const firstRecordLinkedAt = events.find((e: any) => e.event_name === "patient_record_linked")?.occurred_at || null;
  const firstEvolutionCompletedAt = completedEvents[0]?.occurred_at || null;
  const latestEvolutionAt = latestDate(completedEvents.map((e: any) => e.occurred_at));
  const level = calculateActivationLevel({
    loggedIn: Boolean(lastLoginAt),
    patientsCount: patients.length,
    linkedRecordsCount,
    evolutionsCount: completedEvolutions.length,
    usageDaysCount: activityDates.size,
    resourcesCount: resourceEvents.size
  });

  const stateRow = {
    user_id: userId,
    activation_level: level,
    activation_status: activationStatusForLevel(level, profile.subscription_status),
    first_login_at: firstLoginAt,
    last_login_at: lastLoginAt,
    last_activity_at: latestActivity,
    usage_days_count: activityDates.size,
    patients_count: patients.length,
    first_patient_at: firstPatientAt,
    latest_patient_at: latestPatientAt,
    linked_records_count: linkedRecordsCount,
    first_record_linked_at: firstRecordLinkedAt,
    evolutions_count: completedEvolutions.length,
    processing_evolutions_count: processingEvolutions.length,
    failed_evolutions_count: failedEvolutions.length,
    first_evolution_completed_at: firstEvolutionCompletedAt,
    latest_evolution_at: latestEvolutionAt,
    audio_evolutions_count: completedEvolutions.filter((e: any) => Number(e.audio_duration_seconds || 0) > 0).length,
    reports_count: (reportsResult.data || []).length,
    migrations_count: (migrationsResult.data || []).filter((m: any) => m.status !== "cancelled").length,
    resources_count: resourceEvents.size,
    onboarding_completed_at: events.find((e: any) => e.event_name === "onboarding_completed")?.occurred_at || (profile.onboarding_completed ? profile.updated_at : null),
    subscription_plan: profile.subscription_plan || null,
    subscription_status: profile.subscription_status || null,
    trial_ends_at: profile.trial_ends_at || null,
    subscription_started_at: subscriptionEvent?.occurred_at || null,
    subscription_cancelled_at: cancelledEvent?.occurred_at || null,
    last_relationship_email_at: existingStateResult.data?.last_relationship_email_at || null,
    next_relationship_email_eligible_at: existingStateResult.data?.next_relationship_email_eligible_at || null,
    profession: profile.professional_title || null,
    profession_segment: normalizeProfessionSegment(profile.professional_title),
    recalculated_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  const { error: upsertError } = await deps.supabaseAdmin.from("lifecycle_user_state").upsert(stateRow, { onConflict: "user_id" });
  if (upsertError) throw new Error(upsertError.message || "Falha ao salvar estado lifecycle.");

  return {
    userId,
    fullName: profile.full_name || "Profissional",
    email: profile.google_email || "",
    profession: profile.professional_title || "",
    professionSegment: normalizeProfessionSegment(profile.professional_title),
    activationLevel: level,
    activationStatus: activationStatusForLevel(level, profile.subscription_status),
    firstLoginAt,
    lastLoginAt,
    lastActivityAt: latestActivity,
    usageDaysCount: activityDates.size,
    patientsCount: patients.length,
    linkedRecordsCount,
    evolutionsCount: completedEvolutions.length,
    processingEvolutionsCount: processingEvolutions.length,
    failedEvolutionsCount: failedEvolutions.length,
    audioEvolutionsCount: completedEvolutions.filter((e: any) => Number(e.audio_duration_seconds || 0) > 0).length,
    reportsCount: (reportsResult.data || []).length,
    migrationsCount: (migrationsResult.data || []).filter((m: any) => m.status !== "cancelled").length,
    resourcesCount: resourceEvents.size,
    onboardingCompletedAt: stateRow.onboarding_completed_at,
    subscriptionPlan: profile.subscription_plan || null,
    subscriptionStatus: profile.subscription_status || null,
    trialEndsAt: profile.trial_ends_at || null,
    subscriptionStartedAt: subscriptionEvent?.occurred_at || null,
    subscriptionCancelledAt: cancelledEvent?.occurred_at || null,
    lastRelationshipEmailAt: existingStateResult.data?.last_relationship_email_at || null,
    nextRelationshipEmailEligibleAt: existingStateResult.data?.next_relationship_email_eligible_at || null,
    firstEvolutionCompletedAt,
    latestEvolutionAt,
    firstPatientAt,
    firstRecordLinkedAt,
    distinctActivityDays: [...activityDates]
  };
}

export async function getOrRecalculateLifecycleState(deps: LifecycleDependencies, userId: string): Promise<LifecycleState> {
  const existing = await deps.supabaseAdmin.from("lifecycle_user_state").select("*").eq("user_id", userId).maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (!existing.data) return recalculateLifecycleUserState(deps, userId);
  const profile = await getUserProfile(deps, userId);
  return { ...mapState(existing.data), fullName: profile?.full_name || "Profissional", email: profile?.google_email || "", profession: profile?.professional_title || "" };
}
