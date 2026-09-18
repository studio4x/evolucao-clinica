import { createInvitationTransport, renderInvitationMail } from '../server/clinic/clinicInvitationEmail.js';
import nodemailer from 'nodemailer';
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { loadRuntime } from './clinic-preproduction-runtime.js';
import { evaluateBrevoPreflight } from './clinic-brevo-preflight.js';

const runtime = loadRuntime();
const env = runtime.stagingEnv;
assert.equal(env.CLINIC_INVITATION_SMTP_HOST, 'smtp-relay.brevo.com');
assert.ok(env.CLINIC_INVITATION_DELIVERY_ENABLED !== 'true');
const transport = nodemailer.createTransport({ host: env.CLINIC_INVITATION_SMTP_HOST, port: Number(env.CLINIC_INVITATION_SMTP_PORT || 587), secure: env.CLINIC_INVITATION_SMTP_PORT === '465', requireTLS: true, auth: { user: env.CLINIC_INVITATION_SMTP_USER, pass: env.CLINIC_INVITATION_SMTP_PASS }, tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' }, logger: false, debug: false, connectionTimeout: 10000, socketTimeout: 10000 });
let authentication = false;
try { authentication = await transport.verify(); } catch { /* No provider messages/credentials in artifacts. */ } finally { transport.close(); }
const rendered = renderInvitationMail({ recipient: 'never-sent@example.invalid', organizationName: 'Clínica sintética F6', role: 'professional', clinical: true, expiresAt: '2026-09-21T12:00:00Z', token: '0'.repeat(64) }, 'staging');
const smtpTransportReady = createInvitationTransport(env).ready;
const directFragment = rendered.html.includes('https://staging.evolucaoclinica.app.br/convite-clinica#invite=');
// No generic key/settings fallback; a dedicated API credential is not consumed here.
// Evidence is produced through authorized read-only provider UI, never a SEND.
const providerFile = process.env.F6C_BREVO_PROVIDER_FILE || process.env.F6B_BREVO_PROVIDER_FILE;
const provider = providerFile ? JSON.parse(readFileSync(providerFile, 'utf8')) : undefined;
const gateReceipt = process.env.F6_GATE_RECEIPT_FILE ? JSON.parse(readFileSync(process.env.F6_GATE_RECEIPT_FILE, 'utf8')) : undefined;
const deliveryGate = gateReceipt?.acceptedGateWrites?.CLINIC_INVITATION_DELIVERY_ENABLED === 'false' ? 'OFF' : env.CLINIC_INVITATION_DELIVERY_ENABLED === 'true' ? 'ON' : env.CLINIC_INVITATION_DELIVERY_ENABLED === 'false' ? 'OFF' : 'SENSITIVE_UNREADABLE';
const report = evaluateBrevoPreflight({ smtpAuthentication: authentication, smtpTransportReady: smtpTransportReady && authentication, senderConfigured: !!env.CLINIC_INVITATION_SMTP_FROM, directFragment, localTrackingDeclaration: env.CLINIC_INVITATION_SMTP_TRACKING_DISABLED === 'true', deliveryGate, provider });
assert.ok(process.env.F6_BREVO_FILE);
writeFileSync(process.env.F6_BREVO_FILE!, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
