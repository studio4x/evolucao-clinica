import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import Stripe from "https://esm.sh/stripe@13.10.0";

export const clinicCorsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

export class ClinicBillingHttpError extends Error {
  constructor(public readonly status: number, message: string, public readonly code = "clinic_billing_error") {
    super(message);
    this.name = "ClinicBillingHttpError";
  }
}

export function clinicJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...clinicCorsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export function createClinicAdminClient() {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !key) throw new ClinicBillingHttpError(503, "Supabase server credentials are not configured.", "server_configuration_missing");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function requireClinicUser(req: Request, admin: any) {
  const authorization = req.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) throw new ClinicBillingHttpError(401, "Usuário não autenticado.", "authentication_required");
  const { data: { user }, error } = await admin.auth.getUser(authorization.slice(7));
  if (error || !user) throw new ClinicBillingHttpError(401, "Sessão inválida ou expirada.", "authentication_required");
  return user;
}

export function requireJsonObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ClinicBillingHttpError(400, "Corpo de requisição inválido.", "invalid_request");
  return value as Record<string, unknown>;
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function requireUuid(value: unknown, name: string) {
  if (!isUuid(value)) throw new ClinicBillingHttpError(400, `${name} inválido.`, "invalid_uuid");
  return value;
}

export function requirePlanCode(value: unknown) {
  const planCode = String(value || "").trim();
  if (!['clinic_monthly', 'clinic_yearly'].includes(planCode)) throw new ClinicBillingHttpError(400, "Plano Clínica inválido.", "invalid_plan_code");
  return planCode;
}

export function requireSeats(value: unknown, minimum = 3) {
  const seats = Number(value);
  if (!Number.isSafeInteger(seats) || seats < minimum || seats > 10000) throw new ClinicBillingHttpError(400, "Quantidade de licenças inválida.", "invalid_seat_quantity");
  return seats;
}

export async function getClinicConfig(requireEnabled = true) {
  const appEnvironment = String(Deno.env.get("APP_ENV") || "").trim().toLowerCase();
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const actualRef = (() => {
    try { return new URL(supabaseUrl).hostname.match(/^([a-z0-9]{20})\.supabase\.co$/i)?.[1]?.toLowerCase() || ""; } catch { return ""; }
  })();
  if (appEnvironment !== "staging" || actualRef !== "hwkdwinfckmjoriqxbjk") {
    throw new ClinicBillingHttpError(503, "Billing empresarial disponível somente no Supabase Staging autorizado.", "staging_only");
  }
  const enabled = String(Deno.env.get("CLINIC_BILLING_ENABLED") || "false").toLowerCase() === "true";
  if (requireEnabled && !enabled) throw new ClinicBillingHttpError(503, "Billing empresarial desabilitado neste ambiente.", "clinic_billing_disabled");
  const secretKey = Deno.env.get("STRIPE_CLINIC_SECRET_KEY_TEST") || "";
  if (!secretKey.startsWith("sk_test_")) throw new ClinicBillingHttpError(503, "Credencial Stripe Test dedicada ausente ou inválida.", "stripe_test_key_missing");
  const appOrigin = String(Deno.env.get("CLINIC_APP_ORIGIN") || "").replace(/\/$/, "");
  if (requireEnabled && (!appOrigin || !appOrigin.startsWith("https://") || appOrigin.includes("evolucaoclinica.app.br") && !appOrigin.includes("staging."))) {
    throw new ClinicBillingHttpError(503, "Origem pública de staging não configurada.", "staging_origin_invalid");
  }
  return {
    appEnvironment,
    enabled,
    secretKey,
    webhookSecret: Deno.env.get("STRIPE_CLINIC_WEBHOOK_SECRET_TEST") || "",
    appOrigin,
  };
}

export function createClinicStripe(secretKey: string) {
  if (!secretKey.startsWith("sk_test_")) throw new ClinicBillingHttpError(503, "Stripe Live é proibido nesta fase.", "stripe_live_forbidden");
  return new Stripe(secretKey, { apiVersion: "2025-04-30.basil" as any, httpClient: Stripe.createFetchHttpClient() });
}

