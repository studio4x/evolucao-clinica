import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const layout = readFileSync("src/components/Layout.tsx", "utf8");
const selector = readFileSync("src/components/clinic/ClinicContextSelector.tsx", "utf8");
const subscription = readFileSync("src/pages/ContextSubscription.tsx", "utf8");
const personalRoute = readFileSync("src/components/clinic/PersonalContextRoute.tsx", "utf8");
const clinicRoute = readFileSync("src/components/clinic/ClinicRoute.tsx", "utf8");
const version = readFileSync("src/components/layout/AppVersion.tsx", "utf8");

assert.match(layout, /isClinicalProfessional/);
assert.match(layout, /isClinicContext && !isClinicalProfessional \? clinicNavItems : personalNavItems/);
assert.match(layout, /isClinicContext && !isClinicalProfessional \? clinicBottomNavItems : personalBottomNavItems/);
assert.match(layout, /membershipRole === 'professional'/);
assert.match(selector, /Vinculado à clínica/);
assert.match(subscription, /Seu acesso ao Evolução Clínica está vinculado à licença da clínica\./);
assert.match(subscription, /!organization\.clinicalAccessEnabled/);
assert.match(subscription, /!organization\.licenseActive/);
assert.doesNotMatch(subscription, /StripeSubscriptionButton/);
assert.match(personalRoute, /organization\?\.membershipRole === "professional"/);
assert.match(personalRoute, /\/painel\/clinica\/pacientes/);
assert.doesNotMatch(clinicRoute, /location\.pathname === "\/painel\/clinica"/);
assert.match(version, /v1\.10\.914/);

console.log("clinic professional visual shell and clinic plan gating: PASS");
