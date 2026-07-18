import { LIFECYCLE_PRIORITY } from "./lifecycleConstants.js";
import { calculateTrialDaysRemaining } from "./lifecycleState.js";
import type { LifecycleCandidate, LifecycleOperationalContext, LifecycleRule, LifecycleState, LifecycleStep } from "./lifecycleTypes.js";

export function getNextBestAction(state: LifecycleState, now = new Date()): { label: string; ctaLabel: string; route: string } {
  if (state.failedEvolutionsCount > 0) return { label: "Verificar evolução", ctaLabel: "Verificar evolução", route: "/painel/history" };
  const trialExpired = Boolean(state.trialEndsAt && new Date(state.trialEndsAt).getTime() <= now.getTime() && state.subscriptionStatus !== "active");
  if (state.subscriptionStatus === "canceled" || trialExpired) return { label: "Conhecer os planos disponíveis", ctaLabel: "Conhecer planos", route: "/painel/subscription" };
  if (state.patientsCount === 0) return { label: "Cadastrar primeiro paciente", ctaLabel: "Cadastrar paciente", route: "/painel/patients/new" };
  if (state.linkedRecordsCount === 0) return { label: "Criar ou vincular um prontuário", ctaLabel: "Configurar prontuário", route: "/painel/patients" };
  if (state.evolutionsCount === 0) return { label: "Criar sua primeira evolução", ctaLabel: "Criar evolução", route: "/painel/patients" };
  if (state.evolutionsCount === 1) return { label: "Consultar o histórico do paciente", ctaLabel: "Consultar histórico", route: "/painel/history" };
  if (state.subscriptionStatus === "active" && state.subscriptionPlan !== "trial") return { label: "Aproveitar mais recursos do seu plano", ctaLabel: "Explorar recursos", route: "/painel/profile" };
  if (state.evolutionsCount >= 3 || state.usageDaysCount >= 2) return { label: "Explorar outros recursos da plataforma", ctaLabel: "Explorar recursos", route: "/painel/profile" };
  if (state.subscriptionStatus === "trialing") return { label: "Continuar usando", ctaLabel: "Continuar usando", route: "/painel/dashboard" };
  return { label: "Explorar outros recursos da plataforma", ctaLabel: "Explorar recursos", route: "/painel/profile" };
}

