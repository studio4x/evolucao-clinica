import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  clinicAssignmentRoleLabel,
  clinicBillingErrorLabel,
  clinicBillingIntervalLabel,
  clinicPlanLabel,
  getClinicAssignmentRoleLabel,
  getClinicPlanLabel,
} from "../src/utils/clinicAdminPresentation.js";

const migration = readFileSync("supabase/clinic-migrations/20260921_35_consultant_read_only_assignment.sql", "utf8");
const contextMigration = readFileSync("supabase/clinic-migrations/20260921_33_clinic_plan_context_entitlement.sql", "utf8");
const evolutionMigration = readFileSync("supabase/clinic-migrations/20260917_26_isolated_organization_evolutions.sql", "utf8");
const billing = readFileSync("src/pages/ClinicBilling.tsx", "utf8");
const billingService = readFileSync("src/services/clinicBilling.ts", "utf8");
const form = readFileSync("src/pages/ClinicPatientForm.tsx", "utf8");
const detail = readFileSync("src/pages/ClinicPatientDetail.tsx", "utf8");
const profile = readFileSync("src/pages/Profile.tsx", "utf8");
const app = readFileSync("src/App.tsx", "utf8");

assert.equal(getClinicPlanLabel("clinic_monthly"), "Plano Clínica Mensal");
assert.equal(getClinicPlanLabel("clinic_yearly"), "Plano Clínica Anual");
assert.equal(clinicPlanLabel.clinic_monthly, "Plano Clínica Mensal");
assert.equal(clinicBillingIntervalLabel.month, "Mensal");
assert.equal(clinicBillingIntervalLabel.year, "Anual");
assert.equal(clinicAssignmentRoleLabel.primary, "Principal");
assert.equal(getClinicAssignmentRoleLabel("secondary"), "Secundário");
assert.equal(getClinicAssignmentRoleLabel("consultant"), "Consultor");
assert.equal(clinicBillingErrorLabel.clinic_billing_disabled, "Alterações de cobrança estão temporariamente indisponíveis.");

assert.match(contextMigration, /v_profile\.subscription_status/);
assert.match(migration, /v_profile\.status = 'active'/);
assert.doesNotMatch(migration, /v_profile\.subscription_status/);
assert.match(migration, /ALTER COLUMN can_create_evolution SET DEFAULT false/);
assert.match(migration, /WHEN NEW\.status = 'active' AND NEW\.assignment_role = 'secondary'/);
assert.match(migration, /UPDATE public\.patient_professional_assignments/);
assert.match(migration, /assignment_role = 'primary'/);
assert.match(migration, /assignment_role IN \('primary', 'secondary'\)/);
assert.match(migration, /assignment_role = 'primary'/);
assert.match(migration, /assignment_role = 'consultant'/);
assert.match(evolutionMigration, /a\.can_create_evolution IS TRUE/);

assert.match(billing, /!billingEnabled \|\| busy/);
assert.match(billing, /Alterações de cobrança estão desabilitadas neste ambiente de homologação/);
assert.match(billing, /getClinicPlanLabel/);
assert.match(billingService, /getClinicBillingErrorLabel/);
assert.match(form, /Profissional principal/);
assert.match(form, /Responsável principal pelo acompanhamento deste paciente/);
assert.match(form, /Profissionais secundários/);
assert.match(form, /podem registrar suas próprias evoluções/);
assert.match(form, /Consultores/);
assert.match(form, /sem editar o cadastro ou registrar evoluções/);
assert.doesNotMatch(form, /Profissional Primary|Profissionais Secondary/);
assert.match(detail, /getClinicAssignmentRoleLabel/);
assert.match(detail, /Profissional secundário/);
assert.doesNotMatch(detail, />Primary<|>Secondary</);
assert.match(app, /const isProfileRoute = location\.pathname === '\/painel\/profile'/);
assert.match(app, /effectiveEntitlement\.shouldRedirectToClinic && !isProfileRoute/);
assert.match(profile, /from\('professionals'\)/);

console.log("clinic context, billing UX, profile and assignment refinement contracts: PASS");
