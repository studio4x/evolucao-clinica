import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// Execute the shipped Deno source, not a copied authorization/recovery model.
// Only provider transport, database transport and serve are replaced.
function loadRuntime(admin: any, stripe: any, enabled = true) {
  let handler: (req: Request) => Promise<Response>;
  const calls: string[] = [];
  const modules = new Map<string, any>();
  const env: Record<string, string> = {
    SUPABASE_URL: "https://hwkdwinfckmjoriqxbjk.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "synthetic",
    APP_ENV: "staging", CLINIC_BILLING_ENABLED: String(enabled), STRIPE_CLINIC_SECRET_KEY_TEST: "sk_test_synthetic",
    CLINIC_APP_ORIGIN: "https://staging.evolucaoclinica.app.br",
  };
  class StripeMock {
    constructor() { calls.push("stripe.constructor"); return stripe; }
    static createFetchHttpClient() { return {}; }
  }
  function load(file: string): any {
    file = resolve(file);
    if (modules.has(file)) return modules.get(file);
    const module = { exports: {} };
    modules.set(file, module.exports);
    const compiled = ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    runInNewContext(compiled, {
      module, exports: module.exports,
      require: (name: string) => {
        if (name.includes("http/server")) return { serve: (fn: typeof handler) => { handler = fn; } };
        if (name.includes("supabase-js")) return { createClient: () => admin };
        if (name.includes("stripe@")) return { default: StripeMock };
        return load(resolve(dirname(file), name));
      },
      Deno: { env: { get: (name: string) => env[name] } },
      Request, Response, URL, crypto, Date, console: { error: () => undefined },
    }, { filename: file });
    return module.exports;
  }
  return { load, calls, request: (body: any) => handler(new Request("https://staging.invalid", {
    method: "POST", headers: { Authorization: "Bearer user-session", "Content-Type": "application/json" }, body: JSON.stringify(body),
  })) };
}

const org = crypto.randomUUID(), otherOrg = crypto.randomUUID();
const oldOwner = crypto.randomUUID(), owner = crypto.randomUUID();
const attemptId = crypto.randomUUID();
const catalog = {
  plan_code: "clinic_monthly", minimum_contracted_seats: 3, billing_interval: "monthly",
  stripe_base_price_id: "price_base", stripe_seat_price_id: "price_seat",
  stripe_base_product_id: "prod_base", stripe_seat_product_id: "prod_seat",
  base_amount_minor: 1990, seat_amount_minor: 3990, base_lookup_key: "base", seat_lookup_key: "seat",
};
const product = { livemode: false, metadata: { billing_scope: "clinic", environment: "staging" } };
function contract(status = "active", quantity = 3, cancel = false) {
  return {
    id: "sub_test", livemode: false, status, customer: "cus_test", cancel_at_period_end: cancel,
    metadata: { billingScope: "clinic", environment: "staging", organizationId: org, ownerProfessionalId: oldOwner, planCode: "clinic_monthly" },
    items: { data: [
      { id: "si_base", quantity: 1, price: { id: "price_base", product }, current_period_start: 1800000000, current_period_end: 1900000000 },
      { id: "si_seat", quantity, price: { id: "price_seat", product }, current_period_start: 1800000000, current_period_end: 1900000000 },
    ] },
  };
}
function session(status: string) {
  return {
    id: "cs_test_synthetic", livemode: false, status, customer: "cus_test", subscription: status === "complete" ? "sub_test" : null,
    // Deliberately past deadline: COMPLETE must win over expires_at.
    expires_at: 1, url: "https://checkout.stripe.com/synthetic", client_reference_id: attemptId,
    metadata: { checkoutAttemptId: attemptId, organizationId: org, planCode: "clinic_monthly", initialContractedSeats: "3", ownerProfessionalId: oldOwner },
    line_items: { data: [{ quantity: 1, price: { id: "price_base" } }, { quantity: 3, price: { id: "price_seat" } }] },
  };
}

