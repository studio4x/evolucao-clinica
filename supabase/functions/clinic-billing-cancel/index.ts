import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  ClinicBillingHttpError,
  clinicCorsHeaders,
  clinicJsonResponse,
  createClinicAdminClient,
  createClinicStripe,
  assertSandboxAccount,
  assertClinicBillingOwnerAuthorized,
  getClinicConfig,
  requireClinicUser,
  requireJsonObject,
  requireUuid,
  rpc,
  assertClinicBillingMutationStatus,
  recoverStaleClinicBillingOperation,
  reconcileClinicStripeSubscription,
  resolveClinicSubscription,
  getCatalog,
} from "../_shared/clinicBilling.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: clinicCorsHeaders });
  if (req.method !== "POST") return clinicJsonResponse({ error: "method_not_allowed" }, 405);
  let operationId: string | null = null;
  let organizationId: string | null = null;
  let stripeMutationAttempted = false;
  try {
    const admin = createClinicAdminClient();
    const user = await requireClinicUser(req, admin);
    const body = requireJsonObject(await req.json());
    organizationId = requireUuid(body.organizationId, "organizationId");
    await assertClinicBillingOwnerAuthorized(admin, organizationId, user.id);
    const config = await getClinicConfig(true);
    const stripe = createClinicStripe(config.secretKey);
    await assertSandboxAccount(stripe);
    const idempotencyKey = requireUuid(body.idempotencyKey, "idempotencyKey");
    let recovery = await recoverStaleClinicBillingOperation(admin, stripe, organizationId, user.id);
    if (recovery?.status === "pending_payment") {
      return clinicJsonResponse({ status: "pending_payment", operation_id: recovery.operation.operation_id, payment_action_required: true });
    }
    let prepared = await rpc<any>(admin, "prepare_clinic_billing_operation", {
      p_organization_id: organizationId,
      p_actor_professional_id: user.id,
      p_operation_type: "cancel_at_period_end",
      p_target_seats: null,
      p_idempotency_key: idempotencyKey,
    });
    if (prepared.recovery_required) {
      recovery = await recoverStaleClinicBillingOperation(admin, stripe, organizationId, user.id);
      if (recovery?.status === "pending_payment") {
        return clinicJsonResponse({ status: "pending_payment", operation_id: recovery.operation.operation_id, payment_action_required: true });
      }
      prepared = await rpc<any>(admin, "prepare_clinic_billing_operation", {
        p_organization_id: organizationId,
        p_actor_professional_id: user.id,
        p_operation_type: "cancel_at_period_end",
        p_target_seats: null,
        p_idempotency_key: idempotencyKey,
      });
      if (prepared.recovery_required) throw new ClinicBillingHttpError(503, "A recuperação da operação comercial não foi conclusiva.", "stale_operation_inconclusive");
    }
    operationId = prepared.operation_id;
    if (prepared.status === "completed") return clinicJsonResponse({ status: "confirmed", operation: "cancel_at_period_end", operation_id: operationId, cancel_at_period_end: true, reused: true });
    if (!prepared.claimed) throw new ClinicBillingHttpError(409, "Já existe uma alteração comercial em andamento.", "billing_operation_in_progress");
    const status = await rpc<any>(admin, "get_clinic_billing_status", { p_organization_id: organizationId, p_actor_professional_id: user.id });
    const catalog = await getCatalog(admin, String(status?.subscription?.plan_code || ""));
    const current = await resolveClinicSubscription(stripe, prepared.subscription_id, catalog);
    assertClinicBillingMutationStatus(current);
    if (current.organizationId !== organizationId) throw new ClinicBillingHttpError(409, "A assinatura Stripe mudou antes do cancelamento.", "stale_subscription_state");
    let updated: any;
    await assertClinicBillingOwnerAuthorized(admin, organizationId, user.id);
    try {
      stripeMutationAttempted = true;
      updated = await stripe.subscriptions.update(prepared.subscription_id, { cancel_at_period_end: true } as any, { idempotencyKey: `clinic:billing:${organizationId}:${operationId}` });
    } catch (error) {
      stripeMutationAttempted = false;
      throw error;
    }
    if (updated?.livemode === true) throw new ClinicBillingHttpError(503, "Stripe Live é proibido nesta fase.", "stripe_live_forbidden");
    const reconciled = await reconcileClinicStripeSubscription(admin, stripe, prepared.subscription_id);
    return clinicJsonResponse({ status: "confirmed", operation: "cancel_at_period_end", operation_id: operationId, cancel_at_period_end: reconciled.resolved.cancelAtPeriodEnd, current_period_end: reconciled.resolved.currentPeriodEnd, billing: reconciled.local });
  } catch (error) {
    if (operationId && !stripeMutationAttempted) {
      const admin = createClinicAdminClient();
      await rpc(admin, "finish_clinic_billing_operation", { p_operation_id: operationId, p_status: "failed", p_error_code: error instanceof ClinicBillingHttpError ? error.code : "clinic_cancellation_failed" }).catch(() => undefined);
    }
    console.error("[clinic-billing-cancel]", error instanceof ClinicBillingHttpError ? error.code : "processing_error");
    return clinicJsonResponse({ error: error instanceof ClinicBillingHttpError ? error.code : "clinic_cancellation_failed" }, error instanceof ClinicBillingHttpError ? error.status : 400);
  }
});