export function getSubscriberNextBestAction(state: LifecycleState, now = new Date()): { label: string; ctaLabel: string; route: string } {
  if (state.failedEvolutionsCount > 0) return { label: "Retome o processo com o apoio da nossa equipe", ctaLabel: "Falar com o suporte", route: "/painel/support" };
  if (state.patientsCount === 0) return { label: "Cadastre seu primeiro paciente", ctaLabel: "Cadastrar paciente", route: "/painel/patients/new" };
  if (state.linkedRecordsCount === 0) return { label: "Crie ou vincule o prontuário no Google Docs", ctaLabel: "Configurar prontuário", route: "/painel/patients" };
  if (state.evolutionsCount === 0) return { label: "Grave ou envie seu primeiro resumo em áudio", ctaLabel: "Criar evolução", route: "/painel/patients" };
  const daysSinceActivity = state.lastActivityAt ? (now.getTime() - new Date(state.lastActivityAt).getTime()) / 86400000 : Number.POSITIVE_INFINITY;
  if (state.evolutionsCount < 3 || daysSinceActivity >= 3) return { label: "Registre um dos próximos atendimentos", ctaLabel: "Registrar atendimento", route: "/painel/patients" };
  return { label: "Conheça outros recursos disponíveis no seu plano", ctaLabel: "Explorar recursos", route: "/painel/profile" };
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
  evolution_processing_too_long: { subject: "Sua evolução ainda está em processamento", preheader: "Acesse a plataforma para verificar o status.", body: "Uma evolução iniciada ainda não foi concluída. Acesse a plataforma para verificar o status.", cta_label: "Verificar evolução", cta_route: "/painel/history", category: "technical" },
  trial_expiring_3d: { subject: "Seu período de teste termina em 3 dias", preheader: "Conheça as opções para continuar.", body: "Seu período de teste termina em {{data_fim_teste}}. Conheça as opções disponíveis para continuar.", cta_label: "Conhecer os planos", cta_route: "/painel/subscription", category: "commercial", commercial: true },
  trial_expiring_1d: { subject: "Seu teste termina amanhã", preheader: "Continue com o Evolução Clínica.", body: "Seu período de teste termina amanhã. Conheça os planos disponíveis para continuar.", cta_label: "Continuar com o Evolução Clínica", cta_route: "/painel/subscription", category: "commercial", commercial: true },
  trial_expired: { subject: "Seu período de teste terminou", preheader: "Escolha uma opção de continuidade.", body: "Seu período de teste terminou. Para continuar utilizando os recursos disponíveis, escolha um plano.", cta_label: "Escolher um plano", cta_route: "/painel/subscription", category: "commercial", commercial: true },
  trial_recovery_2d: { subject: "Continue de onde você parou", preheader: "Retome sua organização quando estiver pronto.", body: "Você já começou a organizar sua rotina. Escolha um plano e retome sua conta quando desejar.", cta_label: "Retomar minha conta", cta_route: "/painel/subscription", category: "commercial", commercial: true },
  trial_recovery_7d: { subject: "O que impediu você de continuar?", preheader: "Conte o que dificultou sua continuidade.", body: "Gostaríamos de entender se algo dificultou sua continuidade. Sua resposta pode ajudar a melhorar a plataforma.", cta_label: "Contar o que aconteceu", cta_route: "/painel/support", category: "commercial", commercial: true },
  inactive_3d: { subject: "Seu próximo passo no Evolução Clínica", preheader: "Uma ação concreta para continuar sua organização.", body: "Você já iniciou sua organização no Evolução Clínica. Continue pela próxima ação disponível: {{titulo_proxima_acao}}.\n\n{{descricao_proxima_acao}}", cta_label: "{{texto_cta_proxima_acao}}", cta_route: "{{url_proxima_acao}}", category: "reactivation" },
  inactive_7d: { subject: "A semana ficou corrida?", preheader: "Comece por apenas uma ação.", body: "Se os registros ficaram para depois, abra a plataforma e retome um atendimento de cada vez.", cta_label: "Retomar meus registros", cta_route: "/painel/patients", category: "reactivation" },
  inactive_14d: { subject: "Algo dificultou o uso da plataforma?", preheader: "Estamos disponíveis para ajudar.", body: "Gostaríamos de saber se você encontrou alguma dificuldade durante o uso.", cta_label: "Preciso de ajuda", cta_route: "/painel/support", category: "reactivation" },
  subscription_started: { subject: "Sua assinatura do Evolução Clínica está ativa", preheader: "As próximas mensagens ajudarão na adoção da sua conta.", body: "Sua assinatura foi confirmada. Você pode continuar utilizando os recursos disponíveis no seu plano.", cta_label: "Acessar minha conta", cta_route: "/painel/dashboard", category: "transactional" },
  subscriber_low_usage: { subject: "Vamos aproveitar melhor sua assinatura?", preheader: "Escolha uma ação simples para retomar.", body: "Sua assinatura está ativa. Escolha uma ação simples para retomar o uso.", cta_label: "Continuar usando", cta_route: "/painel/dashboard", category: "retention" }
  ,evolution_processing_failed: { subject: "Não foi possível concluir sua evolução", preheader: "Confira a evolução e veja como continuar.", body: "Não foi possível concluir o processamento de uma evolução. Acesse a plataforma para verificar o status e, se necessário, fale com o suporte.", cta_label: "Verificar evolução", cta_route: "/painel/history", category: "operational" }
  ,evolution_not_added_to_record: { subject: "Sua evolução está pronta, mas falta adicioná-la ao prontuário", preheader: "Uma ação ficou pendente para concluir o registro.", body: "A evolução foi processada, mas ainda falta adicioná-la ao prontuário. Acesse a plataforma para concluir esse registro ou falar com o suporte.", cta_label: "Adicionar ao prontuário", cta_route: "/painel/history", category: "operational" }
  ,google_connection_interrupted: { subject: "Reconecte sua conta Google para continuar", preheader: "Reconecte o Google para continuar usando seus prontuários.", body: "A conexão com o Google precisa ser autorizada novamente. Reconecte sua conta para continuar acessando e atualizando seus prontuários.", cta_label: "Reconectar Google", cta_route: "/painel/dashboard", category: "operational" }
  ,subscription_payment_failed: { subject: "Não foi possível concluir o pagamento da sua assinatura", preheader: "Atualize sua forma de pagamento para verificar a situação da assinatura.", body: "Não foi possível concluir o pagamento da sua assinatura. {{bloco_status_acesso}} Atualize sua forma de pagamento ou fale com o suporte.", cta_label: "Atualizar pagamento", cta_route: "/painel/subscription", category: "billing" }
};

