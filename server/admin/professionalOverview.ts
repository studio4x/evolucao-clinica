import {
  LIFECYCLE_ACTIVATION_CAMPAIGN_KEY,
  LIFECYCLE_CONDITIONAL_CAMPAIGN_KEY
} from "../lifecycle/lifecycleConstants.js";
import { evaluateKnownRule, shouldSkipSequenceStep } from "../lifecycle/lifecycleRules.js";
import { getOrRecalculateLifecycleState } from "../lifecycle/lifecycleStateService.js";
import type {
  LifecycleOperationalContext,
  LifecycleRule,
  LifecycleState,
  LifecycleStep
} from "../lifecycle/lifecycleTypes.js";

type ProfessionalPatientRow = {
  id: string;
  full_name?: string | null;
  status?: string | null;
};

type ProfessionalEvolutionRow = {
  patient_id?: string | null;
  transcription_status?: string | null;
  audio_duration_seconds?: number | string | null;
};

type ProfessionalUsageRow = {
  audio_duration_seconds?: number | string | null;
};

type OnboardingCampaignRow = {
  id: string;
  key: string;
  name: string;
  status: string;
};

type OnboardingEnrollmentRow = {
  id: string;
  campaign_id: string;
  status: string;
  current_position?: number | string | null;
  started_at?: string | null;
  enrolled_at?: string | null;
  next_step_at?: string | null;
};

type OnboardingDispatchRow = {
  id: string;
  step_id?: string | null;
  rule_id?: string | null;
  message_key?: string | null;
  dedupe_key?: string | null;
  status: string;
  scheduled_for?: string | null;
  created_at?: string | null;
};

export type ProfessionalClinicalMetrics = {
  patientCount: number;
  evolutionCount: number;
  transcribedSeconds: number;
  patients: Array<{
    id: string;
    name: string;
    status: string | null;
    evolutionCount: number;
    transcribedSeconds: number;
  }>;
};

export type ProfessionalEligibleEmail = {
  key: string;
  subject: string;
  campaignName: string;
  stepPosition: number;
  kind: "sequence" | "conditional";
  status: "eligible" | "scheduled" | "waiting";
  scheduledFor: string | null;
  reason: string;
};

export type ProfessionalOnboardingEligibility = {
  evaluatedAt: string;
  blockedReason: string | null;
  emails: ProfessionalEligibleEmail[];
};

