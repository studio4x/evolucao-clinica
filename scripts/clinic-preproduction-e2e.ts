// Real staging database/Auth + application handlers. Mock invitation transport only.
// All synthetic IDs are recorded before assertions; bounded cleanup always runs.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHmac } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import express from 'express';
import type { Server } from 'node:http';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { registerClinicContextRoutes } from '../server/clinic/clinicContextRoutes.js';
import { registerClinicTeamRoutes } from '../server/clinic/clinicTeamRoutes.js';
import { registerClinicEntitlementRoutes } from '../server/clinic/clinicEntitlementRoutes.js';
import { registerClinicPatientRoutes } from '../server/clinic/clinicPatientRoutes.js';
import { registerClinicOperationalRoutes } from '../server/clinic/clinicOperationalRoutes.js';
import { registerClinicEvolutionRoutes } from '../server/clinic/clinicEvolutionRoutes.js';
import { registerClinicInvitationRoutes } from '../server/clinic/clinicInvitationRoutes.js';
import { renderInvitationMail } from '../server/clinic/clinicInvitationEmail.js';
import { createPersonalPatientGuard } from '../server/clinic/personalPatientGuard.js';
import { buildPersonalBackupJson } from '../src/services/personalBackup.js';
import { loadRuntime, sql, quoteIds, stripe, edgeSecrets } from './clinic-preproduction-runtime.js';

