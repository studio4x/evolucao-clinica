import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  BillingHttpError,
  createAdminClient,
  getBillingConfig,
  jsonResponse,
  parsePlaySubscription,
  projectSubscription,
  verifyPlayPurchase,
} from "../_shared/billing.ts";

async function validatePubSubIdentity(req: Request) {
  const expectedAudience = Deno.env.get("GOOGLE_PLAY_RTDN_AUDIENCE") || "";
  const expectedEmail = Deno.env.get("GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT_EMAIL") || "";
  if (!expectedAudience || !expectedEmail) {
    throw new BillingHttpError(503, "Validação OIDC do Pub/Sub ainda não foi configurada.");
  }

  const authorization = req.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) throw new BillingHttpError(401, "Token OIDC ausente.");
  const idToken = authorization.slice(7);
  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
  const identity = await response.json();
  const emailVerified = identity.email_verified === "true" || identity.email_verified === true;
  if (!response.ok || identity.aud !== expectedAudience || identity.email !== expectedEmail || !emailVerified) {
    throw new BillingHttpError(401, "Identidade do Pub/Sub inválida.");
  }
}

serve(async (req) => {
  if (req.method !== "POST") return jsonResponse({ error: "Método não permitido." }, 405);

  try {
    await validatePubSubIdentity(req);
    const envelope = await req.json();
    const encodedData = String(envelope?.message?.data || "");
    if (!encodedData) throw new BillingHttpError(400, "Mensagem RTDN sem dados.");
    const notification = JSON.parse(atob(encodedData));
    const subscriptionNotification = notification.subscriptionNotification;
    const voidedNotification = notification.voidedPurchaseNotification;
    const purchaseToken = String(
      subscriptionNotification?.purchaseToken || voidedNotification?.purchaseToken || "",
    );
    if (!purchaseToken) return jsonResponse({ received: true, ignored: true });

    const admin = createAdminClient();
    const { data: stored } = await admin
      .from("billing_subscriptions")
      .select("professional_id, plan_id, play_product_id")
      .eq("play_purchase_token", purchaseToken)
      .maybeSingle();
    if (!stored) return jsonResponse({ received: true, ignored: true });

    if (voidedNotification) {
      await admin.from("billing_subscriptions").update({
        status: "refunded",
        updated_at: new Date().toISOString(),
        metadata: { voidedNotification },
      }).eq("professional_id", stored.professional_id);
      await admin.from("transactions").update({ status: "refunded" })
        .eq("play_purchase_token", purchaseToken);
      await projectSubscription(admin, {
        userId: stored.professional_id,
        provider: "google_play",
        planId: stored.plan_id,
        status: "refunded",
      });
      return jsonResponse({ received: true });
    }

    const config = await getBillingConfig(admin);
    const purchase = await verifyPlayPurchase(config.googlePackageName, purchaseToken);
    const parsed = parsePlaySubscription(purchase);
    await admin.from("billing_subscriptions").update({
      status: parsed.status,
      current_period_end: parsed.currentPeriodEnd,
      metadata: {
        latestOrderId: parsed.latestOrderId,
        acknowledgementState: parsed.acknowledgementState,
        notificationType: subscriptionNotification?.notificationType,
      },
      updated_at: new Date().toISOString(),
    }).eq("professional_id", stored.professional_id);
    await projectSubscription(admin, {
      userId: stored.professional_id,
      provider: "google_play",
      planId: stored.plan_id,
      status: parsed.status,
      currentPeriodEnd: parsed.currentPeriodEnd,
    });

    // O purchaseToken identifica a série da assinatura, enquanto cada renovação
    // recebe um orderId próprio. Assim o histórico financeiro não é sobrescrito.
    if (parsed.latestOrderId && parsed.entitled) {
      const { data: plan } = await admin.from("plans")
        .select("price")
        .eq("id", stored.plan_id)
        .single();
      const { error: transactionError } = await admin.from("transactions").upsert({
        professional_id: stored.professional_id,
        amount: Number(plan?.price || 0),
        currency: "brl",
        plan_id: stored.plan_id,
        status: "paid",
        payment_provider: "google_play",
        provider_transaction_id: parsed.latestOrderId,
        payment_method: "Google Play Billing",
        play_order_id: parsed.latestOrderId,
        play_purchase_token: purchaseToken,
      }, { onConflict: "payment_provider,provider_transaction_id" });
      if (transactionError) throw transactionError;
    }

    return jsonResponse({ received: true });
  } catch (error) {
    console.error("[google-play-rtdn]", error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Falha ao processar RTDN." },
      error instanceof BillingHttpError ? error.status : 500,
    );
  }
});
