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

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Método não permitido." }, 405);

  try {
    const admin = createAdminClient();
    const user = await requireAuthenticatedUser(req, admin);
    const { planId, productId, purchaseToken } = await req.json();
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

    if (parsed.acknowledgementState !== "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED") {
      await acknowledgePlayPurchase(config.googlePackageName, normalizedProductId, normalizedToken);
    }

    const { data: tokenOwner } = await admin
      .from("billing_subscriptions")
      .select("professional_id")
      .eq("play_purchase_token", normalizedToken)
      .maybeSingle();
    if (tokenOwner && tokenOwner.professional_id !== user.id) {
      throw new BillingHttpError(409, "Esta compra já está vinculada a outra conta.");
    }

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
      metadata: {
        latestOrderId: parsed.latestOrderId,
        acknowledgementState: "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED",
        testPurchase: Boolean(purchase?.testPurchase),
      },
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

    const providerTransactionId = parsed.latestOrderId || `play-${normalizedToken}-initial`;
    const { error: transactionError } = await admin.from("transactions").upsert({
      professional_id: user.id,
      amount: Number(plan.price || 0),
      currency: "brl",
      plan_id: plan.id,
      status: parsed.entitled ? "paid" : "processing",
      payment_provider: "google_play",
      provider_transaction_id: providerTransactionId,
      payment_method: "Google Play Billing",
      play_order_id: parsed.latestOrderId,
      play_purchase_token: normalizedToken,
      created_at: new Date().toISOString(),
    }, { onConflict: "payment_provider,provider_transaction_id" });
    if (transactionError) throw transactionError;

    return jsonResponse({
      status: parsed.status,
      currentPeriodEnd: parsed.currentPeriodEnd,
      entitled: parsed.entitled,
    });
  } catch (error) {
    console.error("[verify-google-play-subscription]", error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Falha ao verificar a assinatura Google Play." },
      error instanceof BillingHttpError ? error.status : 400,
    );
  }
});
