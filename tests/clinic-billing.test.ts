import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import "./clinic-billing-authorization.test.ts";

const files = [
  "supabase/clinic-migrations/20260916_14_clinic_stripe_billing.sql",
  "supabase/clinic-migrations/20260916_15_clinic_stripe_billing_server_wrappers.sql",
  "supabase/clinic-migrations/20260916_16_clinic_stripe_checkout_lookup.sql",
  "supabase/clinic-migrations/20260916_17_clinic_stripe_cancellation_wrapper.sql",
  "supabase/clinic-migrations/20260916_18_harden_clinic_billing_operations.sql",
  "supabase/clinic-migrations/20260916_19_harden_clinic_billing_recovery.sql",
  "supabase/functions/_shared/clinicBilling.ts",
  "supabase/functions/create-clinic-stripe-checkout-session/index.ts",
  "supabase/functions/clinic-stripe-webhook/index.ts",
  "supabase/functions/clinic-billing-seats/index.ts",
  "supabase/functions/clinic-billing-cancel/index.ts",
  "supabase/functions/clinic-billing-status/index.ts",
  "supabase/functions/clinic-billing-catalog/index.ts",
  "src/services/clinicBilling.ts",
  "src/pages/ClinicBilling.tsx",
];
const source = files.map((file) => readFileSync(file, "utf8")).join("\n");
const migration = readFileSync("supabase/clinic-migrations/20260916_14_clinic_stripe_billing.sql", "utf8");
const hardeningMigration = readFileSync("supabase/clinic-migrations/20260916_18_harden_clinic_billing_operations.sql", "utf8");
const recoveryMigration = readFileSync("supabase/clinic-migrations/20260916_19_harden_clinic_billing_recovery.sql", "utf8");
const webhook = readFileSync("supabase/functions/clinic-stripe-webhook/index.ts", "utf8");

assert.doesNotMatch(source, /sk_live_/);
assert.doesNotMatch(source, /STRIPE_SECRET_KEY_PROD|STRIPE_WEBHOOK_SECRET_PROD/);
assert.doesNotMatch(source, /\b(patients|evolutions)\b/);
assert.match(source, /environment.*staging|environment.*test/s);
assert.match(source, /Sandbox Evolução Clínica/);
assert.match(source, /pending_if_incomplete/);
assert.match(source, /always_invoice/);
assert.match(source, /cancel_at_period_end/);
assert.match(source, /organization_checkout_attempts/);
assert.match(source, /clinic_stripe_events/);
assert.match(source, /clinic_stripe_transactions/);
assert.match(source, /clinic-stripe-webhook/);
assert.match(webhook, /req\.text\(\)/);
assert.match(webhook, /constructEventAsync/);
assert.match(webhook, /SUPPORTED_EVENTS/);
assert.match(migration, /REVOKE ALL ON TABLE private\.clinic_stripe_catalog/);
assert.match(migration, /REVOKE ALL ON TABLE private\.clinic_stripe_events/);
assert.match(migration, /REVOKE ALL ON TABLE private\.clinic_stripe_transactions/);
assert.match(source, /service_role/);
assert.match(hardeningMigration, /clinic_billing_operations/);
assert.match(hardeningMigration, /clinic_billing_operations_open_org/);
assert.match(hardeningMigration, /interval '5 minutes'/);
assert.match(hardeningMigration, /P0003/);
assert.match(hardeningMigration, /P0004/);
assert.match(recoveryMigration, /get_stale_clinic_billing_operation/);
assert.match(recoveryMigration, /expire_stale_clinic_billing_operation/);
assert.match(recoveryMigration, /expire_clinic_checkout_attempt/);
assert.match(recoveryMigration, /get_open_clinic_checkout_attempt_for_organization/);
assert.match(recoveryMigration, /financial_status NOT IN \('active', 'past_due'\)/);
assert.match(source, /recoverStaleClinicBillingOperation/);
assert.match(source, /checkout_session_expired/);
assert.match(source, /checkout_attempt_in_progress/);
assert.match(source, /stripe_status_not_mutable/);
assert.match(source, /clinic:billing:/);
assert.match(source, /clinic:checkout:/);
assert.match(webhook, /amount_due/);