export async function assertSandboxAccount(stripe: Stripe) {
  const account: any = await stripe.accounts.retrieve();
  const displayName = account?.settings?.dashboard?.display_name || account?.business_profile?.name || "";
  if (account?.livemode === true || displayName !== "Sandbox Evolução Clínica" || account?.country !== "BR" || account?.default_currency !== "brl") {
    throw new ClinicBillingHttpError(503, "A conta Stripe ativa não corresponde à Sandbox Evolução Clínica Test autorizada.", "stripe_account_mismatch");
  }
  return { id: account.id, livemode: false, displayName };
}

export async function rpc<T>(admin: any, name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await admin.rpc(name, args);
  if (error) {
    if (error.code === "42501") throw new ClinicBillingHttpError(403, "Operação de billing não autorizada.", "not_authorized");
    if (error.code === "23505") throw new ClinicBillingHttpError(409, "Operação de billing já existe ou está em conflito.", "billing_conflict");
    if (error.code === "23514") throw new ClinicBillingHttpError(409, "A operação violaria a capacidade contratada.", "capacity_conflict");
    if (error.code === "P0001") throw new ClinicBillingHttpError(409, "Estado Stripe ou contrato empresarial inválido.", "reconciliation_rejected");
    if (error.code === "P0003") throw new ClinicBillingHttpError(409, "O payload não corresponde à operação persistida.", "payload_mismatch");
    if (error.code === "P0004") throw new ClinicBillingHttpError(409, "Já existe uma operação de billing em andamento.", "billing_operation_in_progress");
    if (error.code === "P0002") throw new ClinicBillingHttpError(404, "Recurso de billing não encontrado.", "billing_not_found");
    throw new ClinicBillingHttpError(500, "Falha na operação de billing.", "billing_database_error");
  }
  return data as T;
}

export async function getCatalog(admin: any, planCode: string) {
  return rpc<any>(admin, "get_clinic_stripe_catalog", { p_plan_code: planCode });
}

export async function validatePrice(stripe: Stripe, priceId: string, catalog: any, component: "base" | "seat") {
  const price: any = await stripe.prices.retrieve(priceId, { expand: ["product"] } as any);
  const expectedAmount = component === "base" ? Number(catalog.base_amount_minor) : Number(catalog.seat_amount_minor);
  const expectedLookup = component === "base" ? catalog.base_lookup_key : catalog.seat_lookup_key;
  const expectedProduct = component === "base" ? catalog.stripe_base_product_id : catalog.stripe_seat_product_id;
  if (
    price?.livemode === true || price?.active !== true || String(price?.currency).toLowerCase() !== "brl" ||
    Number(price?.unit_amount) !== expectedAmount || price?.type !== "recurring" ||
    price?.recurring?.interval !== (catalog.billing_interval === "monthly" ? "month" : "year") ||
    price?.lookup_key !== expectedLookup || price?.id !== (component === "base" ? catalog.stripe_base_price_id : catalog.stripe_seat_price_id) ||
    String(price?.product?.id || price?.product) !== expectedProduct || price?.metadata?.app !== "evolucao_clinica" ||
    price?.metadata?.billing_scope !== "clinic" || price?.metadata?.environment !== "staging" ||
    price?.metadata?.component !== component || price?.metadata?.plan_code !== catalog.plan_code
  ) {
    throw new ClinicBillingHttpError(503, "Preço Stripe Test incompatível com o catálogo interno.", "stripe_price_mismatch");
  }
  return price;
}

export async function getCheckoutAttempt(admin: any, attemptId: string, actorId: string) {
  return rpc<any>(admin, "get_clinic_checkout_attempt", { p_attempt_id: attemptId, p_actor_professional_id: actorId });
}

export async function getOpenCheckoutAttemptForOrganization(admin: any, organizationId: string, actorId: string) {
  return rpc<any>(admin, "get_open_clinic_checkout_attempt_for_organization", {
    p_organization_id: organizationId,
    p_actor_professional_id: actorId,
  });
}

