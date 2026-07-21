import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  BillingHttpError,
  corsHeaders,
  createAdminClient,
  createStripe,
  getBillingConfig,
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
    const professional = await getProfessional(admin, user.id);
    if (!professional.stripe_customer_id) {
      throw new BillingHttpError(404, "Cliente Stripe não encontrado para esta conta.");
    }
    const config = await getBillingConfig(admin);
    const stripe = createStripe(config.stripeSecretKey);
    const session = await stripe.billingPortal.sessions.create({
      customer: professional.stripe_customer_id,
      return_url: `${config.appOrigin}/painel/subscription`,
    });
    return jsonResponse({ portalUrl: session.url });
  } catch (error) {
    console.error("[create-stripe-customer-portal-session]", error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Falha ao abrir o gerenciamento da assinatura." },
      error instanceof BillingHttpError ? error.status : 400,
    );
  }
});
