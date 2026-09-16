import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  ClinicBillingHttpError,
  clinicCorsHeaders,
  clinicJsonResponse,
  createClinicAdminClient,
  createClinicStripe,
  assertSandboxAccount,
  getCatalog,
  getClinicConfig,
  requireClinicUser,
  requireJsonObject,
  requireSeats,
  requireUuid,
  rpc,
  reconcileClinicStripeSubscription,
  resolveClinicSubscription,
} from "../_shared/clinicBilling.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: clinicCorsHeaders });
  if (req.method !== "POST") return clinicJsonResponse({ error: "method_not_allowed" }, 405);
  try {
    const admin = createClinicAdminClient();
    const user = await requireClinicUser(req, admin);
    const config = await getClinicConfig(true);
    const stripe = createClinicStripe(config.secretKey);
    await assertSandboxAccount(stripe);
    const body = requireJsonObject(await req.json());
    const organizationId = requireUuid(body.organizationId, "organizationId");
    const targetSeats = requireSeats(body.contractedSeats);
    const status = await rpc<any>(admin, "get_clinic_billing_status", { p_organization_id: organizationId, p_actor_professional_id: user.id });
    const planCode = String(status?.subscription?.plan_code || "");
    const catalog = await getCatalog(admin, planCode);
    const prepared = await rpc<any>(admin, "prepare_clinic_seat_change", { p_organization_id: organizationId, p_actor_professional_id: user.id, p_target_seats: targetSeats });
    const current = await resolveClinicSubscription(stripe, prepared.subscription_id, catalog);
    if (current.seatItemId !== prepared.seat_item_id || current.organizationId !== organizationId) throw new ClinicBillingHttpError(409, "A assinatura Stripe mudou antes da operação.", "stale_subscription_state");
    const idempotencyKey = body.idempotencyKey ? requireUuid(body.idempotencyKey, "idempotencyKey") : crypto.randomUUID();
    let updated: any;
    try {
      updated = await stripe.subscriptions.update(prepared.subscription_id, {
        items: [{ id: prepared.seat_item_id, quantity: targetSeats }],
        proration_behavior: prepared.operation === "increase" ? "always_invoice" : "none",
        ...(prepared.operation === "increase" ? { payment_behavior: "pending_if_incomplete" } : {}),
      } as any, { idempotencyKey });
    } catch (error) {
      if (prepared.operation === "decrease") await rpc(admin, "clear_clinic_pending_seat_change", { p_organization_id: organizationId, p_reason: "stripe seat reduction update failed" }).catch(() => undefined);
      throw error;
    }
    if (prepared.operation === "increase" && updated?.pending_update) {
      return clinicJsonResponse({ status: "pending_payment", payment_action_required: true, target_seats: targetSeats });
    }
    const reconciled = await reconcileClinicStripeSubscription(admin, stripe, prepared.subscription_id);
    return clinicJsonResponse({ status: "confirmed", operation: prepared.operation, target_seats: targetSeats, billing: reconciled.local });
  } catch (error) {
    console.error("[clinic-billing-seats]", error instanceof ClinicBillingHttpError ? error.code : "processing_error");
    return clinicJsonResponse({ error: error instanceof ClinicBillingHttpError ? error.code : "clinic_seat_change_failed" }, error instanceof ClinicBillingHttpError ? error.status : 400);
  }
});
