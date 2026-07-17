import { randomUUID } from "node:crypto";
import { LIFECYCLE_ACTIVATION_CAMPAIGN_KEY, LIFECYCLE_FAILURE_ALERT_COOLDOWN_MINUTES, LIFECYCLE_FAILURE_ALERT_THRESHOLD, LIFECYCLE_RETRY_DELAYS_MINUTES, type LifecycleRuntimeConfig } from "./lifecycleConstants.js";
import { getNextBestAction } from "./lifecycleRules.js";
import { ensureCommunicationToken, getLifecycleFailureAlertState, getLifecyclePreferences, getLifecycleRuntimeConfig, getUserProfile, saveLifecycleFailureAlertState, type LifecycleFailureAlertState } from "./lifecycleRepository.js";
import { getOrRecalculateLifecycleState } from "./lifecycleStateService.js";
import { escapeLifecycleHtml, renderLifecycleMessage, renderSafeLifecycleMarkdown, resolveLifecycleUrl } from "./lifecycleRenderer.js";
import { renderLifecycleTemplate } from "./templates/tokenRegistry.js";
import type { LifecycleDependencies, LifecycleState } from "./lifecycleTypes.js";

function buildContext(state: LifecycleState, origin: string, now: Date) {
  const action = getNextBestAction(state);
  return {
    primeiro_nome: state.fullName.trim().split(/\s+/)[0] || "Profissional",
    nome_completo: state.fullName,
    profissao: state.profession || "profissional",
    quantidade_pacientes: state.patientsCount,
    quantidade_prontuarios: state.linkedRecordsCount,
    quantidade_evolucoes: state.evolutionsCount,
    resumo_progresso: "",
    quantidade_audios: state.audioEvolutionsCount,
    quantidade_documentos: state.reportsCount,
    quantidade_recursos: state.resourcesCount,
    plano_atual: state.subscriptionPlan || "seu plano atual",
    data_fim_teste: state.trialEndsAt ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(state.trialEndsAt)) : "",
    dias_restantes_teste: state.trialEndsAt ? Math.max(0, Math.ceil((new Date(state.trialEndsAt).getTime() - now.getTime()) / 86400000)) : 0,
    proxima_acao: action.label,
    texto_cta_proxima_acao: action.label,
    link_acao: action.route,
    link_suporte: `${origin.replace(/\/$/, "")}/painel/support`
  };
}

