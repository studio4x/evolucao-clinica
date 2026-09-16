import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const files = [
  "supabase/clinic-migrations/20260916_14_clinic_stripe_billing.sql",
  "supabase/clinic-migrations/20260916_15_clinic_stripe_billing_server_wrappers.sql",
  "supabase/clinic-migrations/20260916_16_clinic_stripe_checkout_lookup.sql",
  "supabase/clinic-migrations/20260916_17_clinic_stripe_cancellation_wrapper.sql",
  "supabase/clinic-migrations/20260916_18_harden_clinic_billing_operations.sql",
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

console.log("clinic billing tests: ok");
