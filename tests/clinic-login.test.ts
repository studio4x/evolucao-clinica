import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getClinicAccessTypeLabel, getClinicRoleLabel, getClinicWorkspacePath, hasAuthorizedOrganizationAccess } from "../src/utils/clinicAccess";

const login = readFileSync("src/pages/Login.tsx", "utf8");
const clinicLogin = readFileSync("src/pages/ClinicLogin.tsx", "utf8");
const app = readFileSync("src/App.tsx", "utf8");
const pending = readFileSync("src/pages/PendingApproval.tsx", "utf8");
const layout = readFileSync("src/components/Layout.tsx", "utf8");
const trial = readFileSync("src/components/layout/TrialBanner.tsx", "utf8");
const shell = readFileSync("src/pages/ClinicShell.tsx", "utf8");

assert.match(login, /Building2/);
assert.match(login, /\/login\/clinica/);
assert.match(clinicLogin, /signInWithPassword/);
assert.match(clinicLogin, /autoComplete="current-password"/);
assert.match(clinicLogin, /requestGoogleOAuth/);
assert.match(clinicLogin, /setClinicLoginIntent/);
assert.match(clinicLogin, /Esta conta não possui acesso ativo a uma clínica/);
assert.match(clinicLogin, /Escolha a clínica que deseja acessar/);
assert.match(app, /path="\/login\/clinica"/);
assert.match(app, /hasAuthorizedOrganizationAccess/);
assert.match(app, /profileRole !== 'admin'/);
assert.match(pending, /getClinicWorkspacePath/);
assert.match(pending, /Acessar uma clínica/);
assert.match(layout, /activeContext\.type === 'personal' && <TrialBanner \/>/);
assert.match(layout, /name: 'Plano Clínica'/);
assert.match(shell, /getClinicRoleLabel/);
assert.match(shell, /Atribuições ativas/);
assert.doesNotMatch(clinicLogin, /console\.(log|error).*password/i);

assert.equal(getClinicWorkspacePath({ membershipRole: "owner" }), "/painel/clinica");
assert.equal(getClinicWorkspacePath({ membershipRole: "manager" }), "/painel/clinica");
assert.equal(getClinicWorkspacePath({ membershipRole: "professional" }), "/painel/clinica/pacientes");
assert.equal(getClinicRoleLabel("owner"), "Proprietário");
assert.equal(getClinicAccessTypeLabel({ membershipRole: "owner", clinicalAccessEnabled: false }), "Administrativo");
assert.equal(getClinicAccessTypeLabel({ membershipRole: "professional", clinicalAccessEnabled: true }), "Clínico");
assert.equal(hasAuthorizedOrganizationAccess({
  featureEnabled: true,
  contextStatus: "ready",
  contextUserId: "user-1",
  userId: "user-1",
  activeContext: { type: "organization", organizationId: "org-1" },
  organizations: [{ id: "org-1" }],
}), true);
assert.equal(hasAuthorizedOrganizationAccess({
  featureEnabled: true,
  contextStatus: "ready",
  contextUserId: "user-1",
  userId: "user-1",
  activeContext: { type: "personal" },
  organizations: [{ id: "org-1" }],
}), false);

console.log("clinic login tests: ok");
