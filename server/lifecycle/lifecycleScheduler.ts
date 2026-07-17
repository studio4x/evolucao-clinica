import { LIFECYCLE_COOLDOWN_HOURS, LIFECYCLE_PRIORITY, type LifecycleRuntimeConfig } from "./lifecycleConstants.js";
import { chooseHighestPriority, evaluateKnownRule, getNextBestAction, shouldSkipSequenceStep } from "./lifecycleRules.js";
import { ensureLifecycleEnrollment, getLifecyclePreferences, getLifecycleRuntimeConfig, findCampaign, recordLifecycleEvent } from "./lifecycleRepository.js";
import { getOrRecalculateLifecycleState } from "./lifecycleStateService.js";
import type { LifecycleCandidate, LifecycleDependencies, LifecycleRule, LifecycleState, LifecycleStep } from "./lifecycleTypes.js";

function firstName(value: string) { return value.trim().split(/\s+/)[0] || "Profissional"; }

function zonedDateParts(value: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
  return Object.fromEntries(formatter.formatToParts(value).filter((part) => part.type !== "literal").map((part) => [part.type, part.value])) as Record<string, string>;
}

function localDateTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): Date {
  const localAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  const offsetParts = zonedDateParts(new Date(localAsUtc), timeZone);
  const renderedAsUtc = Date.UTC(Number(offsetParts.year), Number(offsetParts.month) - 1, Number(offsetParts.day), Number(offsetParts.hour), Number(offsetParts.minute), Number(offsetParts.second));
  return new Date(localAsUtc - (renderedAsUtc - localAsUtc));
}

function nextPreferredSendAt(reference: Date, timeZone: string, preferredTime: string | null | undefined, minimumDelayMinutes: number): Date {
  const safeTime = /^([01]\d|2[0-3]):[0-5]\d/.test(String(preferredTime || "")) ? String(preferredTime) : "08:30";
  const [hour, minute] = safeTime.split(":").map(Number);
  const notBefore = new Date(reference.getTime() + Math.max(0, minimumDelayMinutes) * 60000);
  const current = zonedDateParts(notBefore, timeZone);
  let target = localDateTimeToUtc(Number(current.year), Number(current.month), Number(current.day), hour, minute, timeZone);
  if (target.getTime() < notBefore.getTime()) {
    const nextLocalDay = new Date(Date.UTC(Number(current.year), Number(current.month) - 1, Number(current.day) + 1));
    target = localDateTimeToUtc(nextLocalDay.getUTCFullYear(), nextLocalDay.getUTCMonth() + 1, nextLocalDay.getUTCDate(), hour, minute, timeZone);
  }
  return target;
}

function safeTimeZone(value: unknown, fallback = "America/Sao_Paulo"): string {
  try {
    const candidate = String(value || fallback);
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format();
    return candidate;
  } catch {
    return fallback;
  }
}

function buildTemplateContext(state: LifecycleState, origin: string, now: Date): Record<string, string | number> {
  const nextAction = getNextBestAction(state);
  const daysRemaining = state.trialEndsAt ? Math.ceil((new Date(state.trialEndsAt).getTime() - now.getTime()) / 86400000) : 0;
  return {
    primeiro_nome: firstName(state.fullName),
    nome_completo: state.fullName,
    profissao: state.profession || "profissional",
    quantidade_pacientes: state.patientsCount,
    quantidade_prontuarios: state.linkedRecordsCount,
    quantidade_evolucoes: state.evolutionsCount,
    quantidade_audios: state.audioEvolutionsCount,
    quantidade_documentos: state.reportsCount,
    quantidade_recursos: state.resourcesCount,
    plano_atual: state.subscriptionPlan || "seu plano atual",
    data_fim_teste: state.trialEndsAt ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(state.trialEndsAt)) : "",
    dias_restantes_teste: Math.max(daysRemaining, 0),
    proxima_acao: nextAction.label,
    link_acao: nextAction.route,
    link_suporte: `${origin.replace(/\/$/, "")}/painel/support`
  };
}

function sequenceCandidate(step: LifecycleStep, campaignKey: string, periodKey: string): LifecycleCandidate {
  return {
    messageKey: `sequence:${step.step_key}`,
    priority: Number(step.priority || LIFECYCLE_PRIORITY.sequence),
    dispatchType: "sequence",
    category: step.category || "education",
    commercial: step.category === "commercial",
    step,
    subjectTemplate: step.subject_template,
    preheaderTemplate: step.preheader_template || "Continue de onde parou.",
    bodyTemplate: step.body_markdown,
    ctaLabelTemplate: step.cta_label_template || "Acessar a plataforma",
    ctaRouteTemplate: step.cta_route_template || step.fallback_cta_route || "/painel/dashboard",
    dedupePeriodKey: `${campaignKey}:${periodKey}`,
    reason: `passo ${step.position} devido`
  };
}