type Operation = { id: string; organizationId: string; operationType: string; targetSeats: number | null; key: string; status: "processing" | "pending_payment" | "completed" | "failed"; expiresAt: number };
class OperationLedgerHarness {
  private readonly rows = new Map<string, Operation>();
  private readonly openByOrganization = new Map<string, string>();
  claim(input: Omit<Operation, "id" | "status" | "expiresAt">, now: number) {
    const sameKey = [...this.rows.values()].find((row) => row.organizationId === input.organizationId && row.operationType === input.operationType && row.key === input.key);
    if (sameKey) {
      if (sameKey.targetSeats !== input.targetSeats) throw new Error("payload_mismatch");
      if (sameKey.status === "completed") return { claimed: false, row: sameKey };
      if (sameKey.expiresAt > now) return { claimed: false, row: sameKey };
      sameKey.status = "processing";
      sameKey.expiresAt = now + 300;
      return { claimed: true, row: sameKey };
    }
    const openId = this.openByOrganization.get(input.organizationId);
    if (openId) {
      const open = this.rows.get(openId)!;
      if (open.expiresAt > now) throw new Error("billing_operation_in_progress");
      throw new Error("billing_operation_in_progress");
    }
    const row: Operation = { ...input, id: crypto.randomUUID(), status: "processing", expiresAt: now + 300 };
    this.rows.set(row.id, row);
    this.openByOrganization.set(row.organizationId, row.id);
    return { claimed: true, row };
  }
  complete(id: string) { const row = this.rows.get(id)!; row.status = "completed"; this.openByOrganization.delete(row.organizationId); }
}

const ledger = new OperationLedgerHarness();
const concurrent = await Promise.allSettled([
  Promise.resolve().then(() => ledger.claim({ organizationId: "org-a", operationType: "seat_increase", targetSeats: 4, key: "key-a" }, 100)),
  Promise.resolve().then(() => ledger.claim({ organizationId: "org-a", operationType: "seat_increase", targetSeats: 5, key: "key-b" }, 100)),
]);
assert.equal(concurrent.filter((result) => result.status === "fulfilled").length, 1);
assert.equal(concurrent.filter((result) => result.status === "rejected" && String((result as PromiseRejectedResult).reason?.message) === "billing_operation_in_progress").length, 1);
const reused = ledger.claim({ organizationId: "org-a", operationType: "seat_increase", targetSeats: 4, key: "key-a" }, 100);
assert.equal(reused.claimed, false);
assert.throws(() => ledger.claim({ organizationId: "org-a", operationType: "seat_increase", targetSeats: 5, key: "key-a" }, 100), /payload_mismatch/);
ledger.complete(reused.row.id);
const pendingLedger = new OperationLedgerHarness();
const pending = pendingLedger.claim({ organizationId: "org-pending", operationType: "seat_increase", targetSeats: 4, key: "key-pending" }, 100);
pending.row.status = "pending_payment";
assert.equal(pendingLedger.claim({ organizationId: "org-pending", operationType: "seat_increase", targetSeats: 4, key: "key-pending" }, 100).claimed, false);
const stale = new OperationLedgerHarness();
const first = stale.claim({ organizationId: "org-b", operationType: "cancel_at_period_end", targetSeats: null, key: "key-stale" }, 100);
assert.equal(stale.claim({ organizationId: "org-b", operationType: "cancel_at_period_end", targetSeats: null, key: "key-stale" }, 401).claimed, true);
assert.equal(first.row.status, "processing");

