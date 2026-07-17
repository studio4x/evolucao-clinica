import { LIFECYCLE_PRIORITY } from "./lifecycleConstants.js";
import { calculateTrialDaysRemaining } from "./lifecycleState.js";
import type { LifecycleCandidate, LifecycleRule, LifecycleState, LifecycleStep } from "./lifecycleTypes.js";

export function getNextBestAction(state: LifecycleState, now = new Date()): { label: string; route: string } {
  if (state.failedEvolutionsCount > 0) return { label: "Verificar evolução", route: "/painel/history" };
  const trialExpired = Boolean(state.trialEndsAt && new Date(state.trialEndsAt).getTime() <= now.getTime() && state.subscriptionStatus !== "active");
  if (state.subscriptionStatus === "canceled" || trialExpired) return { label: "Conhecer os planos disponíveis", route: "/painel/subscription" };
  if (state.patientsCount === 0) return { label: "Cadastrar primeiro paciente", route: "/painel/patients/new" };
  if (state.linkedRecordsCount === 0) return { label: "Criar ou vincular um prontuário", route: "/painel/patients" };
  if (state.evolutionsCount === 0) return { label: "Criar sua primeira evolução", route: "/painel/patients" };
  if (state.evolutionsCount === 1) return { label: "Consultar o histórico do paciente", route: "/painel/history" };
  if (state.subscriptionStatus === "active" && state.subscriptionPlan !== "trial") return { label: "Aproveitar mais recursos do seu plano", route: "/painel/profile" };
  if (state.evolutionsCount >= 3 || state.usageDaysCount >= 2) return { label: "Explorar outros recursos da plataforma", route: "/painel/profile" };
  if (state.subscriptionStatus === "trialing") return { label: "Continuar usando", route: "/painel/dashboard" };
  return { label: "Explorar outros recursos da plataforma", route: "/painel/profile" };
}

function hoursSince(value: string | null | undefined, now: Date): number {
  if (!value) return Number.POSITIVE_INFINITY;
  return (now.getTime() - new Date(value).getTime()) / (60 * 60 * 1000);
}

function daysSince(value: string | null | undefined, now: Date): number {
  return hoursSince(value, now) / 24;
}

function isSubscriber(state: LifecycleState): boolean {
  return state.subscriptionStatus === "active" && state.subscriptionPlan !== "trial";
}

function isTrial(state: LifecycleState): boolean {
  return state.subscriptionStatus === "trialing" || state.subscriptionPlan === "trial";
}

function messageConfig(rule: LifecycleRule, fallback: Record<string, unknown>) {
  return { ...fallback, ...(rule.message_config || {}) } as Record<string, string | number | boolean>;
}

