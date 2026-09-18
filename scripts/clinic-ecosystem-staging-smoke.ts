// Fase 5: único smoke sintético final. Staging only; no external providers.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import dotenv from "dotenv";
import express from "express";
import type { Server } from "node:http";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { registerClinicOperationalRoutes } from "../server/clinic/clinicOperationalRoutes.js";
import { registerClinicEvolutionRoutes } from "../server/clinic/clinicEvolutionRoutes.js";

assert.ok(process.argv.includes("--confirm-staging-only"), "Explicit staging-only flag required");
const ref = "hwkdwinfckmjoriqxbjk";
const url = `https://${ref}.supabase.co`;
const env = dotenv.parse(readFileSync(process.env.SUPABASE_SMOKE_ENV_FILE || ".env.local"));
assert.ok(env.SUPABASE_ACCESS_TOKEN, "Management credential required");
async function management(query: string) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, { method: "POST", headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify({ query }) });
  if (!response.ok) throw new Error(`staging_management_${response.status}`);
  return response.json() as Promise<any[]>;
}
const keysResponse = await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys`, { headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}` } });
assert.ok(keysResponse.ok);
const keys = await keysResponse.json() as Array<{ name: string; api_key: string }>;
const serviceKey = keys.find((key) => key.name === "service_role")?.api_key;
const anonKey = keys.find((key) => key.name === "anon")?.api_key;
assert.ok(serviceKey && anonKey);
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(url, serviceKey, options);
const auth = createClient(url, anonKey, options);
const run = randomUUID().slice(0, 8);
const users: string[] = []; const orgs: string[] = []; const ops: string[] = []; const patients: string[] = []; const evolutions: string[] = [];
const fixtures: Record<string, { id: string; client: SupabaseClient; token: string }> = {};
const checked = (result: any, label: string) => { if (result.error) throw new Error(`${label}_${result.error.code || "failed"}`); return result.data; };
const ids = (values: string[]) => values.length ? values.map((value) => `'${value}'`).join(",") : "NULL";
async function fixture(name: string) {
  const email = `clinic-5-${run}-${name}@example.invalid`;
  const password = randomBytes(24).toString("base64url");
  const generated = checked(await admin.auth.admin.generateLink({ type: "signup", email, password }), "auth_create");
  const id = generated.user?.id as string; assert.ok(id); users.push(id);
  const client = createClient(url, anonKey!, options);
  const session = checked(await client.auth.verifyOtp({ token_hash: generated.properties?.hashed_token, type: "signup" }), "auth_verify");
  assert.ok(session.session?.access_token); fixtures[name] = { id, client, token: session.session.access_token };
}
async function createOrg(actor: string) {
  const row = checked(await fixtures[actor].client.rpc("create_organization_with_owner", { p_name: `Clínica sintética F5 ${run} ${actor}` }), "org");
  orgs.push(row.id);
  await management(`insert into private.organization_subscriptions(organization_id,plan_code,billing_interval,currency,base_amount_minor,seat_amount_minor,minimum_contracted_seats,contracted_seats,financial_status) values('${row.id}','clinic_monthly','monthly','BRL',4990,2990,3,8,'active')`);
  checked(await admin.rpc("set_organization_clinic_rollout_state", { p_organization_id: row.id, p_enabled: true, p_reason: "Fase 5 synthetic smoke" }), "rollout");
  return row.id as string;
}
let server: Server | undefined; let port = 0; let passed = false;
try {
  const state = (await management("select (select environment_name from private.runtime_environment where id=true) environment,(select allowed_environment from private.clinic_runtime_config where id=true) allowed,(select enabled from private.clinic_runtime_config where id=true) gate"))[0];
  assert.equal(state.environment, "staging"); assert.equal(state.allowed, "staging"); assert.equal(state.gate, false);
  for (const name of ["ownerA", "managerA", "primaryA", "secondaryA", "consultantA", "ownerB"]) await fixture(name);
  await management("update private.clinic_runtime_config set enabled=true,updated_at=clock_timestamp() where id=true");
  const orgA = await createOrg("ownerA"); const orgB = await createOrg("ownerB");
  await management(`insert into public.organization_memberships(organization_id,professional_id,membership_role,status,clinical_access_enabled,created_by) values('${orgA}','${fixtures.managerA.id}','manager','active',false,'${fixtures.ownerA.id}'),('${orgA}','${fixtures.primaryA.id}','professional','active',true,'${fixtures.ownerA.id}'),('${orgA}','${fixtures.secondaryA.id}','professional','active',true,'${fixtures.ownerA.id}'),('${orgA}','${fixtures.consultantA.id}','professional','active',true,'${fixtures.ownerA.id}'); update public.organization_memberships set clinical_access_enabled=true where organization_id='${orgB}' and professional_id='${fixtures.ownerB.id}'`);
  const patient = checked(await fixtures.ownerA.client.rpc("create_organization_patient", { p_organization_id: orgA, p_full_name: `Paciente sintético F5 ${run}`, p_primary_professional_id: fixtures.primaryA.id, p_secondary_professional_ids: [fixtures.secondaryA.id], p_consultant_professional_ids: [fixtures.consultantA.id] }), "patient");
  const patientB = checked(await fixtures.ownerB.client.rpc("create_organization_patient", { p_organization_id: orgB, p_full_name: `Paciente sintético F5 B ${run}`, p_primary_professional_id: fixtures.ownerB.id }), "patient_b");
  const op = patient.organization_patient_id as string; const opB = patientB.organization_patient_id as string; ops.push(op, opB); patients.push(patient.patient_id, patientB.patient_id);
  const requireAuth = async (req: any, res: any, next: any) => { const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, ""); const result = await auth.auth.getUser(token); if (result.error || !result.data.user) return res.status(401).json({ error: "authentication_required" }); req.user = result.data.user; next(); };
  const app = express(); app.use(express.json());
  registerClinicOperationalRoutes(app, { requireAuth, supabaseUrl: url, supabaseAnonKey: anonKey!, clinicFeatureEnabled: true });
  registerClinicEvolutionRoutes(app, { requireAuth, supabaseUrl: url, supabaseAnonKey: anonKey!, clinicFeatureEnabled: true });
  server = app.listen(0, "127.0.0.1"); await new Promise<void>((resolve) => server!.once("listening", resolve)); port = (server.address() as { port: number }).port;
  async function api(actor: string, path: string, method = "GET", body?: unknown) { const response = await fetch(`http://127.0.0.1:${port}${path}`, { method, headers: { Authorization: `Bearer ${fixtures[actor].token}`, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }); assert.equal(response.headers.get("vary"), "Authorization"); assert.equal(response.headers.get("cache-control"), "private, no-store"); return { status: response.status, body: await response.json() }; }
  const dashboard = await api("ownerA", `/api/clinic/dashboard?organizationId=${orgA}`); assert.equal(dashboard.status, 200); assert.ok(dashboard.body.dashboard.patients); assert.equal(JSON.stringify(dashboard.body.dashboard).includes("evolution"), false);
  const professionalDashboard = await api("primaryA", `/api/clinic/dashboard?organizationId=${orgA}`); assert.equal(professionalDashboard.status, 200); assert.ok(professionalDashboard.body.dashboard.myPatients); assert.equal(professionalDashboard.body.dashboard.patients, undefined);
  assert.equal((await api("primaryA", `/api/clinic/dashboard?organizationId=${orgB}`)).status, 403);
  const created = await api("primaryA", `/api/clinic/patients/${op}/evolutions`, "POST", { sessionDate: "2026-09-18", sessionTime: "10:00" }); assert.equal(created.status, 201); evolutions.push(created.body.evolution.id);
  assert.equal((await api("secondaryA", `/api/clinic/patients/${op}/evolutions`)).status, 200); assert.equal((await fixtures.secondaryA.client.from("evolutions").select("id").eq("id", evolutions[0])).data?.length || 0, 0);
  assert.equal((await api("primaryA", `/api/clinic/patients/${opB}/evolutions`)).status, 403);
  const audit = await api("ownerA", `/api/clinic/audit?organizationId=${orgA}&limit=50`); assert.equal(audit.status, 200); assert.equal(audit.body.events.some((event: any) => event.event_type === "patient_assignment_created"), true); assert.equal(audit.body.events.some((event: any) => "transcription_text" in event || "content" in event), false);
  assert.equal((await api("primaryA", `/api/clinic/audit?organizationId=${orgA}`)).status, 403);
  assert.equal((await api("ownerA", `/api/clinic/patients/${op}/archive`, "POST", {})).status, 200);
  assert.equal((await api("primaryA", `/api/clinic/patients/${op}/evolutions`, "POST", { sessionDate: "2026-09-18" })).status, 403);
  assert.equal((await api("ownerA", `/api/clinic/patients/${op}/reactivate`, "POST", {})).status, 200);
  assert.equal((await api("ownerA", `/api/clinic/patients/${op}/reassign-primary`, "POST", { newPrimaryProfessionalId: fixtures.secondaryA.id, keepPreviousAsSecondary: false })).status, 200);
  const afterPromotion = checked(await admin.from("patient_professional_assignments").select("professional_id,assignment_role,status").eq("organization_patient_id", op).eq("status", "active"), "promotion"); assert.equal(afterPromotion.filter((row: any) => row.assignment_role === "primary").length, 1); assert.equal(afterPromotion.some((row: any) => row.professional_id === fixtures.secondaryA.id && row.assignment_role === "primary"), true);
  assert.equal((await api("ownerA", `/api/clinic/patients/${op}/reassign-primary`, "POST", { newPrimaryProfessionalId: fixtures.consultantA.id, keepPreviousAsSecondary: true })).status, 200);
  const afterKeep = checked(await admin.from("patient_professional_assignments").select("professional_id,assignment_role,status").eq("organization_patient_id", op).eq("status", "active"), "keep"); assert.equal(afterKeep.filter((row: any) => row.assignment_role === "primary").length, 1); assert.equal(afterKeep.some((row: any) => row.professional_id === fixtures.secondaryA.id && row.assignment_role === "secondary"), true); assert.equal(afterKeep.some((row: any) => row.professional_id === fixtures.consultantA.id && row.assignment_role === "primary"), true);
  const old = (await admin.from("evolutions").select("professional_id,organization_id,organization_patient_id").eq("id", evolutions[0]).single()).data; assert.equal(old.professional_id, fixtures.primaryA.id); assert.equal(old.organization_id, orgA); assert.equal(old.organization_patient_id, op);
  const finalAudit = await api("managerA", `/api/clinic/audit?organizationId=${orgA}&eventType=patient_primary_reassigned&limit=2`); assert.equal(finalAudit.status, 200); assert.ok(finalAudit.body.events.length >= 2);
  passed = true; console.log(JSON.stringify({ smoke: "PASS", dashboard: "PASS", audit: "PASS", lifecycle: "PASS", primaryPromotion: "PASS", keepSecondary: "PASS", crossAuthor: "PASS", crossTenant: "PASS" }));
} finally {
  if (server) await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
  await management("update private.clinic_runtime_config set enabled=false,updated_at=clock_timestamp() where id=true");
  const orgValues = ids(orgs); const userValues = ids(users); const opValues = ids(ops); const patientValues = ids(patients);
  await management(`begin; set local session_replication_role='replica'; delete from public.evolutions where professional_id in (${userValues}); set local session_replication_role='origin'; delete from public.patient_professional_assignments where organization_patient_id in (${opValues}); delete from public.organization_patients where id in (${opValues}); select private.purge_organization_admin_events_for_staging_cleanup(id) from public.organizations where id in (${orgValues}); delete from private.organization_subscriptions where organization_id in (${orgValues}); delete from public.organization_feature_flags where organization_id in (${orgValues}); delete from public.organization_memberships where organization_id in (${orgValues}); delete from public.organizations where id in (${orgValues}); delete from public.patients where id in (${patientValues}); commit;`);
  for (const id of users) { const result = await admin.auth.admin.deleteUser(id); assert.ifError(result.error); }
  const remaining = (await management(`select (select enabled from private.clinic_runtime_config where id=true) gate,(select count(*) from public.organization_patients where id in (${opValues})) patients,(select count(*) from public.organizations where id in (${orgValues})) organizations,(select count(*) from auth.users where id in (${userValues})) auth_users`))[0]; assert.equal(remaining.gate, false); assert.equal(Number(remaining.patients), 0); assert.equal(Number(remaining.organizations), 0); assert.equal(Number(remaining.auth_users), 0); console.log(JSON.stringify({ cleanup: "PASS", clinicGateFinal: "OFF", fixtureCounts: remaining }));
  if (!passed) throw new Error("clinic_ecosystem_smoke_failed");
}
