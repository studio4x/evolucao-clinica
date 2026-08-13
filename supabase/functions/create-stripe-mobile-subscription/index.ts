import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  BillingHttpError,
  corsHeaders,
  createAdminClient,
  createStripe,
  ensureNoActiveSubscription,
  getBillingConfig,
  getOrCreateStripeCustomer,
  getPlan,
  getProfessional,
  jsonResponse,
  requireAuthenticatedUser,
} from "../_shared/billing.ts";

async function tokenFingerprint(value: string) {
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

async function resolveCoupon(admin: any, stripe: any, planId: string, couponCode: unknown, isProduction: boolean) {
  const code = String(couponCode || "").trim().toUpperCase();
  if (!code) return null;
  const now = new Date().toISOString();
  const { data: coupon, error } = await admin.from("subscription_coupons").select("*").eq("code", code).eq("active", true).maybeSingle();
  if (error || !coupon || (coupon.starts_at && coupon.starts_at > now) || (coupon.expires_at && coupon.expires_at <= now) || !coupon.applicable_plans?.includes(planId)) {
    throw new BillingHttpError(400, "Cupom inválido, inativo, expirado ou indisponível para este plano.");
  }
  const idField = isProduction ? "stripe_prod_coupon_id" : "stripe_sandbox_coupon_id";
  let stripeCouponId = coupon[idField];
  if (!stripeCouponId) {
    const params: any = { id: `ec_${isProduction ? "p" : "t"}_${coupon.id.replace(/-/g, "")}`, name: coupon.code, duration: coupon.duration, metadata: { subscriptionCouponId: coupon.id, couponCode: coupon.code } };
    if (coupon.discount_type === "percentage") params.percent_off = Number(coupon.discount_value);
    else { params.amount_off = Math.round(Number(coupon.discount_value) * 100); params.currency = "brl"; }
    if (coupon.duration === "repeating") params.duration_in_months = coupon.duration_in_months;
    try { stripeCouponId = (await stripe.coupons.create(params)).id; } catch (stripeError: any) { if (stripeError?.code !== "resource_already_exists") throw stripeError; stripeCouponId = params.id; }
    const { error: updateError } = await admin.from("subscription_coupons").update({ [idField]: stripeCouponId, updated_at: now }).eq("id", coupon.id);
    if (updateError) throw updateError;
  }
  return { id: stripeCouponId, code: coupon.code };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Método não permitido." }, 405);

  try {
    const admin = createAdminClient();
    const user = await requireAuthenticatedUser(req, admin);
    const { planId, externalTransactionToken, couponCode, attribution, checkoutAttemptId } = await req.json();
    const choiceToken = String(externalTransactionToken || "").trim();
    if (!choiceToken) throw new BillingHttpError(400, "Token da escolha de faturamento ausente.");

    const config = await getBillingConfig(admin);
    if (!config.stripePublishableKey) {
      throw new BillingHttpError(503, "Chave publicável Stripe do ambiente ativo não configurada.");
    }
    if (!config.stripePaymentMethodConfigurationId) {
      throw new BillingHttpError(
        503,
        "A configuração Stripe exclusiva para cartão e Google Pay ainda não foi definida.",
      );
    }
    const plan = await getPlan(admin, planId, config.isProduction);
    if (!plan.stripePriceId) {
      throw new BillingHttpError(503, `Preço Stripe do ${plan.name} não configurado para este ambiente.`);
    }

    await ensureNoActiveSubscription(admin, user.id);
    const professional = await getProfessional(admin, user.id);
    const stripe = createStripe(config.stripeSecretKey);
    const customer = await getOrCreateStripeCustomer(admin, stripe, professional);
    const coupon = await resolveCoupon(admin, stripe, plan.id, couponCode, config.isProduction);
    const fingerprint = await tokenFingerprint(choiceToken);
    const { data: analyticsConsent } = await admin
      .from("analytics_consents")
      .select("analytics_granted")
      .eq("user_id", user.id)
      .maybeSingle();
    const attributionMetadata = analyticsConsent?.analytics_granted ? analyticsAttribution(attribution) : {};
    const attemptId = typeof checkoutAttemptId === "string" && /^[a-zA-Z0-9-]{1,80}$/.test(checkoutAttemptId)
      ? checkoutAttemptId
      : undefined;

    const { data: pending } = await admin
      .from("billing_subscriptions")
      .select("provider_subscription_id, status, metadata")
      .eq("professional_id", user.id)
      .eq("provider", "stripe")
      .maybeSingle();
    if (pending?.provider_subscription_id && pending.status === "pending") {
      if (pending.metadata?.choiceTokenFingerprint === fingerprint) {
        const existing: any = await stripe.subscriptions.retrieve(
          pending.provider_subscription_id,
          { expand: ["latest_invoice.confirmation_secret"] },
        );
        const existingInvoice: any = existing.latest_invoice;
        const existingClientSecret = existingInvoice?.confirmation_secret?.client_secret ||
          existingInvoice?.payment_intent?.client_secret;
        if (existingClientSecret) {
          return jsonResponse({
            clientSecret: existingClientSecret,
            publishableKey: config.stripePublishableKey,
            subscriptionId: existing.id,
            isProduction: config.isProduction,
          });
        }
      }
      await stripe.subscriptions.cancel(pending.provider_subscription_id).catch(() => undefined);
    }

    const externalTransactionId = `ec-${crypto.randomUUID()}`;
    const paymentSettings: any = {
      save_default_payment_method: "on_subscription",
      payment_method_configuration: config.stripePaymentMethodConfigurationId,
    };

    const subscriptionParams: any = {
      customer: customer.id,
      items: [{ price: plan.stripePriceId }],
      payment_behavior: "default_incomplete",
      payment_settings: paymentSettings,
      expand: ["latest_invoice.confirmation_secret"],
      metadata: {
        supabaseUserId: user.id,
        planId: plan.id,
        checkoutChannel: "android_user_choice",
        initialExternalTransactionId: externalTransactionId,
        ...attributionMetadata,
        ...(attemptId ? { checkoutAttemptId: attemptId } : {}),
      },
    };
    if (coupon) {
      subscriptionParams.discounts = [{ coupon: coupon.id }];
      subscriptionParams.metadata.couponCode = coupon.code;
    }
    const subscription = await stripe.subscriptions.create(
      subscriptionParams,
      { idempotencyKey: `android-choice-${fingerprint}` },
    );

    const invoice: any = subscription.latest_invoice;
    const clientSecret = invoice?.confirmation_secret?.client_secret ||
      invoice?.payment_intent?.client_secret;
    if (!clientSecret) {
      await stripe.subscriptions.cancel(subscription.id).catch(() => undefined);
      throw new Error("A Stripe não retornou o segredo do pagamento inicial.");
    }

    const { error: subscriptionError } = await admin.from("billing_subscriptions").upsert({
      professional_id: user.id,
      provider: "stripe",
      plan_id: plan.id,
      provider_subscription_id: subscription.id,
      status: "pending",
      stripe_customer_id: customer.id,
      initial_external_transaction_id: externalTransactionId,
      external_transaction_token: choiceToken,
      external_reporting_status: "pending",
      external_reporting_error: null,
      metadata: {
        checkoutChannel: "android_user_choice",
        choiceTokenFingerprint: fingerprint,
        environment: config.environment,
        ...attributionMetadata,
        ...(attemptId ? { checkoutAttemptId: attemptId } : {}),
      },
      updated_at: new Date().toISOString(),
    }, { onConflict: "professional_id" });
    if (subscriptionError) throw subscriptionError;

    await admin.from("professionals").update({
      billing_provider: "stripe",
      stripe_customer_id: customer.id,
      updated_at: new Date().toISOString(),
    }).eq("id", user.id);

    return jsonResponse({
      clientSecret,
      publishableKey: config.stripePublishableKey,
      subscriptionId: subscription.id,
      isProduction: config.isProduction,
    });
  } catch (error) {
    console.error("[create-stripe-mobile-subscription]", error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Falha ao iniciar o pagamento móvel." },
      error instanceof BillingHttpError ? error.status : 400,
    );
  }
});