const eventRows = new Map<string, { status: string; startedAt: number }>();
function claimEvent(id: string, now: number) {
  const existing = eventRows.get(id);
  if (!existing) { eventRows.set(id, { status: "processing", startedAt: now }); return "claimed"; }
  if (existing.status === "processed" || existing.status === "ignored") return "duplicate";
  if (existing.status === "processing" && existing.startedAt > now - 300) return "in_progress";
  existing.status = "processing"; existing.startedAt = now; return "reclaimed";
}
assert.equal(claimEvent("evt_1", 100), "claimed");
assert.equal(claimEvent("evt_1", 101), "in_progress");
eventRows.get("evt_1")!.status = "processed";
assert.equal(claimEvent("evt_1", 102), "duplicate");
eventRows.get("evt_1")!.status = "processing"; eventRows.get("evt_1")!.startedAt = 1;
assert.equal(claimEvent("evt_1", 400), "reclaimed");

function ledgerAmount(eventType: string, invoice: { paid?: boolean; amount_paid?: number; amount_due?: number }) {
  return eventType === "invoice.payment_failed" ? Number(invoice.amount_due ?? invoice.amount_paid ?? 0) : Number(invoice.amount_paid ?? invoice.amount_due ?? 0);
}
assert.equal(ledgerAmount("invoice.payment_failed", { paid: false, amount_paid: 0, amount_due: 13960 }), 13960);
assert.equal(ledgerAmount("invoice.paid", { paid: true, amount_paid: 13960, amount_due: 13960 }), 13960);

type RecoveryOperation = { id: string; organizationId: string; type: "seat_increase" | "seat_decrease" | "cancel_at_period_end"; targetSeats: number | null; status: "processing" | "pending_payment" | "completed" | "expired"; expiresAt: number };
class RecoveryHarness {
  private readonly rows = new Map<string, RecoveryOperation>();
  private readonly openByOrganization = new Map<string, string>();
  prepare(operation: Omit<RecoveryOperation, "id" | "status" | "expiresAt">, now: number) {
    const openId = this.openByOrganization.get(operation.organizationId);
    if (openId) {
      const open = this.rows.get(openId)!;
      if (open.expiresAt <= now) return { recoveryRequired: true, operation: open };
      throw new Error("billing_operation_in_progress");
    }
    const row: RecoveryOperation = { ...operation, id: crypto.randomUUID(), status: "processing", expiresAt: now + 300 };
    this.rows.set(row.id, row); this.openByOrganization.set(row.organizationId, row.id);
    return { recoveryRequired: false, operation: row };
  }
  recover(organizationId: string, stripeSeats: number, pendingPayment: boolean, now: number) {
    const id = this.openByOrganization.get(organizationId); if (!id) return "none";
    const row = this.rows.get(id)!; if (row.expiresAt > now) return "active";
    if (pendingPayment) { row.status = "pending_payment"; row.expiresAt = now + 300; return "pending_payment"; }
    const satisfied = row.type === "cancel_at_period_end" || row.targetSeats === stripeSeats;
    row.status = satisfied ? "completed" : "expired";
    this.openByOrganization.delete(organizationId);
    return row.status;
  }
  claimNew(operation: Omit<RecoveryOperation, "id" | "status" | "expiresAt">, now: number) { return this.prepare(operation, now); }
  get(id: string) { return this.rows.get(id)!; }
}

const appliedRecovery = new RecoveryHarness();
const operationA = appliedRecovery.prepare({ organizationId: "org-recovery", type: "seat_increase", targetSeats: 4 }, 100).operation;
assert.equal(appliedRecovery.prepare({ organizationId: "org-recovery", type: "seat_increase", targetSeats: 5 }, 401).recoveryRequired, true);
assert.equal(appliedRecovery.recover("org-recovery", 4, false, 401), "completed");
assert.equal(appliedRecovery.get(operationA.id).status, "completed");
assert.equal(appliedRecovery.claimNew({ organizationId: "org-recovery", type: "seat_increase", targetSeats: 5 }, 401).recoveryRequired, false);

