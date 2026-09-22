import { createUserScopedClient } from "../supabase/createUserScopedClient.js";

type ClinicRequest = any & { user?: { id?: string } };
type ClinicResponse = any;

export type ClinicPatientRouteDeps = {
  requireAuth: any;
  supabaseUrl: string;
  supabaseAnonKey: string;
  clinicFeatureEnabled: boolean;
  createUserScopedClient?: typeof createUserScopedClient;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function readClinicPatientUuid(value: unknown) {
  return typeof value === "string" && UUID_PATTERN.test(value.trim()) ? value.trim() : null;
}

function readBearerToken(req: ClinicRequest) {
  const match = String(req.headers?.authorization || "").match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function withCommonHeaders(res: ClinicResponse) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Vary", "Authorization");
}

function getUserClient(req: ClinicRequest, deps: ClinicPatientRouteDeps) {
  const token = readBearerToken(req);
  if (!token || !req.user?.id) return null;
  const createClient = deps.createUserScopedClient || createUserScopedClient;
  return createClient({ supabaseUrl: deps.supabaseUrl, supabaseAnonKey: deps.supabaseAnonKey, accessToken: token });
}

function errorStatus(error: any) {
  if (error?.code === "42501") return 403;
  if (error?.code === "P0002") return 404;
  if (error?.code === "23505") return 409;
  if (error?.code === "22023" || error?.code === "23514") return 400;
  return 503;
}

function errorResponse(res: ClinicResponse, error: any) {
  const status = errorStatus(error);
  const code = status === 403 ? "not_authorized" : status === 404 ? "patient_not_found" : status === 409 ? "assignment_conflict" : status === 400 ? "invalid_patient_request" : "patient_operation_failed";
  console.error("[ClinicPatients] operação recusada/falhou", { code: error?.code || "unknown", status });
  return res.status(status).json({ ok: false, error: code });
}

function requireFeature(res: ClinicResponse, deps: ClinicPatientRouteDeps) {
  if (deps.clinicFeatureEnabled) return true;
  res.status(503).json({ ok: false, error: "feature_unavailable" });
  return false;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function onlyAllowedKeys(body: unknown, keys: string[]) {
  if (!isObject(body)) return false;
  return Object.keys(body).every((key) => keys.includes(key));
}

function readUuidArray(value: unknown) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => !readClinicPatientUuid(item))) return null;
  return value.map((item) => readClinicPatientUuid(item) as string);
}