export async function resolveClinicSubscription(stripe: Stripe, subscriptionId: string, catalog: any) {
  const subscription: any = await stripe.subscriptions.retrieve(subscriptionId, { expand: ["items.data.price.product", "latest_invoice"] } as any);
  if (subscription?.livemode === true || subscription?.metadata?.billingScope !== "clinic" && subscription?.metadata?.billing_scope !== "clinic") {
    throw new ClinicBillingHttpError(400, "Assinatura não pertence ao billing empresarial Clínica.", "clinic_metadata_mismatch");
  }
  if (subscription?.metadata?.environment !== "staging") throw new ClinicBillingHttpError(400, "Assinatura fora do ambiente Staging.", "stripe_environment_mismatch");
  const items = Array.isArray(subscription?.items?.data) ? subscription.items.data : [];
  if (items.length !== 2) throw new ClinicBillingHttpError(400, "Assinatura empresarial deve conter exatamente dois itens recorrentes.", "stripe_item_count_mismatch");
  const base = items.find((item: any) => item?.price?.id === catalog.stripe_base_price_id);
  const seat = items.find((item: any) => item?.price?.id === catalog.stripe_seat_price_id);
  if (!base || !seat || Number(base.quantity) !== 1 || !Number.isSafeInteger(Number(seat.quantity)) || Number(seat.quantity) < Number(catalog.minimum_contracted_seats)) {
    throw new ClinicBillingHttpError(400, "Itens Stripe base/seat incompatíveis.", "stripe_item_mapping_mismatch");
  }
  const organizationId = String(subscription?.metadata?.organizationId || "");
  const ownerProfessionalId = String(subscription?.metadata?.ownerProfessionalId || "");
  if (!isUuid(organizationId) || !isUuid(ownerProfessionalId) || subscription?.metadata?.planCode !== catalog.plan_code) {
    throw new ClinicBillingHttpError(400, "Metadata de organização da assinatura inválida.", "stripe_metadata_invalid");
  }
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
  if (!customerId?.startsWith("cus_")) throw new ClinicBillingHttpError(400, "Customer Stripe empresarial inválido.", "stripe_customer_invalid");
  const baseProduct = base.price?.product;
  const seatProduct = seat.price?.product;
  for (const product of [baseProduct, seatProduct]) {
    if (!product || product.livemode === true || product.metadata?.billing_scope !== "clinic" || product.metadata?.environment !== "staging") {
      throw new ClinicBillingHttpError(400, "Produto Stripe empresarial incompatível.", "stripe_product_mismatch");
    }
  }
  const toIso = (seconds: unknown) => Number(seconds) > 0 ? new Date(Number(seconds) * 1000).toISOString() : null;
  const periods = items.map((item: any) => ({ start: Number(item.current_period_start || 0), end: Number(item.current_period_end || 0) }));
  const periodStart = Math.min(...periods.map((period) => period.start).filter(Boolean));
  const periodEnd = Math.max(...periods.map((period) => period.end).filter(Boolean));
  return {
    subscription,
    organizationId,
    ownerProfessionalId,
    customerId,
    baseItemId: base.id,
    seatItemId: seat.id,
    basePriceId: base.price.id,
    seatPriceId: seat.price.id,
    seatQuantity: Number(seat.quantity),
    stripeStatus: String(subscription.status || ""),
    currentPeriodStart: toIso(periodStart),
    currentPeriodEnd: toIso(periodEnd),
    cancelAtPeriodEnd: subscription.cancel_at_period_end === true,
  };
}

export function assertClinicBillingMutationStatus(resolved: any) {
  if (!resolved || !["active", "past_due"].includes(resolved.stripeStatus)) {
    throw new ClinicBillingHttpError(409, "A assinatura Stripe não está em estado mutável para esta operação.", "stripe_status_not_mutable");
  }
  return resolved;
}

