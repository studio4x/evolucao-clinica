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
  requireUuid,
  rpc,
  reconcileClinicStripeSubscription,
  resolveClinicSubscription,
} from "../_shared/clinicBilling.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: clinicCorsHeaders });
  if (req.method !== "POST") return clinicJsonResponse({ error: "method_not_allowed" }, 405);
  let operationId: string | null = null;
  let operationType: string | null = null;
  let organizationIdForCleanup: string | null = null;
  let stripeMutationAttempted = false;
  try {
    const admin = createClinicAdminClient();
    const user = await requireClinicUser(req, admin);
    const config = await getClinicConfig(true);
    const stripe = createClinicStripe(config.secretKey);
    await assertSandboxAccount(stripe);
    const body = requireJsonObject(await req.json());
    const organizationId = requireUuid(body.organizationId, "organizationId");
    organizationIdForCleanup = organizationId;
    const targetSeats = Number(body.contractedSeats);
    const idempotencyKey = requireUuid(body.idempotencyKey, "idempotencyKey");
    const status = await rpc<any>(admin, "get_clinic_billing_status", { p_organization_id: organizationId, p_actor_professional_id: user.id });
    const currentSeats = Number(status?.subscription?.contracted_seats || 0);
    operationType = targetSeats < currentSeats ? "seat_decrease" : "seat_increase";
    const prepared = await rpc<any>(admin, "prepare_clinic_billing_operation", {
      p_organization_id: organizationId,
      p_actor_professional_id: user.id,
      p_operation_type: operationType,
      p_target_seats: targetSeats,
      p_idempotency_key: idempotencyKey,
    });
    operationId = prepared.operation_id;
    if (prepared.status === "completed") return clinicJsonResponse({ status: "confirmed", operation: operationType, operation_id: operationId, target_seats: targetSeats, reused: true });
    const catalog = await getCatalog(admin, String(status?.subscription?.plan_code || ""));
    if (!prepared.claimed) {
      if (prepared.status === "pending_payment") {
        const reconciled = await reconcileClinicStripeSubscription(admin, stripe, prepared.subscription_id);
        if (reconciled.resolved.seatQuantity === targetSeats) {
          return clinicJsonResponse({ status: "confirmed", operation: operationType, operation_id: operationId, target_seats: targetSeats, billing: reconciled.local, reused: true });
        }
        return clinicJsonResponse({ status: "pending_payment", operation: operationType, operation_id: operationId, payment_action_required: true, target_seats: targetSeats });
      }
      throw new ClinicBillingHttpError(409, "Já existe uma alteração comercial em andamento.", "billing_operation_in_progress");
    }
    const current = await resolveClinicSubscription(stripe, prepared.subscription_id, catalog);
    if (current.seatItemId !== prepared.stripe_reference || current.organizationId !== organizationId) throw new ClinicBillingHttpError(409, "A assinatura Stripe mudou antes da operação.", "stale_subscription_state");
    let updated: any;
    try {
      stripeMutationAttempted = true;
      updated = await stripe.subscriptions.update(prepared.subscription_id, {
        items: [{ id: prepared.stripe_reference, quantity: targetSeats }],
        proration_behavior: operationType === "seat_increase" ? "always_invoice" : "none",
        ...(operationType === "seat_increase" ? { payment_behavior: "pending_if_incomplete" } : {}),
      } as any, { idempotencyKey: `clinic:billing:${organizationId}:${operationId}` });
    } catch (error) {
      stripeMutationAttempted = false;
      throw error;
    }
    if (operationType === "seat_increase" && updated?.pending_update) {
      await rpc(admin, "finish_clinic_billing_operation", { p_operation_id: operationId, p_status: "pending_payment", p_error_code: null });
      return clinicJsonResponse({ status: "pending_payment", operation: operationType, operation_id: operationId, payment_action_required: true, target_seats: targetSeats });
    }
    const reconciled = await reconcileClinicStripeSubscription(admin, stripe, prepared.subscription_id);
    return clinicJsonResponse({ status: "confirmed", operation: operationType, operation_id: operationId, target_seats: targetSeats, billing: reconciled.local });
  } catch (error) {
    if (operationId && !stripeMutationAttempted) {
      const admin = createClinicAdminClient();
      if (operationType === "seat_decrease" && organizationIdForCleanup) await rpc(admin, "clear_clinic_pending_seat_change", { p_organization_id: organizationIdForCleanup, p_reason: "Stripe seat reduction update failed" }).catch(() => undefined);
      await rpc(admin, "finish_clinic_billing_operation", { p_operation_id: operationId, p_status: "failed", p_error_code: error instanceof ClinicBillingHttpError ? error.code : "clinic_seat_change_failed" }).catch(() => undefined);
    }
    console.error("[clinic-billing-seats]", error instanceof ClinicBillingHttpError ? error.code : "processing_error");
    return clinicJsonResponse({ error: error instanceof ClinicBillingHttpError ? error.code : "clinic_seat_change_failed" }, error instanceof ClinicBillingHttpError ? error.status : 400);
  }
});
