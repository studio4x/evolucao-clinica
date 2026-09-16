import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { clinicCorsHeaders, clinicJsonResponse, createClinicAdminClient, getClinicConfig, requireClinicUser, requireUuid, rpc } from "../_shared/clinicBilling.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: clinicCorsHeaders });
  if (req.method !== "GET" && req.method !== "POST") return clinicJsonResponse({ error: "method_not_allowed" }, 405);
  try {
    const admin = createClinicAdminClient();
    await getClinicConfig(false);
    const user = await requireClinicUser(req, admin);
    const body = req.method === "POST" && req.headers.get("content-type")?.includes("application/json") ? await req.json() : null;
    const organizationId = requireUuid(body?.organizationId || new URL(req.url).searchParams.get("organizationId"), "organizationId");
    const status = await rpc<any>(admin, "get_clinic_billing_status", { p_organization_id: organizationId, p_actor_professional_id: user.id });
    return clinicJsonResponse({ billing: status, clinic_billing_enabled: String(Deno.env.get("CLINIC_BILLING_ENABLED") || "false").toLowerCase() === "true" });
  } catch (error) {
    return clinicJsonResponse({ error: error instanceof Error && "code" in error ? (error as any).code : "clinic_billing_status_failed" }, error instanceof Error && "status" in error ? (error as any).status : 400);
  }
});