for (const endpoint of ["clinic-billing-seats", "clinic-billing-cancel", "create-clinic-stripe-checkout-session"]) {
  for (const denied of ["cross-tenant", "manager", "professional", "no-membership", "ex-owner", "random-org", "archived", "suspended"]) {
    const calls: string[] = [];
    const state = { operation: { status: "processing" }, subscription: { seats: 3 }, pendingReduction: 3, checkout: { status: "session_created" } };
    const before = JSON.stringify(state);
    const admin = {
      auth: { getUser: async () => ({ data: { user: { id: oldOwner } }, error: null }) },
      rpc: async (name: string, args: any) => {
        calls.push(name);
        assert.equal(name, "assert_clinic_billing_owner_authorized", denied);
        assert.equal(args.p_actor_professional_id, oldOwner, "JWT actor, not spoofed body actor");
        return { error: { code: "42501" }, data: null };
      },
    };
    const stripe = new Proxy({}, { get: () => { throw new Error("Unauthorized Stripe access"); } });
    const runtime = loadRuntime(admin, stripe, false);
    runtime.load(`supabase/functions/${endpoint}/index.ts`);
    const response = await runtime.request({
      organizationId: denied === "random-org" ? crypto.randomUUID() : otherOrg,
      actorProfessionalId: owner, ownerId: owner, membershipRole: "owner",
      contractedSeats: 4, idempotencyKey: crypto.randomUUID(), planCode: "clinic_monthly", checkoutAttemptId: attemptId,
    });
    assert.equal(response.status, 403, `${endpoint}: ${denied}`);
    assert.deepEqual(await response.json(), { error: "not_authorized" });
    assert.deepEqual(calls, ["assert_clinic_billing_owner_authorized"]);
    assert.deepEqual(runtime.calls, [], "Denied before Stripe construction/config gate");
    assert.equal(JSON.stringify(state), before, "No operation/subscription/pending/checkout writes");
  }
}

// The shared helper independently refuses unauthorized callers, even if caller forgot its guard.
{
  const calls: string[] = [];
  const admin = { rpc: async (name: string) => { calls.push(name); return { error: { code: "42501" } }; } };
  const runtime = loadRuntime(admin, {});
  const shared = runtime.load("supabase/functions/_shared/clinicBilling.ts");
  await assert.rejects(shared.recoverStaleClinicBillingOperation(admin, {}, org, oldOwner), (error: any) => error.status === 403);
  assert.deepEqual(calls, ["assert_clinic_billing_owner_authorized"]);
}

// Run the actual financial mutation handlers against a past_due Stripe contract,
// not merely a DB fixture that recovery would immediately turn back into active.
for (const endpoint of ["clinic-billing-seats", "clinic-billing-cancel"]) {
  const calls: string[] = [];
  const sub: any = contract("past_due");
  const admin = {
    auth: { getUser: async () => ({ data: { user: { id: owner } }, error: null }) },
    rpc: async (name: string, args: any) => {
      calls.push(name);
      let data: any;
      if (name === "assert_clinic_billing_owner_authorized") data = { organization_id: org, actor_professional_id: owner, role: "owner", operational_status: "active" };
      else if (name === "get_stale_clinic_billing_operation") data = { recovery_required: false };
      else if (name === "get_clinic_billing_status") data = { subscription: { plan_code: "clinic_monthly", contracted_seats: 3, financial_status: "past_due" } };
      else if (name === "prepare_clinic_billing_operation") { assert.equal(args.p_actor_professional_id, owner); data = { operation_id: "op", status: "processing", claimed: true, subscription_id: "sub_test", stripe_reference: "si_seat" }; }
      else if (name === "get_clinic_stripe_catalog") data = catalog;
      else if (name === "reconcile_clinic_stripe_subscription") data = { financial_status: "past_due" };
      else if (name === "complete_clinic_billing_operations_for_subscription") data = 1;
      else throw new Error(`Unexpected ${name}`);
      return { data, error: null };
    },
  };
  const stripe = {
    accounts: { retrieve: async () => ({ id: "acct_test", settings: { dashboard: { display_name: "Sandbox Evolução Clínica" } }, country: "BR", default_currency: "brl" }) },
    subscriptions: {
      retrieve: async () => { calls.push("stripe.retrieve"); return sub; },
      update: async (_id: string, body: any) => { calls.push("stripe.update"); if (body.items) sub.items.data[1].quantity = body.items[0].quantity; if (body.cancel_at_period_end) sub.cancel_at_period_end = true; return sub; },
    },
  };
  const runtime = loadRuntime(admin, stripe);
  runtime.load(`supabase/functions/${endpoint}/index.ts`);
  const response = await runtime.request({ organizationId: org, contractedSeats: 4, idempotencyKey: crypto.randomUUID() });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, "confirmed");
  assert.equal(calls[0], "assert_clinic_billing_owner_authorized");
  assert.ok(calls.indexOf("stripe.update") > calls.indexOf("prepare_clinic_billing_operation"));
  assert.equal(sub.metadata.ownerProfessionalId, oldOwner, "Current owner is authorized independently of historical Stripe owner");
}

