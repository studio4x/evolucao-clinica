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

export type ClinicContextOrganization = {
  id: string;
  name: string;
  tradeName: string | null;
  operationalStatus: string;
  membershipRole: string;
  clinicalAccessEnabled: boolean;
  planCode: string | null;
  planLabel: string | null;
  entitlementMode: string;
  accessSource: string;
  licenseActive: boolean;
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
    planCode: row.plan_code == null ? null : String(row.plan_code),
    planLabel: row.plan_label == null ? null : String(row.plan_label),
    entitlementMode: String(row.entitlement_mode || "none"),
    accessSource: String(row.access_source || "organization_membership"),
    licenseActive: row.license_active === true,
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

      const [{ data: contextData, error: contextError }, pending] = await Promise.all([
        userScopedClient.rpc("get_clinic_contexts"),
        userScopedClient.rpc("get_pending_organization_checkout_contexts"),
      ]);

      // Keep a safe compatibility path while the additive staging migration is
      // rolling out. It never grants access; it only preserves the old list.
      let data: any[] = [];
      let personal = { available: true };
      let accessMode = "personal";
      let error = contextError;
      if (!contextError && contextData && !Array.isArray(contextData)) {
        personal = { available: contextData.personal?.available === true };
        accessMode = typeof contextData.accessMode === "string" ? contextData.accessMode : "personal";
        data = Array.isArray(contextData.organizations) ? contextData.organizations.map((organization: any) => ({
          status: "active",
          membership_role: organization.membershipRole,
          clinical_access_enabled: organization.clinicalAccessEnabled,
          plan_code: organization.planCode,
          plan_label: organization.planLabel,
          entitlement_mode: organization.entitlementMode,
          access_source: organization.accessSource,
          license_active: organization.licenseActive,
          organizations: {
            id: organization.id,
            name: organization.name,
            trade_name: organization.tradeName,
            operational_status: organization.operationalStatus,
          },
        })) : [];
        error = null;
      } else if (contextError) {
        const fallback = await userScopedClient
          .from("organization_memberships")
          .select("organization_id,membership_role,status,clinical_access_enabled,organizations!inner(id,name,trade_name,operational_status)")
          .eq("professional_id", userId)
          .eq("status", "active");
        data = fallback.data || [];
        error = fallback.error;
      }

      if (error || pending.error) {
        console.error("[ClinicContexts] Falha ao resolver contexto autorizado:", error?.code || pending.error?.code);
        return res.status(503).json({ ok: false, error: "context_resolution_failed" });
      }

      const pendingOrganizations = resolveClinicOrganizations((pending.data || []).map((organization: any) => ({
        status: "active", membership_role: "owner", clinical_access_enabled: false, organizations: organization,
      })));
      const organizationMap = new Map(resolveClinicOrganizations(data || []).map((organization) => [organization.id, organization]));
      for (const organization of pendingOrganizations) {
        if (!organizationMap.has(organization.id)) organizationMap.set(organization.id, organization);
      }
      const organizations = [...organizationMap.values()];

      return res.json({
        ok: true,
        personal,
        accessMode,
        organizations,
      });
    } catch (error) {
      console.error("[ClinicContexts] Erro inesperado ao resolver contexto:", error instanceof Error ? error.message : "unknown");
      return res.status(503).json({ ok: false, error: "context_resolution_failed" });
    }
  });
}
