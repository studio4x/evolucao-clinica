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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Método não permitido." }, 405);

  try {
    const admin = createAdminClient();
    const user = await requireAuthenticatedUser(req, admin);
    const { planId } = await req.json();
    const config = await getBillingConfig(admin);
    const plan = await getPlan(admin, planId, config.isProduction);
    if (!plan.stripePriceId) {
      throw new BillingHttpError(503, `Preço Stripe do ${plan.name} não configurado para este ambiente.`);
    }

    await ensureNoActiveSubscription(admin, user.id);
    const professional = await getProfessional(admin, user.id);
    const stripe = createStripe(config.stripeSecretKey);
    const customer = await getOrCreateStripeCustomer(admin, stripe, professional);

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
