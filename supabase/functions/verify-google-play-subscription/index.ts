import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  BillingHttpError,
  acknowledgePlayPurchase,
  corsHeaders,
  createAdminClient,
  getBillingConfig,
  getPlan,
  jsonResponse,
  parsePlaySubscription,
  projectSubscription,
  requireAuthenticatedUser,
  verifyPlayPurchase,
} from "../_shared/billing.ts";
import { enqueueAndDeliverAnalyticsEvent } from "../_shared/analyticsDelivery.ts";

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function analyticsAttribution(input: unknown) {
  const value = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const clientId = typeof value.clientId === "string" && /^\d+\.\d+$/.test(value.clientId) ? value.clientId : undefined;
  const sessionId = Number(value.sessionId);
  const sessionNumber = Number(value.sessionNumber);
  const result: Record<string, string | number> = {};
  if (clientId) result.ga4ClientId = clientId;
  if (Number.isSafeInteger(sessionId) && sessionId > 0) result.ga4SessionId = sessionId;
  if (Number.isSafeInteger(sessionNumber) && sessionNumber > 0) result.ga4SessionNumber = sessionNumber;
  return result;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Método não permitido." }, 405);

  try {
    const admin = createAdminClient();
    const user = await requireAuthenticatedUser(req, admin);
    const { planId, productId, purchaseToken, attribution, checkoutAttemptId } = await req.json();
    const normalizedToken = String(purchaseToken || "").trim();
    const normalizedProductId = String(productId || "").trim();
    if (!normalizedToken || !normalizedProductId) {
      throw new BillingHttpError(400, "Produto e token da compra Google Play são obrigatórios.");
    }

    const config = await getBillingConfig(admin);
    const plan = await getPlan(admin, planId, config.isProduction);
    if (normalizedProductId !== plan.google_play_product_id) {
      throw new BillingHttpError(400, "O produto Google Play não corresponde ao plano escolhido.");
    }

    const purchase = await verifyPlayPurchase(config.googlePackageName, normalizedToken);
    const parsed = parsePlaySubscription(purchase);
    if (!parsed.productIds.includes(normalizedProductId)) {
      throw new BillingHttpError(400, "A compra verificada não contém o produto informado.");
    }

    const expectedAccountId = await sha256(user.id);
    const playAccountId = String(
      purchase?.externalAccountIdentifiers?.obfuscatedExternalAccountId || "",
    );
    if (!playAccountId || playAccountId !== expectedAccountId) {
      throw new BillingHttpError(403, "A compra Google Play não pertence à conta autenticada.");
    }

    if (parsed.entitled && parsed.acknowledgementState !== "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED") {
      await acknowledgePlayPurchase(config.googlePackageName, normalizedProductId, normalizedToken);
    }

    const { data: tokenOwner } = await admin
      .from("billing_subscriptions")
      .select("professional_id, metadata")
      .eq("play_purchase_token", normalizedToken)
      .maybeSingle();
    if (tokenOwner && tokenOwner.professional_id !== user.id) {
      throw new BillingHttpError(409, "Esta compra já está vinculada a outra conta.");
    }

    const { data: analyticsConsent } = await admin.from("analytics_consents")
      .select("analytics_granted")
      .eq("user_id", user.id)
      .maybeSingle();
    const attributionMetadata = analyticsConsent?.analytics_granted ? analyticsAttribution(attribution) : {};
    const attemptId = typeof checkoutAttemptId === "string" && /^[a-zA-Z0-9-]{1,80}$/.test(checkoutAttemptId)
      ? checkoutAttemptId
      : undefined;
    const previousMetadata = tokenOwner?.metadata && typeof tokenOwner.metadata === "object" ? tokenOwner.metadata : {};
    const initialOrderId = previousMetadata.initialOrderId || (parsed.entitled ? parsed.latestOrderId : null);
    const subscriptionMetadata = {
      ...previousMetadata,
      ...attributionMetadata,
      ...(attemptId ? { checkoutAttemptId: attemptId } : {}),
      latestOrderId: parsed.latestOrderId,
      initialOrderId,
      acknowledgementState: parsed.entitled
        ? "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED"
        : parsed.acknowledgementState,
      testPurchase: Boolean(purchase?.testPurchase),
    };

    const { error: subscriptionError } = await admin.from("billing_subscriptions").upsert({
      professional_id: user.id,
      provider: "google_play",
      plan_id: plan.id,
      provider_subscription_id: normalizedToken,
      status: parsed.status,
      current_period_end: parsed.currentPeriodEnd,
      play_purchase_token: normalizedToken,
      play_product_id: normalizedProductId,
      external_reporting_status: "not_required",
      metadata: subscriptionMetadata,
      updated_at: new Date().toISOString(),
    }, { onConflict: "professional_id" });
    if (subscriptionError) throw subscriptionError;

    await projectSubscription(admin, {
      userId: user.id,
      provider: "google_play",
      planId: plan.id,
      status: parsed.status,
      currentPeriodEnd: parsed.currentPeriodEnd,
    });

    const pendingTransactionId = `play-pending-${(await sha256(normalizedToken)).slice(0, 32)}`;
    const providerTransactionId = parsed.latestOrderId || pendingTransactionId;
    if (parsed.entitled && parsed.latestOrderId) {
      await admin.from("transactions").delete()
        .eq("professional_id", user.id)
        .eq("payment_provider", "google_play")
        .eq("provider_transaction_id", pendingTransactionId)
        .eq("status", "processing");
    }
    const { error: transactionError } = await admin.from("transactions").upsert({
      professional_id: user.id,
      amount: Number(plan.price || 0),
      currency: "brl",
      plan_id: plan.id,
      status: parsed.entitled ? "paid" : parsed.status === "pending" ? "processing" : "failed",
      payment_provider: "google_play",
      provider_transaction_id: providerTransactionId,
      payment_method: "Google Play Billing",
      play_order_id: parsed.latestOrderId,
      play_purchase_token: normalizedToken,
    }, { onConflict: "payment_provider,provider_transaction_id" });
    if (transactionError) throw transactionError;

    if (parsed.entitled && parsed.latestOrderId) {
      const occurredAt = purchase?.startTime || new Date().toISOString();
      const analyticsPayload = {
        plan_id: String(plan.id).slice(0, 100),
        plan_name: String(plan.name || plan.id).slice(0, 100),
        value: Number(plan.price || 0),
        currency: "BRL",
        payment_provider: "google_play",
      };
      const playAttribution = {
        clientId: typeof subscriptionMetadata.ga4ClientId === "string" ? subscriptionMetadata.ga4ClientId : undefined,
        sessionId: Number(subscriptionMetadata.ga4SessionId) || undefined,
        sessionNumber: Number(subscriptionMetadata.ga4SessionNumber) || undefined,
      };
      const isInitialOrder = parsed.latestOrderId === initialOrderId;
      await enqueueAndDeliverAnalyticsEvent(admin, {
        eventKey: `purchase:google_play:${parsed.latestOrderId}`,
        userId: user.id,
        eventName: "purchase",
        provider: "google_play",
        params: { transaction_id: String(parsed.latestOrderId).slice(0, 100), ...analyticsPayload },
        attribution: playAttribution,
        occurredAt,
      });
      await enqueueAndDeliverAnalyticsEvent(admin, {
        eventKey: `${isInitialOrder ? "subscription_started" : "subscription_renewed"}:google_play:${parsed.latestOrderId}`,
        userId: user.id,
        eventName: isInitialOrder ? "subscription_started" : "subscription_renewed",
        provider: "google_play",
        params: analyticsPayload,
        attribution: playAttribution,
        occurredAt,
      });
    }

    return jsonResponse({
      status: parsed.status,
      currentPeriodEnd: parsed.currentPeriodEnd,
      entitled: parsed.entitled,
      transactionId: parsed.entitled ? parsed.latestOrderId : null,
      amount: Number(plan.price || 0),
      currency: "BRL",
      planName: plan.name,
      provider: "google_play",
    });
  } catch (error) {
    console.error("[verify-google-play-subscription]", error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Falha ao verificar a assinatura Google Play." },
      error instanceof BillingHttpError ? error.status : 400,
    );
  }
});
