// Explicit, bounded staging-only smoke. No external transport, Stripe or mail.
// Auth verification uses generateLink + verifyOtp, never email_confirmed_at SQL.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import dotenv from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import express from "express";
import { registerClinicInvitationRoutes, hashInvitationSecret } from "../server/clinic/clinicInvitationRoutes.js";
import { renderInvitationMail } from "../server/clinic/clinicInvitationEmail.js";

assert.ok(process.argv.includes("--confirm-staging-only"), "Explicit staging-only flag required");
const ref = "hwkdwinfckmjoriqxbjk", url = `https://${ref}.supabase.co`, origin = "https://staging.evolucaoclinica.app.br";
const env = dotenv.parse(readFileSync(".env.local"));
assert.ok(env.SUPABASE_ACCESS_TOKEN, "Management API credential required");
async function management(path: string, query?: string) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/${path}`, {
    method: query === undefined ? "GET" : "POST",
    headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, "Content-Type": "application/json" },
    ...(query === undefined ? {} : { body: JSON.stringify({ query }) }),
  });
  // No response-body/error dumping: SQL may contain confidential RPC output.
  if (!r.ok) throw new Error(`staging_management_${r.status}`);
  return r.json();
}
const sql = (query: string) => management("database/query", query);
const keys = await management("api-keys");
const serviceKey = keys.find((k: any) => k.name === "service_role")?.api_key;
const anonKey = keys.find((k: any) => k.name === "anon")?.api_key;
for (const key of [serviceKey, anonKey]) {
  assert.equal(JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString()).ref, ref);
}
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(url, serviceKey, options);
const userIds: string[] = [], organizationIds: string[] = [], rawTokens: string[] = [], handoffSecrets: string[] = [];
const fixtures: Record<string, { id: string; email: string; token: string; client: SupabaseClient; confirmationHash: string }> = {};
const run = randomUUID().slice(0, 8);
const uuid = (id: unknown): id is string => typeof id === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id);
const checked = (result: any, label: string) => { if (result.error) throw new Error(`${label}_${result.error.code || "failed"}`); return result.data; };
const initial = (await sql("select (select enabled from private.clinic_runtime_config where id=true) as gate,(select environment_name from private.runtime_environment where id=true) as environment,(select count(*) from public.organizations) as organizations,(select count(*) from auth.users) as users"))[0];
assert.equal(initial.environment, "staging"); assert.equal(initial.gate, false); assert.equal(Number(initial.organizations), 0); assert.equal(Number(initial.users), 0);
const payloads: any[] = [];
const app = express();
let failTransport = false;
registerClinicInvitationRoutes(app, { appEnv: "staging", supabaseUrl: url, publicOrigin: origin, clinicFeatureEnabled: true, deliveryEnabled: true, admin,
  transport: { provider: "mock", ready: true, send: async (mail) => { rawTokens.push(mail.token); payloads.push(renderInvitationMail(mail)); if (failTransport) throw new Error("mock_failed"); return { messageId: `${randomUUID()}@staging.evolucaoclinica.app.br` }; } },
});
const server = app.listen(0, "127.0.0.1"); await new Promise<void>((r) => server.once("listening", r));
const address = server.address() as any; const base = `http://127.0.0.1:${address.port}`;
const safeResponses: any[] = [];
async function request(path: string, actor?: string, body?: any, cookie?: string) {
  const result = await fetch(`${base}/api/clinic/invitations${path}`, { method: body === undefined ? "GET" : "POST", headers: { Origin: origin, "Content-Type": "application/json", ...(actor ? { Authorization: `Bearer ${fixtures[actor].token}` } : {}), ...(cookie ? { Cookie: cookie } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = await result.json(); safeResponses.push(data);
  return { status: result.status, data, cookie: result.headers.get("set-cookie") || "" };
}
async function fixture(name: string, confirmed = true) {
  const email = `clinic-2c-${run}-${name}@example.invalid`, password = randomBytes(24).toString("base64url");
  const generated = checked(await admin.auth.admin.generateLink({ type: "signup", email, password }), "auth_generate_link");
  const id = generated.user?.id; assert.ok(uuid(id), "Auth UUID required"); userIds.push(id);
  const confirmationHash = generated.properties?.hashed_token; assert.ok(confirmationHash);
  const auth = createClient(url, anonKey, options);
  if (confirmed) checked(await auth.auth.verifyOtp({ token_hash: confirmationHash, type: "signup" }), "auth_verify");
  const signIn = confirmed ? checked(await auth.auth.signInWithPassword({ email, password }), "auth_login") : null;
  fixtures[name] = { id, email, token: signIn?.session?.access_token || "", client: auth, confirmationHash };
  const professionals = await sql(`select id from public.professionals where id='${id}'`); assert.equal(professionals[0]?.id, id);
}
async function organization(actor: string) {
  const row = checked(await fixtures[actor].client.rpc("create_organization_with_owner", { p_name: `Clínica sintética 2C ${run} ${actor}` }), "create_org");
  const id = row?.id; assert.ok(uuid(id)); organizationIds.push(id);
  // Synthetic contract fixture, not Stripe reconciliation or activation bypass.
  await sql(`insert into private.organization_subscriptions(organization_id,plan_code,billing_interval,currency,base_amount_minor,seat_amount_minor,minimum_contracted_seats,contracted_seats,financial_status) values('${id}','clinic_monthly','monthly','BRL',4990,2990,3,3,'active')`);
  checked(await admin.rpc("set_organization_clinic_rollout_state", { p_organization_id: id, p_enabled: true, p_reason: "Fase 2C synthetic mock-transport smoke" }), "rollout");
  return id;
}
const usage = async (org: string) => (await sql(`select * from private.get_organization_seat_usage('${org}')`))[0];
async function issue(org: string, email: string, clinical = true, actor = "ownerA", role = "professional") {
  const response = await request("", actor, { organizationId: org, email, clinical, role, actor: fixtures.ownerB.id });
  assert.equal(response.status, 201, `issue:${response.data.error || "status"}`); assert.ok(uuid(response.data.invitationId)); return response.data.invitationId;
}
async function handoff(token = rawTokens.at(-1)!) {
  const response = await request("/handoff", undefined, { token }); assert.equal(response.status, 200);
  const secret = response.cookie.match(/ec_clinic_invite=([A-Za-z0-9_-]{43})/)?.[1]; assert.ok(secret); handoffSecrets.push(secret);
  return response.cookie;
}
try {
  await sql("update private.clinic_runtime_config set enabled=true where id=true");
  for (const name of ["ownerA", "ownerB", "manager", "existing", "new", "race", "resendRace", "revokeRace"]) await fixture(name);
  const a = await organization("ownerA"), b = await organization("ownerB");
  const managerInvite = await issue(a, fixtures.manager.email, false);
  const managerCookie = await handoff(); assert.equal((await request("/accept", "manager", {}, managerCookie)).status, 200);
  assert.equal((await request("", "manager", { organizationId: a, email: `invalid-${run}@example.invalid`, role: "manager", clinical: false })).status, 403);
  const existingId = await issue(a, fixtures.existing.email); const existingCookie = await handoff();
  const ttl = (await sql(`select extract(epoch from (expires_at-created_at)) seconds from private.organization_invitation_handoffs where invitation_id='${existingId}'`))[0];
  assert.ok(Number(ttl.seconds) >= 2699 && Number(ttl.seconds) <= 2701, "Real handoff TTL must be 45 minutes");
  const before = await usage(a); assert.equal(Number(before.reserved_seats), 1); assert.equal(Number(before.active_seats), 0);
  assert.equal((await request("/accept", "ownerB", {}, existingCookie)).data.error, "email_mismatch");
  const existingAccepted = await Promise.all([request("/accept", "existing", {}, existingCookie), request("/accept", "existing", {}, existingCookie)]);
  assert.deepEqual(existingAccepted.map((r) => r.status).sort(), [200, 410]);
  const after = await usage(a); assert.equal(Number(after.reserved_seats), 0); assert.equal(Number(after.active_seats), 1);
  const p2 = await issue(a, `pending2-${run}@example.invalid`), p2token = rawTokens.at(-1)!;
  const p3 = await issue(a, `pending3-${run}@example.invalid`);
  assert.equal(Number((await usage(a)).available_seats), 0);
  assert.equal((await request("", "ownerA", { organizationId: a, email: `full-${run}@example.invalid`, role: "professional", clinical: true })).data.error, "no_clinical_seats");
  const adminId = await issue(a, `administrative-${run}@example.invalid`, false);
  assert.equal(Number((await usage(a)).reserved_seats), 2);
  assert.equal((await request(`?organizationId=${b}`, "ownerA")).status, 403);
  for (const action of ["resend", "revoke"]) assert.equal((await request(`/${p2}/${action}`, "ownerB", { organizationId: a })).status, 403);
  assert.equal((await request(`?organizationId=${b}`, "manager")).status, 403);
  const oldCookie = await handoff(p2token);
  assert.equal((await request(`/${p2}/resend`, "ownerA", { organizationId: a })).status, 429);
  // Advance only the synthetic cooldown timestamp, not expiry/acceptance or Auth.
  await sql(`update public.organization_invitations set updated_at=clock_timestamp()-interval '61 seconds' where id='${p2}'`);
  assert.equal((await request(`/${p2}/resend`, "ownerA", { organizationId: a })).status, 201);
  assert.equal((await request("/handoff", undefined, { token: p2token })).status, 410);
  assert.equal((await request("/handoff", undefined, undefined, oldCookie)).status, 410);
  assert.equal(Number((await usage(a)).reserved_seats), 2);
  for (const id of [p2, p3, adminId]) assert.equal((await request(`/${id}/revoke`, "ownerA", { organizationId: a })).status, 200);
  failTransport = true; const failedId = await issue(a, `failed-${run}@example.invalid`); failTransport = false;
  const failedLedger = (await sql(`select status from private.organization_invitation_deliveries where invitation_id='${failedId}'`))[0]; assert.equal(failedLedger.status, "failed"); assert.equal(Number((await usage(a)).reserved_seats), 1);
  assert.equal((await request(`/${failedId}/revoke`, "ownerA", { organizationId: a })).status, 200);
  // Recipient account does not exist at issuance: no account created by invite.
  const newEmail = `clinic-2c-${run}-newAfter@example.invalid`;
  const newId = await issue(a, newEmail, false); assert.equal(Number((await sql(`select count(*) count from auth.users where lower(email)=lower('${newEmail}')`))[0].count), 0);
  const newCookie = await handoff(); await fixture("newAfter", false);
  const newSecret = newCookie.match(/ec_clinic_invite=([A-Za-z0-9_-]{43})/)?.[1]; assert.ok(newSecret);
  const unconfirmed = await admin.rpc("resolve_organization_invitation_handoff_server", { p_secret_hash: hashInvitationSecret(newSecret), p_actor: fixtures.newAfter.id, p_accept: true });
  assert.equal(unconfirmed.error?.message, "email_unconfirmed");
  assert.equal(Number((await sql(`select count(*) count from public.organization_memberships where organization_id='${a}' and professional_id='${fixtures.newAfter.id}'`))[0].count), 0);
  checked(await fixtures.newAfter.client.auth.verifyOtp({ token_hash: fixtures.newAfter.confirmationHash, type: "signup" }), "new_auth_verify");
  const newSession = checked(await fixtures.newAfter.client.auth.getSession(), "new_auth_session").session; assert.ok(newSession?.access_token); fixtures.newAfter.token = newSession.access_token;
  assert.equal((await request("/accept", "newAfter", {}, newCookie)).status, 200);
  // Real concurrent issue, accept, resend/accept and revoke/accept transactions.
  const dup = await Promise.all([request("", "ownerA", { organizationId: a, email: fixtures.race.email, role: "professional", clinical: true }), request("", "ownerA", { organizationId: a, email: fixtures.race.email, role: "professional", clinical: true })]);
  assert.deepEqual(dup.map((r) => r.status).sort(), [201, 409]); const raceId = dup.find((r) => r.status === 201)!.data.invitationId;
  assert.ok(uuid(raceId)); const raceCookie = await handoff();
  const raceAccept = await Promise.all([request("/accept", "race", {}, raceCookie), request("/accept", "race", {}, raceCookie)]); assert.deepEqual(raceAccept.map((r) => r.status).sort(), [200, 410]);
  for (const scenario of ["resendRace", "revokeRace"]) {
    const id = await issue(a, fixtures[scenario].email, false); const ck = await handoff();
    if (scenario === "resendRace") await sql(`update public.organization_invitations set updated_at=clock_timestamp()-interval '61 seconds' where id='${id}'`);
    const results = await Promise.all([request(`/${id}/${scenario === "resendRace" ? "resend" : "revoke"}`, "ownerA", { organizationId: a }), request("/accept", scenario, {}, ck)]);
    assert.ok(results.every((r) => [200, 201, 410].includes(r.status)));
    const state = (await sql(`select status from public.organization_invitations where id='${id}'`))[0].status;
    const count = Number((await sql(`select count(*) count from public.organization_memberships where organization_id='${a}' and professional_id='${fixtures[scenario].id}' and status='active'`))[0].count);
    assert.equal(count, state === "accepted" ? 1 : 0);
  }
  // Expiry materializes/audits once and releases the reservation; no cron.
  const expiry = await issue(a, `expiry-${run}@example.invalid`); const expiryCookie = await handoff();
  await sql(`update public.organization_invitations set created_at=clock_timestamp()-interval '73 hours',expires_at=clock_timestamp()-interval '1 minute' where id='${expiry}'`);
  assert.equal((await request("/handoff", undefined, undefined, expiryCookie)).status, 410);
  await request(`?organizationId=${a}`, "ownerA"); await request(`?organizationId=${a}`, "ownerA");
  assert.equal(Number((await sql(`select count(*) count from private.organization_admin_events where invitation_id='${expiry}' and event_type='invitation_expired'`))[0].count), 1);
  const snapshot = JSON.stringify(await sql("select jsonb_build_object('invitations',(select jsonb_agg(to_jsonb(i)) from public.organization_invitations i),'deliveries',(select jsonb_agg(to_jsonb(d)) from private.organization_invitation_deliveries d),'handoffs',(select jsonb_agg(to_jsonb(h)) from private.organization_invitation_handoffs h),'audit',(select jsonb_agg(to_jsonb(a)) from private.organization_admin_events a)) snapshot"));
  for (const secret of [...rawTokens, ...handoffSecrets]) { assert.ok(!snapshot.includes(secret)); assert.ok(!JSON.stringify(safeResponses).includes(secret)); }
  const grants = (await sql("select has_function_privilege('authenticated','public.create_organization_invitation(uuid,text,text,boolean)','execute') issue,has_function_privilege('authenticated','public.accept_organization_invitation(text)','execute') accept,has_function_privilege('authenticated','public.issue_organization_invitation_server(uuid,uuid,text,text,boolean,text)','execute') server,has_table_privilege('authenticated','private.organization_invitation_deliveries','select') ledger"))[0];
  assert.deepEqual(grants, { issue: false, accept: false, server: false, ledger: false });
  const leakRows = await sql("select table_name from information_schema.tables where table_schema='public' and table_name='email_deliveries'");
  if (leakRows.length) assert.equal(Number((await sql("select count(*) count from public.email_deliveries"))[0].count), 0);
  console.log(JSON.stringify({ staging: ref, technicalSmoke: "PASS", transport: "mock", externalEmails: 0, auth: "generateLink + verifyOtp; normal recipient sessions", pendingReservationConversion: "PASS", tenantIsolation: "PASS", concurrency: "PASS", secretLeak: "PASS", legacyGrants: "REVOKED", ids: { organizations: organizationIds, invitations: [managerInvite, existingId, newId, raceId] } }));
} finally {
  await new Promise<void>((r) => server.close(() => r()));
  // Exact run-owned IDs only; immutable audit cleanup is explicitly staging.
  for (const id of organizationIds) {
    assert.ok(uuid(id));
    await sql(`begin; select private.purge_organization_admin_events_for_staging_cleanup('${id}'); delete from public.organization_invitations where organization_id='${id}'; delete from public.organization_feature_flags where organization_id='${id}'; delete from private.organization_subscriptions where organization_id='${id}'; delete from public.organization_memberships where organization_id='${id}'; delete from public.organizations where id='${id}'; commit;`);
  }
  for (const id of userIds) checked(await admin.auth.admin.deleteUser(id), "auth_cleanup");
  await sql("update private.clinic_runtime_config set enabled=false where id=true");
  const remaining = (await sql("select (select count(*) from auth.users) users,(select count(*) from public.professionals) professionals,(select count(*) from public.organizations) organizations,(select count(*) from public.organization_invitations) invitations,(select count(*) from private.organization_invitation_deliveries) deliveries,(select count(*) from private.organization_invitation_handoffs) handoffs,(select count(*) from private.organization_admin_events) audit,(select enabled from private.clinic_runtime_config where id=true) gate"))[0];
  for (const [key, value] of Object.entries(remaining)) assert.equal(value, key === "gate" ? false : 0, `cleanup_${key}`);
  console.log(JSON.stringify({ cleanup: "PASS", remaining, externalEmails: 0 }));
}
