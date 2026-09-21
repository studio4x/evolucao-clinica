import express from "express";
import { createHash, randomBytes } from "node:crypto";
import type { SensitiveTransport } from "./clinicInvitationEmail.js";

const ORIGIN = "https://staging.evolucaoclinica.app.br";
const PREFIX = "/api/clinic/invitations";
export const INVITATION_CSP = "default-src 'none'; script-src 'self'; connect-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'";
const uuid = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
export const hashInvitationSecret = (value: string) => createHash("sha256").update(value).digest("hex");
const cookie = (value: string, age: number) => `ec_clinic_invite=${value}; Path=${PREFIX}; Max-Age=${age}; HttpOnly; Secure; SameSite=Lax`;
const readCookie = (req: any) => {
  const match = String(req.headers.cookie || "").match(/(?:^|;\s*)ec_clinic_invite=([A-Za-z0-9_-]{43})(?:;|$)/);
  return match?.[1] || null;
};
function headers(res: any) {
  res.set({ "Cache-Control": "private, no-store", Pragma: "no-cache", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow", "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", Vary: "Cookie, Authorization" });
}
function unavailable(res: any) { res.setHeader("Set-Cookie", cookie("", 0)); return res.status(410).json({ ok: false, error: "invitation_unavailable" }); }
function failure(res: any, error: any) {
  // Never serialize/log provider, PostgREST or JSON parser messages/details.
  const known = error?.message === "email_mismatch" || error?.message === "email_unconfirmed";
  const code = known ? error.message : error?.code === "23505" ? "pending_invitation_exists" : error?.code === "42501" ? "not_authorized" : error?.message === "rate_limited" ? "rate_limited" : error?.message === "no clinical seats available" ? "no_clinical_seats" : "invitation_operation_failed";
  return res.status(code === "rate_limited" ? 429 : error?.code === "42501" ? 403 : error?.code === "23505" ? 409 : 503).json({ ok: false, error: code });
}

// Executed before any application bundle/analytics. The token never leaves
// this closure except the same-origin POST body; GET never accepts a member.
export const INVITATION_LANDING_SCRIPT = `(async()=>{let token=new URLSearchParams(location.hash.slice(1)).get('invite');history.replaceState(null,'','/convite-clinica');try{if(!token||!/^[a-f0-9]{64}$/.test(token))throw 0;const response=await fetch('/api/clinic/invitations/handoff',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({token}),cache:'no-store',referrerPolicy:'no-referrer'});token=null;if(!response.ok)throw 0;location.replace('/painel/convite-clinica');}catch{token=null;const status=document.getElementById('status');if(status)status.textContent='Não foi possível validar este convite. Ele pode ter expirado, sido utilizado ou substituído.';const loader=document.querySelector('.loader');if(loader)loader.remove();}})();`;
export const INVITATION_LANDING_HTML = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer"><meta http-equiv="Cache-Control" content="no-store"><title>Convite — Evolução Clínica</title><style> :root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#123b52;background:#f2faff}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:linear-gradient(135deg,#e9f8ff,#fff 55%,#effcff)}main{width:min(100%,520px);border:1px solid #d8eaf2;border-radius:28px;background:#fff;box-shadow:0 24px 70px #0b66821a;padding:40px 28px;text-align:center}header{display:flex;justify-content:center;align-items:center;gap:10px;font-weight:700;font-size:20px;color:#105576}header svg{width:38px;height:38px;padding:8px;border-radius:12px;background:#105576;color:#fff}.badge{display:inline-flex;margin:28px 0 14px;border-radius:999px;background:#e7f7ff;color:#105576;padding:7px 12px;font-size:11px;font-weight:800;letter-spacing:.12em}h1{margin:0;font-size:28px;line-height:1.15}p{margin:12px auto 0;max-width:360px;color:#647b88;line-height:1.6}.loader{width:26px;height:26px;margin:28px auto 0;border:3px solid #d7edf5;border-top-color:#105576;border-radius:50%;animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}</style><script defer src="/api/clinic/invitations/landing.js"></script></head><body><main><header><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 3 4.5 6v5.2c0 4.7 3.1 8.2 7.5 9.8 4.4-1.6 7.5-5.1 7.5-9.8V6L12 3Z"/><path d="m8.5 12 2.2 2.2 4.8-5"/></svg>Evolução Clínica</header><div class="badge">AMBIENTE DE HOMOLOGAÇÃO</div><h1>Preparando seu convite</h1><p id="status">Estamos validando seu acesso de forma segura.</p><div class="loader" aria-label="Carregando"></div></main></body></html>`;

export type InvitationRouteDeps = {
  appEnv: string; supabaseUrl: string; publicOrigin: string; clinicFeatureEnabled: boolean;
  deliveryEnabled: boolean; transport: SensitiveTransport;
  admin: { rpc(name: string, args: any): PromiseLike<{ data: any; error: any }>; auth: { getUser(token: string): PromiseLike<{ data: { user: { id: string } | null }; error: any }> } };
};

export function registerClinicInvitationRoutes(app: any, deps: InvitationRouteDeps) {
  const enabled = deps.appEnv === "staging" && deps.supabaseUrl === "https://hwkdwinfckmjoriqxbjk.supabase.co"
    && deps.publicOrigin === ORIGIN && deps.clinicFeatureEnabled;
  app.use(PREFIX, (req: any, res: any, next: any) => {
    headers(res);
    if (!enabled) return res.status(503).json({ ok: false, error: "feature_unavailable" });
    if (req.method !== "GET" && req.headers.origin !== ORIGIN) return res.status(403).json({ ok: false, error: "invalid_origin" });
    // These endpoints have no query-token mode, including the fragment landing.
    if (Object.keys(req.query || {}).some((key) => /token|secret|invite/i.test(key))) return res.status(400).json({ ok: false, error: "invalid_request" });
    next();
  }, express.json({ limit: "8kb" }), (err: any, _req: any, res: any, _next: any) => {
    headers(res); res.status(err?.type === "entity.too.large" ? 413 : 400).json({ ok: false, error: "invalid_request" });
  });
  const auth = async (req: any, res: any) => {
    const token = String(req.headers.authorization || "").match(/^Bearer (.+)$/)?.[1];
    if (!token) { res.status(401).json({ ok: false, error: "authentication_required" }); return null; }
    try {
      const { data, error } = await deps.admin.auth.getUser(token);
      if (error || !uuid(data.user?.id)) { res.status(401).json({ ok: false, error: "authentication_required" }); return null; }
      return data.user!.id;
    } catch { res.status(401).json({ ok: false, error: "authentication_required" }); return null; }
  };
  app.get("/convite-clinica", (_req: any, res: any) => {
    headers(res); res.setHeader("Content-Security-Policy", INVITATION_CSP);
    return res.status(enabled ? 200 : 503).type("html").send(enabled ? INVITATION_LANDING_HTML : "Convites indisponíveis.");
  });
  app.get(`${PREFIX}/landing.js`, (_req: any, res: any) => res.type("application/javascript").send(INVITATION_LANDING_SCRIPT));
  app.post(`${PREFIX}/handoff`, async (req: any, res: any) => {
    const token = req.body?.token;
    req.body = {}; // Do not leave raw sensitive content attached to a request.
    if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) return unavailable(res);
    const secret = randomBytes(32).toString("base64url");
    try {
      const { data, error } = await deps.admin.rpc("create_organization_invitation_handoff_server", { p_token_hash: hashInvitationSecret(token), p_secret_hash: hashInvitationSecret(secret) });
      if (error) return failure(res, error);
      if (data?.status !== "pending") return unavailable(res);
      res.setHeader("Set-Cookie", cookie(secret, 2700));
      return res.json({ ok: true });
    } catch (error) { return failure(res, error); }
  });
  const resolve = async (req: any, res: any, accept: boolean) => {
    const actor = accept ? await auth(req, res) : null;
    if (accept && !actor) return;
    const secret = readCookie(req);
    if (!secret) return unavailable(res);
    try {
      const { data, error } = await deps.admin.rpc("resolve_organization_invitation_handoff_server", { p_secret_hash: hashInvitationSecret(secret), p_actor: actor, p_accept: accept });
      if (error) return failure(res, error);
      if (accept ? data?.status !== "accepted" : data?.status !== "pending") return unavailable(res);
      if (accept) {
        res.setHeader("Set-Cookie", cookie("", 0));
        return res.json({ ok: true, organizationId: data.organization_id, membershipId: data.membership_id });
      }
      return res.json({ ok: true, status: "pending", organizationName: data.organization_name, role: data.intended_role, clinical: data.intended_clinical_access, expiresAt: data.expires_at });
    } catch (error) { return failure(res, error); }
  };
  app.get(`${PREFIX}/handoff`, (req: any, res: any) => resolve(req, res, false));
  app.post(`${PREFIX}/accept`, (req: any, res: any) => resolve(req, res, true));
  app.get(PREFIX, async (req: any, res: any) => {
    const actor = await auth(req, res); if (!actor) return;
    if (!uuid(req.query.organizationId)) return res.status(400).json({ ok: false, error: "invalid_request" });
    try {
      const { data, error } = await deps.admin.rpc("list_organization_invitations_server", { p_organization_id: req.query.organizationId, p_actor: actor });
      if (error) return failure(res, error);
      // Explicit DTO projection; even an accidental extra RPC field is stripped.
      const fields = ["invitation_id", "normalized_email", "intended_role", "intended_clinical_access", "status", "expires_at", "invited_by", "delivery_status", "sent_at", "delivery_attempt"];
      return res.json({ ok: true, invitations: (Array.isArray(data) ? data : []).map((row) => Object.fromEntries(fields.map((key) => [key, row[key]]))) });
    } catch (error) { return failure(res, error); }
  });
  const mutate = async (req: any, res: any, action: "issue" | "resend" | "revoke") => {
    const actor = await auth(req, res); if (!actor) return;
    const body = req.body || {};
    if (!uuid(body.organizationId) || (action !== "issue" && !uuid(req.params.id))) return res.status(400).json({ ok: false, error: "invalid_request" });
    if (action !== "revoke" && (!deps.deliveryEnabled || !deps.transport.ready)) return res.status(503).json({ ok: false, error: "delivery_unavailable" });
    if (action === "issue" && (typeof body.email !== "string" || body.email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim()) || !["manager", "professional"].includes(body.role) || typeof body.clinical !== "boolean")) return res.status(400).json({ ok: false, error: "invalid_request" });
    const args: any = { p_organization_id: body.organizationId, p_actor: actor };
    if (action === "issue") Object.assign(args, { p_email: body.email.trim().toLowerCase(), p_intended_role: body.role, p_intended_clinical_access: body.clinical });
    else args.p_invitation_id = req.params.id;
    if (action !== "revoke") args.p_provider = deps.transport.provider;
    try {
      const { data, error } = await deps.admin.rpc(`${action === "issue" ? "issue" : action}_organization_invitation_server`, args);
      if (error) return failure(res, error);
      if (action === "revoke") return res.json({ ok: true, status: data?.status });
      if (!uuid(data?.invitation_id) || !uuid(data?.delivery_id) || data?.status !== "pending") return unavailable(res);
      let sent = false; let messageId: string | null = null;
      try {
        const result = await deps.transport.send({ recipient: data.normalized_email, organizationName: data.organization_name,
          role: data.intended_role, clinical: data.intended_clinical_access, expiresAt: data.expires_at, token: data.token });
        // Never store an untrusted provider string; transports generate this ID.
        if (/^[a-f0-9-]{36}@staging\.evolucaoclinica\.app\.br$/.test(result.messageId) && !result.messageId.includes(data.token)) { messageId = result.messageId; sent = true; }
      } catch { /* Failure stays pending with its seat; explicit resend only. */ }
      finally { data.token = undefined; }
      const finish = await deps.admin.rpc("finish_organization_invitation_delivery_server", { p_delivery_id: data.delivery_id, p_status: sent ? "sent" : "failed", p_message_id: messageId });
      if (finish.error) return failure(res, finish.error);
      return res.status(201).json({ ok: true, invitationId: data.invitation_id, status: "pending", deliveryStatus: sent ? "sent" : "failed" });
    } catch (error) { return failure(res, error); }
  };
  app.post(PREFIX, (req: any, res: any) => mutate(req, res, "issue"));
  app.post(`${PREFIX}/:id/resend`, (req: any, res: any) => mutate(req, res, "resend"));
  app.post(`${PREFIX}/:id/revoke`, (req: any, res: any) => mutate(req, res, "revoke"));
}