const FALLBACK_RULE_MESSAGES: Record<string, Record<string, unknown>> = {
  no_return_after_registration: { subject: "Sua conta está pronta para continuar", preheader: "Acesse a plataforma e continue pela primeira etapa.", body: "Sua conta no Evolução Clínica já está disponível. Acesse a plataforma e comece por uma ação simples.", cta_label: "Acessar minha conta", cta_route: "/painel/dashboard", category: "activation" },
  logged_in_without_patient: { subject: "Falta apenas o primeiro paciente para começar", preheader: "Cadastre um paciente para iniciar a organização.", body: "Você já acessou o Evolução Clínica. O próximo passo é cadastrar um paciente para iniciar a organização.", cta_label: "Cadastrar primeiro paciente", cta_route: "/painel/patients/new", category: "activation" },
  patient_without_linked_record: { subject: "Seu paciente já está cadastrado. Falta o prontuário.", preheader: "Crie ou vincule o prontuário antes da primeira evolução.", body: "O paciente já foi cadastrado. Antes de criar a primeira evolução, crie ou vincule o prontuário no Google Docs.", cta_label: "Configurar prontuário", cta_route: "/painel/patients", category: "activation" },
  linked_record_without_evolution: { subject: "Seu prontuário está pronto para a primeira evolução", preheader: "Grave ou envie um resumo em áudio.", body: "O prontuário já está vinculado. Agora, grave ou envie um resumo em áudio para experimentar o fluxo completo.", cta_label: "Criar primeira evolução", cta_route: "/painel/patients", category: "activation" },
  evolution_processing_too_long: { subject: "Sua evolução ainda está em processamento", preheader: "Acesse a plataforma para verificar o status.", body: "Uma evolução iniciada ainda não foi concluída. Acesse a plataforma para verificar o status.", cta_label: "Verificar evolução", cta_route: "/painel/history", category: "technical" },
  first_evolution_completed: { subject: "Sua primeira evolução foi concluída", preheader: "Confira como o registro ficou organizado.", body: "Sua primeira evolução foi processada e adicionada ao prontuário. Consulte o histórico e continue utilizando a plataforma.", cta_label: "Ver histórico", cta_route: "/painel/history", category: "activation" },
  trial_expiring_3d: { subject: "Seu período de teste termina em 3 dias", preheader: "Conheça as opções para continuar.", body: "Seu período de teste termina em {{data_fim_teste}}. Conheça as opções disponíveis para continuar.", cta_label: "Conhecer os planos", cta_route: "/painel/subscription", category: "commercial", commercial: true },
  trial_expiring_1d: { subject: "Seu teste termina amanhã", preheader: "Continue com o Evolução Clínica.", body: "Seu período de teste termina amanhã. Conheça os planos disponíveis para continuar.", cta_label: "Continuar com o Evolução Clínica", cta_route: "/painel/subscription", category: "commercial", commercial: true },
  trial_expired: { subject: "Seu período de teste terminou", preheader: "Escolha uma opção de continuidade.", body: "Seu período de teste terminou. Para continuar utilizando os recursos disponíveis, escolha um plano.", cta_label: "Escolher um plano", cta_route: "/painel/subscription", category: "commercial", commercial: true },
  trial_recovery_2d: { subject: "Continue de onde você parou", preheader: "Retome sua organização quando estiver pronto.", body: "Você já começou a organizar sua rotina. Escolha um plano e retome sua conta quando desejar.", cta_label: "Retomar minha conta", cta_route: "/painel/subscription", category: "commercial", commercial: true },
  trial_recovery_7d: { subject: "O que impediu você de continuar?", preheader: "Conte o que dificultou sua continuidade.", body: "Gostaríamos de entender se algo dificultou sua continuidade. Sua resposta pode ajudar a melhorar a plataforma.", cta_label: "Contar o que aconteceu", cta_route: "/painel/support", category: "commercial", commercial: true },
  inactive_3d: { subject: "Continue de onde você parou", preheader: "Retome a próxima ação recomendada.", body: "Acesse sua conta e continue pela próxima ação recomendada.", cta_label: "Continuar de onde parei", cta_route: "/painel/dashboard", category: "reactivation" },
  inactive_7d: { subject: "A semana ficou corrida?", preheader: "Comece por apenas uma ação.", body: "Se os registros ficaram para depois, abra a plataforma e retome um atendimento de cada vez.", cta_label: "Retomar meus registros", cta_route: "/painel/patients", category: "reactivation" },
  inactive_14d: { subject: "Algo dificultou o uso da plataforma?", preheader: "Estamos disponíveis para ajudar.", body: "Gostaríamos de saber se você encontrou alguma dificuldade durante o uso.", cta_label: "Preciso de ajuda", cta_route: "/painel/support", category: "reactivation" },
  subscription_started: { subject: "Sua assinatura do Evolução Clínica está ativa", preheader: "As próximas mensagens ajudarão na adoção da sua conta.", body: "Sua assinatura foi confirmada. Você pode continuar utilizando os recursos disponíveis no seu plano.", cta_label: "Acessar minha conta", cta_route: "/painel/dashboard", category: "transactional" },
  subscriber_low_usage: { subject: "Vamos aproveitar melhor sua assinatura?", preheader: "Escolha uma ação simples para retomar.", body: "Sua assinatura está ativa. Escolha uma ação simples para retomar o uso.", cta_label: "Continuar usando", cta_route: "/painel/dashboard", category: "retention" }
};

function createCandidate(rule: LifecycleRule, state: LifecycleState, now: Date, periodKey: string, reason: string): LifecycleCandidate {
  const fallback = FALLBACK_RULE_MESSAGES[rule.rule_key] || FALLBACK_RULE_MESSAGES.logged_in_without_patient;
  const config = messageConfig(rule, fallback);
  const category = String(config.category || fallback.category || "activation");
  return {
    messageKey: `conditional:${rule.rule_key}`,
    priority: Number(rule.priority || LIFECYCLE_PRIORITY.activation),
    dispatchType: category === "transactional" ? "transactional_bridge" : "conditional",
    category,
    commercial: config.commercial === true || category === "commercial",
    rule,
    subjectTemplate: String(config.subject || fallback.subject || "Uma orientação do Evolução Clínica"),
    preheaderTemplate: String(config.preheader || fallback.preheader || "Continue de onde parou."),
    bodyTemplate: String(config.body || fallback.body || "Acesse a plataforma para continuar."),
    ctaLabelTemplate: String(config.cta_label || fallback.cta_label || "Acessar a plataforma"),
    ctaRouteTemplate: String(config.cta_route || fallback.cta_route || "/painel/dashboard"),
    dedupePeriodKey: periodKey,
    reason
  };
}

