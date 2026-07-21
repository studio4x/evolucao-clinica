import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  BillingHttpError,
  corsHeaders,
  createAdminClient,
  createStripe,
  getBillingConfig,
  jsonResponse,
  refundExternalStripeTransaction,
  refundGooglePlayOrder,
  requireAuthenticatedUser,
} from "../_shared/billing.ts";

function asId(value: any) {
  return typeof value === "string" ? value : value?.id || null;
}

function paymentIntentIdsFromInvoice(invoice: any) {
  const ids = Array.isArray(invoice?.payments?.data)
    ? invoice.payments.data
      .map((item: any) => asId(item?.payment?.payment_intent))
      .filter(Boolean)
    : [];
  const legacyId = asId(invoice?.payment_intent);
  return Array.from(new Set(legacyId ? [...ids, legacyId] : ids)) as string[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Método não permitido." }, 405);

  try {
    const admin = createAdminClient();
    const user = await requireAuthenticatedUser(req, admin);
    const { transactionId, refundReason } = await req.json();
    if (!transactionId) throw new BillingHttpError(400, "Transação não informada.");

    const { data: transaction, error: transactionLookupError } = await admin
      .from("transactions")
      .select("*")
      .eq("id", transactionId)
      .single();
    if (transactionLookupError || !transaction) throw new BillingHttpError(404, "Transação não encontrada.");

    const { data: requester } = await admin.from("professionals")
      .select("role")
      .eq("id", user.id)
      .single();
    const isAdmin = requester?.role === "admin";
    if (transaction.professional_id !== user.id && !isAdmin) {
      throw new BillingHttpError(403, "Esta transação não pertence à conta autenticada.");
    }

    const ageInDays = (Date.now() - new Date(transaction.created_at).getTime()) / 86400000;
    if (ageInDays > 7 && !isAdmin) {
      throw new BillingHttpError(400, "O prazo de 7 dias para solicitar o reembolso expirou.");
    }
    if (transaction.status === "refunded") {
      return jsonResponse({ success: true, message: "Esta transação já foi reembolsada." });
    }

    const config = await getBillingConfig(admin);
    const provider = transaction.payment_provider ||
      (transaction.stripe_invoice_id ? "stripe" : transaction.play_purchase_token ? "google_play" : "simulation");

    if (provider === "stripe") {
      const stripe = createStripe(config.stripeSecretKey);
      if (!transaction.stripe_invoice_id) throw new Error("Fatura Stripe não encontrada para esta transação.");
      const invoice: any = await stripe.invoices.retrieve(transaction.stripe_invoice_id, {
        expand: ["payments.data.payment.payment_intent"],
      } as any);
      const paymentIntentIds = paymentIntentIdsFromInvoice(invoice);
      for (const paymentIntentId of paymentIntentIds) {
        await stripe.refunds.create({ payment_intent: paymentIntentId, reason: "requested_by_customer" });
      }
      const subscriptionId = asId(invoice?.parent?.subscription_details?.subscription) ||
        asId(invoice?.subscription) || transaction.stripe_subscription_id;
      if (subscriptionId) await stripe.subscriptions.cancel(subscriptionId);

      if (transaction.external_transaction_id) {
        await refundExternalStripeTransaction(config.googlePackageName, transaction.external_transaction_id);
      }
    } else if (provider === "google_play") {
      let orderId = transaction.play_order_id;
      if (!orderId) {
        const { data: billing } = await admin.from("billing_subscriptions")
          .select("metadata")
          .eq("professional_id", transaction.professional_id)
          .maybeSingle();
        orderId = billing?.metadata?.latestOrderId || null;
      }
      if (!orderId) throw new Error("Pedido Google Play não encontrado para reembolso.");
      await refundGooglePlayOrder(config.googlePackageName, orderId);
    }

    const now = new Date().toISOString();
    const { error: updateError } = await admin.from("transactions").update({
      status: "refunded",
      refund_reason: String(refundReason || "Cancelamento solicitado pelo cliente"),
    }).eq("id", transaction.id);
    if (updateError) throw updateError;

    await admin.from("billing_subscriptions").update({
      status: "refunded",
      updated_at: now,
    }).eq("professional_id", transaction.professional_id);
    await admin.from("professionals").update({
      subscription_status: "canceled",
      updated_at: now,
    }).eq("id", transaction.professional_id);

    return jsonResponse({ success: true, message: "Assinatura cancelada e reembolso processado." });
  } catch (error) {
    console.error("[process-refund]", error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Falha ao processar o reembolso." },
      error instanceof BillingHttpError ? error.status : 400,
    );
  }
});
