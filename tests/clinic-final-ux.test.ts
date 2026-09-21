import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  getAdminExpiryLines,
  getClinicAccessLabel,
  clinicBillingIntervalLabel,
  clinicEntitlementLabel,
  clinicFinancialStatusLabel,
  clinicMemberStatusLabel,
  clinicPlanLabel,
  clinicRoleLabel,
} from "../src/utils/clinicAdminPresentation.js";
import { getClinicContextSelectorMode } from "../src/utils/clinicContextPresentation.js";

assert.equal(getClinicContextSelectorMode("clinic_only", 1), "static_clinic");
assert.equal(getClinicContextSelectorMode("clinic_only", 2), "clinics_only");
assert.equal(getClinicContextSelectorMode("hybrid", 2), "personal_plus_clinics");
assert.equal(getClinicContextSelectorMode("personal", 0), "hidden");
assert.equal(getClinicContextSelectorMode("personal", 1), "personal_plus_clinics");

const organizationExpiry = getAdminExpiryLines({
  professional_access_mode: "clinic_only",
  subscription_plan: "trial",
  subscription_ends_at: "2020-01-01T00:00:00.000Z",
  clinics: [{ organizationId: "org", name: "Clínica", role: "professional", clinicalAccessEnabled: true, licenseActive: true, currentPeriodEnd: "2030-12-31T00:00:00.000Z" }],
}, new Date("2026-09-21T00:00:00.000Z"));
assert.equal(organizationExpiry.length, 1);
assert.notEqual(organizationExpiry[0].value, new Date("2020-01-01T00:00:00.000Z").toLocaleDateString("pt-BR"));
assert.equal(organizationExpiry[0].value, new Date("2030-12-31T00:00:00.000Z").toLocaleDateString("pt-BR"));

const managedExpiry = getAdminExpiryLines({
  professional_access_mode: "clinic_only",
  clinics: [{ organizationId: "org", name: "Clínica", role: "professional", clinicalAccessEnabled: true, licenseActive: true, currentPeriodEnd: null }],
});
assert.equal(managedExpiry[0].value, "Gerenciado pela clínica");

const hybridExpiry = getAdminExpiryLines({
  professional_access_mode: "hybrid",
  subscription_plan: "monthly",
  subscription_ends_at: "2027-01-01T00:00:00.000Z",
  clinics: [{ organizationId: "org", name: "Clínica", role: "professional", clinicalAccessEnabled: true, licenseActive: true, currentPeriodEnd: "2027-02-01T00:00:00.000Z" }],
});
assert.equal(hybridExpiry[0].label, "Pessoal");
assert.equal(hybridExpiry[1].label, "Clínica Clínica");

assert.equal(getClinicAccessLabel({ role: "owner", clinicalAccessEnabled: false, licenseActive: false }), "Acesso administrativo");
assert.equal(getClinicAccessLabel({ role: "manager", clinicalAccessEnabled: false, licenseActive: false }), "Acesso administrativo");
assert.equal(getClinicAccessLabel({ role: "professional", clinicalAccessEnabled: true, licenseActive: true }), "Licença ativa");
assert.equal(clinicRoleLabel.owner, "Proprietário");
assert.equal(clinicRoleLabel.manager, "Gestor");
assert.equal(clinicRoleLabel.professional, "Profissional");
assert.equal(clinicMemberStatusLabel.suspended, "Suspenso");
assert.equal(clinicEntitlementLabel.restricted, "Acesso restrito");
assert.equal(clinicPlanLabel.clinic_yearly, "Plano Clínica Anual");
assert.equal(clinicBillingIntervalLabel.monthly, "Mensal");
assert.equal(clinicFinancialStatusLabel.past_due, "Pagamento pendente");
assert.equal(clinicFinancialStatusLabel.pending_setup, "Configuração pendente");

const selector = readFileSync("src/components/clinic/ClinicContextSelector.tsx", "utf8");
const server = readFileSync("server.ts", "utf8");
const panel = readFileSync("src/pages/AdminPanel.tsx", "utf8");
const modal = readFileSync("src/components/admin/ProfessionalDetailsModal.tsx", "utf8");
const clinics = readFileSync("src/components/admin/AdminClinics.tsx", "utf8");
assert.match(selector, /data-testid="clinic-context-static"/);
assert.match(selector, /selectorMode === "personal_plus_clinics"/);
assert.match(server, /professional_access_mode/);
assert.match(server, /currentPeriodEnd/);
assert.match(panel, /Acesso \/ Plano/);
assert.match(modal, /Métrica de uso indisponível/);
assert.doesNotMatch(clinics, />Past due</);
assert.doesNotMatch(clinics, /label="Owner"|label="Contrato"|label="Entitlement"|label="Feature"/);

console.log("clinic final UX selector, expiry, access labels and translations: PASS");
