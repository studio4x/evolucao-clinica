import { randomUUID } from "node:crypto";
import { getNextBestAction, chooseHighestPriority, evaluateKnownRule } from "./lifecycleRules.js";
import { getLifecyclePreferences, getLifecycleRuntimeConfig, ensureLifecycleEnrollment, getUserProfile, findCampaign, recordLifecycleEvent, suppressLifecycleDispatches, updateLifecyclePreferences, hashCommunicationToken } from "./lifecycleRepository.js";
import { recalculateLifecycleUserState } from "./lifecycleStateService.js";
import { processLifecycleDispatchById, processLifecycleDispatches } from "./lifecycleQueue.js";
import { scheduleLifecycleMessages } from "./lifecycleScheduler.js";
import { renderLifecycleMessage, resolveLifecycleUrl } from "./lifecycleRenderer.js";
import { LIFECYCLE_ACTIVATION_CAMPAIGN_KEY } from "./lifecycleConstants.js";
import { LIFECYCLE_EVENT_NAMES, type LifecycleDependencies, type LifecycleEventName } from "./lifecycleTypes.js";

function asyncRoute(handler: (req: any, res: any) => Promise<unknown>) {
  return (req: any, res: any) => handler(req, res).catch((error) => {
    console.error("[Lifecycle API]", error instanceof Error ? error.message : error);
    if (!res.headersSent) res.status(500).json({ error: error instanceof Error ? error.message : "Erro interno do lifecycle." });
  });
}

function cronAuthorized(req: any, deps: LifecycleDependencies): { ok: boolean; missing: boolean } {
  const production = process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);
  if (production && !deps.cronSecret) return { ok: false, missing: true };
  if (!deps.cronSecret) return { ok: true, missing: false };
  return { ok: req.headers.authorization === "Bearer " + deps.cronSecret, missing: false };
}

async function countRows(deps: LifecycleDependencies, table: string, filters: Array<[string, string, unknown]> = []) {
  let query = deps.supabaseAdmin.from(table).select("id", { count: "exact", head: true });
  for (const [method, column, value] of filters) query = query[method](column, value);
  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return count || 0;
}

function mapContext(state: any, origin: string) {
  const action = getNextBestAction(state);
  return {
    primeiro_nome: state.fullName?.split(/\s+/)[0] || "Profissional",
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
    data_fim_teste: state.trialEndsAt || "",
    dias_restantes_teste: state.trialEndsAt ? Math.max(0, Math.ceil((new Date(state.trialEndsAt).getTime() - Date.now()) / 86400000)) : 0,
    proxima_acao: action.label,
    texto_cta_proxima_acao: action.ctaLabel,
    link_acao: action.route,
    link_suporte: origin + "/painel/support"
  };
}

const CONTINUITY_FEEDBACK_OPTIONS = [
  "Não tive tempo suficiente para testar",
  "Tive dificuldade para conectar minha conta Google",
  "Não consegui criar a primeira evolução",
  "Tive dificuldade para entender como a plataforma funciona",
  "O valor dos planos não se encaixa no momento",
  "Senti falta de alguma funcionalidade",
  "A plataforma não se adaptou à minha rotina",
  "Encontrei um problema técnico",
  "Decidi utilizar outra solução",
  "Outro motivo"
] as const;