function applyConditionalStepTemplate(candidate: LifecycleCandidate, step: LifecycleStep): LifecycleCandidate {
  return {
    ...candidate,
    step,
    category: step.category || candidate.category,
    commercial: step.category === "commercial" || candidate.commercial,
    subjectTemplate: step.subject_template,
    preheaderTemplate: step.preheader_template || candidate.preheaderTemplate,
    bodyTemplate: step.body_markdown,
    ctaLabelTemplate: step.cta_label_template || candidate.ctaLabelTemplate,
    ctaRouteTemplate: step.cta_route_template || step.fallback_cta_route || candidate.ctaRouteTemplate
  };
}

function isRelationshipCooldownBlocked(state: LifecycleState, now: Date, candidate: LifecycleCandidate): boolean {
  if (candidate.dispatchType === "transactional_bridge") return false;
  return Boolean(state.nextRelationshipEmailEligibleAt && new Date(state.nextRelationshipEmailEligibleAt).getTime() > now.getTime());
}

async function insertDecision(deps: LifecycleDependencies, row: Record<string, unknown>) {
  const { error } = await deps.supabaseAdmin.from("lifecycle_decisions").upsert(row, { onConflict: "decision_key", ignoreDuplicates: true });
  if (error && error.code !== "23505") throw new Error(error.message || "Falha ao registrar decisão lifecycle.");
}

async function insertSkippedDispatch(deps: LifecycleDependencies, row: Record<string, unknown>) {
  const { error } = await deps.supabaseAdmin.from("lifecycle_dispatches").insert(row);
  if (error && error.code !== "23505") throw new Error(error.message || "Falha ao registrar skip lifecycle.");
}

function sequenceDue(step: LifecycleStep | undefined, enrollment: any, now: Date): boolean {
  if (!step || enrollment.current_position >= step.position) return false;
  const startedAt = new Date(enrollment.started_at || enrollment.enrolled_at).getTime();
  const dueAt = startedAt + Number(step.day_offset || 0) * 86400000;
  return now.getTime() >= dueAt && (!enrollment.next_step_at || now.getTime() >= new Date(enrollment.next_step_at).getTime());
}