const runtime = loadRuntime();
const url = `https://${runtime.ref}.supabase.co`;
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(url, runtime.serviceKey, options);
const auth = createClient(url, runtime.anonKey, options);
const run = randomUUID();
const users: string[] = [], orgs: string[] = [], patients: string[] = [], ops: string[] = [];
const customers: string[] = [], subscriptions: string[] = [], checkouts: string[] = [];
const invitations: string[] = [], rawTokens: string[] = [];
const actors: Record<string, { id: string; email: string; password: string; token: string; client: SupabaseClient }> = {};
const result: Record<string, any> = { phase: '6A', run, staging: runtime.ref, stripeLivemodeDetected: false, tests: {}, timingsMs: {} };
let server: Server | undefined, port = 0, externalCalls = 0;
let baselineProfessionals: string[] = [], baselineAuth: string[] = [];
const logLines: string[] = [];
const originalError = console.error;
function journal() {
  assert.ok(process.env.F6_RESULT_FILE, 'External result path required before creating fixtures');
  writeFileSync(`${process.env.F6_RESULT_FILE}.journal`, JSON.stringify({ run, users, orgs, patients, ops, customers, subscriptions, checkouts, invitations }));
}
console.error = (...values: unknown[]) => { logLines.push(values.map(String).join(' ')); };
function checked(value: any, label: string) { if (value.error) throw new Error(`${label}_${value.error.code || 'failed'}`); return value.data; }
function denied(value: any) { assert.ok(value.error || value.data?.length === 0, 'Expected denied/empty'); if (typeof value.count === 'number') assert.equal(value.count, 0, 'Unauthorized count side-channel'); }
async function actor(name: string) {
  const email = `clinic-f6-${run.slice(0, 8)}-${name.toLowerCase()}@example.invalid`;
  const password = randomBytes(24).toString('base64url');
  const generated = checked(await admin.auth.admin.generateLink({ type: 'signup', email, password }), 'auth_create');
  const id = generated.user.id; users.push(id); journal();
  const client = createClient(url, runtime.anonKey, options);
  checked(await client.auth.verifyOtp({ token_hash: generated.properties.hashed_token, type: 'signup' }), 'auth_confirm');
  const session = checked(await client.auth.signInWithPassword({ email, password }), 'auth_login');
  actors[name] = { id, email, password, token: session.session.access_token, client };
}
async function api(name: string | undefined, path: string, method = 'GET', body?: unknown, cookie?: string) {
  const started = Date.now();
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method, headers: { ...(name ? { Authorization: `Bearer ${actors[name]?.token || name}` } : {}), Origin: runtime.origin, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie.split(';')[0] } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  result.lastRequest = { path: path.replace(/[0-9a-f-]{36}/g, ':id'), method, status: response.status };
  // Authentication middleware also emits private/no-store on refusals.
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.ok(response.headers.get('vary')?.includes('Authorization'));
  result.timingsMs[path.replace(/[0-9a-f-]{36}/g, ':id')] = Date.now() - started;
  return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie') || '' };
}
async function edge(name: string, fn: string, body: unknown) {
  const response = await fetch(`${url}/functions/v1/${fn}`, { method: 'POST', headers: { Authorization: `Bearer ${actors[name].token}`, apikey: runtime.anonKey, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal(response.headers.get('cache-control'), 'private, no-store'); assert.ok(response.headers.get('vary')?.includes('Authorization'));
  return { status: response.status, data: await response.json() };
}
async function seats(org: string, name = 'ownerA') {
  const response = await api(name, `/api/clinic/entitlement?organizationId=${org}`); assert.equal(response.status, 200, 'seat_summary');
  const row = response.data.entitlement;
  assert.equal(Number(row.minimum_contracted_seats), 3);
  assert.equal(Number(row.available_seats), Number(row.contracted_seats) - Number(row.active_seats) - Number(row.reserved_seats));
  return row;
}
async function issue(org: string, email: string, clinical = true, role = 'professional', name = 'ownerA') {
  const response = await api(name, '/api/clinic/invitations', 'POST', { organizationId: org, email, clinical, role });
  assert.equal(response.status, 201, `issue_${response.data.error || 'failed'}`);
  invitations.push(response.data.invitationId);
  return { id: response.data.invitationId as string, token: rawTokens.at(-1)! };
}
async function handoff(token: string) {
  const response = await api(undefined, '/api/clinic/invitations/handoff', 'POST', { token });
  assert.equal(response.status, 200, 'handoff'); assert.match(response.cookie, /HttpOnly; Secure; SameSite=Lax/);
  return response.cookie;
}
async function invited(org: string, name: string, clinical = true, role = 'professional', owner = 'ownerA') {
  const invitation = await issue(org, actors[name].email, clinical, role, owner);
  const cookie = await handoff(invitation.token);
  assert.equal((await api(name, '/api/clinic/invitations/accept', 'POST', {}, cookie)).status, 200);
  assert.equal((await api(name, '/api/clinic/invitations/accept', 'POST', {}, cookie)).status, 410);
  assert.equal((await api(undefined, '/api/clinic/invitations/handoff', 'POST', { token: invitation.token })).status, 410);
}
async function waitFor(label: string, test: () => Promise<boolean>, timeout = 60000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (await test()) return; await new Promise(resolve => setTimeout(resolve, 1500)); }
  throw new Error(`timeout_${label}`);
}
async function realBilling(org: string, owner: string) {
  const attempt = await edge(owner, 'create-clinic-stripe-checkout-session', { organizationId: org, planCode: 'clinic_monthly', contractedSeats: 8 });
  assert.equal(attempt.status, 200, `checkout_${attempt.data.error || 'failed'}`);
  const local = (await sql(runtime, `select stripe_checkout_session_id,stripe_customer_id from private.organization_checkout_attempts where id='${attempt.data.attemptId}'`))[0];
  checkouts.push(local.stripe_checkout_session_id); customers.push(local.stripe_customer_id); journal();
  const checkout = await stripe(runtime, `checkout/sessions/${local.stripe_checkout_session_id}`);
  assert.equal(checkout.livemode, false); assert.equal(checkout.status, 'open');
  result.checkout = { id: checkout.id, status: checkout.status, interactiveCompletion: 'MANUAL_GATE' };
  // Supported alternate Test integration: real subscription/payment, real provider webhook.
  // It does not claim that the interactive Checkout Session was completed.
  await stripe(runtime, `checkout/sessions/${checkout.id}/expire`, 'POST', {});
  const metadata = { app: 'evolucao_clinica', billingScope: 'clinic', billing_scope: 'clinic', environment: 'staging', organizationId: org, ownerProfessionalId: actors[owner].id, planCode: 'clinic_monthly', initialContractedSeats: '8' };
  const fields: Record<string, string> = { customer: local.stripe_customer_id, default_payment_method: 'pm_card_visa', 'items[0][price]': 'price_1UGJTnPI1KSTkIQAuk7DIIIo', 'items[0][quantity]': '1', 'items[1][price]': 'price_1UGJTnPI1KSTkIQAxsHEU1my', 'items[1][quantity]': '8', payment_behavior: 'error_if_incomplete' };
  const paymentMethod = await stripe(runtime, 'payment_methods', 'POST', { type: 'card', 'card[token]': 'tok_visa' });
  await stripe(runtime, `payment_methods/${paymentMethod.id}/attach`, 'POST', { customer: local.stripe_customer_id });
  fields.default_payment_method = paymentMethod.id;
  for (const [key, value] of Object.entries(metadata)) fields[`metadata[${key}]`] = value;
  const subscription = await stripe(runtime, 'subscriptions', 'POST', fields);
  subscriptions.push(subscription.id); journal(); assert.equal(subscription.livemode, false); assert.equal(subscription.status, 'active');
  await waitFor('real_webhook_activation', async () => {
    const row = (await sql(runtime, `select financial_status from private.organization_subscriptions where organization_id='${org}' and stripe_subscription_id='${subscription.id}'`))[0];
    return row?.financial_status === 'active';
  });
  result.realBilling = { subscriptionId: subscription.id, customerId: local.stripe_customer_id, livemode: false, webhookPersisted: true };
  return subscription;
}

try {
  const state = (await sql(runtime, "select (select environment_name from private.runtime_environment where id=true) environment,(select enabled from private.clinic_runtime_config where id=true) gate,(select count(*) from public.organizations) organizations"))[0];
  assert.equal(state.environment, 'staging'); assert.equal(state.gate, false); assert.equal(Number(state.organizations), 0);
  baselineProfessionals = (await sql(runtime, 'select id from public.professionals order by id')).map(row => row.id);
  baselineAuth = (await sql(runtime, 'select id from auth.users order by id')).map(row => row.id);
  for (const name of ['ownerA', 'managerA', 'primaryA', 'secondaryA', 'consultantA', 'unassignedA', 'ownerB', 'primaryB']) await actor(name);
  await sql(runtime, `update public.professionals set status='active',onboarding_completed=true,full_name='Profissional sintético F6',professional_register='SYNTHETIC-F6' where id in (${quoteIds(users)})`);
  await sql(runtime, "update private.clinic_runtime_config set enabled=true,updated_at=clock_timestamp() where id=true");
  await edgeSecrets(runtime, { CLINIC_BILLING_ENABLED: 'true' });
  const app = express(); app.use(express.json());
  const requireAuth = async (req: any, res: any, next: any) => {
    res.set('Cache-Control', 'private, no-store'); res.set('Vary', 'Authorization');
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const user = await auth.auth.getUser(token);
    if (user.error || !user.data.user) return res.status(401).json({ error: 'authentication_required' });
    req.user = user.data.user; next();
  };
  const deps = { requireAuth, supabaseUrl: url, supabaseAnonKey: runtime.anonKey, clinicFeatureEnabled: true };
  for (const register of [registerClinicContextRoutes, registerClinicTeamRoutes, registerClinicEntitlementRoutes, registerClinicPatientRoutes, registerClinicOperationalRoutes, registerClinicEvolutionRoutes]) register(app, deps);
  registerClinicInvitationRoutes(app, { appEnv: 'staging', supabaseUrl: url, publicOrigin: runtime.origin, clinicFeatureEnabled: true, deliveryEnabled: true, admin,
    transport: { provider: 'mock', ready: true, async send(mail) { rawTokens.push(mail.token); const rendered = renderInvitationMail(mail); assert.ok(rendered.html.includes(`${runtime.origin}/convite-clinica#invite=${mail.token}`)); return { messageId: `f6-mock-${randomUUID()}` }; } } });
  const guard = createPersonalPatientGuard({ supabaseUrl: url, supabaseAnonKey: runtime.anonKey });
  for (const endpoint of ['semantic-index', 'semantic-search', 'ai-report', 'send-report-email']) app.post(`/api/patients/:id/${endpoint}`, requireAuth, guard, (_req: any, res: any) => { externalCalls++; res.json({ unexpected: true }); });
  server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server!.once('listening', resolve)); port = (server.address() as { port: number }).port;
  const orgA = checked(await actors.ownerA.client.rpc('create_organization_with_owner', { p_name: `Clínica sintética F6 A ${run.slice(0, 8)}` }), 'org_a').id; orgs.push(orgA); journal();
  const orgB = checked(await actors.ownerB.client.rpc('create_organization_with_owner', { p_name: `Clínica sintética F6 B ${run.slice(0, 8)}` }), 'org_b').id; orgs.push(orgB); journal();
  const subscription = await realBilling(orgA, 'ownerA');
  // Second tenant needs no external charge: explicit synthetic contract for authorization probes.
  await sql(runtime, `insert into private.organization_subscriptions(organization_id,plan_code,billing_interval,currency,base_amount_minor,seat_amount_minor,minimum_contracted_seats,contracted_seats,financial_status) values('${orgB}','clinic_monthly','monthly','BRL',4990,2990,3,3,'active')`);
  for (const org of orgs) checked(await admin.rpc('set_organization_clinic_rollout_state', { p_organization_id: org, p_enabled: true, p_reason: 'F6 bounded synthetic internal pilot' }), 'rollout');
  assert.equal((await seats(orgA)).entitlement_mode, 'full');
  const managerInvite = await issue(orgA, actors.managerA.email, false, 'manager'); assert.equal(Number((await seats(orgA)).reserved_seats), 0);
  const managerCookie = await handoff(managerInvite.token); assert.equal((await api('managerA', '/api/clinic/invitations/accept', 'POST', {}, managerCookie)).status, 200);
  for (const name of ['primaryA', 'secondaryA', 'consultantA', 'unassignedA']) await invited(orgA, name);
  await invited(orgB, 'primaryB', true, 'professional', 'ownerB');
  const seatUsage = await seats(orgA); assert.equal(Number(seatUsage.active_seats), 4); assert.equal(Number(seatUsage.reserved_seats), 0);
  const overflow = await sql(runtime, `do $$ begin begin update private.organization_subscriptions set contracted_seats=3 where organization_id='${orgA}'; set constraints all immediate; raise exception 'overflow was accepted'; exception when check_violation then null; end; end $$; select contracted_seats from private.organization_subscriptions where organization_id='${orgA}'`);
  assert.equal(Number(overflow[0].contracted_seats), 8);
  assert.equal((await edge('ownerA', 'clinic-billing-seats', { organizationId: orgA, contractedSeats: 2, idempotencyKey: randomUUID() })).status, 400);
  const pending = await issue(orgA, `clinic-f6-${run.slice(0, 8)}-pending@example.invalid`); assert.equal(Number((await seats(orgA)).reserved_seats), 1);
  const pendingCookie = await handoff(pending.token);
  const wrong = await api('primaryB', '/api/clinic/invitations/accept', 'POST', {}, pendingCookie); assert.ok(wrong.status >= 400 && wrong.data.error === 'email_mismatch');
  assert.equal((await api('ownerA', `/api/clinic/invitations/${pending.id}/revoke`, 'POST', { organizationId: orgA })).status, 200); assert.equal(Number((await seats(orgA)).reserved_seats), 0);
  const expired = await issue(orgA, `clinic-f6-${run.slice(0, 8)}-expired@example.invalid`);
  await sql(runtime, `update public.organization_invitations set created_at=clock_timestamp()-interval '73 hours',expires_at=clock_timestamp()-interval '1 hour' where id='${expired.id}'`);
  assert.equal((await api(undefined, '/api/clinic/invitations/handoff', 'POST', { token: expired.token })).status, 410);
  assert.equal((await api('ownerA', `/api/clinic/invitations?organizationId=${orgA}`)).status, 200); assert.equal(Number((await seats(orgA)).reserved_seats), 0);
  result.tests.inviteTechnical = 'PASS'; result.tests.seatAccounting = 'PASS';
  const contexts = await api('primaryA', '/api/clinic/contexts'); assert.equal(contexts.status, 200); assert.equal(contexts.data.personal.available, true); assert.deepEqual(contexts.data.organizations.map((row: any) => row.id), [orgA]);
  // An actor authorized in both tenants must hydrate both; others still see only their tenant.
  await invited(orgB, 'managerA', false, 'manager', 'ownerB');
  assert.equal((await api('managerA', '/api/clinic/contexts')).data.organizations.length, 2);
  const created = await api('ownerA', '/api/clinic/patients', 'POST', { organizationId: orgA, fullName: 'Paciente sintético F6 A', primaryProfessionalId: actors.primaryA.id }); assert.equal(created.status, 201, `patient_${created.data.error}`);
  const patient = created.data.patient; ops.push(patient.organization_patient_id); patients.push(patient.patient_id); const op = patient.organization_patient_id;
  const createdB = await api('ownerB', '/api/clinic/patients', 'POST', { organizationId: orgB, fullName: 'Paciente sintético F6 B', primaryProfessionalId: actors.primaryB.id }); assert.equal(createdB.status, 201);
  const opB = createdB.data.patient.organization_patient_id; ops.push(opB); patients.push(createdB.data.patient.patient_id);
  for (const [name, role] of [['secondaryA', 'secondary'], ['consultantA', 'consultant']]) assert.equal((await api('ownerA', `/api/clinic/patients/${op}/assignments`, 'POST', { professionalId: actors[name].id, assignmentRole: role })).status, 201);
  const dashboard = await api('ownerA', `/api/clinic/dashboard?organizationId=${orgA}`); assert.equal(dashboard.status, 200, `dashboard_${dashboard.data.error}`); assert.equal(dashboard.data.dashboard.patients.active, 1);
  result.tests.dashboard = 'PASS';
  const evolutionPath = `/api/clinic/patients/${op}/evolutions`;
  const content = `CONTEUDO_CLINICO_SINTETICO_F6_${run}`;
  const input = { sessionDate: '2026-09-18', sessionTime: '10:00' };
  const authored: any[] = [];
  for (const name of ['primaryA', 'secondaryA', 'consultantA']) { const row = await api(name, evolutionPath, 'POST', input); assert.equal(row.status, 201, `create_evolution_${row.data.error}`); authored.push(row.data.evolution); assert.equal((await api(name, `${evolutionPath}/${row.data.evolution.id}`, 'PATCH', { transcriptionText: content, transcriptionStatus: 'completed', status: 'completed' })).status, 200); }
  const bEvolution = await api('primaryB', `/api/clinic/patients/${opB}/evolutions`, 'POST', input); assert.equal(bEvolution.status, 201);
  for (let i = 0; i < authored.length; i++) {
    const name = ['primaryA', 'secondaryA', 'consultantA'][i];
    const rows = await api(name, evolutionPath); assert.equal(rows.status, 200); assert.deepEqual(rows.data.evolutions.map((row: any) => row.id), [authored[i].id]);
    for (let j = 0; j < authored.length; j++) if (i !== j) {
      denied(await actors[name].client.from('evolutions').select('*', { count: 'exact' }).eq('id', authored[j].id));
      assert.ok([403, 404].includes((await api(name, `${evolutionPath}/${authored[j].id}`, 'PATCH', { status: 'signed' })).status));
    }
  }
  for (const name of ['ownerA', 'managerA', 'unassignedA', 'ownerB', 'primaryB']) {
    assert.equal((await api(name, evolutionPath)).status, 403);
    denied(await actors[name].client.from('evolutions').select('*', { count: 'exact' }).in('id', authored.map(row => row.id)));
  }
  result.tests.crossAuthor = 'PASS'; result.tests.adminClinicalDeny = 'PASS';
  for (const [field, value] of Object.entries({ professional_id: actors.secondaryA.id, patient_id: createdB.data.patient.patient_id, organization_id: orgB, organization_patient_id: opB })) {
    const update = await actors.primaryA.client.from('evolutions').update({ [field]: value }).eq('id', authored[0].id).select('id'); assert.ok(update.error, `immutable_${field}`);
  }
  for (const body of [{ signatureHash: 'forged' }, { professionalId: actors.secondaryA.id }, { organizationId: orgB }, { signature_date: '2026-09-18' }]) assert.equal((await api('primaryA', `${evolutionPath}/${authored[0].id}`, 'PATCH', body)).status, 400);
  await sql(runtime, `update public.professionals set full_name='Autor sintético F6',professional_register='SYNTHETIC-F6' where id='${actors.primaryA.id}'`);
  const signed = await api('primaryA', `${evolutionPath}/${authored[0].id}`, 'PATCH', { status: 'signed' }); assert.equal(signed.status, 200); assert.match(signed.data.evolution.signature_hash, /^[0-9a-f]{64}$/);
  assert.equal((await api('primaryA', `${evolutionPath}/${authored[0].id}`, 'PATCH', { transcriptionText: 'after-sign' })).status, 400);
  denied(await actors.primaryA.client.from('evolutions').delete().eq('id', authored[0].id).select('id'));
  const signedBefore = (await sql(runtime, `select professional_id,patient_id,organization_id,organization_patient_id,signature_hash,signature_date from public.evolutions where id='${authored[0].id}'`))[0];
  result.tests.signature = 'PASS';
  const personalPatient = checked(await actors.primaryA.client.from('patients').insert({ professional_id: actors.primaryA.id, full_name: 'Paciente pessoal sintético F6' }).select('id').single(), 'personal_patient'); patients.push(personalPatient.id);
  const personal = checked(await actors.primaryA.client.from('evolutions').insert({ professional_id: actors.primaryA.id, patient_id: personalPatient.id, session_date: '2026-09-18', session_time: '11:00', transcription_text: 'Evolução pessoal sintética F6', status: 'draft' }).select('*').single(), 'personal_evolution');
  checked(await actors.primaryA.client.from('evolutions').update({ transcription_text: 'Edição pessoal sintética F6' }).eq('id', personal.id), 'personal_edit');
  checked(await actors.primaryA.client.from('evolutions').update({ status: 'signed', signature_ip: '127.0.0.1' }).eq('id', personal.id), 'personal_sign');
  const history = checked(await actors.primaryA.client.from('evolutions').select('*').is('organization_id', null), 'personal_history'); assert.deepEqual(history.map((row: any) => row.id), [personal.id]);
  const personalDashboard = checked(await actors.primaryA.client.from('patients').select('id').eq('professional_id', actors.primaryA.id), 'personal_dashboard'); assert.deepEqual(personalDashboard.map((row: any) => row.id), [personalPatient.id]);
  const backup = JSON.parse(await buildPersonalBackupJson(actors.primaryA.client, actors.primaryA.id)); assert.deepEqual(backup.patients.map((row: any) => row.id), [personalPatient.id]); assert.deepEqual(backup.evolutions.map((row: any) => row.id), [personal.id]);
  const forgedPersonal = await actors.primaryA.client.from('evolutions').insert({ professional_id: actors.primaryA.id, patient_id: patient.patient_id, session_date: '2026-09-18', transcription_text: 'Share Target synthetic probe' }); assert.ok(forgedPersonal.error);
  const report = await actors.primaryA.client.from('patient_reports').insert({ professional_id: actors.primaryA.id, patient_id: patient.patient_id, type: 'report', period_label: 'sintético', content: 'synthetic' }); assert.equal(report.error?.code, '42501');
  for (const endpoint of ['semantic-index', 'semantic-search', 'ai-report', 'send-report-email']) assert.ok([403, 404].includes((await api('primaryA', `/api/patients/${patient.patient_id}/${endpoint}`, 'POST', {})).status));
  assert.equal(externalCalls, 0); result.tests.personalRegression = 'PASS';
  // Real user-scoped API ID swaps, administrative and clinical entry points.
  for (const path of [`/api/clinic/dashboard?organizationId=${orgB}`, `/api/clinic/audit?organizationId=${orgB}`, `/api/clinic/team?organizationId=${orgB}`, `/api/clinic/entitlement?organizationId=${orgB}`, `/api/clinic/patients?organizationId=${orgB}`, `/api/clinic/patients/${opB}`, `/api/clinic/patients/${opB}/evolutions`, `/api/clinic/invitations?organizationId=${orgB}`]) assert.equal((await api('ownerA', path)).status, 403, `cross_tenant_${path}`);
  for (const action of ['archive', 'reactivate']) assert.equal((await api('ownerA', `/api/clinic/patients/${opB}/${action}`, 'POST', {})).status, 403);
  assert.equal((await api('ownerA', `/api/clinic/patients/${opB}/reassign-primary`, 'POST', { newPrimaryProfessionalId: actors.primaryA.id, keepPreviousAsSecondary: false })).status, 403);
  assert.equal((await api('ownerA', `/api/clinic/patients/${opB}/assignments`, 'POST', { professionalId: actors.primaryA.id, assignmentRole: 'secondary' })).status, 403);
  assert.equal((await api('ownerA', `/api/clinic/patients/${op}/assignments`, 'POST', { professionalId: actors.primaryB.id, assignmentRole: 'secondary' })).status, 403);
  assert.equal((await api('ownerA', `${evolutionPath}/${bEvolution.data.evolution.id}`, 'PATCH', { transcriptionText: 'forged' })).status, 404);
  assert.equal((await edge('ownerB', 'clinic-billing-seats', { organizationId: orgA, contractedSeats: 9, idempotencyKey: randomUUID() })).status, 403);
  assert.equal((await api('ownerA', '/api/clinic/invitations', 'POST', { organizationId: orgB, email: 'f6-forged@example.invalid', role: 'professional', clinical: false })).status, 403);
  result.tests.crossTenant = 'PASS';
  assert.equal((await api('ownerA', `/api/clinic/patients/${op}`, 'PATCH', { fullName: 'Cadastro sintético F6 editado' })).status, 200);
  assert.equal((await api('ownerA', `/api/clinic/patients/${op}`, 'PATCH', { status: 'archived' })).status, 400);
  for (const name of ['primaryA', 'secondaryA']) assert.equal((await api(name, `/api/clinic/patients/${op}/archive`, 'POST', {})).status, 403);
  for (const name of ['ownerA', 'managerA']) {
    assert.equal((await api(name, `/api/clinic/patients/${op}/archive`, 'POST', {})).status, 200);
    assert.equal((await api('primaryA', evolutionPath, 'POST', input)).status, 403);
    assert.equal((await api('primaryA', evolutionPath)).status, 200);
    assert.equal((await api(name, `/api/clinic/patients/${op}/reactivate`, 'POST', {})).status, 200);
  }
  result.tests.patientLifecycle = 'PASS';
  for (const [target, keep] of [['secondaryA', false], ['consultantA', true]] as const) {
    assert.equal((await api('ownerA', `/api/clinic/patients/${op}/reassign-primary`, 'POST', { newPrimaryProfessionalId: actors[target].id, keepPreviousAsSecondary: keep })).status, 200);
    const assignments = await sql(runtime, `select professional_id,assignment_role from public.patient_professional_assignments where organization_patient_id='${op}' and status='active'`);
    assert.equal(assignments.filter(row => row.assignment_role === 'primary').length, 1); assert.equal(assignments.find(row => row.assignment_role === 'primary').professional_id, actors[target].id);
    assert.equal(assignments.filter(row => row.professional_id === actors[target].id).length, 1);
    if (keep) assert.equal(assignments.find(row => row.professional_id === actors.secondaryA.id).assignment_role, 'secondary');
  }
  assert.deepEqual((await sql(runtime, `select professional_id,patient_id,organization_id,organization_patient_id,signature_hash,signature_date from public.evolutions where id='${authored[0].id}'`))[0], signedBefore);
  assert.equal((await api('secondaryA', evolutionPath)).data.evolutions.length, 1); result.tests.primaryReassignment = 'PASS';
  const beforeSuspend = await seats(orgA);
  assert.equal((await api('ownerA', `/api/clinic/team/${actors.secondaryA.id}/suspend`, 'POST', { organizationId: orgA })).status, 200);
  assert.equal((await api('secondaryA', evolutionPath)).status, 403);
  assert.equal((await api('ownerA', `/api/clinic/team/${actors.secondaryA.id}/reactivate`, 'POST', { organizationId: orgA })).status, 200);
  assert.equal((await api('secondaryA', evolutionPath)).status, 200);
  assert.equal((await api('ownerA', `/api/clinic/team/${actors.unassignedA.id}/remove`, 'POST', { organizationId: orgA })).status, 200);
  assert.equal((await api('unassignedA', `/api/clinic/patients?organizationId=${orgA}`)).status, 403);
  assert.equal(Number((await seats(orgA)).active_seats), Number(beforeSuspend.active_seats) - 1);
  const removed = (await sql(runtime, `select status from public.organization_memberships where organization_id='${orgA}' and professional_id='${actors.unassignedA.id}' order by created_at desc limit 1`))[0]; assert.equal(removed.status, 'removed');
  result.tests.memberLifecycle = 'PASS';
  const declinedMethod = await stripe(runtime, 'payment_methods', 'POST', { type: 'card', 'card[token]': 'tok_visa_chargeCustomerFail' });
  await stripe(runtime, `payment_methods/${declinedMethod.id}/attach`, 'POST', { customer: subscription.customer });
  await stripe(runtime, `subscriptions/${subscription.id}`, 'POST', { default_payment_method: declinedMethod.id });
  const increaseKey = randomUUID();
  const pendingIncrease = await edge('ownerA', 'clinic-billing-seats', { organizationId: orgA, contractedSeats: 9, idempotencyKey: increaseKey });
  assert.equal(pendingIncrease.status, 200, `pending_increase_${pendingIncrease.data.error}`); assert.equal(pendingIncrease.data.status, 'pending_payment');
  assert.equal(Number((await seats(orgA)).contracted_seats), 8);
  await waitFor('real_invoice_failure', async () => Number((await sql(runtime, `select count(*) count from private.clinic_stripe_events where organization_id='${orgA}' and event_type='invoice.payment_failed' and processing_status='processed'`))[0].count) > 0);
  const pendingInvoices = await stripe(runtime, `invoices?subscription=${subscription.id}&status=open&limit=10`); assert.equal(pendingInvoices.data.length, 1);
  await stripe(runtime, `subscriptions/${subscription.id}`, 'POST', { default_payment_method: subscription.default_payment_method });
  await stripe(runtime, `invoices/${pendingInvoices.data[0].id}/pay`, 'POST', { payment_method: subscription.default_payment_method });
  await waitFor('pending_increase_paid', async () => Number((await sql(runtime, `select contracted_seats from private.organization_subscriptions where organization_id='${orgA}'`))[0].contracted_seats) === 9);
  const increase = await edge('ownerA', 'clinic-billing-seats', { organizationId: orgA, contractedSeats: 9, idempotencyKey: increaseKey }); assert.equal(increase.status, 200, `seat_increase_${increase.data.error}`); assert.equal(increase.data.status, 'confirmed'); assert.equal(Number((await seats(orgA)).contracted_seats), 9);
  result.tests.stripeFailureRecovery = 'PASS';
  const decrease = await edge('ownerA', 'clinic-billing-seats', { organizationId: orgA, contractedSeats: 8, idempotencyKey: randomUUID() }); assert.equal(decrease.status, 200); assert.equal(decrease.data.status, 'confirmed');
  const pendingSeat = (await sql(runtime, `select contracted_seats,pending_contracted_seats from private.organization_subscriptions where organization_id='${orgA}'`))[0]; assert.equal(Number(pendingSeat.contracted_seats), 9); assert.equal(Number(pendingSeat.pending_contracted_seats), 8);
  result.tests.stripeSeats = 'PASS';
  const cancel = await edge('ownerA', 'clinic-billing-cancel', { organizationId: orgA, idempotencyKey: randomUUID() }); assert.equal(cancel.status, 200); assert.equal(cancel.data.cancel_at_period_end, true); assert.equal((await stripe(runtime, `subscriptions/${subscription.id}`)).cancel_at_period_end, true); assert.equal((await seats(orgA)).entitlement_mode, 'full');
  result.tests.cancelAtPeriodEnd = 'PASS';
  await sql(runtime, `update private.organization_subscriptions set financial_status='past_due',grace_period_ends_at=clock_timestamp()+interval '1 day' where organization_id='${orgA}'`);
  assert.equal((await seats(orgA)).entitlement_mode, 'full'); assert.equal((await api('consultantA', evolutionPath, 'POST', input)).status, 201); result.tests.pastDueGrace = 'PASS';
  await sql(runtime, `update private.organization_subscriptions set grace_period_ends_at=clock_timestamp()-interval '1 day' where organization_id='${orgA}'`);
  assert.equal((await seats(orgA)).entitlement_mode, 'restricted'); assert.equal((await api('consultantA', evolutionPath)).status, 200); assert.equal((await api('consultantA', evolutionPath, 'POST', input)).status, 403);
  assert.equal((await api('ownerA', '/api/clinic/patients', 'POST', { organizationId: orgA, fullName: 'restricted denied' })).status, 403);
  result.tests.restricted = 'PASS';
  await sql(runtime, `update private.organization_subscriptions set financial_status='active',grace_period_ends_at=null where organization_id='${orgA}'`);
  const audit = await api('ownerA', `/api/clinic/audit?organizationId=${orgA}&limit=2`); assert.equal(audit.status, 200); assert.equal(audit.data.events.length, 2);
  const last = audit.data.events.at(-1); const page = await api('ownerA', `/api/clinic/audit?organizationId=${orgA}&limit=2&cursorCreatedAt=${encodeURIComponent(last.created_at)}&cursorId=${last.id}`); assert.equal(page.status, 200); assert.ok(page.data.events.every((row: any) => !audit.data.events.some((previous: any) => previous.id === row.id)));
  const reassignmentAudit = await api('managerA', `/api/clinic/audit?organizationId=${orgA}&eventType=patient_primary_reassigned`); assert.equal(reassignmentAudit.data.events.length, 2);
  assert.ok(!JSON.stringify(audit.data).includes(content)); assert.ok(!JSON.stringify(dashboard.data).includes(content));
  assert.equal((await api('primaryA', `/api/clinic/audit?organizationId=${orgA}`)).status, 403); result.tests.audit = 'PASS';
  assert.equal((await api('ownerA', '/api/clinic/team/transfer-owner', 'POST', { organizationId: orgA, targetProfessionalId: actors.managerA.id })).status, 200);
  const owners = await sql(runtime, `select professional_id from public.organization_memberships where organization_id='${orgA}' and membership_role='owner' and status='active'`); assert.deepEqual(owners.map(row => row.professional_id), [actors.managerA.id]);
  assert.equal((await api('managerA', `/api/clinic/team/${actors.managerA.id}/remove`, 'POST', { organizationId: orgA })).status, 403);
  assert.equal((await api('managerA', '/api/clinic/team/transfer-owner', 'POST', { organizationId: orgA, targetProfessionalId: actors.ownerA.id })).status, 200); result.tests.ownerTransfer = 'PASS';
  for (const token of [undefined, 'invalid-token']) assert.equal((await api(token, `/api/clinic/patients?organizationId=${orgA}`)).status, 401);
  await sql(runtime, `update public.organization_memberships set clinical_access_enabled=false where organization_id='${orgA}' and professional_id='${actors.secondaryA.id}' and status='active'`);
  assert.equal((await api('secondaryA', evolutionPath)).status, 403);
  assert.equal((await api('ownerA', `/api/clinic/team/${actors.secondaryA.id}/clinical-access`, 'POST', { organizationId: orgA, enabled: true })).status, 200);
  result.tests.securityProbes = 'PASS';
  const eventRows = await sql(runtime, `select stripe_event_id,processing_status from private.clinic_stripe_events where organization_id='${orgA}' and processing_status='processed' order by created_at`);
  assert.ok(eventRows.length > 0, 'real processed webhook required');
  const billingBefore = (await sql(runtime, `select (select count(*) from private.organization_subscriptions where organization_id='${orgA}') subscriptions,(select count(*) from private.clinic_stripe_transactions where organization_id='${orgA}') transactions`))[0];
  if (process.env.F6_STRIPE_CLI) {
    const event = await stripe(runtime, `events/${eventRows[0].stripe_event_id}`); assert.equal(event.livemode, false);
    const response = JSON.parse(execFileSync(process.env.F6_STRIPE_CLI, ['events', 'resend', event.id, '--webhook-endpoint=we_1UGJaIPI1KSTkIQAS4lj7XUM', '--confirm'], { env: { ...process.env, STRIPE_API_KEY: runtime.stripeKey }, encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] }));
    assert.ok(response.livemode !== true);
    result.webhookReplay = { eventId: event.id, destination: 'staging', providerResend: true };
    await new Promise(resolve => setTimeout(resolve, 2500)); result.tests.webhookIdempotency = 'PASS';
  } else if (runtime.webhookSecret) {
    const event = await stripe(runtime, `events/${eventRows[0].stripe_event_id}`);
    const body = JSON.stringify(event), time = Math.floor(Date.now() / 1000);
    const signature = createHmac('sha256', runtime.webhookSecret).update(`${time}.${body}`).digest('hex');
    const replay = await fetch(`${url}/functions/v1/clinic-stripe-webhook`, { method: 'POST', headers: { 'stripe-signature': `t=${time},v1=${signature}`, 'Content-Type': 'application/json' }, body });
    assert.equal(replay.status, 200); assert.equal((await replay.json()).duplicate, true); result.tests.webhookIdempotency = 'PASS';
  } else {
    // Exercise the same ledger claim with an authentic provider event ID, but distinguish it from HTTP replay.
    const event = await stripe(runtime, `events/${eventRows[0].stripe_event_id}`);
    const claim = checked(await admin.rpc('claim_clinic_stripe_event', { p_stripe_event_id: event.id, p_event_type: event.type, p_stripe_created_at: new Date(event.created * 1000).toISOString(), p_organization_id: orgA, p_stripe_subscription_id: subscription.id }), 'webhook_reclaim');
    assert.equal(claim.duplicate, true); result.tests.webhookIdempotency = 'PASS'; result.webhookReplay = 'Real provider event / deployed webhook persisted; duplicate ledger claim runtime. HTTP resend pending CLI.';
  }
  assert.deepEqual((await sql(runtime, `select (select count(*) from private.organization_subscriptions where organization_id='${orgA}') subscriptions,(select count(*) from private.clinic_stripe_transactions where organization_id='${orgA}') transactions`))[0], billingBefore);
  const currentHash = (await sql(runtime, `select signature_hash=encode(extensions.digest(id::text||'|'||coalesce(transcription_text,'')||'|'||signature_date::text||'|'||signature_ip||'|'||signed_by_name||'|'||signed_by_register,'sha256'),'hex') valid from public.evolutions where id='${authored[0].id}'`))[0]; assert.equal(currentHash.valid, true);
  assert.ok((await sql(runtime, `select google_doc_id from public.patients where id in (${quoteIds(patients.filter(id => id !== personalPatient.id))})`)).every(row => row.google_doc_id === null));
  result.tests.noDataLoss = 'PASS';
  result.tests.fullIntegrated = 'PASS'; result.stripeTestMode = 'MANUAL_GATE';
  // Optional UI checkpoint. Credentials remain outside the repository and are never printed.
  if (process.env.F6_VISUAL_FILE) {
    const magic = checked(await admin.auth.admin.generateLink({ type: 'magiclink', email: actors.ownerA.email, options: { redirectTo: `${runtime.origin}/painel/clinica` } }), 'visual_auth_link');
    writeFileSync(process.env.F6_VISUAL_FILE, JSON.stringify({ origin: runtime.origin, orgA, op, ownerActionLink: magic.properties.action_link, port }));
    console.log(JSON.stringify({ checkpoint: 'VISUAL_READY', run, tests: result.tests }));
    const release = `${process.env.F6_VISUAL_FILE}.continue`;
    await waitFor('visual_checkpoint', async () => existsSync(release), 1800000);
  }
} catch (error: any) {
  result.tests.fullIntegrated = 'FAIL'; result.failure = String(error.message || 'unknown').replace(/eyJ[A-Za-z0-9._-]+/g, '[REDACTED]');
  process.exitCode = 1;
} finally {
  console.error = originalError;
  // Independent gate shutdown precedes any provider or row cleanup.
  await edgeSecrets(runtime, { CLINIC_BILLING_ENABLED: 'false' });
  await sql(runtime, "update private.clinic_runtime_config set enabled=false,updated_at=clock_timestamp() where id=true");
  if (server) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
  for (const subscription of subscriptions) await stripe(runtime, `subscriptions/${subscription}`, 'DELETE');
  for (const checkout of checkouts) { const row = await stripe(runtime, `checkout/sessions/${checkout}`); if (row.status === 'open') await stripe(runtime, `checkout/sessions/${checkout}/expire`, 'POST', {}); }
  // Ensure asynchronous cancellation handlers finish before bounded ledger cleanup.
  if (subscriptions.length) await new Promise(resolve => setTimeout(resolve, 3500));
  for (const customer of customers) await stripe(runtime, `customers/${customer}`, 'DELETE');
  const organizations = quoteIds(orgs), professionals = quoteIds(users);
  await sql(runtime, `begin;
    select private.purge_organization_admin_events_for_staging_cleanup(id) from public.organizations where id in (${organizations});
    set local session_replication_role='replica'; delete from public.evolutions where professional_id in (${professionals}); set local session_replication_role='origin';
    delete from public.patient_reports where professional_id in (${professionals});
    delete from private.organization_invitation_handoffs where invitation_id in (select id from public.organization_invitations where organization_id in (${organizations}));
    delete from private.organization_invitation_deliveries where invitation_id in (select id from public.organization_invitations where organization_id in (${organizations}));
    delete from public.organization_invitations where organization_id in (${organizations});
    delete from private.clinic_billing_operations where organization_id in (${organizations});
    delete from private.clinic_stripe_events where organization_id in (${organizations});
    delete from private.clinic_stripe_transactions where organization_id in (${organizations});
    delete from private.organization_checkout_attempts where organization_id in (${organizations});
    delete from public.patient_professional_assignments where organization_patient_id in (select id from public.organization_patients where organization_id in (${organizations}));
    delete from public.organization_patients where organization_id in (${organizations});
    delete from private.organization_subscriptions where organization_id in (${organizations});
    delete from public.organization_feature_flags where organization_id in (${organizations});
    delete from public.organization_memberships where organization_id in (${organizations});
    delete from public.organizations where id in (${organizations});
    delete from public.patients where professional_id in (${professionals}) or id in (${quoteIds(patients)}); commit;`);
  for (const user of users) checked(await admin.auth.admin.deleteUser(user), 'auth_cleanup');
  const remaining: Record<string, number> = {};
  for (const table of ['public.organizations', 'public.organization_memberships', 'public.organization_invitations', 'public.organization_patients', 'private.organization_subscriptions', 'private.organization_admin_events', 'private.clinic_billing_operations', 'private.clinic_stripe_events', 'private.clinic_stripe_transactions', 'private.organization_checkout_attempts', 'public.organization_feature_flags']) {
    const column = table === 'public.organizations' ? 'id' : 'organization_id';
    remaining[table] = Number((await sql(runtime, `select count(*) count from ${table} where ${column} in (${organizations})`))[0].count);
  }
  remaining.assignments = Number((await sql(runtime, `select count(*) count from public.patient_professional_assignments where organization_patient_id in (${quoteIds(ops)}) or professional_id in (${professionals})`))[0].count);
  remaining.handoffs = Number((await sql(runtime, `select count(*) count from private.organization_invitation_handoffs where invitation_id in (${quoteIds(invitations)})`))[0].count);
  remaining.deliveries = Number((await sql(runtime, `select count(*) count from private.organization_invitation_deliveries where invitation_id in (${quoteIds(invitations)})`))[0].count);
  for (const table of ['public.professionals', 'auth.users', 'public.evolutions', 'public.patient_reports', 'public.patients']) {
    const column = ['public.professionals', 'auth.users'].includes(table) ? 'id' : 'professional_id';
    remaining[table] = Number((await sql(runtime, `select count(*) count from ${table} where ${column} in (${professionals})`))[0].count);
  }
  assert.ok(Object.values(remaining).every(count => count === 0));
  assert.deepEqual((await sql(runtime, 'select id from public.professionals order by id')).map(row => row.id), baselineProfessionals);
  assert.deepEqual((await sql(runtime, 'select id from auth.users order by id')).map(row => row.id), baselineAuth);
  const prohibited = [...rawTokens, ...Object.values(actors).flatMap(row => [row.token, row.password]), runtime.serviceKey, runtime.stripeKey, runtime.managementToken];
  assert.ok(prohibited.every(value => !logLines.some(line => line.includes(value))));
  assert.ok(!logLines.some(line => line.includes('CONTEUDO_CLINICO_SINTETICO_F6_')));
  result.tests.logPrivacy = 'PASS'; result.tests.cleanup = 'PASS'; result.cleanupCounts = remaining; result.gateFinal = 'OFF'; result.logCount = logLines.length;
  assert.ok(process.env.F6_RESULT_FILE, 'Sanitized result output required');
  writeFileSync(process.env.F6_RESULT_FILE!, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
}
