import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@13.10.0";
import {
  ClinicBillingHttpError,
  clinicJsonResponse,
  createClinicAdminClient,
  createClinicStripe,
  finishEvent,
  getClinicConfig,
  reconcileClinicStripeSubscription,
  recordEvent,
  rpc,
} from "../_shared/clinicBilling.ts";

const SUPPORTED_EVENTS = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
]);

function asId(value: any) { return typeof value === "string" ? value : value?.id || null; }
function subscriptionIdFromInvoice(invoice: any) { return asId(invoice?.parent?.subscription_details?.subscription) || asId(invoice?.subscription); }

async function currentSubscriptionId(stripe: Stripe, event: any) {
  const object: any = event.data.object;
  if (event.type === "checkout.session.completed") return asId(object?.subscription);
  if (event.type.startsWith("customer.subscription.")) return asId(object);
  return subscriptionIdFromInvoice(object);
}

serve(async (req) => {
  if (req.method !== "POST") return clinicJsonResponse({ error: "method_not_allowed" }, 405);
  const signature = req.headers.get("stripe-signature");
  if (!signature) return clinicJsonResponse({ error: "signature_required" }, 400);
  let event: any;
  let admin: any;
  try {
    admin = createClinicAdminClient();
    const config = await getClinicConfig(false);
    if (!config.webhookSecret) return clinicJsonResponse({ error: "webhook_secret_missing" }, 503);
    const stripe = createClinicStripe(config.secretKey);
    const account = await stripe.accounts.retrieve();
    if (account.livemode === true || (account.business_profile?.name || account.settings?.dashboard?.display_name) !== "Sandbox Evolução Clínica") {
      throw new ClinicBillingHttpError(503, "Stripe Test account validation failed.", "stripe_test_account_invalid");
    }
    const rawBody = await req.text();
    try {
      event = await stripe.webhooks.constructEventAsync(rawBody, signature, config.webhookSecret);
    } catch {
      return clinicJsonResponse({ error: "invalid_signature" }, 400);
    }
    const subscriptionId = await currentSubscriptionId(stripe, event);
    let preliminary: any = null;
    if (subscriptionId && event.type !== "customer.subscription.deleted") {
      preliminary = await stripe.subscriptions.retrieve(subscriptionId);
    } else if (event.type === "customer.subscription.deleted") {
      preliminary = event.data.object;
    }
    const metadata = preliminary?.metadata || event.data.object?.metadata || {};
    const isClinic = metadata.billingScope === "clinic" || metadata.billing_scope === "clinic";
    const claimed = await recordEvent(admin, event, metadata.organizationId || null, subscriptionId);
    if (claimed?.duplicate) return clinicJsonResponse({ received: true, duplicate: true });
    if (!SUPPORTED_EVENTS.has(event.type) || !isClinic || !subscriptionId) {
      await finishEvent(admin, event.id, "ignored");
      return clinicJsonResponse({ received: true, ignored: true });
    }
    const reconciled = await reconcileClinicStripeSubscription(admin, stripe, subscriptionId);
    const attemptId = reconciled.resolved.subscription?.metadata?.checkoutAttemptId;
    if (attemptId && event.type === "checkout.session.completed") {
      await rpc(admin, "update_clinic_checkout_attempt", { p_attempt_id: attemptId, p_status: "completed", p_stripe_checkout_session_id: event.data.object.id, p_stripe_customer_id: reconciled.resolved.customerId, p_stripe_subscription_id: subscriptionId });
    }
    if (event.type === "invoice.paid" || event.type === "invoice.payment_failed") {
      const invoice: any = event.data.object;
      const invoiceId = String(invoice.id || "");
      if (!/^in_[A-Za-z0-9]+$/.test(invoiceId)) throw new ClinicBillingHttpError(400, "Invoice Stripe inválida.", "stripe_invoice_invalid");
      await rpc(admin, "record_clinic_stripe_transaction", {
        p_organization_id: reconciled.resolved.organizationId,
        p_stripe_invoice_id: invoiceId,
        p_stripe_subscription_id: subscriptionId,
        p_amount_minor: Number(invoice.amount_paid ?? invoice.amount_due ?? 0),
        p_currency: String(invoice.currency || "brl").toUpperCase(),
        p_status: event.type === "invoice.paid" ? "paid" : "failed",
        p_billing_reason: invoice.billing_reason || null,
        p_invoice_url: invoice.hosted_invoice_url || null,
        p_invoice_pdf_url: invoice.invoice_pdf || null,
      });
    }
    if (attemptId && ["invoice.paid", "customer.subscription.updated", "customer.subscription.created"].includes(event.type)) {
      const status = reconciled.local?.financial_status === "active" ? "activated" : "completed";
      await rpc(admin, "update_clinic_checkout_attempt", { p_attempt_id: attemptId, p_status: status, p_stripe_subscription_id: subscriptionId, p_stripe_customer_id: reconciled.resolved.customerId });
    }
    await finishEvent(admin, event.id, "processed");
    return clinicJsonResponse({ received: true });
  } catch (error) {
    if (event?.id && admin) await finishEvent(admin, event.id, "failed", error instanceof ClinicBillingHttpError ? error.code : "processing_error").catch(() => undefined);
    console.error("[clinic-stripe-webhook]", error instanceof ClinicBillingHttpError ? error.code : "processing_error");
    return clinicJsonResponse({ error: error instanceof ClinicBillingHttpError ? error.code : "processing_error" }, error instanceof ClinicBillingHttpError ? error.status : 500);
  }
});
