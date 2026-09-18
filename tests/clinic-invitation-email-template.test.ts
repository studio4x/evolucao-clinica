import assert from "node:assert/strict";
import { createInvitationTransport, renderInvitationMail } from "../server/clinic/clinicInvitationEmail.js";

const token = "a".repeat(64);
const input = { recipient: "never-sent@example.invalid", organizationName: "Clínica sintética", role: "professional" as const, clinical: true, expiresAt: "2026-09-21T12:00:00Z", token };
const smtpEnv = { APP_ENV: "staging", CLINIC_INVITATION_SMTP_HOST: "smtp-relay.example.invalid", CLINIC_INVITATION_SMTP_PORT: "587", CLINIC_INVITATION_SMTP_USER: "staging-user", CLINIC_INVITATION_SMTP_PASS: "staging-pass", CLINIC_INVITATION_SMTP_FROM: "staging@example.invalid", CLINIC_INVITATION_SHARED_PROVIDER_ACCEPTED: "true", CLINIC_INVITATION_SMTP_TRACKING_DISABLED: "false" };
assert.equal(createInvitationTransport(smtpEnv).ready, true);
assert.equal(createInvitationTransport({ ...smtpEnv, CLINIC_INVITATION_SHARED_PROVIDER_ACCEPTED: "false" }).ready, false);
assert.equal(createInvitationTransport({ ...smtpEnv, APP_ENV: "production" }).ready, false);

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