// Actual recovery regression: applied, untouched, decrease, cancel, pending,
// and financial states that must not be rejected by owner authorization.
for (const scenario of ["applied", "untouched", "decrease", "cancel", "pending", "past_due", "unpaid", "canceled", "foreign-contract"]) {
  const calls: string[] = [];
  let operationStatus = "processing";
  const sub: any = contract(["past_due", "unpaid", "canceled"].includes(scenario) ? scenario : "active", scenario === "applied" ? 4 : 3, scenario === "cancel");
  if (scenario === "pending") sub.pending_update = { expires_at: 1900000000 };
  if (scenario === "foreign-contract") sub.metadata.organizationId = otherOrg;
  const admin = { rpc: async (name: string, args: any) => {
    calls.push(name);
    let data: any = null;
    if (name === "assert_clinic_billing_owner_authorized") data = { organization_id: org, actor_professional_id: owner, role: "owner", operational_status: "restricted" };
    else if (name === "get_stale_clinic_billing_operation") data = { recovery_required: true, operation_id: "op", stripe_subscription_id: "sub_test" };
    else if (name === "get_clinic_stripe_catalog") data = catalog;
    else if (name === "reconcile_clinic_stripe_subscription") data = { financial_status: sub.status };
    else if (name === "complete_clinic_billing_operations_for_subscription") { if (["applied", "cancel"].includes(scenario)) operationStatus = "completed"; data = 1; }
    else if (name === "get_clinic_billing_operation") data = { status: operationStatus };
    else if (name === "expire_stale_clinic_billing_operation") data = { status: "failed" };
    else if (name === "hold_clinic_billing_operation_pending_payment") data = { status: "pending_payment" };
    else throw new Error(`Unexpected RPC ${name} ${JSON.stringify(args)}`);
    return { data, error: null };
  } };
  const stripe = { subscriptions: { retrieve: async () => { calls.push("stripe.retrieve"); return sub; } } };
  const runtime = loadRuntime(admin, stripe);
  const shared = runtime.load("supabase/functions/_shared/clinicBilling.ts");
  if (scenario === "foreign-contract") {
    await assert.rejects(shared.recoverStaleClinicBillingOperation(admin, stripe, org, owner), (e: any) => e.code === "stale_subscription_state");
    assert.ok(!calls.includes("reconcile_clinic_stripe_subscription"));
  } else {
    const result = await shared.recoverStaleClinicBillingOperation(admin, stripe, org, owner);
    assert.equal(result.status, scenario === "pending" ? "pending_payment" : ["applied", "cancel"].includes(scenario) ? "completed" : "expired");
  }
  assert.equal(calls[0], "assert_clinic_billing_owner_authorized");
  assert.equal(calls[1], "get_stale_clinic_billing_operation");
}

