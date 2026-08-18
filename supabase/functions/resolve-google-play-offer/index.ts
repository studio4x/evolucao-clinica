import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  BillingHttpError,
  corsHeaders,
  createAdminClient,
  getActiveSubscriptionCoupon,
  getBillingConfig,
  getPlan,
  jsonResponse,
  requireAuthenticatedUser,
} from "../_shared/billing.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Método não permitido." }, 405);

  try {
    const admin = createAdminClient();
    await requireAuthenticatedUser(req, admin);
    const { planId, couponCode } = await req.json();
    const config = await getBillingConfig(admin);
    const plan = await getPlan(admin, planId, config.isProduction);
    const coupon = await getActiveSubscriptionCoupon(admin, plan.id, couponCode);
    const offerId = String(coupon?.google_play_offer_id || "").trim();

    if (!offerId) {
      throw new BillingHttpError(
        400,
        "Este cupom ainda não está configurado para uma oferta do Google Play.",
      );
    }
    if (!/^[A-Za-z0-9._-]{1,100}$/.test(offerId)) {
      throw new BillingHttpError(500, "A oferta Google Play configurada para este cupom é inválida.");
    }

    return jsonResponse({ offerId, couponCode: String(coupon.code) });
  } catch (error) {
    console.error("[resolve-google-play-offer]", error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Não foi possível validar a oferta Google Play." },
      error instanceof BillingHttpError ? error.status : 400,
    );
  }
});
