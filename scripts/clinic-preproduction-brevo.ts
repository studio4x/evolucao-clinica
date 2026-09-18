import { createInvitationTransport, renderInvitationMail } from '../server/clinic/clinicInvitationEmail.js';
import nodemailer from 'nodemailer';
import { writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { loadRuntime } from './clinic-preproduction-runtime.js';

const runtime = loadRuntime();
const env = runtime.stagingEnv;
assert.equal(env.CLINIC_INVITATION_SMTP_HOST, 'smtp-relay.brevo.com');
assert.ok(env.CLINIC_INVITATION_DELIVERY_ENABLED !== 'true');
const transport = nodemailer.createTransport({ host: env.CLINIC_INVITATION_SMTP_HOST, port: Number(env.CLINIC_INVITATION_SMTP_PORT || 587), secure: env.CLINIC_INVITATION_SMTP_PORT === '465', requireTLS: true, auth: { user: env.CLINIC_INVITATION_SMTP_USER, pass: env.CLINIC_INVITATION_SMTP_PASS }, tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' }, logger: false, debug: false, connectionTimeout: 10000, socketTimeout: 10000 });
let authentication = false;
try { authentication = await transport.verify(); } catch { /* No provider messages/credentials in artifacts. */ } finally { transport.close(); }
const rendered = renderInvitationMail({ recipient: 'never-sent@example.invalid', organizationName: 'Clínica sintética F6', role: 'professional', clinical: true, expiresAt: '2026-09-21T12:00:00Z', token: '0'.repeat(64) });
const directFragment = rendered.html.includes('https://staging.evolucaoclinica.app.br/convite-clinica#invite=');
const report = { status: authentication && createInvitationTransport(env).ready ? 'PASS' : 'FAIL', smtpAuthentication: authentication, senderConfigured: !!env.CLINIC_INVITATION_SMTP_FROM, senderProviderVerification: 'PENDING', trackingDisabledDeclaration: env.CLINIC_INVITATION_SMTP_TRACKING_DISABLED === 'true', providerTrackingAndClickRewritingVerification: 'PENDING', directFragment, intermediaryRedirectDesigned: false, gate: 'OFF', sendAttempted: false, realControlledDelivery: 'WAITING_FOR_EXPLICIT_AUTHORIZATION' };
assert.ok(process.env.F6_BREVO_FILE);
writeFileSync(process.env.F6_BREVO_FILE!, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