export function evaluateKnownRule(rule: LifecycleRule, state: LifecycleState, now = new Date()): LifecycleCandidate | null {
  if (!rule.enabled) return null;
  const trialDays = calculateTrialDaysRemaining(state.trialEndsAt, now);
  const loginAge = daysSince(state.lastLoginAt, now);
  const activityAge = daysSince(state.lastActivityAt || state.lastLoginAt, now);
  const period = now.toISOString().slice(0, 10);

  switch (rule.rule_key) {
    case "no_return_after_registration":
      return !state.lastLoginAt && hoursSince(state.onboardingCompletedAt || state.lastActivityAt, now) >= 24
        ? createCandidate(rule, state, now, `registration:${period}`, "sem novo acesso após 24 horas") : null;
    case "logged_in_without_patient":
      return Boolean(state.lastLoginAt) && state.patientsCount === 0 && hoursSince(state.lastLoginAt, now) >= 24
        ? createCandidate(rule, state, now, `logged-in:${period}`, "login sem paciente cadastrado") : null;
    case "patient_without_linked_record":
      return state.patientsCount > 0 && state.linkedRecordsCount === 0 && hoursSince(state.firstPatientAt, now) >= 24
        ? createCandidate(rule, state, now, `patient:${period}`, "paciente sem prontuário vinculado") : null;
    case "linked_record_without_evolution":
      return state.linkedRecordsCount > 0 && state.evolutionsCount === 0 && hoursSince(state.firstRecordLinkedAt, now) >= 24
        ? createCandidate(rule, state, now, `record:${period}`, "prontuário sem evolução concluída") : null;
    case "evolution_processing_too_long":
      return state.processingEvolutionsCount > 0
        ? createCandidate(rule, state, now, `processing:${period}`, "evolução em processamento") : null;
    case "first_evolution_completed":
      return state.evolutionsCount === 1 && Boolean(state.firstEvolutionCompletedAt) && hoursSince(state.firstEvolutionCompletedAt, now) <= 72
        ? createCandidate(rule, state, now, `first-evolution:${state.firstEvolutionCompletedAt}`, "primeira evolução concluída") : null;
    case "trial_expiring_3d":
      return isTrial(state) && trialDays !== null && trialDays <= 3 && trialDays > 1
        ? createCandidate(rule, state, now, `trial-3d:${state.trialEndsAt}`, "teste termina em até três dias") : null;
    case "trial_expiring_1d":
      return isTrial(state) && trialDays !== null && trialDays <= 1 && trialDays > 0
        ? createCandidate(rule, state, now, `trial-1d:${state.trialEndsAt}`, "teste termina em até um dia") : null;
    case "trial_expired":
      return isTrial(state) && trialDays !== null && trialDays <= 0
        ? createCandidate(rule, state, now, `trial-expired:${state.trialEndsAt}`, "teste encerrado") : null;
    case "trial_recovery_2d":
      return !isSubscriber(state) && state.subscriptionStatus !== "active" && trialDays !== null && trialDays <= -2 && trialDays > -7
        ? createCandidate(rule, state, now, `trial-recovery-2d:${state.trialEndsAt}`, "recuperação dois dias após o teste") : null;
    case "trial_recovery_7d":
      return !isSubscriber(state) && state.subscriptionStatus !== "active" && trialDays !== null && trialDays <= -7 && trialDays > -14
        ? createCandidate(rule, state, now, `trial-recovery-7d:${state.trialEndsAt}`, "recuperação sete dias após o teste") : null;
    case "inactive_3d":
      return !isSubscriber(state) && activityAge >= 3 && activityAge < 7
        ? createCandidate(rule, state, now, `inactive-3d:${period}`, "três dias sem acesso") : null;
    case "inactive_7d":
      return !isSubscriber(state) && activityAge >= 7 && activityAge < 14
        ? createCandidate(rule, state, now, `inactive-7d:${period}`, "sete dias sem acesso") : null;
    case "inactive_14d":
      return !isSubscriber(state) && activityAge >= 14
        ? createCandidate(rule, state, now, `inactive-14d:${period}`, "quatorze dias sem acesso") : null;
    case "subscription_started":
      return isSubscriber(state) && state.subscriptionStartedAt && hoursSince(state.subscriptionStartedAt, now) <= 48
        ? createCandidate(rule, state, now, `subscription-started:${state.subscriptionStartedAt}`, "assinatura ativa") : null;
    case "subscriber_low_usage":
      return isSubscriber(state) && daysSince(state.subscriptionStartedAt || state.lastActivityAt, now) >= 7 && state.evolutionsCount < 1
        ? createCandidate(rule, state, now, `subscriber-low-usage:${period}`, "assinante com baixo uso") : null;
    default:
      return null;
  }
}

export function shouldSkipSequenceStep(step: LifecycleStep, state: LifecycleState): string | null {
  if (step.step_key === "day_02" && state.patientsCount > 0) return "ação já concluída: paciente existente";
  if (step.step_key === "day_03" && state.linkedRecordsCount > 0) return "ação já concluída: prontuário vinculado";
  if (step.step_key === "day_04" && state.evolutionsCount > 0) return "ação já concluída: evolução existente";
  if (step.status !== "active" || !step.enabled) return "passo não está ativo";
  return null;
}

export function chooseHighestPriority(candidates: LifecycleCandidate[]): LifecycleCandidate | null {
  return [...candidates].sort((a, b) => b.priority - a.priority || a.messageKey.localeCompare(b.messageKey))[0] || null;
}
