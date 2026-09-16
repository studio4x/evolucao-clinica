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
  getOpenCheckoutAttemptForOrganization,
  getClinicConfig,
  requireClinicUser,
  requireJsonObject,
  requirePlanCode,
  requireSeats,
  requireUuid,
  rpc,
  reconcileClinicStripeSubscription,
  validatePrice,
} from "../_shared/clinicBilling.ts";

function assertCheckoutSessionPayload(session: any, attemptId: string, organizationId: string, planCode: string, seats: number, catalog: any) {
  const metadata = session?.metadata || {};
  const items = Array.isArray(session?.line_items?.data) ? session.line_items.data : [];
  const base = items.find((item: any) => item?.price?.id === catalog.stripe_base_price_id);
  const seat = items.find((item: any) => item?.price?.id === catalog.stripe_seat_price_id);
  if (
    session?.client_reference_id !== attemptId || metadata.checkoutAttemptId !== attemptId ||
    metadata.organizationId !== organizationId || metadata.planCode !== planCode ||
    Number(metadata.initialContractedSeats) !== seats || items.length !== 2 ||
    !base || Number(base.quantity) !== 1 || !seat || Number(seat.quantity) !== seats
  ) {
    throw new ClinicBillingHttpError(409, "A Checkout Session existente não corresponde à tentativa persistida.", "checkout_session_mismatch");
  }
}

async function inspectCheckoutSession(stripe: any, sessionId: string, attemptId: string, organizationId: string, planCode: string, seats: number, catalog: any) {
  let session: any;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["line_items.data.price"] });
  } catch (error: any) {
    if (error?.code === "resource_missing") throw new ClinicBillingHttpError(503, "A Checkout Session persistida não pôde ser recuperada.", "checkout_session_unavailable");
    throw error;
  }
  if (session?.livemode === true) throw new ClinicBillingHttpError(503, "Stripe Live é proibido nesta fase.", "stripe_live_forbidden");
  const expired = session?.status === "expired" || Number(session?.expires_at || 0) <= Math.floor(Date.now() / 1000);
  if (expired) return { session, expired: true };
  if (session?.status === "complete") return { session, expired: false, complete: true };
  if (session?.status !== "open") throw new ClinicBillingHttpError(409, "A Checkout Session não está aberta nem concluída.", "checkout_session_mismatch");
  assertCheckoutSessionPayload(session, attemptId, organizationId, planCode, seats, catalog);
  return { session, expired: false, complete: false };
}

async function reconcileCompletedCheckoutAttempt(admin: any, stripe: any, attempt: any, organizationId: string, planCode: string, seats: number, catalog: any) {
  if (!attempt?.stripe_checkout_session_id) throw new ClinicBillingHttpError(409, "Checkout concluído sem Session recuperável.", "checkout_contract_unresolved");
  const inspected = await inspectCheckoutSession(stripe, attempt.stripe_checkout_session_id, attempt.attempt_id, organizationId, planCode, seats, catalog);
  if (!inspected.complete) throw new ClinicBillingHttpError(409, "Checkout concluído sem contrato Stripe finalizado.", "checkout_contract_unresolved");
  const subscriptionId = typeof inspected.session.subscription === "string" ? inspected.session.subscription : inspected.session.subscription?.id || attempt.stripe_subscription_id;
  if (!subscriptionId) throw new ClinicBillingHttpError(409, "Checkout concluído sem Subscription recuperável.", "checkout_contract_unresolved");
  const reconciled = await reconcileClinicStripeSubscription(admin, stripe, subscriptionId);
  const status = reconciled.local?.financial_status === "active" ? "activated" : "completed";
  await rpc(admin, "update_clinic_checkout_attempt", {
    p_attempt_id: attempt.attempt_id,
    p_status: status,
    p_stripe_checkout_session_id: attempt.stripe_checkout_session_id,
    p_stripe_customer_id: reconciled.resolved.customerId,
    p_stripe_subscription_id: subscriptionId,
  });
  return { status, attemptId: attempt.attempt_id, subscriptionId, reused: true, billing: reconciled.local };
}

