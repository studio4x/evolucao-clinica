import { createUserScopedClient } from "../supabase/createUserScopedClient.js";

type ClinicTeamRouteDeps = {
  requireAuth: any;
  supabaseUrl: string;
  supabaseAnonKey: string;
  clinicFeatureEnabled: boolean;
};

type ClinicRequest = {
  headers: { authorization?: string };
  user?: { id?: string };
  query?: Record<string, unknown>;
  params?: Record<string, string | undefined>;
  body?: Record<string, unknown>;
};

type ClinicResponse = {
  setHeader(name: string, value: string): void;
  status(code: number): ClinicResponse;
  json(body: unknown): unknown;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readBearerToken(req: ClinicRequest) {
  const header = req.headers.authorization || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function readUuid(value: unknown) {
  return typeof value === "string" && UUID_PATTERN.test(value.trim()) ? value.trim() : null;
}

function readReason(value: unknown) {
  if (value == null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const reason = value.trim();
  return reason.length <= 500 ? reason || null : undefined;
}

function errorStatus(error: any) {
  if (error?.code === "42501") return 403;
  if (error?.code === "P0002") return 404;
  return 503;
}

function errorResponse(res: ClinicResponse, error: any) {
  const status = errorStatus(error);
  const errorCode = status === 403 ? "not_authorized" : status === 404 ? "organization_not_found" : "team_operation_failed";
  console.error("[ClinicTeam] Operação recusada/falhou:", error?.message || "unknown");
  return res.status(status).json({ ok: false, error: errorCode });
}

function withCommonHeaders(res: ClinicResponse) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Vary", "Authorization");
}

function getUserClient(req: ClinicRequest, deps: ClinicTeamRouteDeps) {
  const token = readBearerToken(req);
  const userId = req.user?.id;
  if (!token || !userId) return null;
  return createUserScopedClient({
    supabaseUrl: deps.supabaseUrl,
    supabaseAnonKey: deps.supabaseAnonKey,
    accessToken: token,
  });
}

function requireFeature(res: ClinicResponse, deps: ClinicTeamRouteDeps) {
  if (deps.clinicFeatureEnabled) return true;
  res.status(503).json({ ok: false, error: "feature_unavailable" });
  return false;
}

export function registerClinicTeamRoutes(app: any, deps: ClinicTeamRouteDeps) {
  app.get("/api/clinic/team", deps.requireAuth, async (req: ClinicRequest, res: ClinicResponse) => {
    withCommonHeaders(res);
    if (!requireFeature(res, deps)) return;

    const organizationId = readUuid(req.query?.organizationId);
    const client = getUserClient(req, deps);
    if (!organizationId || !client) {
      return res.status(400).json({ ok: false, error: "invalid_team_request" });
    }

    try {
      const { data, error } = await client.rpc("get_organization_team", {
        p_organization_id: organizationId,
      });
      if (error) return errorResponse(res, error);
      return res.json({
        ok: true,
        organizationId,
        members: Array.isArray(data) ? data : [],
      });
    } catch (error) {
      return errorResponse(res, error);
    }
  });

  const lifecycle = async (req: ClinicRequest, res: ClinicResponse, rpcName: string) => {
    withCommonHeaders(res);
    if (!requireFeature(res, deps)) return;

    const organizationId = readUuid(req.body?.organizationId);
    const targetProfessionalId = readUuid(req.params?.professionalId);
    const reason = readReason(req.body?.reason);
    const client = getUserClient(req, deps);
    if (!organizationId || !targetProfessionalId || reason === undefined || !client) {
      return res.status(400).json({ ok: false, error: "invalid_team_request" });
    }

    try {
      const { data, error } = await client.rpc(rpcName, {
        p_organization_id: organizationId,
        p_target_professional_id: targetProfessionalId,
        p_reason: reason,
      });
      if (error) return errorResponse(res, error);
      return res.json({ ok: true, organizationId, membership: data });
    } catch (error) {
      return errorResponse(res, error);
    }
  };

  app.post("/api/clinic/team/:professionalId/suspend", deps.requireAuth, (req: ClinicRequest, res: ClinicResponse) =>
    lifecycle(req, res, "suspend_organization_member"));
  app.post("/api/clinic/team/:professionalId/reactivate", deps.requireAuth, (req: ClinicRequest, res: ClinicResponse) =>
    lifecycle(req, res, "reactivate_organization_member"));
  app.post("/api/clinic/team/:professionalId/remove", deps.requireAuth, (req: ClinicRequest, res: ClinicResponse) =>
    lifecycle(req, res, "remove_organization_member"));

  app.patch("/api/clinic/team/:professionalId/role", deps.requireAuth, async (req: ClinicRequest, res: ClinicResponse) => {
    withCommonHeaders(res);
    if (!requireFeature(res, deps)) return;

    const organizationId = readUuid(req.body?.organizationId);
    const targetProfessionalId = readUuid(req.params?.professionalId);
    const newRole = req.body?.newRole;
    const reason = readReason(req.body?.reason);
    const client = getUserClient(req, deps);
    if (!organizationId || !targetProfessionalId || (newRole !== "manager" && newRole !== "professional") || reason === undefined || !client) {
      return res.status(400).json({ ok: false, error: "invalid_team_request" });
    }

    try {
      const { data, error } = await client.rpc("change_organization_member_role", {
        p_organization_id: organizationId,
        p_target_professional_id: targetProfessionalId,
        p_new_role: newRole,
        p_reason: reason,
      });
      if (error) return errorResponse(res, error);
      return res.json({ ok: true, organizationId, membership: data });
    } catch (error) {
      return errorResponse(res, error);
    }
  });

  app.post("/api/clinic/team/transfer-owner", deps.requireAuth, async (req: ClinicRequest, res: ClinicResponse) => {
    withCommonHeaders(res);
    if (!requireFeature(res, deps)) return;

    const organizationId = readUuid(req.body?.organizationId);
    const targetProfessionalId = readUuid(req.body?.targetProfessionalId);
    const client = getUserClient(req, deps);
    if (!organizationId || !targetProfessionalId || !client) {
      return res.status(400).json({ ok: false, error: "invalid_team_request" });
    }

    try {
      const { data, error } = await client.rpc("transfer_organization_owner", {
        p_organization_id: organizationId,
        p_target_professional_id: targetProfessionalId,
      });
      if (error) return errorResponse(res, error);
      return res.json({ ok: true, organizationId, membership: data });
    } catch (error) {
      return errorResponse(res, error);
    }
  });
}
