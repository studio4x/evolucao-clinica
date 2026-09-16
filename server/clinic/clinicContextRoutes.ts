import { createUserScopedClient } from "../supabase/createUserScopedClient.js";

type ClinicContextRouteDeps = {
  requireAuth: any;
  supabaseUrl: string;
  supabaseAnonKey: string;
  clinicFeatureEnabled: boolean;
};

type ClinicRequest = {
  headers: { authorization?: string };
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
  app.get("/api/clinic/contexts", deps.requireAuth, async (req: ClinicRequest, res: ClinicResponse) => {
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Vary", "Authorization");

    if (!deps.clinicFeatureEnabled) {
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
