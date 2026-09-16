import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerClinicEntitlementRoutes } from "../server/clinic/clinicEntitlementRoutes.js";

const migration = readFileSync("supabase/clinic-migrations/20260916_11_organization_entitlements_and_seats.sql", "utf8");
const hardeningMigration = readFileSync("supabase/clinic-migrations/20260916_12_harden_entitlement_snapshots_and_invitation_expiry.sql", "utf8");
const route = readFileSync("server/clinic/clinicEntitlementRoutes.ts", "utf8");
const service = readFileSync("src/services/clinicEntitlement.ts", "utf8");
const page = readFileSync("src/pages/ClinicTeam.tsx", "utf8");
const app = readFileSync("src/App.tsx", "utf8");

assert.match(migration, /private\.clinic_plan_catalog/);
assert.match(migration, /clinic_monthly.*4990.*2990/s);
assert.match(migration, /clinic_yearly.*49900.*29900/s);
assert.match(migration, /minimum_contracted_seats.*>= 3/);
assert.match(migration, /private\.organization_subscriptions/);
assert.match(migration, /organization_entitlement_mode/);
assert.match(migration, /THEN 'full'/);
assert.match(migration, /ELSE 'restricted'/);
assert.match(migration, /THEN 'none'/);
assert.match(migration, /organization_memberships_seat_capacity/);
assert.match(migration, /DEFERRABLE INITIALLY DEFERRED/);
assert.match(migration, /private\.get_organization_seat_usage/);
assert.match(migration, /pending.*expires_at > clock_timestamp\(\).*intended_clinical_access/s);
assert.match(migration, /enable_organization_member_clinical_access/);
assert.match(migration, /disable_organization_member_clinical_access/);
assert.match(migration, /member_clinical_access_enabled/);
assert.match(migration, /member_clinical_access_disabled/);
assert.match(migration, /restricted organization cannot reactivate membership/);
assert.match(migration, /no clinical seats available/);
assert.doesNotMatch(migration, /stripe_(customer|subscription|price|item)_id/);
assert.match(migration, /REVOKE ALL ON TABLE private\.organization_subscriptions FROM PUBLIC, anon, authenticated/);
assert.match(hardeningMigration, /organization_subscriptions_plan_code_fkey/);
assert.match(hardeningMigration, /ON DELETE RESTRICT/);
assert.match(hardeningMigration, /organization_subscriptions_plan_interval_consistency/);
assert.match(hardeningMigration, /is_organization_subscription_structurally_valid/);
assert.match(hardeningMigration, /organization_subscription_access_mode/);
assert.match(hardeningMigration, /is_clinic_plan_sellable/);
assert.match(hardeningMigration, /NOT s\.cancel_at_period_end/);
assert.match(hardeningMigration, /s\.cancel_at_period_end[\s\S]*s\.current_period_end IS NOT NULL/);
assert.match(hardeningMigration, /logical expiration during invitation issuance/);
assert.match(hardeningMigration, /logical expiration during invitation revocation/);
assert.match(hardeningMigration, /logical expiration during invitation acceptance/);
assert.match(hardeningMigration, /'accepted', false/);
assert.match(hardeningMigration, /p_event_type => 'invitation_expired'/);
assert.doesNotMatch(hardeningMigration.slice(hardeningMigration.indexOf("CREATE OR REPLACE FUNCTION private.organization_entitlement_mode"), hardeningMigration.indexOf("CREATE OR REPLACE FUNCTION public.set_organization_clinic_rollout_state")), /clinic_plan_catalog|catalog\.enabled|base_amount_minor = s\.|seat_amount_minor = s\./);
assert.doesNotMatch(hardeningMigration, /stripe_(customer|subscription|price|item)_id/);
assert.match(route, /\/api\/clinic\/entitlement/);
assert.match(route, /clinical-access/);
assert.match(route, /createUserScopedClient/);
assert.doesNotMatch(route, /serviceRole|SUPABASE_SERVICE_ROLE/);
assert.match(service, /fetchClinicEntitlement/);
assert.match(page, /Licenças contratadas/);
assert.match(page, /Licenças reservadas/);
assert.match(page, /Habilitar acesso clínico/);
assert.match(page, /Clínica em modo restrito/);
assert.match(app, /isClinicRoute/);

let entitlementHandler: ((request: any, response: any) => Promise<unknown>) | null = null;
let clinicalAccessHandler: ((request: any, response: any) => Promise<unknown>) | null = null;
registerClinicEntitlementRoutes(
  {
    get: (_path: string, _middleware: unknown, handler: (request: any, response: any) => Promise<unknown>) => { entitlementHandler = handler; },
    post: (path: string, _middleware: unknown, handler: (request: any, response: any) => Promise<unknown>) => { if (path.includes("clinical-access")) clinicalAccessHandler = handler; },
  },
  { requireAuth: () => undefined, supabaseUrl: "https://staging.example.com", supabaseAnonKey: "anon-test", clinicFeatureEnabled: false },
);
assert.ok(entitlementHandler);
assert.ok(clinicalAccessHandler);
let status = 200;
let body: unknown;
const response = { set: () => undefined, status: (value: number) => { status = value; return response; }, json: (value: unknown) => { body = value; return value; } };
await entitlementHandler?.({ query: { organizationId: "00000000-0000-4000-8000-000000000001" }, headers: { authorization: "Bearer token" } }, response);
assert.equal(status, 503);
assert.deepEqual(body, { error: "feature_unavailable" });

console.log("clinic entitlement tests: ok");