for (const initial of ["open", "expired", "complete", "activated", "complete-race", "expire-inconclusive", "foreign-session", "foreign-subscription"]) {
  const calls: string[] = [];
  const stripeSession = session(initial === "activated" ? "complete" : initial === "complete-race" || initial === "expire-inconclusive" || initial.startsWith("foreign") ? "open" : initial);
  const sub = contract();
  if (initial === "foreign-session") stripeSession.metadata.organizationId = otherOrg;
  if (initial === "foreign-subscription") { stripeSession.status = "complete"; stripeSession.subscription = "sub_test"; sub.metadata.organizationId = otherOrg; }
  const candidate: any = { attempt_id: attemptId, actor_professional_id: oldOwner, organization_id: org, plan_code: "clinic_monthly", requested_seats: 3, status: "session_created", stripe_checkout_session_id: stripeSession.id };
  if (initial === "activated") candidate.status = "activated";
  const admin = { auth: { getUser: async () => ({ data: { user: { id: owner } }, error: null }) }, rpc: async (name: string) => {
    calls.push(name);
    let data: any;
    if (name === "assert_clinic_billing_owner_authorized") data = { organization_id: org, actor_professional_id: owner, role: "owner", operational_status: "pending_setup" };
    else if (name === "get_clinic_stripe_catalog") data = catalog;
    else if (name === "get_open_clinic_checkout_attempt_for_organization_admin") data = candidate;
    else if (name === "reconcile_clinic_stripe_subscription") data = { financial_status: "active" };
    else if (name === "complete_clinic_billing_operations_for_subscription") data = 0;
    else if (name === "update_clinic_checkout_attempt") data = { status: "activated" };
    else if (name === "expire_clinic_checkout_attempt") { candidate.status = "expired"; data = candidate; }
    else throw new Error(`Unexpected RPC ${name}`);
    return { data, error: null };
  } };
  const stripe = {
    accounts: { retrieve: async () => ({ id: "acct_test", settings: { dashboard: { display_name: "Sandbox Evolução Clínica" } }, country: "BR", default_currency: "brl" }) },
    checkout: { sessions: {
      retrieve: async () => { calls.push("stripe.session.retrieve"); return stripeSession; },
      expire: async () => {
        calls.push("stripe.session.expire");
        if (initial === "complete-race") { stripeSession.status = "complete"; stripeSession.subscription = "sub_test"; throw new Error("Already complete"); }
        if (initial === "expire-inconclusive") throw new Error("Transport error");
        stripeSession.status = "expired"; return stripeSession;
      },
    } },
    subscriptions: { retrieve: async () => { calls.push("stripe.subscription.retrieve"); return sub; } },
  };
  const runtime = loadRuntime(admin, stripe);
  const helpers = runtime.load("supabase/functions/create-clinic-stripe-checkout-session/index.ts");
  if (["expire-inconclusive", "foreign-session", "foreign-subscription"].includes(initial)) {
    await assert.rejects(helpers.recoverCheckoutCandidate(admin, stripe, candidate, org, "clinic_monthly", 3, catalog, owner), (e: any) => e.status === 409);
    assert.ok(!calls.includes("reconcile_clinic_stripe_subscription"));
    assert.ok(!calls.includes("expire_clinic_checkout_attempt"));
  } else {
    let result: any;
    if (["complete", "activated"].includes(initial)) {
      const response = await runtime.request({ organizationId: org, planCode: "clinic_monthly", contractedSeats: 3 });
      assert.equal(response.status, 200);
      result = await response.json();
    } else result = await helpers.recoverCheckoutCandidate(admin, stripe, candidate, org, "clinic_monthly", 3, catalog, owner);
    if (["complete", "activated", "complete-race"].includes(initial)) {
      assert.equal(result.status, "activated");
      assert.ok(!calls.includes("expire_clinic_checkout_attempt"));
      if (["complete", "activated"].includes(initial)) assert.ok(!calls.includes("stripe.session.expire"));
      assert.equal(sub.metadata.ownerProfessionalId, oldOwner, "Historical initiator stays unchanged");
    } else {
      assert.equal(result, null);
      assert.equal(candidate.status, "expired");
      assert.equal(calls.includes("stripe.session.expire"), initial === "open");
    }
  }
  assert.equal(calls[0], "assert_clinic_billing_owner_authorized");
}

const migration = readFileSync("supabase/clinic-migrations/20260916_20_harden_clinic_billing_recovery_authorization.sql", "utf8");
assert.match(migration, /SET search_path = ''/);
assert.match(migration, /m.status = 'active' AND m.membership_role = 'owner'/);
assert.doesNotMatch(migration, /get_organization_entitlement|financial_status\s*[=<>]|organization_subscriptions/);
assert.match(migration, /FROM PUBLIC, anon, authenticated/);
const webhookSource = readFileSync("supabase/functions/clinic-stripe-webhook/index.ts", "utf8");
assert.doesNotMatch(webhookSource, /assertClinicBillingOwnerAuthorized/);
console.log("Clinic billing 2B.3: shipped handlers/helpers authorization, zero unauthorized calls, stale and ownership-transfer recovery PASS");