async function recoverCheckoutCandidate(admin: any, stripe: any, candidate: any, organizationId: string, planCode: string, seats: number, catalog: any) {
  if (candidate.status === "completed") return reconcileCompletedCheckoutAttempt(admin, stripe, candidate, organizationId, planCode, seats, catalog);
  if (candidate.status === "session_created" && candidate.stripe_checkout_session_id) {
    const inspected = await inspectCheckoutSession(stripe, candidate.stripe_checkout_session_id, candidate.attempt_id, organizationId, planCode, seats, catalog);
    if (inspected.expired) {
      await rpc(admin, "expire_clinic_checkout_attempt", { p_attempt_id: candidate.attempt_id, p_reason: "stripe_checkout_session_expired" });
      return null;
    }
    if (inspected.complete) return reconcileCompletedCheckoutAttempt(admin, stripe, candidate, organizationId, planCode, seats, catalog);
    return { checkoutUrl: inspected.session.url, attemptId: candidate.attempt_id, reused: true };
  }
  const expiresAtMs = Date.parse(String(candidate.expires_at || ""));
  if (Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now()) {
    await rpc(admin, "expire_clinic_checkout_attempt", { p_attempt_id: candidate.attempt_id, p_reason: "started_attempt_stale" });
    return null;
  }
  throw new ClinicBillingHttpError(409, "Já existe uma tentativa de checkout em andamento.", "checkout_attempt_in_progress");
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
    const suppliedAttemptId = Boolean(body.checkoutAttemptId);
    let attemptId = suppliedAttemptId ? requireUuid(body.checkoutAttemptId, "checkoutAttemptId") : crypto.randomUUID();
    let candidate = suppliedAttemptId ? await getCheckoutAttempt(admin, attemptId, user.id) : null;
    if (candidate && (candidate.organization_id !== organizationId || candidate.plan_code !== planCode || Number(candidate.requested_seats) !== seats)) {
      throw new ClinicBillingHttpError(409, "O payload não corresponde à tentativa de checkout persistida.", "checkout_attempt_payload_mismatch");
    }
    if (!candidate) candidate = await getOpenCheckoutAttemptForOrganization(admin, organizationId, user.id);
    if (candidate && (candidate.organization_id !== organizationId || candidate.plan_code !== planCode || Number(candidate.requested_seats) !== seats)) {
      throw new ClinicBillingHttpError(409, "Já existe checkout aberto com payload diferente.", "checkout_open_payload_conflict");
    }
    if (candidate) {
      if (candidate.attempt_id === attemptId && suppliedAttemptId && candidate.status === "started" && !candidate.stripe_checkout_session_id) {
        candidate = null;
      }
    }
    if (candidate) {
      const recovered = await recoverCheckoutCandidate(admin, stripe, candidate, organizationId, planCode, seats, catalog);
      if (recovered) return clinicJsonResponse(recovered);
      if (candidate.attempt_id === attemptId && suppliedAttemptId) throw new ClinicBillingHttpError(409, "A tentativa de checkout expirou; inicie uma nova tentativa.", "checkout_attempt_expired");
      attemptId = crypto.randomUUID();
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
      if (error instanceof ClinicBillingHttpError && error.code === "payload_mismatch") throw new ClinicBillingHttpError(409, "O payload não corresponde à tentativa de checkout persistida.", "checkout_attempt_payload_mismatch");
      throw error;
    }
    if (started?.recovery_required) {
      const staleCandidate = { ...started, attempt_id: started.attempt_id };
      const recovered = await recoverCheckoutCandidate(admin, stripe, staleCandidate, organizationId, planCode, seats, catalog);
      if (recovered) return clinicJsonResponse(recovered);
      started = await rpc<any>(admin, "start_clinic_checkout_attempt", {
        p_organization_id: organizationId,
        p_attempt_id: attemptId,
        p_actor_professional_id: user.id,
        p_plan_code: planCode,
        p_requested_seats: seats,
      });
    }
    if (started?.organization_id !== organizationId) throw new ClinicBillingHttpError(403, "Organização não autorizada.", "not_authorized");
    if (started?.status === "completed") return clinicJsonResponse(await reconcileCompletedCheckoutAttempt(admin, stripe, started, organizationId, planCode, seats, catalog));
    if (started?.status === "session_created" && started.stripe_checkout_session_id) {
      const recovered = await recoverCheckoutCandidate(admin, stripe, started, organizationId, planCode, seats, catalog);
      if (recovered) return clinicJsonResponse(recovered);
    }

    const { data: organization, error: organizationError } = await admin.from("organizations").select("id,name,trade_name,operational_status").eq("id", organizationId).single();
    if (organizationError || !organization || organization.operational_status !== "pending_setup") throw new ClinicBillingHttpError(409, "A organização não está pronta para checkout.", "organization_not_pending");
    await validatePrice(stripe, catalog.stripe_base_price_id, catalog, "base");
    await validatePrice(stripe, catalog.stripe_seat_price_id, catalog, "seat");
    let customer: any;
    if (started?.stripe_customer_id) {
      customer = await stripe.customers.retrieve(started.stripe_customer_id);
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
      line_items: [{ price: catalog.stripe_base_price_id, quantity: 1 }, { price: catalog.stripe_seat_price_id, quantity: seats }],
      success_url: `${config.appOrigin}/painel/clinica/contratacao/sucesso?attempt_id=${encodeURIComponent(attemptId)}`,
      cancel_url: `${config.appOrigin}/painel/clinica/contratar?checkout=cancelled&attempt_id=${encodeURIComponent(attemptId)}`,
      locale: "pt-BR",
      allow_promotion_codes: false,
      payment_method_types: ["card"],
      metadata: { app: "evolucao_clinica", billingScope: "clinic", billing_scope: "clinic", organizationId, ownerProfessionalId: user.id, planCode, initialContractedSeats: String(seats), environment: "staging", checkoutAttemptId: attemptId },
      subscription_data: { metadata: { app: "evolucao_clinica", billingScope: "clinic", billing_scope: "clinic", organizationId, ownerProfessionalId: user.id, planCode, initialContractedSeats: String(seats), environment: "staging", checkoutAttemptId: attemptId } },
    }, { idempotencyKey: `clinic:checkout:${attemptId}` });
    if (session.livemode === true || !session.url || !session.id) throw new ClinicBillingHttpError(503, "Stripe não retornou um checkout Test válido.", "stripe_checkout_invalid");
    await rpc(admin, "update_clinic_checkout_attempt", { p_attempt_id: attemptId, p_status: "session_created", p_stripe_checkout_session_id: session.id, p_stripe_customer_id: customer.id });
    return clinicJsonResponse({ checkoutUrl: session.url, attemptId });
  } catch (error) {
    console.error("[create-clinic-stripe-checkout-session]", error instanceof Error ? error.message : "unknown");
    return clinicJsonResponse({ error: error instanceof ClinicBillingHttpError ? error.code : "clinic_checkout_failed" }, error instanceof ClinicBillingHttpError ? error.status : 400);
  }
});