function readOptionalDate(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

function readOptionalText(value: unknown, maxLength: number) {
  if (value === undefined || value === null) return null;
  return typeof value === "string" && value.trim().length <= maxLength ? value.trim() : undefined;
}

export function registerClinicPatientRoutes(app: any, deps: ClinicPatientRouteDeps) {
  app.get("/api/clinic/patients", deps.requireAuth, async (req: ClinicRequest, res: ClinicResponse) => {
    withCommonHeaders(res);
    if (!requireFeature(res, deps)) return;
    const organizationId = readClinicPatientUuid(req.query?.organizationId);
    const search = typeof req.query?.search === "string" ? req.query.search.trim().slice(0, 100) : null;
    const client = getUserClient(req, deps);
    if (!organizationId || !client) return res.status(400).json({ ok: false, error: "invalid_patient_request" });
    try {
      const { data, error } = await client.rpc("list_organization_patients", { p_organization_id: organizationId, p_search: search });
      if (error) return errorResponse(res, error);
      return res.json({ ok: true, organizationId, patients: Array.isArray(data) ? data : [] });
    } catch (error) {
      return errorResponse(res, error);
    }
  });

  app.post("/api/clinic/patients", deps.requireAuth, async (req: ClinicRequest, res: ClinicResponse) => {
    withCommonHeaders(res);
    if (!requireFeature(res, deps)) return;
    const body = req.body;
    const client = getUserClient(req, deps);
    if (!client || !onlyAllowedKeys(body, ["organizationId", "fullName", "birthDate", "phone", "primaryProfessionalId", "secondaryProfessionalIds", "consultantProfessionalIds"])) {
      return res.status(400).json({ ok: false, error: "invalid_patient_request" });
    }
    const organizationId = readClinicPatientUuid(body.organizationId);
    const fullName = readOptionalText(body.fullName, 200);
    const birthDate = readOptionalDate(body.birthDate);
    const phone = readOptionalText(body.phone, 32);
    const primaryProfessionalId = body.primaryProfessionalId === undefined ? null : readClinicPatientUuid(body.primaryProfessionalId);
    const secondaryProfessionalIds = readUuidArray(body.secondaryProfessionalIds);
    const consultantProfessionalIds = readUuidArray(body.consultantProfessionalIds);
    if (!organizationId || !fullName || birthDate === undefined || phone === undefined || (body.primaryProfessionalId !== undefined && !primaryProfessionalId) || !secondaryProfessionalIds || !consultantProfessionalIds) {
      return res.status(400).json({ ok: false, error: "invalid_patient_request" });
    }
    try {
      const { data, error } = await client.rpc("create_organization_patient", {
        p_organization_id: organizationId,
        p_full_name: fullName,
        p_birth_date: birthDate,
        p_phone: phone,
        p_primary_professional_id: primaryProfessionalId,
        p_secondary_professional_ids: secondaryProfessionalIds,
        p_consultant_professional_ids: consultantProfessionalIds,
      });
      if (error) return errorResponse(res, error);
      return res.status(201).json({ ok: true, patient: data });
    } catch (error) {
      return errorResponse(res, error);
    }
  });

  app.get("/api/clinic/patients/:organizationPatientId", deps.requireAuth, async (req: ClinicRequest, res: ClinicResponse) => {
    withCommonHeaders(res);
    if (!requireFeature(res, deps)) return;
    const organizationPatientId = readClinicPatientUuid(req.params?.organizationPatientId);
    const client = getUserClient(req, deps);
    if (!organizationPatientId || !client) return res.status(400).json({ ok: false, error: "invalid_patient_request" });
    try {
      const { data, error } = await client.rpc("get_organization_patient", { p_organization_patient_id: organizationPatientId });
      if (error) return errorResponse(res, error);
      return res.json({ ok: true, patient: data });
    } catch (error) {
      return errorResponse(res, error);
    }
  });

  app.patch("/api/clinic/patients/:organizationPatientId", deps.requireAuth, async (req: ClinicRequest, res: ClinicResponse) => {
    withCommonHeaders(res);
    if (!requireFeature(res, deps)) return;
    const organizationPatientId = readClinicPatientUuid(req.params?.organizationPatientId);
    const body = req.body;
    const client = getUserClient(req, deps);
    if (!organizationPatientId || !client || !onlyAllowedKeys(body, ["fullName", "birthDate", "phone"])) return res.status(400).json({ ok: false, error: "invalid_patient_request" });
    const fullName = readOptionalText(body.fullName, 200);
    const birthDate = readOptionalDate(body.birthDate);
    const phone = readOptionalText(body.phone, 32);
    if (fullName === undefined || birthDate === undefined || phone === undefined) return res.status(400).json({ ok: false, error: "invalid_patient_request" });
    try {
      const { data, error } = await client.rpc("update_organization_patient", { p_organization_patient_id: organizationPatientId, p_full_name: fullName, p_birth_date: birthDate, p_phone: phone });
      if (error) return errorResponse(res, error);
      return res.json({ ok: true, patient: data });
    } catch (error) {
      return errorResponse(res, error);
    }
  });

  app.post("/api/clinic/patients/:organizationPatientId/assignments", deps.requireAuth, async (req: ClinicRequest, res: ClinicResponse) => {
    withCommonHeaders(res);
    if (!requireFeature(res, deps)) return;
    const organizationPatientId = readClinicPatientUuid(req.params?.organizationPatientId);
    const body = req.body;
    const client = getUserClient(req, deps);
    if (!organizationPatientId || !client || !onlyAllowedKeys(body, ["professionalId", "assignmentRole"]) || !["secondary", "consultant"].includes(body.assignmentRole)) return res.status(400).json({ ok: false, error: "invalid_patient_request" });
    const professionalId = readClinicPatientUuid(body.professionalId);
    if (!professionalId) return res.status(400).json({ ok: false, error: "invalid_patient_request" });
    try {
      const { data, error } = await client.rpc("add_organization_patient_assignment", { p_organization_patient_id: organizationPatientId, p_professional_id: professionalId, p_assignment_role: body.assignmentRole });
      if (error) return errorResponse(res, error);
      return res.status(201).json({ ok: true, assignment: data });
    } catch (error) {
      return errorResponse(res, error);
    }
  });

  app.delete("/api/clinic/patients/:organizationPatientId/assignments/:assignmentId", deps.requireAuth, async (req: ClinicRequest, res: ClinicResponse) => {
    withCommonHeaders(res);
    if (!requireFeature(res, deps)) return;
    const assignmentId = readClinicPatientUuid(req.params?.assignmentId);
    const organizationPatientId = readClinicPatientUuid(req.params?.organizationPatientId);
    const client = getUserClient(req, deps);
    if (!assignmentId || !organizationPatientId || !client) return res.status(400).json({ ok: false, error: "invalid_patient_request" });
    try {
      const { data, error } = await client.rpc("revoke_organization_patient_assignment", { p_assignment_id: assignmentId });
      if (error) return errorResponse(res, error);
      return res.json({ ok: true, assignment: data });
    } catch (error) {
      return errorResponse(res, error);
    }
  });
}
