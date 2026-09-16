import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  ClinicBillingHttpError,
  clinicCorsHeaders,
  clinicJsonResponse,
  createClinicAdminClient,
  createClinicStripe,
  assertSandboxAccount,
  getClinicConfig,
  requireClinicUser,
  requireJsonObject,
  requireUuid,
  rpc,
  reconcileClinicStripeSubscription,
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
    const prepared = await rpc<any>(admin, "prepare_clinic_cancellation", { p_organization_id: organizationId, p_actor_professional_id: user.id });
    const idempotencyKey = body.idempotencyKey ? requireUuid(body.idempotencyKey, "idempotencyKey") : crypto.randomUUID();
    const updated: any = await stripe.subscriptions.update(prepared.subscription_id, { cancel_at_period_end: true } as any, { idempotencyKey });
    if (updated?.livemode === true) throw new ClinicBillingHttpError(503, "Stripe Live é proibido nesta fase.", "stripe_live_forbidden");
    const reconciled = await reconcileClinicStripeSubscription(admin, stripe, prepared.subscription_id);
    return clinicJsonResponse({ status: "confirmed", cancel_at_period_end: reconciled.resolved.cancelAtPeriodEnd, current_period_end: reconciled.resolved.currentPeriodEnd, billing: reconciled.local });
  } catch (error) {
    console.error("[clinic-billing-cancel]", error instanceof ClinicBillingHttpError ? error.code : "processing_error");
    return clinicJsonResponse({ error: error instanceof ClinicBillingHttpError ? error.code : "clinic_cancellation_failed" }, error instanceof ClinicBillingHttpError ? error.status : 400);
  }
});