export async function recoverStaleClinicBillingOperation(admin: any, stripe: Stripe, organizationId: string) {
  const stale = await rpc<any>(admin, "get_stale_clinic_billing_operation", { p_organization_id: organizationId });
  if (!stale?.recovery_required) return null;
  if (!stale.stripe_subscription_id) {
    throw new ClinicBillingHttpError(503, "A operação stale não possui assinatura Stripe recuperável.", "stale_operation_inconclusive");
  }

  const preliminary: any = await stripe.subscriptions.retrieve(stale.stripe_subscription_id, { expand: ["items.data.price.product", "latest_invoice.payment_intent"] } as any);
  if (preliminary?.livemode === true) throw new ClinicBillingHttpError(503, "Stripe Live é proibido nesta fase.", "stripe_live_forbidden");
  const planCode = String(preliminary?.metadata?.planCode || "");
  if (!['clinic_monthly', 'clinic_yearly'].includes(planCode)) {
    throw new ClinicBillingHttpError(409, "A operação stale não possui plano Stripe recuperável.", "stale_operation_inconclusive");
  }
  const catalog = await getCatalog(admin, planCode);
  const resolved = await resolveClinicSubscription(stripe, stale.stripe_subscription_id, catalog);
  const latestInvoice: any = preliminary?.latest_invoice;
  const paymentIntentStatus = typeof latestInvoice?.payment_intent === "object" ? latestInvoice.payment_intent?.status : "";
  const pendingPayment = Boolean(
    resolved.subscription?.pending_update ||
    (latestInvoice?.status === "open" && ["processing", "requires_action", "requires_payment_method"].includes(paymentIntentStatus)),
  );
  if (pendingPayment) {
    const held = await rpc<any>(admin, "hold_clinic_billing_operation_pending_payment", {
      p_operation_id: stale.operation_id,
      p_error_code: "payment_action_required",
    });
    return { status: "pending_payment", operation: held, resolved };
  }

  await reconcileClinicStripeSubscription(admin, stripe, stale.stripe_subscription_id);
  const afterReconcile = await rpc<any>(admin, "get_clinic_billing_operation", { p_operation_id: stale.operation_id });
  if (afterReconcile?.status === "completed") {
    return { status: "completed", operation: afterReconcile, resolved };
  }

  const released = await rpc<any>(admin, "expire_stale_clinic_billing_operation", {
    p_operation_id: stale.operation_id,
    p_error_code: "stale_operation_released",
  });
  return { status: released?.status === "completed" ? "completed" : "expired", operation: released, resolved };
}

export async function reconcileClinicStripeSubscription(admin: any, stripe: Stripe, subscriptionId: string) {
  const preliminary: any = await stripe.subscriptions.retrieve(subscriptionId, { expand: ["items.data.price.product"] } as any);
  const planCode = String(preliminary?.metadata?.planCode || "");
  if (!['clinic_monthly', 'clinic_yearly'].includes(planCode)) throw new ClinicBillingHttpError(400, "Plano empresarial ausente na assinatura Stripe.", "stripe_metadata_invalid");
  const catalog = await getCatalog(admin, planCode);
  const resolved = await resolveClinicSubscription(stripe, subscriptionId, catalog);
  if (!["active", "past_due", "unpaid", "canceled"].includes(resolved.stripeStatus)) {
    throw new ClinicBillingHttpError(409, "Assinatura inicial ainda não está em estado habilitante.", "stripe_status_not_eligible");
  }
  const local = await rpc<any>(admin, "reconcile_clinic_stripe_subscription", {
    p_organization_id: resolved.organizationId,
    p_stripe_subscription_id: subscriptionId,
    p_stripe_customer_id: resolved.customerId,
    p_stripe_base_subscription_item_id: resolved.baseItemId,
    p_stripe_seat_subscription_item_id: resolved.seatItemId,
    p_stripe_base_price_id: resolved.basePriceId,
    p_stripe_seat_price_id: resolved.seatPriceId,
    p_plan_code: planCode,
    p_billing_interval: catalog.billing_interval,
    p_stripe_status: resolved.stripeStatus,
    p_stripe_seat_quantity: resolved.seatQuantity,
    p_current_period_start: resolved.currentPeriodStart,
    p_current_period_end: resolved.currentPeriodEnd,
    p_cancel_at_period_end: resolved.cancelAtPeriodEnd,
  });
  await rpc<number>(admin, "complete_clinic_billing_operations_for_subscription", {
    p_stripe_subscription_id: subscriptionId,
    p_seat_quantity: resolved.seatQuantity,
    p_cancel_at_period_end: resolved.cancelAtPeriodEnd,
  });
  return { catalog, resolved, local };
}

export async function recordEvent(admin: any, event: any, organizationId?: string | null, subscriptionId?: string | null) {
  return rpc<any>(admin, "claim_clinic_stripe_event", {
    p_stripe_event_id: event.id,
    p_event_type: event.type,
    p_stripe_created_at: Number(event.created) > 0 ? new Date(Number(event.created) * 1000).toISOString() : null,
    p_stripe_subscription_id: subscriptionId || null,
    p_organization_id: organizationId || null,
  });
}

export async function finishEvent(admin: any, eventId: string, status: "processed" | "failed" | "ignored", errorCode?: string) {
  return rpc<any>(admin, "finish_clinic_stripe_event", { p_stripe_event_id: eventId, p_processing_status: status, p_error_code: errorCode || null });
}
