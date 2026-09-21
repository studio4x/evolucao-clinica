import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/clinic-migrations/20260921_33_clinic_plan_context_entitlement.sql", "utf8");
const route = readFileSync("server/clinic/clinicContextRoutes.ts", "utf8");
const app = readFileSync("src/App.tsx", "utf8");
const shell = readFileSync("src/pages/ClinicShell.tsx", "utf8");
const subscription = readFileSync("src/pages/Subscription.tsx", "utf8");
const admin = readFileSync("src/pages/AdminPanel.tsx", "utf8");

assert.match(migration, /professional_access_mode/);
assert.match(migration, /personal.*hybrid.*clinic_only/s);
assert.match(migration, /CREATE OR REPLACE FUNCTION public\.get_clinic_contexts/);
assert.match(migration, /organization_seat/);
assert.match(migration, /organization_admin/);
assert.match(migration, /licenseActive|license_active/);
assert.match(migration, /REVOKE ALL ON FUNCTION public\.get_clinic_contexts/);
assert.match(route, /get_clinic_contexts/);
assert.match(app, /resolveEffectiveEntitlement/);
assert.match(app, /shouldRedirectToClinic/);
assert.match(shell, /membershipRole === "professional"/);
assert.match(subscription, /Seu acesso é fornecido pela licença da clínica/);
assert.match(admin, /Acesso \/ Plano/);
assert.match(admin, /Plano Clínica/);

console.log("clinic plan context entitlement contract: PASS");