function createCandidate(rule: LifecycleRule, state: LifecycleState, now: Date, periodKey: string, reason: string): LifecycleCandidate {
  const fallback = FALLBACK_RULE_MESSAGES[rule.rule_key] || FALLBACK_RULE_MESSAGES.no_return_after_registration;
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

export function evaluateKnownRule(rule: LifecycleRule, state: LifecycleState, now = new Date(), operational?: LifecycleOperationalContext): LifecycleCandidate | null {
  if (!rule.enabled) return null;
  const trialDays = calculateTrialDaysRemaining(state.trialEndsAt, now);
  const loginAge = daysSince(state.lastLoginAt, now);
  const activityAge = daysSince(state.lastActivityAt || state.lastLoginAt, now);
  const period = now.toISOString().slice(0, 10);

  switch (rule.rule_key) {
    case "evolution_processing_failed": {
      const occurrence = operational?.failedEvolution;
      return occurrence ? { ...createCandidate(rule, state, now, `failed:${occurrence.id}:${occurrence.updatedAt || "unknown"}`, "falha terminal no processamento da evolução"), resourceId: occurrence.id, occurrenceId: occurrence.updatedAt || occurrence.id } : null;
    }
    case "evolution_not_added_to_record": {
      const occurrence = operational?.notAddedEvolution;
      return occurrence ? { ...createCandidate(rule, state, now, `append-failed:${occurrence.id}:${occurrence.updatedAt || "unknown"}`, "evolução concluída, mas não adicionada ao prontuário"), resourceId: occurrence.id, occurrenceId: occurrence.updatedAt || occurrence.id } : null;
    }
    case "google_connection_interrupted": {
      const occurrence = operational?.googleConnection;
      return occurrence ? { ...createCandidate(rule, state, now, `google:${occurrence.updatedAt || period}`, "conexão do Google interrompida"), resourceId: state.userId, occurrenceId: occurrence.updatedAt || period } : null;
    }
    case "subscription_payment_failed": {
      const occurrence = operational?.failedPayment;
      return occurrence ? { ...createCandidate(rule, state, now, `payment:${occurrence.id}:${occurrence.updatedAt || "unknown"}`, "falha no pagamento da assinatura"), resourceId: occurrence.id, occurrenceId: occurrence.updatedAt || occurrence.id } : null;
    }
    case "no_return_after_registration":
      return !state.lastLoginAt && hoursSince(state.onboardingCompletedAt || state.lastActivityAt, now) >= 24
        ? createCandidate(rule, state, now, `registration:${period}`, "sem novo acesso após 24 horas") : null;
    case "evolution_processing_too_long":
      return state.processingEvolutionsCount > 0
        ? createCandidate(rule, state, now, `processing:${period}`, "evolução em processamento") : null;
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
    case "inactive_3d": {
      const trialEndedWithoutSubscription = Boolean(state.trialEndsAt && new Date(state.trialEndsAt).getTime() <= now.getTime() && state.subscriptionStatus !== "active");
      const actionPendingAt = getContextualActionPendingAt(state);
      const pendingHours = Number(rule.condition_config?.pending_hours || 72);
      return !trialEndedWithoutSubscription && Boolean(actionPendingAt) && hoursSince(actionPendingAt, now) >= pendingHours && activityAge >= 3 && activityAge < 7
        ? createCandidate(rule, state, now, `inactive-3d:${actionPendingAt}`, "próxima ação concreta pendente há pelo menos 72 horas") : null;
    }
    case "inactive_7d":
      return !((state.trialEndsAt && new Date(state.trialEndsAt).getTime() <= now.getTime() && state.subscriptionStatus !== "active")) && activityAge >= Number(rule.condition_config?.days || 7) && activityAge < 14
        ? createCandidate(rule, state, now, `inactive-7d:${period}`, "sete dias sem acesso") : null;
    case "inactive_14d": {
      const trialEndedWithoutSubscription = Boolean(state.trialEndsAt && new Date(state.trialEndsAt).getTime() <= now.getTime() && state.subscriptionStatus !== "active");
      const subscriptionIsActive = state.subscriptionStatus === "active";
      const noPendingTechnicalError = state.failedEvolutionsCount === 0 && state.processingEvolutionsCount === 0;
      return !trialEndedWithoutSubscription && subscriptionIsActive && noPendingTechnicalError && activityAge >= Number(rule.condition_config?.days || 14)
        ? createCandidate(rule, state, now, `inactive-14d:${period}`, "quatorze dias sem acesso") : null;
    }
    case "subscription_started":
      return isSubscriber(state) && state.subscriptionStartedAt && hoursSince(state.subscriptionStartedAt, now) <= 48
        ? createCandidate(rule, state, now, `subscription-started:${state.subscriptionStartedAt}`, "assinatura ativa") : null;
    case "subscriber_low_usage":
      return isSubscriber(state) && daysSince(state.lastActivityAt || state.subscriptionStartedAt, now) >= Number(rule.condition_config?.days || 7)
        ? createCandidate(rule, state, now, `subscriber-low-usage:${period}`, "assinante com baixo uso") : null;
    default:
      return null;
  }
}

export function getNextActionCopy(state: LifecycleState, now = new Date()): { title: string; description: string } {
  if (state.patientsCount === 0) return { title: "Cadastre seu primeiro paciente", description: "Comece com apenas um paciente para conhecer o fluxo de organização da plataforma." };
  if (state.linkedRecordsCount === 0) return { title: "Prepare o prontuário", description: "Crie ou vincule um documento do Google Docs ao cadastro do paciente." };
  if (state.evolutionsCount === 0) return { title: "Crie sua primeira evolução", description: "Grave ou envie um resumo em áudio para experimentar a transcrição e a organização do registro." };
  if (state.evolutionsCount === 1) return { title: "Confira o histórico do paciente", description: "Acesse o prontuário, confira o conteúdo registrado e faça os ajustes necessários." };
  return { title: "Registre um atendimento recente", description: "Escolha um atendimento e retome seus registros, um de cada vez." };
}

export function getContextualActionPendingAt(state: LifecycleState): string | null {
  if (state.patientsCount === 0) return state.firstLoginAt || state.onboardingCompletedAt || state.lastActivityAt;
  if (state.linkedRecordsCount === 0) return state.firstPatientAt;
  if (state.evolutionsCount === 0) return state.firstRecordLinkedAt;
  if (state.evolutionsCount === 1) return state.firstEvolutionCompletedAt || state.latestEvolutionAt;
  return null;
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