async function scheduleForEnrollment(
  deps: LifecycleDependencies,
  campaign: any,
  enrollment: any,
  steps: LifecycleStep[],
  conditionalCampaign: any | null,
  conditionalSteps: LifecycleStep[],
  rules: LifecycleRule[],
  state: LifecycleState,
  runtime: LifecycleRuntimeConfig,
  now: Date
) {
  if (enrollment.status !== "active") return "inactive";
  if (enrollment.completion_deadline_at && new Date(enrollment.completion_deadline_at).getTime() < now.getTime()) {
    await deps.supabaseAdmin.from("lifecycle_enrollments").update({ status: "expired", cancellation_reason: "completion_window_expired" }).eq("id", enrollment.id);
    await insertDecision(deps, { user_id: state.userId, enrollment_id: enrollment.id, campaign_id: campaign.id, decision_key: `deadline:${enrollment.id}`, outcome: "completed", reason: "janela máxima da jornada excedida" });
    return "expired";
  }

  const preferences = await getLifecyclePreferences(deps, state.userId);
  if (!preferences.lifecycle_enabled || !preferences.product_education_enabled) {
    await insertDecision(deps, { user_id: state.userId, enrollment_id: enrollment.id, campaign_id: campaign.id, decision_key: `suppressed:${enrollment.id}:${now.toISOString().slice(0, 10)}`, outcome: "suppressed", reason: "preferência de comunicação desativada" });
    return "suppressed";
  }

  const currentStep = steps.find((step) => step.position === enrollment.current_position + 1);
  const candidates = rules.map((rule) => {
    const candidate = evaluateKnownRule(rule, state, now);
    if (!candidate || conditionalCampaign?.status !== "active") return candidate;
    const templateStep = conditionalSteps.find((step) => step.eligibility_rule_key === rule.rule_key && step.status === "active" && step.enabled);
    return templateStep ? applyConditionalStepTemplate(candidate, templateStep) : candidate;
  }).filter(Boolean) as LifecycleCandidate[];
  let sequence = sequenceDue(currentStep, enrollment, now) && currentStep ? sequenceCandidate(currentStep, campaign.key, now.toISOString().slice(0, 10)) : null;
  if (sequence && shouldSkipSequenceStep(currentStep!, state)) {
    const skipReason = shouldSkipSequenceStep(currentStep!, state) || "passo obsoleto";
    const decisionKey = `skip:${enrollment.id}:${currentStep!.id}`;
    await insertDecision(deps, { user_id: state.userId, enrollment_id: enrollment.id, campaign_id: campaign.id, step_id: currentStep!.id, decision_key: decisionKey, selected_message_key: sequence.messageKey, selected_priority: sequence.priority, outcome: runtime.dry_run || !runtime.send_enabled ? "dry_run" : "skipped", reason: skipReason });
    if (!runtime.dry_run && runtime.send_enabled) {
      await insertSkippedDispatch(deps, { user_id: state.userId, enrollment_id: enrollment.id, campaign_id: campaign.id, step_id: currentStep!.id, message_key: sequence.messageKey, dispatch_type: "sequence", priority: sequence.priority, status: "skipped", scheduled_for: now.toISOString(), dedupe_key: `sequence:${enrollment.id}:${currentStep!.id}`, skip_reason: skipReason, skipped_at: now.toISOString() });
      await deps.supabaseAdmin.from("lifecycle_enrollments").update({ current_position: currentStep!.position, next_step_at: steps.find((s) => s.position === currentStep!.position + 1) ? new Date(now.getTime() + 86400000).toISOString() : null }).eq("id", enrollment.id);
    }
    sequence = null;
  }

  const allCandidates = [...candidates, ...(sequence ? [sequence] : [])];
  if (allCandidates.length === 0) return "nothing_due";

  const candidateDedupeKeys = allCandidates.map(c => 
    `${c.dispatchType}:${state.userId}:${c.messageKey}:${c.dedupePeriodKey}`
  );

  const { data: existingDispatches, error: dedupeError } = await deps.supabaseAdmin
    .from("lifecycle_dispatches")
    .select("dedupe_key")
    .in("dedupe_key", candidateDedupeKeys);

  if (dedupeError) throw new Error(dedupeError.message);

  const existingDedupeSet = new Set((existingDispatches || []).map((d: any) => d.dedupe_key));
  const eligibleCandidates = allCandidates.filter(c => {
    const key = `${c.dispatchType}:${state.userId}:${c.messageKey}:${c.dedupePeriodKey}`;
    return !existingDedupeSet.has(key);
  });

  const chosen = chooseHighestPriority(eligibleCandidates);
  if (!chosen) return "nothing_due";
  if (isRelationshipCooldownBlocked(state, now, chosen)) {
    await insertDecision(deps, { user_id: state.userId, enrollment_id: enrollment.id, campaign_id: chosen.step?.campaign_id || campaign.id, step_id: chosen.step?.id || null, rule_id: chosen.rule?.id || null, decision_key: `deferred:${enrollment.id}:${chosen.messageKey}:${now.toISOString().slice(0, 10)}`, selected_message_key: chosen.messageKey, selected_priority: chosen.priority, outcome: "deferred", reason: "cooldown de 24 horas" });
    await deps.supabaseAdmin.from("lifecycle_enrollments").update({ next_step_at: state.nextRelationshipEmailEligibleAt }).eq("id", enrollment.id);
    return "deferred";
  }

  const context = buildTemplateContext(state, deps.productionOrigin, now);
  const chosenCampaignId = chosen.step?.campaign_id || campaign.id;
  const decisionKey = `${chosen.dispatchType}:${enrollment.id}:${chosen.messageKey}:${chosen.dedupePeriodKey}`;
  const dryRun = runtime.dry_run || !runtime.send_enabled;
  await insertDecision(deps, { user_id: state.userId, enrollment_id: enrollment.id, campaign_id: chosenCampaignId, step_id: chosen.step?.id || null, rule_id: chosen.rule?.id || null, decision_key: decisionKey, selected_message_key: chosen.messageKey, selected_priority: chosen.priority, outcome: dryRun ? "dry_run" : "scheduled", reason: chosen.reason, metadata: { cta_route: chosen.ctaRouteTemplate, category: chosen.category, context_keys: Object.keys(context) } });
  if (dryRun) return "dry_run";

  const delayMinutes = Number(chosen.rule?.delay_minutes || 0);
  const scheduledFor = nextPreferredSendAt(
    now,
    safeTimeZone(preferences.timezone || campaign.timezone),
    preferences.preferred_send_time || chosen.step?.send_time || campaign.default_send_time,
    delayMinutes
  );
  const { error: dispatchError } = await deps.supabaseAdmin.from("lifecycle_dispatches").insert({
    user_id: state.userId,
    enrollment_id: enrollment.id,
    campaign_id: chosenCampaignId,
    step_id: chosen.step?.id || null,
    rule_id: chosen.rule?.id || null,
    message_key: chosen.messageKey,
    dispatch_type: chosen.dispatchType,
    priority: chosen.priority,
    status: "queued",
    scheduled_for: scheduledFor.toISOString(),
    dedupe_key: `${chosen.dispatchType}:${state.userId}:${chosen.messageKey}:${chosen.dedupePeriodKey}`,
    metadata: { ...context, cta_label_template: chosen.ctaLabelTemplate, cta_route_template: chosen.ctaRouteTemplate, category: chosen.category, commercial: chosen.commercial }
  });
  if (dispatchError && dispatchError.code !== "23505") throw new Error(dispatchError.message || "Falha ao criar dispatch lifecycle.");

  const nextStep = chosen.dispatchType === "sequence" ? steps.find((step) => step.position === chosen.step!.position + 1) : currentStep;
  await deps.supabaseAdmin.from("lifecycle_enrollments").update({
    current_position: chosen.dispatchType === "sequence" ? chosen.step!.position : enrollment.current_position,
    next_step_at: nextStep ? new Date(now.getTime() + (chosen.dispatchType === "sequence" ? 86400000 : 86400000)).toISOString() : null
  }).eq("id", enrollment.id);
  return "scheduled";
}

