import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  ClinicBillingHttpError,
  clinicCorsHeaders,
  clinicJsonResponse,
  createClinicAdminClient,
  createClinicStripe,
  assertSandboxAccount,
  getCatalog,
  getCheckoutAttempt,
  getClinicConfig,
  requireClinicUser,
  requireJsonObject,
  requirePlanCode,
  requireSeats,
  requireUuid,
  rpc,
  validatePrice,
} from "../_shared/clinicBilling.ts";

async function validateReusableCheckoutSession(stripe: any, sessionId: string, attemptId: string, organizationId: string, planCode: string, seats: number, catalog: any) {
  const session: any = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["line_items.data.price"] });
  const metadata = session?.metadata || {};
  const items = Array.isArray(session?.line_items?.data) ? session.line_items.data : [];
  const base = items.find((item: any) => item?.price?.id === catalog.stripe_base_price_id);
  const seat = items.find((item: any) => item?.price?.id === catalog.stripe_seat_price_id);
  if (
    session?.livemode !== false || session?.mode !== "subscription" || session?.status !== "open" ||
    Number(session?.expires_at || 0) <= Math.floor(Date.now() / 1000) ||
    session?.client_reference_id !== attemptId || metadata.checkoutAttemptId !== attemptId ||
    metadata.organizationId !== organizationId || metadata.planCode !== planCode ||
    Number(metadata.initialContractedSeats) !== seats || items.length !== 2 ||
    !base || Number(base.quantity) !== 1 || !seat || Number(seat.quantity) !== seats
  ) {
    throw new ClinicBillingHttpError(409, "A Checkout Session existente não corresponde à tentativa persistida.", "checkout_session_mismatch");
  }
  return session;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: clinicCorsHeaders });
  if (req.method !== "POST") return clinicJsonResponse({ error: "method_not_allowed" }, 405);
  try {
    const admin = createClinicAdminClient();
    const user = await requireClinicUser(req, admin);
    const config = await getClinicConfig(true);
    const stripe = createClinicStripe(config.secretKey);
    await assertSandboxAccount(stripe);
    const body = requireJsonObject(await req.json());
    const organizationId = requireUuid(body.organizationId, "organizationId");
    const planCode = requirePlanCode(body.planCode);
    const catalog = await getCatalog(admin, planCode);
    const seats = requireSeats(body.contractedSeats, Number(catalog.minimum_contracted_seats));
    const attemptId = body.checkoutAttemptId ? requireUuid(body.checkoutAttemptId, "checkoutAttemptId") : crypto.randomUUID();
    const existing = await getCheckoutAttempt(admin, attemptId, user.id);
    if (existing && (
      existing.organization_id !== organizationId || existing.actor_professional_id !== user.id ||
      existing.plan_code !== planCode || Number(existing.requested_seats) !== seats
    )) {
      throw new ClinicBillingHttpError(409, "O payload não corresponde à tentativa de checkout persistida.", "checkout_attempt_payload_mismatch");
    }
    if (existing?.status === "session_created" && existing.stripe_checkout_session_id) {
      const session = await validateReusableCheckoutSession(stripe, existing.stripe_checkout_session_id, attemptId, organizationId, planCode, seats, catalog);
      return clinicJsonResponse({ checkoutUrl: session.url, attemptId, reused: true });
    }
    let started: any;
    try {
      started = await rpc<any>(admin, "start_clinic_checkout_attempt", {
        p_organization_id: organizationId,
        p_attempt_id: attemptId,
        p_actor_professional_id: user.id,
        p_plan_code: planCode,
        p_requested_seats: seats,
      });
    } catch (error) {
      if (error instanceof ClinicBillingHttpError && error.code === "payload_mismatch") {
        throw new ClinicBillingHttpError(409, "O payload não corresponde à tentativa de checkout persistida.", "checkout_attempt_payload_mismatch");
      }
      throw error;
    }
    if (started?.organization_id !== organizationId) throw new ClinicBillingHttpError(403, "Organização não autorizada.", "not_authorized");
    if (started?.status === "session_created" && started.stripe_checkout_session_id) {
      const session = await validateReusableCheckoutSession(stripe, started.stripe_checkout_session_id, attemptId, organizationId, planCode, seats, catalog);
      return clinicJsonResponse({ checkoutUrl: session.url, attemptId, reused: true });
    }
    const { data: organization, error: organizationError } = await admin.from("organizations").select("id,name,trade_name,operational_status").eq("id", organizationId).single();
    if (organizationError || !organization || organization.operational_status !== "pending_setup") throw new ClinicBillingHttpError(409, "A organização não está pronta para checkout.", "organization_not_pending");
    await validatePrice(stripe, catalog.stripe_base_price_id, catalog, "base");
    await validatePrice(stripe, catalog.stripe_seat_price_id, catalog, "seat");
    let customer: any;
    if (existing?.stripe_customer_id) {
      customer = await stripe.customers.retrieve(existing.stripe_customer_id);
      if (customer?.deleted) customer = null;
    }
    if (!customer) {
      customer = await stripe.customers.create({
        name: organization.trade_name || organization.name,
        metadata: { app: "evolucao_clinica", billingScope: "clinic", billing_scope: "clinic", organizationId, ownerProfessionalId: user.id, environment: "staging" },
      }, { idempotencyKey: `clinic:checkout-customer:${attemptId}` });
    }
    const session: any = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customer.id,
      client_reference_id: attemptId,
      line_items: [
        { price: catalog.stripe_base_price_id, quantity: 1 },
        { price: catalog.stripe_seat_price_id, quantity: seats },
      ],
      success_url: `${config.appOrigin}/painel/clinica/contratacao/sucesso?attempt_id=${encodeURIComponent(attemptId)}`,
      cancel_url: `${config.appOrigin}/painel/clinica/contratar?checkout=cancelled&attempt_id=${encodeURIComponent(attemptId)}`,
      locale: "pt-BR",
      allow_promotion_codes: false,
      payment_method_types: ["card"],
      metadata: { app: "evolucao_clinica", billingScope: "clinic", billing_scope: "clinic", organizationId, ownerProfessionalId: user.id, planCode, initialContractedSeats: String(seats), environment: "staging", checkoutAttemptId: attemptId },
      subscription_data: {
        metadata: { app: "evolucao_clinica", billingScope: "clinic", billing_scope: "clinic", organizationId, ownerProfessionalId: user.id, planCode, initialContractedSeats: String(seats), environment: "staging", checkoutAttemptId: attemptId },
      },
    }, { idempotencyKey: `clinic:checkout:${attemptId}` });
    if (session.livemode === true || !session.url || !session.id) throw new ClinicBillingHttpError(503, "Stripe não retornou um checkout Test válido.", "stripe_checkout_invalid");
    await rpc(admin, "update_clinic_checkout_attempt", { p_attempt_id: attemptId, p_status: "session_created", p_stripe_checkout_session_id: session.id, p_stripe_customer_id: customer.id });
    return clinicJsonResponse({ checkoutUrl: session.url, attemptId });
  } catch (error) {
    console.error("[create-clinic-stripe-checkout-session]", error instanceof Error ? error.message : "unknown");
    return clinicJsonResponse({ error: error instanceof ClinicBillingHttpError ? error.code : "clinic_checkout_failed" }, error instanceof ClinicBillingHttpError ? error.status : 400);
  }
});
