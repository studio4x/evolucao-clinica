import { createUserScopedClient } from "../supabase/createUserScopedClient.js";

type ClinicContextRouteDeps = {
  requireAuth: any;
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseAdmin?: any;
  clinicFeatureEnabled: boolean;
  appEnv?: string;
};

type ClinicRequest = {
  headers: { authorization?: string };
  body?: any;
  user?: { id?: string };
};

type ClinicResponse = {
  setHeader(name: string, value: string): void;
  status(code: number): ClinicResponse;
  json(body: unknown): unknown;
};

function readBearerToken(req: ClinicRequest) {
  const header = req.headers.authorization || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function normalizeOrganization(row: any) {
  const organization = Array.isArray(row.organizations) ? row.organizations[0] : row.organizations;
  if (!organization?.id || !organization?.name) return null;

  return {
    id: String(organization.id),
    name: String(organization.name),
    tradeName: organization.trade_name == null ? null : String(organization.trade_name),
    operationalStatus: String(organization.operational_status),
    membershipRole: String(row.membership_role),
    clinicalAccessEnabled: row.clinical_access_enabled === true,
  };
}

export function resolveClinicOrganizations(rows: any[]) {
  return rows
    .filter((row) => row?.status === "active")
    .map(normalizeOrganization)
    .filter((organization): organization is NonNullable<ReturnType<typeof normalizeOrganization>> => organization !== null)
    .filter((organization) => organization.operationalStatus !== "archived");
}

export function registerClinicContextRoutes(app: any, deps: ClinicContextRouteDeps) {
  const isDiagnosticRequest = (req: ClinicRequest) =>
    deps.appEnv === "staging" && req.headers["x-phase-2c-diagnostic"] === "phase2c-context-matrix-20260917";

  app.post("/api/clinic/contexts/diagnostic-accept", deps.requireAuth, async (req: ClinicRequest, res: ClinicResponse) => {
    if (!isDiagnosticRequest(req) || !deps.supabaseAdmin) return res.status(404).json({ ok: false, error: "not_found" });

    const token = readBearerToken(req);
    const userId = req.user?.id;
    const organizationId = typeof req.body?.organizationId === "string" ? req.body.organizationId : null;
    const ownerId = typeof req.body?.ownerId === "string" ? req.body.ownerId : null;
    if (!token || !userId || !organizationId || !ownerId) return res.status(400).json({ ok: false, error: "invalid_request" });

    try {
      const authUser = await deps.supabaseAdmin.auth.admin.getUserById(userId);
      const email = authUser.data.user?.email;
      if (authUser.error || !email) return res.status(409).json({ ok: false, error: "controlled_user_unavailable" });

      const invitation = await deps.supabaseAdmin.rpc("issue_organization_invitation_server", {
        p_organization_id: organizationId,
        p_actor: ownerId,
        p_email: email,
        p_intended_role: "professional",
        p_intended_clinical_access: true,
        p_provider: "mock",
      });
      const rawToken = invitation.data?.token;
      if (invitation.error || typeof rawToken !== "string") return res.status(503).json({ ok: false, error: "diagnostic_invitation_failed" });

      const userScopedClient = createUserScopedClient({ supabaseUrl: deps.supabaseUrl, supabaseAnonKey: deps.supabaseAnonKey, accessToken: token });
      const accepted = await userScopedClient.rpc("accept_organization_invitation", { p_raw_token: rawToken });
      if (accepted.error) return res.status(503).json({ ok: false, error: "diagnostic_accept_failed" });
      return res.json({ ok: true, accepted: accepted.data?.status === "accepted", clinical_access_enabled: accepted.data?.clinical_access_enabled === true });
    } catch {
      return res.status(503).json({ ok: false, error: "diagnostic_accept_failed" });
    }
  });

  app.post("/api/clinic/contexts/diagnostic-matrix", deps.requireAuth, async (req: ClinicRequest, res: ClinicResponse) => {
    if (!isDiagnosticRequest(req)) {
      return res.status(404).json({ ok: false, error: "not_found" });
    }

    const token = readBearerToken(req);
    const userId = req.user?.id;
    if (!token || !userId) return res.status(401).json({ ok: false, error: "authentication_required" });

    const safeErrorCode = (error: any) => error?.code ? String(error.code).slice(0, 32) : null;
    try {
      const userScopedClient = createUserScopedClient({
        supabaseUrl: deps.supabaseUrl,
        supabaseAnonKey: deps.supabaseAnonKey,
        accessToken: token,
      });

      const a = await userScopedClient
        .from("organization_memberships")
        .select("organization_id,membership_role,status,clinical_access_enabled")
        .eq("professional_id", userId)
        .eq("status", "active");

      const b = await userScopedClient
        .from("organization_memberships")
        .select("organization_id,membership_role,status,clinical_access_enabled,organizations!inner(id,name,trade_name,operational_status)")
        .eq("professional_id", userId)
        .eq("status", "active");

      const organizationId = a.data?.[0]?.organization_id;
      const c = organizationId
        ? await userScopedClient.from("organizations").select("id,name,trade_name,operational_status").eq("id", organizationId)
        : { data: [], error: null };

      const nestedOrganizationPresent = Boolean((b.data || []).some((row: any) => {
        const organization = Array.isArray(row.organizations) ? row.organizations[0] : row.organizations;
        return Boolean(organization?.id);
      }));

      return res.json({
        ok: true,
        matrix: {
          A_STATUS: a.error ? "error" : "success",
          A_ERROR_CODE: safeErrorCode(a.error),
          A_ROWS_COUNT: a.data?.length || 0,
          A_EXPECTED_MEMBERSHIP_FOUND: Boolean(a.data?.length),
          B_STATUS: b.error ? "error" : "success",
          B_ERROR_CODE: safeErrorCode(b.error),
          B_ROWS_COUNT: b.data?.length || 0,
          B_EXPECTED_MEMBERSHIP_FOUND: Boolean(b.data?.length),
          B_NESTED_ORGANIZATION_PRESENT: nestedOrganizationPresent,
          C_STATUS: c.error ? "error" : "success",
          C_ERROR_CODE: safeErrorCode(c.error),
          C_ROWS_COUNT: c.data?.length || 0,
          C_EXPECTED_ORGANIZATION_FOUND: Boolean(c.data?.length),
        },
      });
    } catch {
      return res.status(503).json({ ok: false, error: "diagnostic_failed" });
    }
  });

  app.get("/api/clinic/contexts", deps.requireAuth, async (req: ClinicRequest, res: ClinicResponse) => {
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Vary", "Authorization");

    if (!deps.clinicFeatureEnabled && !isDiagnosticRequest(req)) {
      return res.status(503).json({ ok: false, error: "feature_unavailable" });
    }

    const token = readBearerToken(req);
    const userId = req.user?.id;
    if (!token || !userId) {
      return res.status(401).json({ ok: false, error: "authentication_required" });
    }

    try {
      const userScopedClient = createUserScopedClient({
        supabaseUrl: deps.supabaseUrl,
        supabaseAnonKey: deps.supabaseAnonKey,
        accessToken: token,
      });

      const { data, error } = await userScopedClient
        .from("organization_memberships")
        .select("organization_id,membership_role,status,clinical_access_enabled,organizations!inner(id,name,trade_name,operational_status)")
        .eq("professional_id", userId)
        .eq("status", "active");

      if (error) {
        console.error("[ClinicContexts] Falha ao resolver contexto autorizado:", error.message);
        return res.status(503).json({ ok: false, error: "context_resolution_failed" });
      }

      const organizations = resolveClinicOrganizations(data || []);

      return res.json({
        ok: true,
        personal: { available: true },
        organizations,
      });
    } catch (error) {
      console.error("[ClinicContexts] Erro inesperado ao resolver contexto:", error instanceof Error ? error.message : "unknown");
      return res.status(503).json({ ok: false, error: "context_resolution_failed" });
    }
  });
}
