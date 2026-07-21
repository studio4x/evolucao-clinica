import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  createAdminClient,
  createStripe,
  getBillingConfig,
  projectSubscription,
  reportExternalStripeTransaction,
  stripeSubscriptionStatus,
} from "../_shared/billing.ts";

function asId(value: any) {
  return typeof value === "string" ? value : value?.id || null;
}

function isoFromSeconds(value: unknown) {
  const seconds = Number(value || 0);
  return seconds > 0 ? new Date(seconds * 1000).toISOString() : null;
}

function stripePeriodEnd(subscription: any) {
  const itemPeriods = Array.isArray(subscription?.items?.data)
    ? subscription.items.data
      .map((item: any) => Number(item?.current_period_end || 0))
      .filter((value: number) => value > 0)
    : [];
  const seconds = itemPeriods.length > 0
    ? Math.max(...itemPeriods)
    : Number(subscription?.current_period_end || 0);
  return isoFromSeconds(seconds);
}

function subscriptionIdFromInvoice(invoice: any) {
  return asId(invoice?.parent?.subscription_details?.subscription) || asId(invoice?.subscription);
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

async function resolveOwner(admin: any, subscription: any) {
  let userId = String(subscription?.metadata?.supabaseUserId || "");
  let planId = String(subscription?.metadata?.planId || "");
  if (userId && planId) return { userId, planId };

  const { data } = await admin.from("billing_subscriptions")
    .select("professional_id, plan_id")
    .eq("provider", "stripe")
    .eq("provider_subscription_id", subscription.id)
    .maybeSingle();
  userId = userId || data?.professional_id || "";
  planId = planId || data?.plan_id || "";
  return { userId, planId };
}

async function syncStripeSubscription(admin: any, subscription: any) {
  const { userId, planId } = await resolveOwner(admin, subscription);
  if (!userId || !planId) {
    console.warn(`[stripe-webhook] Assinatura ${subscription.id} sem vínculo de usuário/plano.`);
    return null;
  }

  const status = stripeSubscriptionStatus(String(subscription.status || ""));
  const currentPeriodEnd = stripePeriodEnd(subscription);
  const customerId = asId(subscription.customer);
  const channel = String(subscription?.metadata?.checkoutChannel || "web");

  const { data: existing } = await admin.from("billing_subscriptions")
    .select("*")
    .eq("professional_id", userId)
    .maybeSingle();

  if (
    existing &&
    ["active", "trialing", "in_grace_period"].includes(existing.status) &&
    existing.provider_subscription_id !== subscription.id
  ) {
    return { duplicate: true, existing, userId, planId, status, currentPeriodEnd };
  }

  const isAlternativeBilling = channel === "android_user_choice" || Boolean(existing?.external_transaction_token);
  const { error } = await admin.from("billing_subscriptions").upsert({
    professional_id: userId,
    provider: "stripe",
    plan_id: planId,
    provider_subscription_id: subscription.id,
    status,
    current_period_end: currentPeriodEnd,
    stripe_customer_id: customerId,
    initial_external_transaction_id:
      subscription?.metadata?.initialExternalTransactionId || existing?.initial_external_transaction_id || null,
    external_transaction_token: existing?.external_transaction_token || null,
    external_reporting_status: isAlternativeBilling
      ? existing?.external_reporting_status || "pending"
      : "not_required",
    external_reporting_error: existing?.external_reporting_error || null,
    metadata: {
      ...(existing?.metadata || {}),
      checkoutChannel: channel,
      stripeStatus: subscription.status,
    },
    updated_at: new Date().toISOString(),
  }, { onConflict: "professional_id" });
  if (error) throw error;

  await admin.from("professionals").update({
    stripe_customer_id: customerId,
    billing_provider: "stripe",
    updated_at: new Date().toISOString(),
  }).eq("id", userId);
  return { duplicate: false, existing, userId, planId, status, currentPeriodEnd };
}

serve(async (req) => {
  try {
    if (req.method !== "POST") return new Response("Método não permitido.", { status: 405 });
    const signature = req.headers.get("stripe-signature");
    if (!signature) return new Response("Assinatura do webhook ausente.", { status: 400 });

    const admin = createAdminClient();
    const config = await getBillingConfig(admin);
    if (!config.stripeWebhookSecret) {
      return new Response("Webhook secret Stripe não configurado no Supabase Secrets.", { status: 503 });
    }
    const stripe = createStripe(config.stripeSecretKey);
    const rawBody = await req.text();
    let event: any;
    try {
      event = await stripe.webhooks.constructEventAsync(
        rawBody,
        signature,
        config.stripeWebhookSecret,
      );
    } catch (error) {
      console.error("[stripe-webhook] Assinatura inválida", error);
      return new Response("Assinatura do webhook inválida.", { status: 400 });
    }

    console.log(`[stripe-webhook] ${event.id} ${event.type}`);
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const subscriptionId = asId(session.subscription);
        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const synced = await syncStripeSubscription(admin, subscription);
          if (synced && !synced.duplicate) {
            const { data: current } = await admin.from("billing_subscriptions")
              .select("metadata")
              .eq("professional_id", synced.userId)
              .single();
            const { error: sessionMetadataError } = await admin.from("billing_subscriptions").update({
              metadata: {
                ...(current?.metadata || {}),
                checkoutSessionId: session.id,
              },
              updated_at: new Date().toISOString(),
            }).eq("professional_id", synced.userId);
            if (sessionMetadataError) throw sessionMetadataError;
          }
        }
        break;
      }

      case "invoice.paid": {
        const invoice: any = event.data.object;
        const subscriptionId = subscriptionIdFromInvoice(invoice);
        if (!subscriptionId) break;
        const subscription: any = await stripe.subscriptions.retrieve(subscriptionId);
        const synced = await syncStripeSubscription(admin, subscription);
        if (!synced) break;

        if (synced.duplicate) {
          let paymentIntentIds = paymentIntentIdsFromInvoice(invoice);
          if (paymentIntentIds.length === 0) {
            const expanded: any = await stripe.invoices.retrieve(invoice.id, {
              expand: ["payments.data.payment.payment_intent"],
            } as any);
            paymentIntentIds = paymentIntentIdsFromInvoice(expanded);
          }
          for (const paymentIntentId of paymentIntentIds) {
            await stripe.refunds.create({ payment_intent: paymentIntentId }).catch((error: unknown) => {
              console.error("[stripe-webhook] Falha ao reembolsar assinatura duplicada", error);
            });
          }
          await stripe.subscriptions.cancel(subscriptionId).catch(() => undefined);
          break;
        }

        const { data: billing } = await admin.from("billing_subscriptions")
          .select("*")
          .eq("professional_id", synced.userId)
          .single();
        const { data: previousTransaction } = await admin.from("transactions")
          .select("external_transaction_id, initial_external_transaction_id")
          .eq("stripe_invoice_id", invoice.id)
          .maybeSingle();

        const requiresPlayReporting = Boolean(
          billing?.external_transaction_token || billing?.initial_external_transaction_id,
        );
        const isInitialInvoice = invoice.billing_reason === "subscription_create";
        const externalTransactionId = requiresPlayReporting
          ? previousTransaction?.external_transaction_id ||
            (isInitialInvoice
              ? billing.initial_external_transaction_id
              : `ec-${crypto.randomUUID()}`)
          : null;
        const initialExternalTransactionId = requiresPlayReporting
          ? billing.initial_external_transaction_id
          : null;

        const transaction = {
          professional_id: synced.userId,
          stripe_invoice_id: invoice.id,
          stripe_subscription_id: subscriptionId,
          amount: Number(invoice.amount_paid || 0) / 100,
          currency: invoice.currency || "brl",
          plan_id: synced.planId,
          status: "paid",
          stripe_invoice_url: invoice.hosted_invoice_url || null,
          invoice_pdf_url: invoice.invoice_pdf || null,
          payment_provider: "stripe",
          provider_transaction_id: invoice.id,
          payment_method: "card",
          external_transaction_id: externalTransactionId,
          initial_external_transaction_id: initialExternalTransactionId,
          created_at: isoFromSeconds(invoice.created) || new Date().toISOString(),
        };
        const { error: transactionError } = await admin.from("transactions")
          .upsert(transaction, { onConflict: "stripe_invoice_id" });
        if (transactionError) throw transactionError;

        if (requiresPlayReporting && externalTransactionId) {
          try {
            const taxes = Array.isArray(invoice.total_taxes)
              ? invoice.total_taxes
              : Array.isArray(invoice.total_tax_amounts)
                ? invoice.total_tax_amounts
                : [];
            const taxAmount = taxes.reduce(
              (sum: number, item: any) => sum + Number(item.amount || 0),
              Number(invoice.tax || 0),
            );
            await reportExternalStripeTransaction({
              packageName: config.googlePackageName,
              externalTransactionId,
              initialExternalTransactionId: isInitialInvoice ? null : initialExternalTransactionId,
              externalTransactionToken: isInitialInvoice ? billing.external_transaction_token : null,
              amountInMinorUnits: Number(invoice.amount_paid || 0),
              taxInMinorUnits: taxAmount,
              currency: invoice.currency || "brl",
              transactionTime: isoFromSeconds(invoice.status_transitions?.paid_at || invoice.created) || new Date().toISOString(),
              testPurchase: !config.isProduction,
            });
            await admin.from("billing_subscriptions").update({
              external_reporting_status: "reported",
              external_reporting_error: null,
              updated_at: new Date().toISOString(),
            }).eq("professional_id", synced.userId);
          } catch (error) {
            await admin.from("billing_subscriptions").update({
              external_reporting_status: "failed",
              external_reporting_error: error instanceof Error ? error.message : String(error),
              updated_at: new Date().toISOString(),
            }).eq("professional_id", synced.userId);
            throw error;
          }
        }
        await projectSubscription(admin, {
          userId: synced.userId,
          provider: "stripe",
          planId: synced.planId,
          status: synced.status,
          currentPeriodEnd: synced.currentPeriodEnd,
        });
        break;
      }

      case "invoice.payment_failed": {
        const invoice: any = event.data.object;
        const subscriptionId = subscriptionIdFromInvoice(invoice);
        if (!subscriptionId) break;
        const subscription: any = await stripe.subscriptions.retrieve(subscriptionId);
        const synced = await syncStripeSubscription(admin, subscription);
        if (!synced || synced.duplicate) break;
        await admin.from("transactions").upsert({
          professional_id: synced.userId,
          stripe_invoice_id: invoice.id,
          stripe_subscription_id: subscriptionId,
          amount: Number(invoice.amount_due || 0) / 100,
          currency: invoice.currency || "brl",
          plan_id: synced.planId,
          status: "failed",
          stripe_invoice_url: invoice.hosted_invoice_url || null,
          invoice_pdf_url: invoice.invoice_pdf || null,
          payment_provider: "stripe",
          provider_transaction_id: invoice.id,
          payment_method: "card",
          created_at: isoFromSeconds(invoice.created) || new Date().toISOString(),
        }, { onConflict: "stripe_invoice_id" });
        await projectSubscription(admin, {
          userId: synced.userId,
          provider: "stripe",
          planId: synced.planId,
          status: synced.status,
          currentPeriodEnd: synced.currentPeriodEnd,
        });
        break;
      }

      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription: any = event.data.object;
        const synced = await syncStripeSubscription(admin, subscription);
        if (
          synced && !synced.duplicate &&
          (event.type === "customer.subscription.deleted" || !["active", "trialing", "pending"].includes(synced.status))
        ) {
          await projectSubscription(admin, {
            userId: synced.userId,
            provider: "stripe",
            planId: synced.planId,
            status: synced.status,
            currentPeriodEnd: synced.currentPeriodEnd,
          });
        }
        break;
      }

      default:
        console.log(`[stripe-webhook] Evento ignorado: ${event.type}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[stripe-webhook] Erro interno", error);
    return new Response(
      error instanceof Error ? error.message : "Erro interno.",
      { status: 500 },
    );
  }
});
