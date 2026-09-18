import { createUserScopedClient } from "../supabase/createUserScopedClient.js";
import { readClinicPatientUuid, type ClinicPatientRouteDeps } from "./clinicPatientRoutes.js";

type ClinicRequest = any & { user?: { id?: string } };
type ClinicResponse = any;

function commonHeaders(res: ClinicResponse) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Vary", "Authorization");
}

function bearer(req: ClinicRequest) {
  return String(req.headers?.authorization || "").match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || null;
}

function uuid(value: unknown) {
  return readClinicPatientUuid(value);
}

function errorStatus(error: any) {
  if (["42501", "28000"].includes(error?.code)) return 403;
  if (error?.code === "P0002") return 404;
  if (["22023", "23514", "22P02"].includes(error?.code)) return 400;
  if (["23505", "40901"].includes(error?.code)) return 409;
  return 503;
}

function fail(res: ClinicResponse, error: any) {
  const status = errorStatus(error);
  const errorCode = status === 403 ? "not_authorized" : status === 404 ? "not_found" : status === 400 ? "invalid_clinic_request" : status === 409 ? "clinic_conflict" : "clinic_operation_failed";
  console.error("[ClinicOperational] operação recusada/falhou", { code: error?.code || "unknown", status });
  return res.status(status).json({ ok: false, error: errorCode });
}

function scopedClient(req: ClinicRequest, deps: ClinicPatientRouteDeps) {
  const token = bearer(req);
  if (!token || !req.user?.id) return null;
  return createUserScopedClient({ supabaseUrl: deps.supabaseUrl, supabaseAnonKey: deps.supabaseAnonKey, accessToken: token });
}

function enabled(res: ClinicResponse, deps: ClinicPatientRouteDeps) {
  if (deps.clinicFeatureEnabled) return true;
  res.status(503).json({ ok: false, error: "feature_unavailable" });
  return false;
}

export function registerClinicOperationalRoutes(app: any, deps: ClinicPatientRouteDeps) {
  app.get("/api/clinic/dashboard", deps.requireAuth, async (req: ClinicRequest, res: ClinicResponse) => {
    commonHeaders(res);
    if (!enabled(res, deps)) return;
    const organizationId = uuid(req.query?.organizationId);
    const client = scopedClient(req, deps);
    if (!organizationId || !client) return res.status(400).json({ ok: false, error: "invalid_clinic_request" });
    try {
      const { data, error } = await client.rpc("get_organization_dashboard", { p_organization_id: organizationId });
      if (error) return fail(res, error);
      return res.json({ ok: true, organizationId, dashboard: data });
    } catch (error) {
      return fail(res, error);
    }
  });

  app.get("/api/clinic/audit", deps.requireAuth, async (req: ClinicRequest, res: ClinicResponse) => {
    commonHeaders(res);
    if (!enabled(res, deps)) return;
    const organizationId = uuid(req.query?.organizationId);
    const client = scopedClient(req, deps);
    const rawLimit = req.query?.limit === undefined ? 25 : Number(req.query.limit);
    const limit = Number.isInteger(rawLimit) && rawLimit >= 1 && rawLimit <= 100 ? rawLimit : null;
    const eventType = req.query?.eventType === undefined || req.query?.eventType === "" ? null : typeof req.query.eventType === "string" ? req.query.eventType.slice(0, 100) : null;
    const cursorCreatedAt = req.query?.cursorCreatedAt === undefined ? null : new Date(String(req.query.cursorCreatedAt));
    const cursorId = req.query?.cursorId === undefined ? null : uuid(req.query.cursorId);
    if (!organizationId || !client || !limit || (cursorCreatedAt && Number.isNaN(cursorCreatedAt.getTime())) || (req.query?.cursorId !== undefined && !cursorId)) return res.status(400).json({ ok: false, error: "invalid_clinic_request" });
    try {
      const { data, error } = await client.rpc("list_organization_admin_events", {
        p_organization_id: organizationId,
        p_limit: limit,
        p_cursor_created_at: cursorCreatedAt?.toISOString() || null,
        p_cursor_id: cursorId,
        p_event_type: eventType,
      });
      if (error) return fail(res, error);
      const events = Array.isArray(data) ? data : [];
      const last = events.at(-1);
      return res.json({
        ok: true,
        organizationId,
        events,
        nextCursor: events.length === limit && last ? { createdAt: last.created_at, id: last.id } : null,
      });
    } catch (error) {
      return fail(res, error);
    }
  });

  for (const action of ["archive", "reactivate"] as const) {
    app.post(`/api/clinic/patients/:organizationPatientId/${action}`, deps.requireAuth, async (req: ClinicRequest, res: ClinicResponse) => {
      commonHeaders(res);
      if (!enabled(res, deps)) return;
      const organizationPatientId = uuid(req.params?.organizationPatientId);
      const client = scopedClient(req, deps);
      if (!organizationPatientId || !client || req.body && Object.keys(req.body).length) return res.status(400).json({ ok: false, error: "invalid_clinic_request" });
      try {
        const { data, error } = await client.rpc(`${action}_organization_patient`, { p_organization_patient_id: organizationPatientId });
        if (error) return fail(res, error);
        return res.json({ ok: true, patient: data });
      } catch (error) {
        return fail(res, error);
      }
    });
  }

  app.post("/api/clinic/patients/:organizationPatientId/reassign-primary", deps.requireAuth, async (req: ClinicRequest, res: ClinicResponse) => {
    commonHeaders(res);
    if (!enabled(res, deps)) return;
    const organizationPatientId = uuid(req.params?.organizationPatientId);
    const client = scopedClient(req, deps);
    const body = req.body;
    if (!organizationPatientId || !client || !body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some((key) => !["newPrimaryProfessionalId", "keepPreviousAsSecondary"].includes(key))) return res.status(400).json({ ok: false, error: "invalid_clinic_request" });
    const newPrimaryProfessionalId = uuid(body.newPrimaryProfessionalId);
    const keepPreviousAsSecondary = body.keepPreviousAsSecondary === undefined ? false : body.keepPreviousAsSecondary;
    if (!newPrimaryProfessionalId || typeof keepPreviousAsSecondary !== "boolean") return res.status(400).json({ ok: false, error: "invalid_clinic_request" });
    try {
      const { data, error } = await client.rpc("reassign_organization_patient_primary", { p_organization_patient_id: organizationPatientId, p_new_primary_professional_id: newPrimaryProfessionalId, p_keep_previous_as_secondary: keepPreviousAsSecondary });
      if (error) return fail(res, error);
      return res.json({ ok: true, reassignment: data });
    } catch (error) {
      return fail(res, error);
    }
  });
}
