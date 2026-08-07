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

async function resolveCoupon(admin: any, stripe: any, planId: string, couponCode: unknown, isProduction: boolean) {
  const code = String(couponCode || "").trim().toUpperCase();
  if (!code) return null;
  const now = new Date().toISOString();
  const { data: coupon, error } = await admin.from("subscription_coupons")
    .select("*").eq("code", code).eq("active", true).maybeSingle();
  if (error || !coupon || (coupon.starts_at && coupon.starts_at > now) || (coupon.expires_at && coupon.expires_at <= now) || !coupon.applicable_plans?.includes(planId)) {
    throw new BillingHttpError(400, "Cupom inválido, inativo, expirado ou indisponível para este plano.");
  }
  const idField = isProduction ? "stripe_prod_coupon_id" : "stripe_sandbox_coupon_id";
  let stripeCouponId = coupon[idField];
  if (!stripeCouponId) {
    const params: any = {
      id: `ec_${isProduction ? "p" : "t"}_${coupon.id.replace(/-/g, "")}`,
      name: coupon.code,
      duration: coupon.duration,
      metadata: { subscriptionCouponId: coupon.id, couponCode: coupon.code },
    };
    if (coupon.discount_type === "percentage") params.percent_off = Number(coupon.discount_value);
    else { params.amount_off = Math.round(Number(coupon.discount_value) * 100); params.currency = "brl"; }
    if (coupon.duration === "repeating") params.duration_in_months = coupon.duration_in_months;
    try { stripeCouponId = (await stripe.coupons.create(params)).id; }
    catch (stripeError: any) {
      if (stripeError?.code !== "resource_already_exists") throw stripeError;
      stripeCouponId = params.id;
    }
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
    const { planId, couponCode } = await req.json();
    const config = await getBillingConfig(admin);
    const plan = await getPlan(admin, planId, config.isProduction);
    if (!plan.stripePriceId) {
      throw new BillingHttpError(503, `Preço Stripe do ${plan.name} não configurado para este ambiente.`);
    }

    await ensureNoActiveSubscription(admin, user.id);
    const professional = await getProfessional(admin, user.id);
    const stripe = createStripe(config.stripeSecretKey);
    const customer = await getOrCreateStripeCustomer(admin, stripe, professional);
    const coupon = await resolveCoupon(admin, stripe, plan.id, couponCode, config.isProduction);

    const params: any = {
      mode: "subscription",
      customer: customer.id,
      client_reference_id: user.id,
      line_items: [{ price: plan.stripePriceId, quantity: 1 }],
      success_url: `${config.appOrigin}/checkout/success?session_id={CHECKOUT_SESSION_ID}&plan=${encodeURIComponent(plan.id)}`,
      cancel_url: `${config.appOrigin}/checkout?plan=${encodeURIComponent(plan.id)}&checkout=cancelled`,
      locale: "pt-BR",
      allow_promotion_codes: false,
      billing_address_collection: "auto",
      customer_update: { address: "auto", name: "auto" },
      metadata: {
        supabaseUserId: user.id,
        planId: plan.id,
        checkoutChannel: "web",
      },
      subscription_data: {
        metadata: {
          supabaseUserId: user.id,
          planId: plan.id,
          checkoutChannel: "web",
        },
      },
    };
    if (coupon) {
      params.discounts = [{ coupon: coupon.id }];
      params.metadata.couponCode = coupon.code;
      params.subscription_data.metadata.couponCode = coupon.code;
    }

    if (config.stripePaymentMethodConfigurationId) {
      params.payment_method_configuration = config.stripePaymentMethodConfigurationId;
    } else {
      // Google Pay e Apple Pay são carteiras de cartão e aparecem automaticamente
      // no Checkout hospedado quando o dispositivo é compatível.
      params.payment_method_types = ["card"];
      params.wallet_options = { link: { display: "never" } };
    }

    const session = await stripe.checkout.sessions.create(params);
    if (!session.url) throw new Error("A Stripe não retornou a URL segura do checkout.");

    return jsonResponse({ checkoutUrl: session.url });
  } catch (error) {
    console.error("[create-stripe-checkout-session]", error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Falha ao iniciar o checkout." },
      error instanceof BillingHttpError ? error.status : 400,
    );
  }
});