async function markSuppressed(deps: LifecycleDependencies, dispatch: any, reason: string) {
  await deps.supabaseAdmin.from("lifecycle_dispatches").update({ status: "suppressed", skip_reason: reason, skipped_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", dispatch.id);
}

async function markSkipped(deps: LifecycleDependencies, dispatch: any, reason: string) {
  await deps.supabaseAdmin.from("lifecycle_dispatches").update({ status: "skipped", skip_reason: reason, skipped_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", dispatch.id);
}

async function markFailure(deps: LifecycleDependencies, dispatch: any, error: unknown) {
  const message = String(error instanceof Error ? error.message : error || "Falha desconhecida").slice(0, 500);
  const attempt = Number(dispatch.attempt_count || 1);
  const shouldRetry = attempt < Number(dispatch.max_attempts || 3);
  const delayMinutes = LIFECYCLE_RETRY_DELAYS_MINUTES[Math.min(attempt, LIFECYCLE_RETRY_DELAYS_MINUTES.length - 1)] || 120;
  await deps.supabaseAdmin.from("lifecycle_dispatches").update({
    status: shouldRetry ? "retry" : "failed",
    next_attempt_at: shouldRetry ? new Date(Date.now() + delayMinutes * 60000).toISOString() : null,
    failed_at: shouldRetry ? null : new Date().toISOString(),
    failure_reason: message,
    updated_at: new Date().toISOString()
  }).eq("id", dispatch.id);
}

async function advanceSequenceEnrollment(deps: LifecycleDependencies, dispatch: any, step: any) {
  if (dispatch.dispatch_type !== "sequence" || !dispatch.enrollment_id || !step?.position) return;

  const { data: enrollment, error: enrollmentError } = await deps.supabaseAdmin
    .from("lifecycle_enrollments")
    .select("id, current_position, status, started_at, enrolled_at")
    .eq("id", dispatch.enrollment_id)
    .maybeSingle();
  if (enrollmentError) throw new Error(enrollmentError.message || "Falha ao consultar matrícula após envio lifecycle.");
  if (!enrollment || enrollment.status !== "active") return;

  const sentPosition = Number(step.position);
  if (Number(enrollment.current_position || 0) >= sentPosition) return;

  const { data: nextStep, error: nextStepError } = await deps.supabaseAdmin
    .from("lifecycle_steps")
    .select("position, wait_minutes")
    .eq("campaign_id", dispatch.campaign_id)
    .eq("status", "active")
    .eq("enabled", true)
    .gt("position", sentPosition)
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (nextStepError) throw new Error(nextStepError.message || "Falha ao consultar próximo passo lifecycle.");

  const startedAt = new Date(enrollment.started_at || enrollment.enrolled_at).getTime();
  const nextStepAt = nextStep ? new Date(startedAt + Number(nextStep.wait_minutes || 0) * 60000).toISOString() : null;

  const { error: updateError } = await deps.supabaseAdmin
    .from("lifecycle_enrollments")
    .update({
      current_position: sentPosition,
      next_step_at: nextStepAt,
      updated_at: new Date().toISOString()
    })
    .eq("id", enrollment.id)
    .lt("current_position", sentPosition);
  if (updateError) throw new Error(updateError.message || "Falha ao avançar matrícula lifecycle.");
}

function getFailureAlertThreshold() {
  const configured = Number(process.env.LIFECYCLE_FAILURE_ALERT_THRESHOLD);
  return Number.isFinite(configured) && configured >= 1 ? Math.min(Math.floor(configured), 100) : LIFECYCLE_FAILURE_ALERT_THRESHOLD;
}

function getFailureAlertCooldownMinutes() {
  const configured = Number(process.env.LIFECYCLE_FAILURE_ALERT_COOLDOWN_MINUTES);
  return Number.isFinite(configured) && configured >= 1 ? Math.min(Math.floor(configured), 1440) : LIFECYCLE_FAILURE_ALERT_COOLDOWN_MINUTES;
}

async function sendLifecycleFailureAlert(
  deps: LifecycleDependencies,
  details: { consecutiveFailures: number; dispatchId: string; reason: string }
) {
  if (!deps.getAdminRecipients) {
    console.warn("[Lifecycle Alert] Lista de administradores não configurada; alerta não enviado.");
    return false;
  }

  const recipients = (await deps.getAdminRecipients()).filter((recipient) => String(recipient.google_email || "").trim());
  if (!recipients.length) {
    console.warn("[Lifecycle Alert] Nenhum administrador com e-mail cadastrado.");
    return false;
  }

  const now = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const safeReason = escapeLifecycleHtml(details.reason || "Falha não informada");
  const lifecycleUrl = `${deps.productionOrigin.replace(/\/$/, "")}/admin/lifecycle`;
  const subject = "[Evolução Clínica] Alerta: falhas consecutivas na fila de e-mails";
  const textContent = [
    "A fila de comunicações da Jornada de Usuários registrou falhas consecutivas de disparo.",
    `Falhas consecutivas: ${details.consecutiveFailures}`,
    `Última falha: ${details.reason || "Falha não informada"}`,
    `Dispatch afetado: ${details.dispatchId}`,
    `Horário: ${now}`,
    `Painel de monitoramento: ${lifecycleUrl}`
  ].join("\n");

  const theme = await deps.getEmailTheme();
  const htmlContent = deps.buildEmailShell(theme, {
    title: "Falhas consecutivas na fila de e-mails",
    subtitle: "A Jornada de Usuários precisa de atenção.",
    eyebrow: "Alerta operacional",
    bodyHtml: `<p style="font-size:15px;line-height:1.6;margin:0 0 16px 0;">A fila de comunicações registrou <strong>${details.consecutiveFailures} falhas consecutivas</strong> de disparo.</p><p style="font-size:14px;line-height:1.6;margin:0 0 8px 0;"><strong>Última falha:</strong> ${safeReason}</p><p style="font-size:14px;line-height:1.6;margin:0 0 20px 0;"><strong>Dispatch:</strong> ${escapeLifecycleHtml(details.dispatchId)}<br><strong>Horário:</strong> ${escapeLifecycleHtml(now)}</p><div style="text-align:center">${deps.buildEmailButton(theme, lifecycleUrl, "Abrir monitoramento")}</div>`,
    footerHtml: "Este alerta é enviado automaticamente pelo worker da Jornada de Usuários."
  });

  const settings = await deps.getNotificationSettings();
  const results = await Promise.all(recipients.map(async (recipient) => {
    try {
      await deps.sendTransactionalEmail(settings, {
        userId: null,
        recipientEmail: String(recipient.google_email).trim(),
        recipientName: recipient.full_name || "Administrador",
        subject,
        textContent,
        htmlContent,
        source: "lifecycle-alert",
        allowFallback: true
      });
      return true;
    } catch (error) {
      console.error(`[Lifecycle Alert] Falha ao notificar ${recipient.google_email}:`, error instanceof Error ? error.message : error);
      return false;
    }
  }));

  return results.some(Boolean);
}

async function registerLifecycleFailure(
  deps: LifecycleDependencies,
  details: { dispatchId: string; reason: string }
) {
  try {
    const state = await getLifecycleFailureAlertState(deps);
    const now = new Date();
    const nowIso = now.toISOString();
    const consecutiveFailures = state.consecutive_failures + 1;
    const lastAttemptAt = state.last_alert_attempt_at ? new Date(state.last_alert_attempt_at).getTime() : 0;
    const cooldownElapsed = !lastAttemptAt || now.getTime() - lastAttemptAt >= getFailureAlertCooldownMinutes() * 60 * 1000;
    const shouldAttemptAlert = consecutiveFailures >= getFailureAlertThreshold() && !state.last_alert_sent_at && cooldownElapsed;
    const nextState: LifecycleFailureAlertState = {
      ...state,
      consecutive_failures: consecutiveFailures,
      last_failure_at: nowIso,
      last_failure_reason: details.reason.slice(0, 500),
      last_failure_dispatch_id: details.dispatchId,
      last_alert_attempt_at: shouldAttemptAlert ? nowIso : state.last_alert_attempt_at
    };

    await saveLifecycleFailureAlertState(deps, nextState);
    if (!shouldAttemptAlert) return;

    const sent = await sendLifecycleFailureAlert(deps, {
      consecutiveFailures,
      dispatchId: details.dispatchId,
      reason: details.reason
    });
    if (sent) await saveLifecycleFailureAlertState(deps, { ...nextState, last_alert_sent_at: nowIso });
  } catch (error) {
    console.error("[Lifecycle Alert] Falha ao atualizar/enviar alerta operacional:", error instanceof Error ? error.message : error);
  }
}

async function registerLifecycleSuccess(deps: LifecycleDependencies) {
  try {
    const state = await getLifecycleFailureAlertState(deps);
    if (state.consecutive_failures === 0 && !state.last_alert_sent_at && !state.last_failure_at) return;
    await saveLifecycleFailureAlertState(deps, {
      consecutive_failures: 0,
      last_failure_at: null,
      last_failure_reason: null,
      last_failure_dispatch_id: null,
      last_alert_attempt_at: null,
      last_alert_sent_at: null
    });
  } catch (error) {
    console.error("[Lifecycle Alert] Falha ao resetar sequência de falhas:", error instanceof Error ? error.message : error);
  }
}

function messageFromConfig(dispatch: any, step: any, rule: any) {
  if (step) {
    return {
      subject_template: step.subject_template,
      preheader_template: step.preheader_template,
      body_markdown: step.body_markdown,
      cta_label_template: step.cta_label_template,
      cta_route_template: step.cta_route_template || step.fallback_cta_route,
      category: step.category || "education",
      commercial: step.category === "commercial"
    };
  }
  const config = rule?.message_config || {};
  return {
    subject_template: config.subject || "Uma orientação do Evolução Clínica",
    preheader_template: config.preheader || "Continue de onde parou.",
    body_markdown: config.body || "Acesse a plataforma para continuar.",
    cta_label_template: config.cta_label || "Acessar a plataforma",
    cta_route_template: config.cta_route || "/painel/dashboard",
    category: config.category || "activation",
    commercial: config.commercial === true || config.category === "commercial"
  };
}

async function validateProcessingAlert(
  deps: LifecycleDependencies,
  dispatch: any,
  rule: any,
  runtime: LifecycleRuntimeConfig
) {
  if (rule?.rule_key !== "evolution_processing_too_long") return null;

  if (runtime.global_outage === true || process.env.LIFECYCLE_GLOBAL_OUTAGE === "true") {
    return "known_global_outage";
  }

  const evolutionId = dispatch.metadata?.processing_evolution_id;
  const query = deps.supabaseAdmin
    .from("evolutions")
    .select("id, transcription_status, google_doc_append_status, created_at, updated_at")
    .eq("professional_id", dispatch.user_id);
  const { data: evolutions, error } = evolutionId
    ? await query.eq("id", evolutionId).limit(1)
    : await query.or("transcription_status.eq.processing,google_doc_append_status.eq.pending").order("created_at", { ascending: true });
  if (error) throw new Error(error.message || "Falha ao confirmar o status da evolução pendente.");

  const threshold = Date.now() - Number(rule.delay_minutes || 120) * 60000;
  const pending = (evolutions || []).find((evolution: any) => {
    const isPending = evolution.transcription_status === "processing" || evolution.google_doc_append_status === "pending";
    const referenceTime = new Date(evolution.updated_at || evolution.created_at || 0).getTime();
    return isPending && Number.isFinite(referenceTime) && referenceTime <= threshold;
  });
  if (!pending) return "processing_resolved_or_below_threshold";

  const { data: previousAlerts, error: previousAlertsError } = await deps.supabaseAdmin
    .from("lifecycle_dispatches")
    .select("id, metadata")
    .eq("user_id", dispatch.user_id)
    .eq("rule_id", rule.id)
    .eq("status", "sent")
    .neq("id", dispatch.id);
  if (previousAlertsError) throw new Error(previousAlertsError.message || "Falha ao verificar alerta duplicado.");
  if ((previousAlerts || []).some((item: any) => item.metadata?.processing_evolution_id === pending.id)) {
    return "processing_already_notified";
  }

  return null;
}

async function validateLinkedRecordWithoutEvolution(deps: LifecycleDependencies, userId: string) {
  const [{ count: linkedRecords, error: linkedRecordsError }, { count: completedEvolutions, error: completedEvolutionsError }] = await Promise.all([
    deps.supabaseAdmin.from("patients").select("id", { count: "exact", head: true }).eq("professional_id", userId).not("google_doc_id", "is", null).neq("google_doc_id", ""),
    deps.supabaseAdmin.from("evolutions").select("id", { count: "exact", head: true }).eq("professional_id", userId).eq("transcription_status", "completed").eq("google_doc_append_status", "completed")
  ]);
  if (linkedRecordsError) throw new Error(linkedRecordsError.message || "Falha ao confirmar prontuários vinculados.");
  if (completedEvolutionsError) throw new Error(completedEvolutionsError.message || "Falha ao confirmar evoluções concluídas.");
  if (!Number(linkedRecords || 0)) return "no_linked_record";
  if (Number(completedEvolutions || 0) > 0) return "evolution_already_completed";
  return null;
}

async function validateTrialExpiringOneDay(deps: LifecycleDependencies, userId: string) {
  const { data: professional, error } = await deps.supabaseAdmin
    .from("professionals")
    .select("subscription_status, trial_ends_at")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message || "Falha ao confirmar o status do trial.");
  if (professional?.subscription_status === "active") return "trial_already_subscribed";

  const trialEndsAt = professional?.trial_ends_at ? new Date(professional.trial_ends_at).getTime() : 0;
  const remainingHours = (trialEndsAt - Date.now()) / 3600000;
  if (!Number.isFinite(trialEndsAt) || remainingHours <= 0) return "trial_expired_or_no_longer_valid";
  if (remainingHours > 24) return "trial_was_extended_or_not_within_24_hours";
  return null;
}

async function validateTrialExpiringThreeDays(deps: LifecycleDependencies, userId: string) {
  const { data: professional, error } = await deps.supabaseAdmin
    .from("professionals")
    .select("subscription_status, trial_ends_at")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message || "Falha ao confirmar o status do trial.");
  if (professional?.subscription_status === "active") return "trial_already_subscribed";
  if (professional?.subscription_status !== "trialing") return "trial_no_longer_active";

  const trialEndsAt = professional?.trial_ends_at ? new Date(professional.trial_ends_at).getTime() : 0;
  const remainingHours = (trialEndsAt - Date.now()) / 3600000;
  if (!Number.isFinite(trialEndsAt) || remainingHours <= 0) return "trial_expired_or_no_longer_valid";
  if (remainingHours <= 24 || remainingHours > 72) return "trial_was_extended_or_not_within_3_days";
  return null;
}

async function processOneDispatch(deps: LifecycleDependencies, dispatch: any, runtime: LifecycleRuntimeConfig) {
  if (!runtime.send_enabled || runtime.dry_run) {
    await markSuppressed(deps, dispatch, "dry_run_or_sending_disabled");
    return { status: "suppressed" };
  }

  if (!dispatch.enrollment_id) {
    await markSuppressed(deps, dispatch, "enrollment_inactive");
    return { status: "suppressed" };
  }
  const { data: enrollment, error: enrollmentError } = await deps.supabaseAdmin
    .from("lifecycle_enrollments")
    .select("status, campaign_id")
    .eq("id", dispatch.enrollment_id)
    .maybeSingle();
  if (enrollmentError) throw new Error(enrollmentError.message || "Falha ao consultar matrícula lifecycle.");
  if (enrollment?.status !== "active") {
    await markSuppressed(deps, dispatch, "enrollment_inactive");
    return { status: "suppressed" };
  }
  const { data: enrollmentCampaign, error: enrollmentCampaignError } = await deps.supabaseAdmin
    .from("lifecycle_campaigns")
    .select("key")
    .eq("id", enrollment.campaign_id)
    .maybeSingle();
  if (enrollmentCampaignError) throw new Error(enrollmentCampaignError.message || "Falha ao consultar campanha lifecycle.");
  if (enrollmentCampaign?.key !== LIFECYCLE_ACTIVATION_CAMPAIGN_KEY) {
    await markSuppressed(deps, dispatch, "activation_enrollment_inactive");
    return { status: "suppressed" };
  }

  const [profile, preferences, stateResult, stepResult, ruleResult] = await Promise.all([
    getUserProfile(deps, dispatch.user_id),
    getLifecyclePreferences(deps, dispatch.user_id),
    getOrRecalculateLifecycleState(deps, dispatch.user_id),
    dispatch.step_id ? deps.supabaseAdmin.from("lifecycle_steps").select("*").eq("id", dispatch.step_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    dispatch.rule_id ? deps.supabaseAdmin.from("lifecycle_rules").select("*").eq("id", dispatch.rule_id).maybeSingle() : Promise.resolve({ data: null, error: null })
  ]);
  const processingValidationReason = await validateProcessingAlert(deps, dispatch, ruleResult.data, runtime);
  if (processingValidationReason) {
    await markSuppressed(deps, dispatch, processingValidationReason);
    return { status: "suppressed" };
  }
  if (ruleResult.data?.rule_key === "linked_record_without_evolution") {
    const skipReason = await validateLinkedRecordWithoutEvolution(deps, dispatch.user_id);
    if (skipReason) {
      await markSkipped(deps, dispatch, skipReason);
      return { status: "skipped" };
    }
  }
  if (ruleResult.data?.rule_key === "trial_expiring_1d") {
    const skipReason = await validateTrialExpiringOneDay(deps, dispatch.user_id);
    if (skipReason) {
      await markSkipped(deps, dispatch, skipReason);
      return { status: "skipped" };
    }
  }
  if (ruleResult.data?.rule_key === "trial_expiring_3d") {
    const skipReason = await validateTrialExpiringThreeDays(deps, dispatch.user_id);
    if (skipReason) {
      await markSkipped(deps, dispatch, skipReason);
      return { status: "skipped" };
    }
  }
  if (!profile?.google_email) throw new Error("destinatário sem e-mail cadastrado");
  if (!preferences.lifecycle_enabled || (dispatch.metadata?.commercial && !preferences.commercial_enabled)) {
    await markSuppressed(deps, dispatch, !preferences.lifecycle_enabled ? "lifecycle_unsubscribed" : "commercial_unsubscribed");
    return { status: "suppressed" };
  }
  if (stateResult.subscriptionStatus === "active" && dispatch.metadata?.commercial) {
    await markSuppressed(deps, dispatch, "subscriber_commercial_message_cancelled");
    return { status: "suppressed" };
  }

  const now = new Date();
  const context = buildContext(stateResult, deps.productionOrigin, now);
  const config = messageFromConfig(dispatch, stepResult.data, ruleResult.data);
  const rendered = renderLifecycleMessage({
    subjectTemplate: config.subject_template,
    preheaderTemplate: config.preheader_template,
    bodyTemplate: config.body_markdown,
    ctaLabelTemplate: config.cta_label_template,
    ctaRouteTemplate: config.cta_route_template,
    context
  });

  // Duplicate email sending mitigation if a previous run sent the email but database update failed
  const emailSource = dispatch.dispatch_type === "conditional" ? "lifecycle-conditional" : "lifecycle";
  const { data: existingDelivery, error: checkError } = await deps.supabaseAdmin
    .from("email_deliveries")
    .select("id")
    .eq("user_id", dispatch.user_id)
    .eq("subject", rendered.subject)
    .eq("source", emailSource)
    .eq("status", "sent")
    .gt("created_at", new Date(Date.now() - 30 * 60 * 1000).toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const existingEmailDelivery = !checkError && existingDelivery && dispatch.metadata?.force_resend !== true
    ? existingDelivery
    : null;
  if (existingEmailDelivery) {
    console.warn(`[Lifecycle Worker] E-mail já enviado anteriormente para o dispatch ${dispatch.id}; continuando para garantir o push.`);
  }

  const unsubscribeToken = await ensureCommunicationToken(deps, dispatch.user_id);
  const preferencesUrl = `${deps.productionOrigin}/preferencias-de-comunicacao`;
  const unsubscribeUrl = `${deps.productionOrigin}/descadastro?token=${encodeURIComponent(unsubscribeToken)}`;
  const actionUrl = resolveLifecycleUrl(deps.productionOrigin, rendered.ctaRoute);

  const forceEmailOnly = dispatch.metadata?.force_email_only === true;
  const emailEnabled = preferences.email_enabled !== false;
  const pushEnabled = !forceEmailOnly && preferences.push_enabled !== false;
  const whatsappEnabled = !forceEmailOnly && preferences.whatsapp_enabled !== false;
  const whatsappNumber = String(preferences.whatsapp_number || "").trim();

  if (forceEmailOnly && !emailEnabled) {
    await markSuppressed(deps, dispatch, "email_disabled");
    return { status: "suppressed" };
  }

  if (!emailEnabled && !pushEnabled && (!whatsappEnabled || !whatsappNumber)) {
    await markSuppressed(deps, dispatch, "no_active_channels");
    return { status: "suppressed" };
  }

  let emailDeliveryId: string | null = existingEmailDelivery?.id || null;
  let emailProvider = "smtp";
  let emailSent = Boolean(existingEmailDelivery);
  let emailFailureReason: string | null = null;
  let pushSent = false;
  let whatsappSent = false;

  // A. Enviar E-mail
  if (emailEnabled && !existingEmailDelivery) {
    try {
      const theme = await deps.getEmailTheme();
      const htmlContent = deps.buildEmailShell(theme, {
        title: escapeLifecycleHtml(rendered.subject),
        subtitle: escapeLifecycleHtml(rendered.preheader),
        headerEyebrow: "Jornada de Usuários",
        bodyHtml: `${rendered.bodyHtml}<div style="text-align:center;margin:28px 0 8px 0;">${deps.buildEmailButton(theme, actionUrl, escapeLifecycleHtml(rendered.ctaLabel))}</div>`,
        footerHtml: `Esta mensagem foi enviada automaticamente pela nossa plataforma.<br/>Por favor, não responda a este e-mail.<br/><a href="${escapeLifecycleHtml(preferencesUrl)}">Preferências de comunicação</a> · <a href="${escapeLifecycleHtml(unsubscribeUrl)}">Descadastrar e-mails de relacionamento</a> · <a href="${escapeLifecycleHtml(resolveLifecycleUrl(deps.productionOrigin, "/painel/support"))}">Suporte</a>`
      });
      const settings = await deps.getNotificationSettings();
      const result = await deps.sendTransactionalEmail(settings, {
        userId: dispatch.user_id,
        recipientEmail: profile.google_email,
        recipientName: profile.full_name || "Profissional",
        subject: rendered.subject,
        textContent: `${rendered.text}\n\n${rendered.ctaLabel}: ${actionUrl}\n\nEsta mensagem foi enviada automaticamente pela nossa plataforma.\nPor favor, não responda a este e-mail.\n\nPreferências: ${preferencesUrl}\nDescadastro: ${unsubscribeUrl}`,
        htmlContent,
        source: dispatch.dispatch_type === "conditional" ? "lifecycle-conditional" : "lifecycle",
        allowFallback: true
      });
      emailDeliveryId = result.emailDeliveryId || null;
      emailProvider = result.provider;
      emailSent = true;
    } catch (emailErr) {
      emailFailureReason = String(emailErr instanceof Error ? emailErr.message : emailErr || "Falha desconhecida ao enviar e-mail.").slice(0, 500);
      console.error(`[Lifecycle Queue] Falha ao enviar e-mail para usuário ${dispatch.user_id}:`, emailErr);
      if (!pushEnabled && !whatsappEnabled) {
        throw emailErr;
      }
    }
  }

  // B. Enviar Push Notification
  if (pushEnabled && deps.sendPushNotification) {
    try {
      const pushText = rendered.preheader || rendered.text.slice(0, 120);
      const pushSuccess = await deps.sendPushNotification(
        dispatch.user_id,
        rendered.subject,
        pushText,
        actionUrl
      );
      pushSent = pushSuccess;
      if (pushSuccess) {
        console.log(`[Lifecycle Queue] Push enviado com sucesso para o usuário ${dispatch.user_id}`);
      }
    } catch (pushErr) {
      console.warn(`[Lifecycle Queue] Falha ao enviar Push para usuário ${dispatch.user_id}:`, pushErr);
    }
  }

  // C. Enviar WhatsApp
  if (whatsappEnabled && whatsappNumber && deps.sendWhatsAppNotification) {
    try {
      const waText = `*${rendered.subject}*\n\n${rendered.text}\n\n👉 *Acesse aqui:* ${actionUrl}`;
      const waSuccess = await deps.sendWhatsAppNotification(
        dispatch.user_id,
        whatsappNumber,
        waText
      );
      whatsappSent = waSuccess;
      if (waSuccess) {
        console.log(`[Lifecycle Queue] WhatsApp enviado com sucesso para o número ${whatsappNumber}`);
      }
    } catch (waErr) {
      console.warn(`[Lifecycle Queue] Falha ao enviar WhatsApp para o número ${whatsappNumber}:`, waErr);
    }
  }

  const channelDelivery = {
    email: emailEnabled ? (emailSent ? "sent" : "failed") : "disabled",
    push: pushEnabled ? (pushSent ? "sent" : "failed") : "disabled",
    whatsapp: whatsappEnabled
      ? (whatsappNumber ? (whatsappSent ? "sent" : "failed") : "not_configured")
      : "disabled"
  };

  await deps.supabaseAdmin.from("lifecycle_dispatches").update({
    status: "sent",
    sent_at: new Date().toISOString(),
    email_delivery_id: emailDeliveryId,
    rendered_subject: rendered.subject,
    rendered_preheader: rendered.preheader,
    rendered_text: rendered.text,
    metadata: {
      ...(dispatch.metadata || {}),
      channel_delivery: channelDelivery,
      channel_delivery_updated_at: new Date().toISOString()
    },
    updated_at: new Date().toISOString()
  }).eq("id", dispatch.id);
  try {
    await advanceSequenceEnrollment(deps, dispatch, stepResult.data);
  } catch (advanceError) {
    console.error(`[Lifecycle Queue] E-mail enviado, mas não foi possível avançar a matrícula ${dispatch.enrollment_id}:`, advanceError);
  }

  if (dispatch.dispatch_type !== "transactional_bridge") {
    await deps.supabaseAdmin.from("lifecycle_user_state").update({
      last_relationship_email_at: new Date().toISOString(),
      next_relationship_email_eligible_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString()
    }).eq("user_id", dispatch.user_id);
  }
  return { status: "sent", provider: emailSent ? emailProvider : "other", deliveryFailure: emailFailureReason };
}

export async function processLifecycleDispatchById(deps: LifecycleDependencies, dispatchId: string) {
  const runtime = await getLifecycleRuntimeConfig(deps);
  const workerId = `lifecycle-manual:${randomUUID()}`;
  const { data: dispatch, error: dispatchError } = await deps.supabaseAdmin
    .from("lifecycle_dispatches")
    .select("*")
    .eq("id", dispatchId)
    .in("status", ["queued", "retry"])
    .maybeSingle();
  if (dispatchError) throw new Error(dispatchError.message || "Falha ao consultar o disparo lifecycle.");
  if (!dispatch) return { status: "unavailable" };

  const { data: claimed, error: claimError } = await deps.supabaseAdmin
    .from("lifecycle_dispatches")
    .update({
      status: "processing",
      claimed_at: new Date().toISOString(),
      claimed_by: workerId,
      attempt_count: Number(dispatch.attempt_count || 0) + 1,
      updated_at: new Date().toISOString()
    })
    .eq("id", dispatchId)
    .in("status", ["queued", "retry"])
    .select("*")
    .maybeSingle();
  if (claimError) throw new Error(claimError.message || "Falha ao iniciar o envio lifecycle.");
  if (!claimed) return { status: "unavailable" };

  try {
    const result = await processOneDispatch(deps, claimed, runtime);
    if (runtime.send_enabled && !runtime.dry_run) {
      if (result.deliveryFailure) {
        await registerLifecycleFailure(deps, { dispatchId: claimed.id, reason: result.deliveryFailure });
      } else {
        await registerLifecycleSuccess(deps);
      }
    }
    const { data: updated } = await deps.supabaseAdmin
      .from("lifecycle_dispatches")
      .select("status, skip_reason, failure_reason, email_delivery_id")
      .eq("id", claimed.id)
      .maybeSingle();
    return { ...result, ...(updated || {}) };
  } catch (error) {
    await markFailure(deps, claimed, error);
    const reason = String(error instanceof Error ? error.message : error || "Falha desconhecida").slice(0, 500);
    if (runtime.send_enabled && !runtime.dry_run) {
      await registerLifecycleFailure(deps, { dispatchId: claimed.id, reason });
    }
    const { data: updated } = await deps.supabaseAdmin
      .from("lifecycle_dispatches")
      .select("status, skip_reason, failure_reason, email_delivery_id")
      .eq("id", claimed.id)
      .maybeSingle();
    return { status: updated?.status || "failed", failure_reason: updated?.failure_reason || reason, ...(updated || {}) };
  }
}

export async function processLifecycleDispatches(deps: LifecycleDependencies, batchSize?: number) {
  const runtime = await getLifecycleRuntimeConfig(deps);
  const workerId = `lifecycle-worker:${randomUUID()}`;
  const { data: claimed, error } = await deps.supabaseAdmin.rpc("claim_lifecycle_dispatches", { p_worker_id: workerId, p_batch_size: batchSize || runtime.max_batch_size });
  if (error) throw new Error(error.message || "Falha ao reivindicar dispatches lifecycle.");
  const results: Record<string, number> = { sent: 0, suppressed: 0, failed: 0 };
  for (const dispatch of claimed || []) {
    try {
      const result = await processOneDispatch(deps, dispatch, runtime);
      results[result.status] = (results[result.status] || 0) + 1;
      if (runtime.send_enabled && !runtime.dry_run) {
        if (result.deliveryFailure) {
          await registerLifecycleFailure(deps, { dispatchId: dispatch.id, reason: result.deliveryFailure });
        } else {
          await registerLifecycleSuccess(deps);
        }
      }
    } catch (error) {
      results.failed += 1;
      await markFailure(deps, dispatch, error);
      console.error(`[Lifecycle Worker] Falha no dispatch ${dispatch.id}:`, error instanceof Error ? error.message : error);
      if (runtime.send_enabled && !runtime.dry_run) {
        await registerLifecycleFailure(deps, {
          dispatchId: dispatch.id,
          reason: String(error instanceof Error ? error.message : error || "Falha desconhecida").slice(0, 500)
        });
      }
    }
  }
  return { workerId, claimed: claimed?.length || 0, ...results, dryRun: runtime.dry_run || !runtime.send_enabled };
}
