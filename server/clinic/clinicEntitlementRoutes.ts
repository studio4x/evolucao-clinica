import { createUserScopedClient } from "../supabase/createUserScopedClient.js";

type ClinicRequest = any;
type ClinicResponse = any;

export type ClinicEntitlementRouteDeps = {
  requireAuth: any;
  supabaseUrl: string;
  supabaseAnonKey: string;
  clinicFeatureEnabled: boolean;
};

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function noStore(res: ClinicResponse) {
  res.set("Cache-Control", "private, no-store");
  res.set("Vary", "Authorization");
}

function readBearerToken(req: ClinicRequest) {
  const header = req.headers?.authorization || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function mapError(error: any) {
  const code = String(error?.code || "");
  if (code === "42501") return { status: 403, error: "not_authorized" };
  if (code === "P0001") return { status: 409, error: "no_clinical_seats_available" };
  if (code === "22023") return { status: 400, error: "invalid_entitlement_request" };
  return { status: 500, error: "entitlement_operation_failed" };
}

export function registerClinicEntitlementRoutes(app: any, deps: ClinicEntitlementRouteDeps) {
  app.get("/api/clinic/entitlement", deps.requireAuth, async (req: ClinicRequest, res: ClinicResponse) => {
    noStore(res);
    if (!deps.clinicFeatureEnabled) return res.status(503).json({ error: "feature_unavailable" });
    const organizationId = req.query?.organizationId;
    if (!isUuid(organizationId)) return res.status(400).json({ error: "invalid_organization_id" });
    try {
      const accessToken = readBearerToken(req);
      if (!accessToken) return res.status(401).json({ error: "authentication_required" });
      const client = createUserScopedClient({
        supabaseUrl: deps.supabaseUrl,
        supabaseAnonKey: deps.supabaseAnonKey,
        accessToken,
      });
      const { data, error } = await client.rpc("get_organization_seat_summary", { p_organization_id: organizationId });
      if (error) throw error;
      const summary = Array.isArray(data) ? data[0] : data;
      if (!summary) return res.status(403).json({ error: "not_authorized" });
      return res.json({ entitlement: summary });
    } catch (error) {
      const mapped = mapError(error);
      return res.status(mapped.status).json({ error: mapped.error });
    }
  });

  app.post("/api/clinic/team/:professionalId/clinical-access", deps.requireAuth, async (req: ClinicRequest, res: ClinicResponse) => {
    noStore(res);
    if (!deps.clinicFeatureEnabled) return res.status(503).json({ error: "feature_unavailable" });
    const organizationId = req.body?.organizationId;
    const professionalId = req.params?.professionalId;
    const enabled = req.body?.enabled;
    const reason = typeof req.body?.reason === "string" ? req.body.reason.slice(0, 500) : undefined;
    if (!isUuid(organizationId) || !isUuid(professionalId) || typeof enabled !== "boolean") {
      return res.status(400).json({ error: "invalid_clinical_access_request" });
    }
    try {
      const accessToken = readBearerToken(req);
      if (!accessToken) return res.status(401).json({ error: "authentication_required" });
      const client = createUserScopedClient({
        supabaseUrl: deps.supabaseUrl,
        supabaseAnonKey: deps.supabaseAnonKey,
        accessToken,
      });
      const rpcName = enabled
        ? "enable_organization_member_clinical_access"
        : "disable_organization_member_clinical_access";
      const { data, error } = await client.rpc(rpcName, {
        p_organization_id: organizationId,
        p_target_professional_id: professionalId,
        p_reason: reason || null,
      });
      if (error) throw error;
      return res.json({ ok: true, enabled, membership: data });
    } catch (error) {
      const mapped = mapError(error);
      return res.status(mapped.status).json({ error: mapped.error });
    }
  });
}
