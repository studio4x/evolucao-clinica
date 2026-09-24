import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const layout = readFileSync("src/components/Layout.tsx", "utf8");
const selector = readFileSync("src/components/clinic/ClinicContextSelector.tsx", "utf8");
const subscription = readFileSync("src/pages/ContextSubscription.tsx", "utf8");
const personalRoute = readFileSync("src/components/clinic/PersonalContextRoute.tsx", "utf8");
const clinicRoute = readFileSync("src/components/clinic/ClinicRoute.tsx", "utf8");
const app = readFileSync("src/App.tsx", "utf8");
const dashboard = readFileSync("src/pages/Dashboard.tsx", "utf8");
const history = readFileSync("src/pages/History.tsx", "utf8");
const version = readFileSync("src/components/layout/AppVersion.tsx", "utf8");

assert.match(layout, /isClinicalProfessional/);
assert.match(layout, /isClinicalProfessional \? clinicalProfessionalNavItems : clinicNavItems/);
assert.match(layout, /path: '\/painel\/clinica\/pacientes'/);
assert.match(layout, /membershipRole === 'professional'/);
assert.match(selector, /Vinculado à clínica/);
assert.match(subscription, /Seu acesso ao Evolução Clínica está vinculado à licença da clínica\./);
assert.match(subscription, /!organization\.clinicalAccessEnabled/);
assert.match(subscription, /!organization\.licenseActive/);
assert.doesNotMatch(subscription, /StripeSubscriptionButton/);
assert.match(personalRoute, /isPersonalShellRouteAllowedForClinicalProfessional/);
assert.match(personalRoute, /pathname === "\/painel\/tutorial"/);
assert.match(app, /ClinicalAdminContextGuard><Dashboard \/><\/ClinicalAdminContextGuard>/);
assert.match(app, /ClinicalAdminContextGuard><History \/><\/ClinicalAdminContextGuard>/);
assert.doesNotMatch(app, /PanelDashboardRoute|PanelHistoryRoute|ClinicProfessionalHistory/);
assert.match(dashboard, /isClinicalProfessional/);
assert.match(dashboard, /fetchClinicPatients/);
assert.match(dashboard, /clinicEvolutionRequest/);
assert.match(history, /fetchClinicPatients/);
assert.match(history, /clinicEvolutionRequest/);
assert.doesNotMatch(history, /\.from\("evolutions"\)/);
assert.doesNotMatch(clinicRoute, /location\.pathname === "\/painel\/clinica"/);
assert.match(version, /v1\.10\.915/);

console.log("clinic professional visual shell and clinic plan gating: PASS");