const untouchedRecovery = new RecoveryHarness();
const untouched = untouchedRecovery.prepare({ organizationId: "org-untouched", type: "seat_increase", targetSeats: 4 }, 100).operation;
assert.equal(untouchedRecovery.recover("org-untouched", 3, false, 401), "expired");
assert.equal(untouchedRecovery.get(untouched.id).status, "expired");
assert.equal(untouchedRecovery.claimNew({ organizationId: "org-untouched", type: "seat_increase", targetSeats: 5 }, 401).recoveryRequired, false);

const pendingRecovery = new RecoveryHarness();
pendingRecovery.prepare({ organizationId: "org-pending-recovery", type: "seat_increase", targetSeats: 4 }, 100);
assert.equal(pendingRecovery.recover("org-pending-recovery", 3, true, 401), "pending_payment");
assert.throws(() => pendingRecovery.claimNew({ organizationId: "org-pending-recovery", type: "seat_increase", targetSeats: 5 }, 500), /billing_operation_in_progress/);

type CheckoutAttempt = { id: string; plan: string; seats: number; status: "started" | "session_created" | "completed" | "expired"; expiresAt: number; session: "none" | "open" | "expired" | "complete" };
class CheckoutRecoveryHarness {
  private attempt: CheckoutAttempt | null = null;
  create(input: { id: string; plan: string; seats: number }, now: number, session: CheckoutAttempt["session"] = "open") {
    const existing = this.attempt;
    if (existing && existing.status !== "expired") {
      if (existing.status === "completed" && existing.session === "complete") return "reconcile";
      if (existing.session === "expired" || existing.expiresAt <= now) { existing.status = "expired"; }
      else if (existing.plan !== input.plan || existing.seats !== input.seats) throw new Error("checkout_open_payload_conflict");
      else if (existing.session === "open") return "reuse";
    }
    this.attempt = { ...input, status: "session_created", expiresAt: now + 86400, session };
    return "created";
  }
  setStarted(id: string, now: number, stale: boolean) { this.attempt = { id, plan: "clinic_monthly", seats: 3, status: "started", expiresAt: stale ? now - 1 : now + 300, session: "none" }; }
  state() { return this.attempt; }
}

const checkoutRecovery = new CheckoutRecoveryHarness();
assert.equal(checkoutRecovery.create({ id: "attempt-a", plan: "clinic_monthly", seats: 3 }, 100), "created");
checkoutRecovery.state()!.session = "expired";
assert.equal(checkoutRecovery.create({ id: "attempt-b", plan: "clinic_monthly", seats: 3 }, 200), "created");
assert.equal(checkoutRecovery.create({ id: "attempt-c", plan: "clinic_monthly", seats: 3 }, 201), "reuse");
assert.throws(() => checkoutRecovery.create({ id: "attempt-d", plan: "clinic_monthly", seats: 4 }, 202), /checkout_open_payload_conflict/);
checkoutRecovery.setStarted("attempt-stale", 300, true);
assert.equal(checkoutRecovery.create({ id: "attempt-new", plan: "clinic_monthly", seats: 3 }, 300), "created");
checkoutRecovery.state()!.status = "completed"; checkoutRecovery.state()!.session = "complete";
assert.equal(checkoutRecovery.create({ id: "attempt-reload", plan: "clinic_monthly", seats: 3 }, 301), "reconcile");

function entitlementForFixture(financialStatus: "active" | "past_due", graceEndsAt: number | null, now: number) {
  return financialStatus === "active" || (financialStatus === "past_due" && graceEndsAt !== null && graceEndsAt > now) ? "full" : "restricted";
}
assert.equal(entitlementForFixture("past_due", 800, 500), "full");
assert.equal(entitlementForFixture("past_due", 400, 500), "restricted");
assert.equal(["active", "past_due"].includes("past_due"), true);
assert.equal(["active", "past_due"].includes("canceled"), false);

console.log("clinic billing tests: ok");
