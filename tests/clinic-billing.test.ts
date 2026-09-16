import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const files = [
  "supabase/clinic-migrations/20260916_14_clinic_stripe_billing.sql",
  "supabase/clinic-migrations/20260916_15_clinic_stripe_billing_server_wrappers.sql",
  "supabase/clinic-migrations/20260916_16_clinic_stripe_checkout_lookup.sql",
  "supabase/clinic-migrations/20260916_17_clinic_stripe_cancellation_wrapper.sql",
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

console.log("clinic billing tests: ok");