export async function scheduleLifecycleMessages(deps: LifecycleDependencies, now = new Date()) {
  const runtime = await getLifecycleRuntimeConfig(deps);
  const activationCampaign = await findCampaign(deps, "new_user_activation_15d");
  const conditionalCampaign = await findCampaign(deps, "conditional_lifecycle_messages");
  const campaign = activationCampaign?.status === "active"
    ? activationCampaign
    : conditionalCampaign?.status === "active"
      ? conditionalCampaign
      : null;
  if (!campaign) return { scheduled: 0, dryRun: runtime.dry_run || !runtime.send_enabled, reason: "campaign_not_active" };
  const [{ data: steps, error: stepsError }, { data: rules, error: rulesError }, { data: professionals, error: professionalsError }, { data: conditionalSteps, error: conditionalStepsError }] = await Promise.all([
    activationCampaign?.status === "active"
      ? deps.supabaseAdmin.from("lifecycle_steps").select("*").eq("campaign_id", activationCampaign.id).eq("enabled", true).order("position")
      : Promise.resolve({ data: [] as any[], error: null }),
    deps.supabaseAdmin.from("lifecycle_rules").select("*").eq("enabled", true),
    deps.supabaseAdmin.from("professionals").select("id, status, role, created_at").eq("status", "active").neq("role", "admin").limit(500),
    conditionalCampaign
      ? deps.supabaseAdmin.from("lifecycle_steps").select("*").eq("campaign_id", conditionalCampaign.id).eq("enabled", true).order("position")
      : Promise.resolve({ data: [] as any[], error: null })
  ]);
  if (stepsError || rulesError || professionalsError || conditionalStepsError) throw new Error(stepsError?.message || rulesError?.message || professionalsError?.message || conditionalStepsError?.message || "Falha ao buscar dados do scheduler lifecycle.");
  let scheduled = 0;
  for (const professional of professionals || []) {
    if (campaign.enrollment_mode === "new_users_only" && new Date(professional.created_at).getTime() < new Date(campaign.eligible_from).getTime()) continue;
    try {
      const enrollment = await ensureLifecycleEnrollment(deps, professional.id, { campaignKey: campaign.key });
      if (!enrollment) continue;
      const state = await getOrRecalculateLifecycleState(deps, professional.id);
      const result = await scheduleForEnrollment(deps, campaign, enrollment, steps || [], conditionalCampaign, conditionalSteps || [], rules || [], state, runtime, now);
      if (result === "scheduled") scheduled += 1;
      if (state.subscriptionStatus === "trialing" && state.trialEndsAt) {
        const trialDays = Math.ceil((new Date(state.trialEndsAt).getTime() - now.getTime()) / 86400000);
        if (trialDays > 0 && trialDays <= 3) await recordLifecycleEvent(deps, { userId: professional.id, eventName: "trial_expiring", source: "backend", metadata: { days: trialDays }, idempotencyKey: `trial_expiring:${professional.id}:${state.trialEndsAt}:${trialDays}` });
      }
      if (state.trialEndsAt && new Date(state.trialEndsAt).getTime() <= now.getTime()) await recordLifecycleEvent(deps, { userId: professional.id, eventName: "trial_expired", source: "backend", metadata: {}, idempotencyKey: `trial_expired:${professional.id}:${state.trialEndsAt}` });
    } catch (error) {
      console.error(`[Lifecycle Scheduler] Falha para ${professional.id}:`, error instanceof Error ? error.message : error);
    }
  }
  return { scheduled, dryRun: runtime.dry_run || !runtime.send_enabled, users: professionals?.length || 0 };
}