const seconds = (value: unknown) => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const timestamp = (value: unknown) => {
  const parsed = new Date(String(value || "")).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

export function buildProfessionalClinicalMetrics(
  patients: ProfessionalPatientRow[],
  evolutions: ProfessionalEvolutionRow[],
  usageLogs: ProfessionalUsageRow[]
): ProfessionalClinicalMetrics {
  const evolutionSummaries = new Map<string, { count: number; transcribedSeconds: number }>();

  for (const evolution of evolutions) {
    const patientId = String(evolution.patient_id || "");
    if (!patientId) continue;
    const current = evolutionSummaries.get(patientId) || { count: 0, transcribedSeconds: 0 };
    current.count += 1;
    if (evolution.transcription_status === "completed") {
      current.transcribedSeconds += seconds(evolution.audio_duration_seconds);
    }
    evolutionSummaries.set(patientId, current);
  }

  return {
    patientCount: patients.length,
    evolutionCount: evolutions.length,
    transcribedSeconds: usageLogs.reduce((total, row) => total + seconds(row.audio_duration_seconds), 0),
    patients: patients
      .map((patient) => {
        const summary = evolutionSummaries.get(patient.id) || { count: 0, transcribedSeconds: 0 };
        return {
          id: patient.id,
          name: String(patient.full_name || "Paciente sem nome"),
          status: patient.status ? String(patient.status) : null,
          evolutionCount: summary.count,
          transcribedSeconds: summary.transcribedSeconds
        };
      })
      .sort((left, right) => left.name.localeCompare(right.name, "pt-BR", { sensitivity: "base" }))
  };
}

const activeDispatchStatuses = new Set(["queued", "processing", "retry"]);
const terminalDispatchStatuses = new Set(["sent", "failed", "suppressed", "skipped", "cancelled", "replaced"]);

const communicationBlockReason = (professionalStatus: string, preferences: Record<string, any> | null) => {
  if (professionalStatus !== "active") return "A conta do profissional não está ativa.";
  if (preferences?.email_enabled === false) return "O recebimento de e-mails está desativado pelo profissional.";
  if (preferences?.lifecycle_enabled === false) return "A jornada de onboarding está desativada pelo profissional.";
  if (preferences?.product_education_enabled === false) return "O conteúdo educativo está desativado pelo profissional.";
  return null;
};

const dispatchFor = (
  dispatches: OnboardingDispatchRow[],
  predicate: (dispatch: OnboardingDispatchRow) => boolean
) => [...dispatches]
  .filter(predicate)
  .sort((left, right) => timestamp(right.created_at || right.scheduled_for) - timestamp(left.created_at || left.scheduled_for))[0] || null;

export function deriveProfessionalOnboardingEligibility(input: {
  professionalStatus: string;
  preferences: Record<string, any> | null;
  state: LifecycleState;
  operational: LifecycleOperationalContext;
  campaigns: OnboardingCampaignRow[];
  steps: LifecycleStep[];
  rules: LifecycleRule[];
  enrollments: OnboardingEnrollmentRow[];
  dispatches: OnboardingDispatchRow[];
  now?: Date;
}): ProfessionalOnboardingEligibility {
  const now = input.now || new Date();
  const blockedReason = communicationBlockReason(input.professionalStatus, input.preferences);
  if (blockedReason) return { evaluatedAt: now.toISOString(), blockedReason, emails: [] };

  const emails: ProfessionalEligibleEmail[] = [];
  const activationCampaign = input.campaigns.find((campaign) => campaign.key === LIFECYCLE_ACTIVATION_CAMPAIGN_KEY && campaign.status === "active");
  const conditionalCampaign = input.campaigns.find((campaign) => campaign.key === LIFECYCLE_CONDITIONAL_CAMPAIGN_KEY && campaign.status === "active");

  if (activationCampaign) {
    const enrollment = input.enrollments.find((item) => item.campaign_id === activationCampaign.id && item.status === "active");
    const position = Number(enrollment?.current_position || 0) + 1;
    const step = enrollment
      ? input.steps.find((item) => item.campaign_id === activationCampaign.id && item.position === position)
      : null;
    const skipReason = step ? shouldSkipSequenceStep(step, input.state) : null;

    if (enrollment && step && !skipReason && !(step.category === "commercial" && input.preferences?.commercial_enabled === false)) {
      const messageKey = `sequence:${step.step_key}`;
      const existing = dispatchFor(input.dispatches, (dispatch) => dispatch.step_id === step.id || dispatch.message_key === messageKey);
      const completed = existing && terminalDispatchStatuses.has(existing.status);
      if (!completed) {
        const startedAt = timestamp(enrollment.started_at || enrollment.enrolled_at);
        const stepAvailableAt = startedAt ? startedAt + Number(step.wait_minutes || 0) * 60000 : 0;
        const enrollmentAvailableAt = timestamp(enrollment.next_step_at);
        const availableAt = Math.max(stepAvailableAt, enrollmentAvailableAt);
        const scheduled = existing && activeDispatchStatuses.has(existing.status);
        emails.push({
          key: messageKey,
          subject: step.subject_template,
          campaignName: activationCampaign.name,
          stepPosition: step.position,
          kind: "sequence",
          status: scheduled ? "scheduled" : availableAt > now.getTime() ? "waiting" : "eligible",
          scheduledFor: scheduled
            ? existing.scheduled_for || null
            : availableAt > now.getTime() ? new Date(availableAt).toISOString() : null,
          reason: scheduled ? "Envio já programado" : availableAt > now.getTime() ? "Próximo passo da jornada" : "Passo atual da jornada"
        });
      }
    }
  }

  if (conditionalCampaign) {
    for (const rule of input.rules.filter((item) => item.enabled)) {
      const candidate = evaluateKnownRule(rule, input.state, now, input.operational);
      if (!candidate) continue;
      const step = input.steps.find((item) => item.campaign_id === conditionalCampaign.id
        && item.eligibility_rule_key === rule.rule_key
        && item.status === "active"
        && item.enabled);
      if (!step || (candidate.commercial && input.preferences?.commercial_enabled === false)) continue;

      const expectedDedupeKey = `${candidate.dispatchType}:${input.state.userId}:${candidate.messageKey}:${candidate.resourceId && candidate.occurrenceId ? `${candidate.resourceId}:${candidate.occurrenceId}` : candidate.dedupePeriodKey}`;
      const existing = dispatchFor(input.dispatches, (dispatch) => dispatch.dedupe_key === expectedDedupeKey);
      if (existing && terminalDispatchStatuses.has(existing.status)) continue;

      const scheduled = existing && activeDispatchStatuses.has(existing.status);
      const cooldownUntil = timestamp(input.state.nextRelationshipEmailEligibleAt);
      const operationalCandidate = ["operational", "billing", "technical"].includes(candidate.category);
      const waitingForCooldown = !scheduled && !operationalCandidate && cooldownUntil > now.getTime();
      emails.push({
        key: candidate.messageKey,
        subject: step.subject_template,
        campaignName: conditionalCampaign.name,
        stepPosition: step.position,
        kind: "conditional",
        status: scheduled ? "scheduled" : waitingForCooldown ? "waiting" : "eligible",
        scheduledFor: scheduled ? existing.scheduled_for || null : waitingForCooldown ? new Date(cooldownUntil).toISOString() : null,
        reason: scheduled ? "Envio já programado" : waitingForCooldown ? "Aguardando intervalo entre comunicações" : candidate.reason
      });
    }
  }

  emails.sort((left, right) => {
    const statusOrder = { scheduled: 0, eligible: 1, waiting: 2 };
    return statusOrder[left.status] - statusOrder[right.status]
      || left.stepPosition - right.stepPosition
      || left.subject.localeCompare(right.subject, "pt-BR");
  });

  return {
    evaluatedAt: now.toISOString(),
    blockedReason: emails.length ? null : "Nenhum e-mail atende às condições atuais do profissional.",
    emails
  };
}

async function loadOperationalContext(supabaseAdmin: any, professionalId: string): Promise<LifecycleOperationalContext> {
  const [failedEvolution, notAddedEvolution, professional, failedPayment] = await Promise.all([
    supabaseAdmin.from("evolutions").select("id, updated_at").eq("professional_id", professionalId).eq("transcription_status", "failed").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    supabaseAdmin.from("evolutions").select("id, updated_at").eq("professional_id", professionalId).eq("transcription_status", "completed").eq("google_doc_append_status", "failed").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    supabaseAdmin.from("professionals").select("force_google_disconnect, updated_at").eq("id", professionalId).maybeSingle(),
    supabaseAdmin.from("transactions").select("id, created_at").eq("professional_id", professionalId).eq("status", "failed").order("created_at", { ascending: false }).limit(1).maybeSingle()
  ]);
  const error = failedEvolution.error || notAddedEvolution.error || professional.error || failedPayment.error;
  if (error) throw error;
  return {
    failedEvolution: failedEvolution.data ? { id: failedEvolution.data.id, updatedAt: failedEvolution.data.updated_at || null } : null,
    notAddedEvolution: notAddedEvolution.data ? { id: notAddedEvolution.data.id, updatedAt: notAddedEvolution.data.updated_at || null } : null,
    googleConnection: professional.data?.force_google_disconnect ? { updatedAt: professional.data.updated_at || null } : null,
    failedPayment: failedPayment.data ? { id: failedPayment.data.id, updatedAt: failedPayment.data.created_at || null } : null
  };
}

export async function getProfessionalClinicalMetrics(supabaseAdmin: any, professionalId: string) {
  const [patientsResult, evolutionsResult, usageResult] = await Promise.all([
    supabaseAdmin.from("patients").select("id, full_name, status").eq("professional_id", professionalId).order("full_name"),
    supabaseAdmin.from("evolutions").select("patient_id, transcription_status, audio_duration_seconds").eq("professional_id", professionalId),
    supabaseAdmin.from("usage_logs").select("audio_duration_seconds").eq("professional_id", professionalId)
  ]);
  const error = patientsResult.error || evolutionsResult.error || usageResult.error;
  if (error) throw error;
  return buildProfessionalClinicalMetrics(patientsResult.data || [], evolutionsResult.data || [], usageResult.data || []);
}

export async function getProfessionalOnboardingEligibility(input: {
  supabaseAdmin: any;
  professionalId: string;
  professionalStatus: string;
  preferences: Record<string, any> | null;
}) {
  const state = await getOrRecalculateLifecycleState({ supabaseAdmin: input.supabaseAdmin } as any, input.professionalId);
  const [{ data: campaigns, error: campaignsError }, { data: rules, error: rulesError }, { data: enrollments, error: enrollmentsError }, { data: dispatches, error: dispatchesError }, operational] = await Promise.all([
    input.supabaseAdmin.from("lifecycle_campaigns").select("id, key, name, status").in("key", [LIFECYCLE_ACTIVATION_CAMPAIGN_KEY, LIFECYCLE_CONDITIONAL_CAMPAIGN_KEY]),
    input.supabaseAdmin.from("lifecycle_rules").select("*").eq("enabled", true),
    input.supabaseAdmin.from("lifecycle_enrollments").select("id, campaign_id, status, current_position, started_at, enrolled_at, next_step_at").eq("user_id", input.professionalId),
    input.supabaseAdmin.from("lifecycle_dispatches").select("id, step_id, rule_id, message_key, dedupe_key, status, scheduled_for, created_at").eq("user_id", input.professionalId).order("created_at", { ascending: false }).limit(200),
    loadOperationalContext(input.supabaseAdmin, input.professionalId)
  ]);
  const error = campaignsError || rulesError || enrollmentsError || dispatchesError;
  if (error) throw error;

  const campaignIds = (campaigns || []).map((campaign: any) => campaign.id);
  const { data: steps, error: stepsError } = await input.supabaseAdmin
    .from("lifecycle_steps")
    .select("*")
    .in("campaign_id", campaignIds.length ? campaignIds : ["00000000-0000-0000-0000-000000000000"])
    .eq("enabled", true)
    .order("position");
  if (stepsError) throw stepsError;

  return deriveProfessionalOnboardingEligibility({
    professionalStatus: input.professionalStatus,
    preferences: input.preferences,
    state,
    operational,
    campaigns: campaigns || [],
    steps: steps || [],
    rules: rules || [],
    enrollments: enrollments || [],
    dispatches: dispatches || []
  });
}