export function createLifecycleService(deps: LifecycleDependencies) {
  return {
    recordEvent: (input: Parameters<typeof recordLifecycleEvent>[1]) => recordLifecycleEvent(deps, input),
    ensureEnrollment: (userId: string, options?: { campaignKey?: string; force?: boolean }) => ensureLifecycleEnrollment(deps, userId, options),
    registerRoutes(app: any, middleware: { requireAuth: any; requireAdmin: any }) {
      app.post("/api/lifecycle/continuity-feedback", asyncRoute(async (req, res) => {
        const token = String(req.body?.token || "").trim();
        const reason = String(req.body?.reason || "").trim();
        const comment = String(req.body?.comment || "").trim().slice(0, 2000);
        if (token.length < 32 || !CONTINUITY_FEEDBACK_OPTIONS.includes(reason as typeof CONTINUITY_FEEDBACK_OPTIONS[number])) {
          return res.status(400).json({ error: "Link ou motivo inválido." });
        }
        const tokenHash = hashCommunicationToken(token);
        const { data: preferences, error: preferencesError } = await deps.supabaseAdmin
          .from("communication_preferences")
          .select("user_id")
          .eq("unsubscribe_token_hash", tokenHash)
          .maybeSingle();
        if (preferencesError) throw new Error(preferencesError.message);
        if (!preferences?.user_id) return res.status(404).json({ error: "Link de feedback inválido ou expirado." });

        const technicalReasons = new Set(["Tive dificuldade para conectar minha conta Google", "Encontrei um problema técnico"]);
        const category = technicalReasons.has(reason) ? "technical" : "general";
        const description = [
          "Feedback de continuidade após o período de teste.",
          `Motivo principal: ${reason}`,
          comment ? `Comentário adicional: ${comment}` : "Sem comentário adicional."
        ].join("\n\n");
        const { data: ticket, error: ticketError } = await deps.supabaseAdmin
          .from("support_tickets")
          .insert({ user_id: preferences.user_id, subject: "Feedback sobre a continuidade após o trial", description, category })
          .select("id")
          .single();
        if (ticketError || !ticket) throw new Error(ticketError?.message || "Não foi possível registrar o feedback.");
        return res.json({ success: true, ticketId: ticket.id });
      }));

      app.get("/api/lifecycle/me", middleware.requireAuth, asyncRoute(async (req, res) => {
        const state = await recalculateLifecycleUserState(deps, req.user.id);
        const { data: enrollments, error: enrollmentError } = await deps.supabaseAdmin.from("lifecycle_enrollments").select("id, status, current_position, next_step_at, completion_deadline_at, campaign_id, lifecycle_campaigns(key,name,status)").eq("user_id", req.user.id);
        if (enrollmentError) throw new Error(enrollmentError.message);
        const preferences = await getLifecyclePreferences(deps, req.user.id);
        const { data: nextDispatch } = await deps.supabaseAdmin.from("lifecycle_dispatches").select("id, message_key, scheduled_for, status, priority, skip_reason, failure_reason").eq("user_id", req.user.id).in("status", ["queued", "retry", "processing"]).order("scheduled_for", { ascending: true }).limit(1).maybeSingle();
        return res.json({ state, enrollments: enrollments || [], preferences, nextDispatch, nextAction: getNextBestAction(state) });
      }));

      app.post("/api/lifecycle/events", middleware.requireAuth, asyncRoute(async (req, res) => {
        const eventName = String(req.body?.eventName || "") as LifecycleEventName;
        if (!LIFECYCLE_EVENT_NAMES.includes(eventName)) return res.status(400).json({ error: "Evento lifecycle não permitido." });
        const id = await recordLifecycleEvent(deps, { userId: req.user.id, eventName, source: "frontend", entityType: req.body?.entityType, entityId: req.body?.entityId, metadata: req.body?.metadata, idempotencyKey: req.body?.dedupeKey || eventName + ":" + req.user.id + ":" + new Date().toISOString().slice(0, 10) });
        return res.json({ success: true, id });
      }));

      app.get("/api/communication/preferences", middleware.requireAuth, asyncRoute(async (req, res) => res.json({ preferences: await getLifecyclePreferences(deps, req.user.id) })));
      app.put("/api/communication/preferences", middleware.requireAuth, asyncRoute(async (req, res) => {
        const preferences = await updateLifecyclePreferences(deps, req.user.id, req.body || {});
        if (preferences.lifecycle_enabled === false) await suppressLifecycleDispatches(deps, req.user.id, "lifecycle_disabled_by_user");
        return res.json({ preferences });
      }));

      const unsubscribe = asyncRoute(async (req, res) => {
        const token = String(req.body?.token || req.query?.token || "");
        const genericMessage = "A solicitação foi processada. Se o token ainda for válido, os e-mails de relacionamento foram desativados.";
        if (!token || token.length < 32) return res.json({ success: true, message: genericMessage });
        const tokenHash = hashCommunicationToken(token);
        const { data: preferences } = await deps.supabaseAdmin.from("communication_preferences").select("user_id").eq("unsubscribe_token_hash", tokenHash).maybeSingle();
        if (preferences?.user_id) {
          await deps.supabaseAdmin.from("communication_preferences").update({ lifecycle_enabled: false, product_education_enabled: false, commercial_enabled: false, unsubscribed_at: new Date().toISOString(), unsubscribe_reason: "public_token" }).eq("user_id", preferences.user_id);
          await suppressLifecycleDispatches(deps, preferences.user_id, "email_unsubscribed");
          await recordLifecycleEvent(deps, { userId: preferences.user_id, eventName: "email_unsubscribed", source: "backend", metadata: {}, idempotencyKey: "email_unsubscribed:" + preferences.user_id + ":" + tokenHash });
        }
        if (req.method === "GET") return res.type("html").send("<!doctype html><html lang=\"pt-BR\"><head><meta charset=\"utf-8\"><title>Preferências atualizadas</title></head><body style=\"font-family:Arial,sans-serif;padding:40px;max-width:640px;margin:auto\"><h1>Preferências atualizadas</h1><p>" + genericMessage + "</p></body></html>");
        return res.json({ success: true, message: genericMessage });
      });
      app.get("/api/communication/unsubscribe", unsubscribe);
      app.post("/api/communication/unsubscribe", unsubscribe);

      app.post("/api/cron/schedule-lifecycle", asyncRoute(async (req, res) => {
        const auth = cronAuthorized(req, deps);
        if (auth.missing) return res.status(503).json({ error: "CRON_SECRET é obrigatório em produção." });
        if (!auth.ok) return res.status(401).json({ error: "Não autorizado" });
        return res.json({ success: true, ...(await scheduleLifecycleMessages(deps)) });
      }));
      app.get("/api/cron/schedule-lifecycle", asyncRoute(async (req, res) => {
        const auth = cronAuthorized(req, deps);
        if (auth.missing) return res.status(503).json({ error: "CRON_SECRET é obrigatório em produção." });
        if (!auth.ok) return res.status(401).json({ error: "Não autorizado" });
        return res.json({ success: true, ...(await scheduleLifecycleMessages(deps)) });
      }));
      app.post("/api/cron/process-lifecycle", asyncRoute(async (req, res) => {
        const auth = cronAuthorized(req, deps);
        if (auth.missing) return res.status(503).json({ error: "CRON_SECRET é obrigatório em produção." });
        if (!auth.ok) return res.status(401).json({ error: "Não autorizado" });
        return res.json({ success: true, ...(await processLifecycleDispatches(deps, Number(req.body?.batchSize) || undefined)) });
      }));
      app.get("/api/cron/process-lifecycle", asyncRoute(async (req, res) => {
        const auth = cronAuthorized(req, deps);
        if (auth.missing) return res.status(503).json({ error: "CRON_SECRET é obrigatório em produção." });
        if (!auth.ok) return res.status(401).json({ error: "Não autorizado" });
        return res.json({ success: true, ...(await processLifecycleDispatches(deps)) });
      }));
      app.post("/api/cron/recalculate-lifecycle", asyncRoute(async (req, res) => {
        const auth = cronAuthorized(req, deps);
        if (auth.missing) return res.status(503).json({ error: "CRON_SECRET é obrigatório em produção." });
        if (!auth.ok) return res.status(401).json({ error: "Não autorizado" });
        const { data: users, error } = await deps.supabaseAdmin.from("professionals").select("id").eq("status", "active").neq("role", "admin").limit(500);
        if (error) throw new Error(error.message);
        let recalculated = 0;
        for (const user of users || []) { await recalculateLifecycleUserState(deps, user.id); recalculated += 1; }
        return res.json({ success: true, recalculated });
      }));
      app.get("/api/cron/recalculate-lifecycle", asyncRoute(async (req, res) => {
        const auth = cronAuthorized(req, deps);
        if (auth.missing) return res.status(503).json({ error: "CRON_SECRET é obrigatório em produção." });
        if (!auth.ok) return res.status(401).json({ error: "Não autorizado" });
        const { data: users, error } = await deps.supabaseAdmin.from("professionals").select("id").eq("status", "active").neq("role", "admin").limit(500);
        if (error) throw new Error(error.message);
        let recalculated = 0;
        for (const user of users || []) { await recalculateLifecycleUserState(deps, user.id); recalculated += 1; }
        return res.json({ success: true, recalculated });
      }));

      app.get("/api/admin/lifecycle/overview", middleware.requireAuth, middleware.requireAdmin, asyncRoute(async (_req, res) => {
        const [enrolled, active, paused, completed, queued, failed, sent, suppressed] = await Promise.all([
          countRows(deps, "lifecycle_enrollments"), countRows(deps, "lifecycle_enrollments", [["eq", "status", "active"]]), countRows(deps, "lifecycle_enrollments", [["eq", "status", "paused"]]), countRows(deps, "lifecycle_enrollments", [["eq", "status", "completed"]]), countRows(deps, "lifecycle_dispatches", [["in", "status", ["queued", "retry", "processing"]]]), countRows(deps, "lifecycle_dispatches", [["eq", "status", "failed"]]), countRows(deps, "lifecycle_dispatches", [["eq", "status", "sent"]]), countRows(deps, "lifecycle_dispatches", [["in", "status", ["suppressed", "cancelled", "skipped"]]])
        ]);
        const runtime = await getLifecycleRuntimeConfig(deps);
        return res.json({ metrics: { enrolled, active, paused, completed, queued, failed, sent, suppressed }, runtime });
      }));

      app.get("/api/admin/lifecycle/campaigns", middleware.requireAuth, middleware.requireAdmin, asyncRoute(async (_req, res) => {
        const { data, error } = await deps.supabaseAdmin.from("lifecycle_campaigns").select("*, lifecycle_steps(id, step_key, position, status, enabled)").order("created_at", { ascending: true });
        if (error) throw new Error(error.message);
        return res.json({ campaigns: data || [] });
      }));
      app.post("/api/admin/lifecycle/campaigns", middleware.requireAuth, middleware.requireAdmin, asyncRoute(async (req, res) => {
        const body = req.body || {};
        if (!body.key || !body.name || !body.campaign_type) return res.status(400).json({ error: "key, name e campaign_type são obrigatórios." });
        const allowed = { key: String(body.key), name: String(body.name), description: body.description || null, campaign_type: body.campaign_type, status: "draft", enrollment_mode: body.enrollment_mode || "selected_users", eligible_from: body.eligible_from || new Date().toISOString(), timezone: body.timezone || "America/Sao_Paulo", default_send_time: body.default_send_time || "08:30", max_messages_per_24h: 1, completion_window_days: Number(body.completion_window_days) || 25, created_by: req.user.id, updated_by: req.user.id };
        const { data, error } = await deps.supabaseAdmin.from("lifecycle_campaigns").insert(allowed).select("*").single();
        if (error) throw new Error(error.message);
        return res.status(201).json({ campaign: data });
      }));
      app.put("/api/admin/lifecycle/campaigns/:id", middleware.requireAuth, middleware.requireAdmin, asyncRoute(async (req, res) => {
        const allowedKeys = ["name", "description", "status", "enrollment_mode", "timezone", "default_send_time", "max_messages_per_24h", "completion_window_days"];
        const update: Record<string, unknown> = { updated_by: req.user.id };
        for (const key of allowedKeys) if (key in (req.body || {})) update[key] = req.body[key];
        if (update.status === "active") {
          const { count } = await deps.supabaseAdmin.from("lifecycle_steps").select("id", { count: "exact", head: true }).eq("campaign_id", req.params.id).eq("status", "active").eq("enabled", true);
          if (!count) return res.status(400).json({ error: "Ative ao menos um passo validado antes de ativar a campanha." });
        }
        const { data, error } = await deps.supabaseAdmin.from("lifecycle_campaigns").update(update).eq("id", req.params.id).select("*").single();
        if (error) throw new Error(error.message);
        return res.json({ campaign: data });
      }));
      app.get("/api/admin/lifecycle/campaigns/:id/steps", middleware.requireAuth, middleware.requireAdmin, asyncRoute(async (req, res) => {
        const { data, error } = await deps.supabaseAdmin.from("lifecycle_steps").select("*").eq("campaign_id", req.params.id).order("position");
        if (error) throw new Error(error.message);
        return res.json({ steps: data || [] });
      }));
      app.put("/api/admin/lifecycle/steps/:id", middleware.requireAuth, middleware.requireAdmin, asyncRoute(async (req, res) => {
        const allowedKeys = ["subject_template", "preheader_template", "body_markdown", "cta_label_template", "cta_route_template", "fallback_cta_route", "priority", "category", "status", "enabled", "wait_minutes"];
        const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
        for (const key of allowedKeys) if (key in (req.body || {})) update[key] = req.body[key];
        const { data, error } = await deps.supabaseAdmin.from("lifecycle_steps").update(update).eq("id", req.params.id).select("*").single();
        if (error) throw new Error(error.message);
        return res.json({ step: data });
      }));

      app.get("/api/admin/lifecycle/rules", middleware.requireAuth, middleware.requireAdmin, asyncRoute(async (_req, res) => {
        const { data, error } = await deps.supabaseAdmin.from("lifecycle_rules").select("*").order("priority", { ascending: false });
        if (error) throw new Error(error.message);
        return res.json({ rules: data || [] });
      }));
      app.put("/api/admin/lifecycle/rules/:id", middleware.requireAuth, middleware.requireAdmin, asyncRoute(async (req, res) => {
        const allowedKeys = ["name", "description", "priority", "cooldown_hours", "delay_minutes", "message_config", "condition_config", "enabled"];
        const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
        for (const key of allowedKeys) if (key in (req.body || {})) update[key] = req.body[key];
        const { data, error } = await deps.supabaseAdmin.from("lifecycle_rules").update(update).eq("id", req.params.id).select("*").single();
        if (error) throw new Error(error.message);
        return res.json({ rule: data });
      }));

      app.get("/api/admin/lifecycle/users", middleware.requireAuth, middleware.requireAdmin, asyncRoute(async (req, res) => {
        const search = String(req.query.search || "").trim();
        let query = deps.supabaseAdmin.from("professionals").select("id, full_name, google_email, professional_title, status, subscription_plan, subscription_status, created_at").neq("role", "admin").order("created_at", { ascending: false }).limit(200);
        if (search) {
          const safeSearch = search.replace(/[,()]/g, "");
          query = query.or("full_name.ilike.%" + safeSearch + "%,google_email.ilike.%" + safeSearch + "%");
        }
        const { data: professionals, error } = await query;
        if (error) throw new Error(error.message);
        const ids = (professionals || []).map((item: any) => item.id);
        const safeIds = ids.length ? ids : ["00000000-0000-0000-0000-000000000000"];
        const [{ data: states }, { data: enrollments }] = await Promise.all([deps.supabaseAdmin.from("lifecycle_user_state").select("*").in("user_id", safeIds), deps.supabaseAdmin.from("lifecycle_enrollments").select("*").in("user_id", safeIds)]);
        return res.json({ users: (professionals || []).map((professional: any) => ({ ...professional, state: (states || []).find((state: any) => state.user_id === professional.id) || null, enrollments: (enrollments || []).filter((enrollment: any) => enrollment.user_id === professional.id) })) });
      }));
      app.get("/api/admin/lifecycle/users/:userId", middleware.requireAuth, middleware.requireAdmin, asyncRoute(async (req, res) => {
        const userId = req.params.userId;
        const state = await recalculateLifecycleUserState(deps, userId);
        const profile = await getUserProfile(deps, userId);
        const preferences = await getLifecyclePreferences(deps, userId);
        const [{ data: enrollments }, { data: dispatches }, { data: events }] = await Promise.all([deps.supabaseAdmin.from("lifecycle_enrollments").select("*").eq("user_id", userId), deps.supabaseAdmin.from("lifecycle_dispatches").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(100), deps.supabaseAdmin.from("lifecycle_events").select("id,event_name,source,occurred_at,metadata").eq("user_id", userId).order("occurred_at", { ascending: false }).limit(100)]);
        return res.json({ profile, state, preferences, enrollments: enrollments || [], dispatches: dispatches || [], events: events || [] });
      }));
      app.post("/api/admin/lifecycle/users/:userId/enroll", middleware.requireAuth, middleware.requireAdmin, asyncRoute(async (req, res) => res.json({ enrollment: await ensureLifecycleEnrollment(deps, req.params.userId, { campaignKey: req.body?.campaignKey || "new_user_activation_15d", force: true }) })));
      app.post("/api/admin/lifecycle/users/:userId/pause", middleware.requireAuth, middleware.requireAdmin, asyncRoute(async (req, res) => {
        const campaignKey = String(req.body?.campaignKey || "").trim();
        const campaign = campaignKey ? await findCampaign(deps, campaignKey) : null;
        if (campaignKey && !campaign) return res.status(404).json({ error: "Campanha lifecycle não encontrada." });
        let query = deps.supabaseAdmin.from("lifecycle_enrollments").update({ status: "paused", paused_at: new Date().toISOString(), pause_reason: String(req.body?.reason || "paused_by_admin") }).eq("user_id", req.params.userId).eq("status", "active");
        if (campaign) query = query.eq("campaign_id", campaign.id);
        const { error } = await query;
        if (error) throw new Error(error.message);
        return res.json({ success: true });
      }));
      app.post("/api/admin/lifecycle/users/:userId/resume", middleware.requireAuth, middleware.requireAdmin, asyncRoute(async (req, res) => {
        const campaignKey = String(req.body?.campaignKey || "").trim();
        const campaign = campaignKey ? await findCampaign(deps, campaignKey) : null;
        if (campaignKey && !campaign) return res.status(404).json({ error: "Campanha lifecycle não encontrada." });
        let query = deps.supabaseAdmin.from("lifecycle_enrollments").update({ status: "active", paused_at: null, pause_reason: null, next_step_at: new Date().toISOString() }).eq("user_id", req.params.userId).eq("status", "paused");
        if (campaign) query = query.eq("campaign_id", campaign.id);
        const { error } = await query;
        if (error) throw new Error(error.message);
        return res.json({ success: true });
      }));
      app.post("/api/admin/lifecycle/users/:userId/recalculate", middleware.requireAuth, middleware.requireAdmin, asyncRoute(async (req, res) => res.json({ state: await recalculateLifecycleUserState(deps, req.params.userId) })));
      app.post("/api/admin/lifecycle/users/:userId/force-send", middleware.requireAuth, middleware.requireAdmin, asyncRoute(async (req, res) => {
        const userId = req.params.userId;
        const campaignKey = String(req.body?.campaignKey || "new_user_activation_15d").trim();
        const stepId = String(req.body?.stepId || "").trim();
        if (!stepId) return res.status(400).json({ error: "stepId é obrigatório para o envio manual." });

        const campaign = await findCampaign(deps, campaignKey);
        if (!campaign) return res.status(404).json({ error: "Campanha lifecycle não encontrada." });
        const [{ data: enrollment, error: enrollmentError }, { data: step, error: stepError }] = await Promise.all([
          deps.supabaseAdmin.from("lifecycle_enrollments").select("*").eq("user_id", userId).eq("campaign_id", campaign.id).maybeSingle(),
          deps.supabaseAdmin.from("lifecycle_steps").select("*").eq("id", stepId).eq("campaign_id", campaign.id).maybeSingle()
        ]);
        if (enrollmentError) throw new Error(enrollmentError.message);
        if (stepError) throw new Error(stepError.message);
        if (!enrollment) return res.status(404).json({ error: "Usuário não está matriculado nesta jornada." });
        if (enrollment.status !== "active") return res.status(400).json({ error: "A jornada deste usuário precisa estar ativa para permitir envio manual." });
        if (!step) return res.status(404).json({ error: "Passo lifecycle não encontrado nesta campanha." });
        if (step.status !== "active" || step.enabled !== true) return res.status(400).json({ error: "O passo atual não está ativo para envio." });

        const expectedPosition = Number(enrollment.current_position || 0) + 1;
        if (Number(step.position) !== expectedPosition) return res.status(400).json({ error: "O passo informado não é o passo atual deste usuário." });

        const runtime = await getLifecycleRuntimeConfig(deps);
        if (!runtime.send_enabled || runtime.dry_run) return res.status(400).json({ error: "O envio real está desativado nas configurações da Jornada de Usuários." });

        const now = new Date().toISOString();
        const { data: dispatch, error: insertError } = await deps.supabaseAdmin.from("lifecycle_dispatches").insert({
          user_id: userId,
          enrollment_id: enrollment.id,
          campaign_id: campaign.id,
          step_id: step.id,
          rule_id: null,
          message_key: `sequence:${step.step_key}`,
          dispatch_type: "sequence",
          priority: Number(step.priority || 50) + 10000,
          status: "queued",
          scheduled_for: now,
          dedupe_key: `manual:sequence:${userId}:${step.id}:${randomUUID()}`,
          metadata: {
            manual: true,
            force_resend: true,
            commercial: step.category === "commercial",
            forced_by: req.user.id,
            forced_at: now
          }
        }).select("id").single();
        if (insertError) throw new Error(insertError.message);

        const result = await processLifecycleDispatchById(deps, dispatch.id);
        if (result.status === "sent") return res.json({ success: true, status: result.status, message: "Mensagem do passo atual enviada pelos canais habilitados." });
        if (result.status === "suppressed") return res.status(400).json({ error: "O envio foi suprimido pelas preferências de comunicação do usuário.", status: result.status, reason: result.skip_reason });
        if (result.status === "failed" || result.status === "retry") return res.status(502).json({ error: "Não foi possível enviar o e-mail do passo atual.", status: result.status, reason: result.failure_reason });
        return res.status(409).json({ error: "O disparo manual não pôde ser processado.", status: result.status });
      }));

      app.get("/api/admin/lifecycle/deliveries", middleware.requireAuth, middleware.requireAdmin, asyncRoute(async (req, res) => {
        const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
        const { data, error } = await deps.supabaseAdmin.from("lifecycle_dispatches").select("*").order("created_at", { ascending: false }).limit(limit);
        if (error) throw new Error(error.message);

        const allDispatches = data || [];
        const activationCampaign = await findCampaign(deps, LIFECYCLE_ACTIVATION_CAMPAIGN_KEY);
        const enrollmentIds = Array.from(new Set(allDispatches.map((item: any) => item.enrollment_id).filter(Boolean)));
        const { data: enrollments, error: enrollmentsError } = await deps.supabaseAdmin
          .from("lifecycle_enrollments")
          .select("id, status, campaign_id")
          .in("id", enrollmentIds.length ? enrollmentIds : ["00000000-0000-0000-0000-000000000000"]);
        if (enrollmentsError) throw new Error(enrollmentsError.message);
        const activeEnrollmentIds = new Set((enrollments || []).filter((enrollment: any) => enrollment.status === "active" && enrollment.campaign_id === activationCampaign?.id).map((enrollment: any) => enrollment.id));
        const dispatches = allDispatches.filter((item: any) => item.enrollment_id && activeEnrollmentIds.has(item.enrollment_id));
        const userIds = Array.from(new Set(dispatches.map((item: any) => item.user_id).filter(Boolean)));
        const stepIds = Array.from(new Set(dispatches.map((item: any) => item.step_id).filter(Boolean)));
        const ruleIds = Array.from(new Set(dispatches.map((item: any) => item.rule_id).filter(Boolean)));
        const campaignIds = Array.from(new Set(dispatches.map((item: any) => item.campaign_id).filter(Boolean)));
        const emptyId = "00000000-0000-0000-0000-000000000000";
        const [{ data: professionals, error: professionalsError }, { data: steps, error: stepsError }, { data: rules, error: rulesError }, { data: campaigns, error: campaignsError }] = await Promise.all([
          deps.supabaseAdmin.from("professionals").select("id, full_name, google_email").in("id", userIds.length ? userIds : [emptyId]),
          deps.supabaseAdmin.from("lifecycle_steps").select("id, step_key, position, subject_template, campaign_id").in("id", stepIds.length ? stepIds : [emptyId]),
          deps.supabaseAdmin.from("lifecycle_rules").select("id, name, rule_key").in("id", ruleIds.length ? ruleIds : [emptyId]),
          deps.supabaseAdmin.from("lifecycle_campaigns").select("id, name, key").in("id", campaignIds.length ? campaignIds : [emptyId])
        ]);
        if (professionalsError || stepsError || rulesError || campaignsError) throw new Error(professionalsError?.message || stepsError?.message || rulesError?.message || campaignsError?.message || "Falha ao enriquecer os registros de envio.");

        return res.json({ deliveries: dispatches.map((item: any) => {
          const professional = (professionals || []).find((entry: any) => entry.id === item.user_id);
          const step = (steps || []).find((entry: any) => entry.id === item.step_id);
          const rule = (rules || []).find((entry: any) => entry.id === item.rule_id);
          const campaign = (campaigns || []).find((entry: any) => entry.id === item.campaign_id);
          return {
            ...item,
            recipient_name: professional?.full_name || "Usuário não identificado",
            recipient_email: professional?.google_email || "E-mail não identificado",
            template_name: step?.subject_template || rule?.name || item.rendered_subject || item.message_key,
            template_reference: step ? `Passo ${step.position}${campaign?.name ? ` · ${campaign.name}` : ""}` : rule?.name || item.message_key,
            template_key: step?.step_key || rule?.rule_key || item.message_key
          };
        }) });
      }));
      app.post("/api/admin/lifecycle/dispatches/:id/resend", middleware.requireAuth, middleware.requireAdmin, asyncRoute(async (req, res) => {
        const { data: original, error: originalError } = await deps.supabaseAdmin.from("lifecycle_dispatches").select("*").eq("id", req.params.id).maybeSingle();
        if (originalError) throw new Error(originalError.message);
        if (!original) return res.status(404).json({ error: "Registro lifecycle não encontrado." });

        const runtime = await getLifecycleRuntimeConfig(deps);
        if (!runtime.send_enabled || runtime.dry_run) return res.status(400).json({ error: "O envio real está desativado nas configurações da Jornada de Usuários." });

        const now = new Date().toISOString();
        const originalMetadata = original.metadata && typeof original.metadata === "object" ? original.metadata : {};
        const { data: dispatch, error: insertError } = await deps.supabaseAdmin.from("lifecycle_dispatches").insert({
          user_id: original.user_id,
          enrollment_id: original.enrollment_id,
          campaign_id: original.campaign_id,
          step_id: original.step_id,
          rule_id: original.rule_id,
          message_key: original.message_key,
          dispatch_type: original.dispatch_type,
          priority: Number(original.priority || 50) + 10000,
          status: "queued",
          scheduled_for: now,
          dedupe_key: `manual-resend:${original.id}:${randomUUID()}`,
          metadata: {
            ...originalMetadata,
            manual: true,
            force_resend: true,
            manual_resend_of: original.id,
            forced_by: req.user.id,
            forced_at: now
          }
        }).select("id").single();
        if (insertError) throw new Error(insertError.message);

        const result = await processLifecycleDispatchById(deps, dispatch.id);
        if (result.status === "sent") return res.json({ success: true, status: result.status, message: "Mensagem lifecycle reenviada pelos canais habilitados." });
        if (result.status === "suppressed") return res.status(400).json({ error: "O reenvio foi suprimido pelas preferências de comunicação do usuário.", status: result.status, reason: result.skip_reason });
        if (result.status === "failed" || result.status === "retry") return res.status(502).json({ error: "Não foi possível reenviar o e-mail lifecycle.", status: result.status, reason: result.failure_reason });
        return res.status(409).json({ error: "O reenvio não pôde ser processado.", status: result.status });
      }));
      app.post("/api/admin/lifecycle/dispatches/:id/cancel", middleware.requireAuth, middleware.requireAdmin, asyncRoute(async (req, res) => { const { error } = await deps.supabaseAdmin.from("lifecycle_dispatches").update({ status: "cancelled", skip_reason: String(req.body?.reason || "cancelled_by_admin"), skipped_at: new Date().toISOString() }).eq("id", req.params.id).in("status", ["queued", "retry", "processing"]); if (error) throw new Error(error.message); return res.json({ success: true }); }));
      app.get("/api/admin/lifecycle/preferences", middleware.requireAuth, middleware.requireAdmin, asyncRoute(async (req, res) => { const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500); const { data: preferences, error } = await deps.supabaseAdmin.from("communication_preferences").select("*").order("updated_at", { ascending: false }).limit(limit); if (error) throw new Error(error.message); const ids = (preferences || []).map((item: any) => item.user_id); const safeIds = ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]; const { data: professionals, error: professionalsError } = await deps.supabaseAdmin.from("professionals").select("id, full_name, google_email").in("id", safeIds); if (professionalsError) throw new Error(professionalsError.message); return res.json({ preferences: (preferences || []).map((item: any) => ({ ...item, user: (professionals || []).find((professional: any) => professional.id === item.user_id) || null })) }); }));

      app.post("/api/admin/lifecycle/preview", middleware.requireAuth, middleware.requireAdmin, asyncRoute(async (req, res) => {
        const state = await recalculateLifecycleUserState(deps, req.body?.userId || req.user.id);
        const step = req.body?.stepId ? (await deps.supabaseAdmin.from("lifecycle_steps").select("*").eq("id", req.body.stepId).single()).data : null;
        const rule = req.body?.ruleId ? (await deps.supabaseAdmin.from("lifecycle_rules").select("*").eq("id", req.body.ruleId).single()).data : null;
        const template = step ? { subject_template: step.subject_template, preheader_template: step.preheader_template, body_markdown: step.body_markdown, cta_label_template: step.cta_label_template, cta_route_template: step.cta_route_template } : { subject_template: rule?.message_config?.subject || "Prévia lifecycle", preheader_template: rule?.message_config?.preheader || "", body_markdown: rule?.message_config?.body || "", cta_label_template: rule?.message_config?.cta_label || "Acessar", cta_route_template: rule?.message_config?.cta_route || "/painel/dashboard" };
        return res.json({ state, rendered: renderLifecycleMessage({ subjectTemplate: template.subject_template, preheaderTemplate: template.preheader_template, bodyTemplate: template.body_markdown, ctaLabelTemplate: template.cta_label_template, ctaRouteTemplate: template.cta_route_template, context: mapContext(state, deps.productionOrigin) }) });
      }));
      app.post("/api/admin/lifecycle/simulate", middleware.requireAuth, middleware.requireAdmin, asyncRoute(async (req, res) => {
        const state = await recalculateLifecycleUserState(deps, req.body?.userId || req.user.id);
        const { data: rules } = await deps.supabaseAdmin.from("lifecycle_rules").select("*").eq("enabled", true);
        const candidates = (rules || []).map((rule: any) => evaluateKnownRule(rule, state, new Date())).filter(Boolean);
        return res.json({ state, candidates, selected: chooseHighestPriority(candidates as any[]), nextAction: getNextBestAction(state) });
      }));
      app.post("/api/admin/lifecycle/test-email", middleware.requireAuth, middleware.requireAdmin, asyncRoute(async (req, res) => {
        const recipientEmail = String(req.body?.recipientEmail || "");
        if (!recipientEmail || !recipientEmail.includes("@")) return res.status(400).json({ error: "recipientEmail inválido." });
        const state = await recalculateLifecycleUserState(deps, req.body?.userId || req.user.id);
        const rendered = renderLifecycleMessage({ subjectTemplate: String(req.body?.subject || "Prévia da Jornada de Usuários"), preheaderTemplate: "Mensagem de teste", bodyTemplate: String(req.body?.body || "Esta é uma mensagem de teste do lifecycle."), ctaLabelTemplate: "Abrir plataforma", ctaRouteTemplate: "/painel/dashboard", context: mapContext(state, deps.productionOrigin) });
        const theme = await deps.getEmailTheme();
        const actionUrl = resolveLifecycleUrl(deps.productionOrigin, rendered.ctaRoute);
        const htmlContent = deps.buildEmailShell(theme, { title: rendered.subject, subtitle: rendered.preheader, eyebrow: "Teste administrativo", bodyHtml: rendered.bodyHtml + "<div style=\"text-align:center\">" + deps.buildEmailButton(theme, actionUrl, rendered.ctaLabel) + "</div>", footerHtml: "Mensagem de teste enviada por um administrador." });
        const result = await deps.sendTransactionalEmail(await deps.getNotificationSettings(), { userId: req.user.id, recipientEmail, recipientName: "Administrador", subject: "[Teste] " + rendered.subject, textContent: rendered.text, htmlContent, source: "lifecycle-test", allowFallback: true });
        return res.json({ success: true, provider: result.provider, emailDeliveryId: result.emailDeliveryId });
      }));
      app.get("/api/admin/lifecycle/settings", middleware.requireAuth, middleware.requireAdmin, asyncRoute(async (_req, res) => res.json({ runtime: await getLifecycleRuntimeConfig(deps) })));
      app.put("/api/admin/lifecycle/settings", middleware.requireAuth, middleware.requireAdmin, asyncRoute(async (req, res) => {
        const runtime = { send_enabled: req.body?.send_enabled === true, dry_run: req.body?.dry_run !== false, max_batch_size: Math.min(Math.max(Number(req.body?.max_batch_size) || 25, 1), 100), global_outage: req.body?.global_outage === true };
        const { error } = await deps.supabaseAdmin.from("settings").upsert({ id: "lifecycle_config", api_key: JSON.stringify(runtime), updated_at: new Date().toISOString(), updated_by: req.user.email || req.user.id });
        if (error) throw new Error(error.message);
        return res.json({ runtime });
      }));
    }
  };
}

export function registerLifecycleRoutes(app: any, deps: LifecycleDependencies, middleware: { requireAuth: any; requireAdmin: any }) {
  createLifecycleService(deps).registerRoutes(app, middleware);
}
