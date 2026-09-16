import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { clinicCorsHeaders, clinicJsonResponse, createClinicAdminClient, getCatalog, getClinicConfig, requireClinicUser, requireUuid, rpc } from "../_shared/clinicBilling.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: clinicCorsHeaders });
  if (req.method !== "POST") return clinicJsonResponse({ error: "method_not_allowed" }, 405);
  try {
    const admin = createClinicAdminClient();
    await getClinicConfig(false);
    const user = await requireClinicUser(req, admin);
    const body = req.headers.get("content-type")?.includes("application/json") ? await req.json() : {};
    const organizationId = requireUuid(body.organizationId, "organizationId");
    await rpc(admin, "get_clinic_billing_status", { p_organization_id: organizationId, p_actor_professional_id: user.id });
    const catalog = await Promise.all(["clinic_monthly", "clinic_yearly"].map((planCode) => getCatalog(admin, planCode)));
    return clinicJsonResponse({ catalog: catalog.map((item: any) => ({
      plan_code: item.plan_code,
      billing_interval: item.billing_interval,
      currency: item.currency,
      base_amount_minor: item.base_amount_minor,
      seat_amount_minor: item.seat_amount_minor,
      minimum_contracted_seats: item.minimum_contracted_seats,
    })) });
  } catch (error) {
    const typed = error as any;
    return clinicJsonResponse({ error: typed?.code || "clinic_catalog_failed" }, typed?.status || 400);
  }
});
