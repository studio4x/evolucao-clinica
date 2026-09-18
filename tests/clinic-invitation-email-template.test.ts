import assert from "node:assert/strict";
import { renderInvitationMail } from "../server/clinic/clinicInvitationEmail.js";

const token = "a".repeat(64);
const input = { recipient: "never-sent@example.invalid", organizationName: "Clínica sintética", role: "professional" as const, clinical: true, expiresAt: "2026-09-21T12:00:00Z", token };

const staging = renderInvitationMail(input, "staging");
assert.equal(staging.fromName, "Evolução Clínica [STAGING]");
assert.match(staging.subject, /^\[STAGING\] Convite para acessar a clínica no Evolução Clínica/);
assert.match(staging.html, /AMBIENTE DE HOMOLOGAÇÃO/);
assert.match(staging.html, /Esta mensagem foi enviada pelo ambiente de testes do Evolução Clínica\./);
assert.match(staging.html, /Abrir convite de teste/);
assert.match(staging.html, /https:\/\/staging\.evolucaoclinica\.app\.br\/convite-clinica#invite=/);
assert.match(staging.text, /^\[STAGING — AMBIENTE DE HOMOLOGAÇÃO\]/);
assert.match(staging.text, /Ambiente: Staging \/ Homologação\nEvolução Clínica$/);
assert.deepEqual(staging.headers, { "X-Evolucao-Environment": "staging", "X-Evolucao-Message-Type": "clinic-invitation" });
assert.ok(Object.values(staging.headers).every((value) => !value.includes(token)));
assert.doesNotMatch(staging.html, /[?&](?:token|invite)=/i);
assert.doesNotMatch(staging.html, /<img\b|pixel|utm_|tracking|facebook|analytics/i);

const production = renderInvitationMail(input, "production");
assert.equal(production.fromName, "Evolução Clínica");
assert.doesNotMatch(production.subject, /STAGING/i);
assert.doesNotMatch(production.html, /AMBIENTE DE HOMOLOGAÇÃO|Staging \/ Homologação|\[STAGING\]/i);
assert.doesNotMatch(production.text, /AMBIENTE DE HOMOLOGAÇÃO|Staging \/ Homologação|\[STAGING\]/i);
assert.deepEqual(production.headers, {});
assert.match(production.html, /https:\/\/www\.evolucaoclinica\.app\.br\/convite-clinica#invite=/);

assert.throws(() => renderInvitationMail(input, "development"), /unsupported_invitation_environment/);
console.log("clinic invitation email template: staging identification, safe fragment, no tracking markup and production omission PASS");
