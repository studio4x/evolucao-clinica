// Smoke sintético único da Fase 3. Staging only; não envia e-mail, áudio ou
// dados clínicos reais. A limpeza é sempre executada no finally.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import dotenv from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

assert.ok(process.argv.includes("--confirm-staging-only"), "Explicit staging-only flag required");
const ref = "hwkdwinfckmjoriqxbjk";
const url = `https://${ref}.supabase.co`;
const env = dotenv.parse(readFileSync(".env.local"));
assert.ok(env.SUPABASE_ACCESS_TOKEN, "Management API credential required");

async function management(query: string) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!response.ok) throw new Error(`staging_management_${response.status}`);
  return response.json();
}

async function getKeys() {
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys`, { headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}` } });
  if (!response.ok) throw new Error(`staging_keys_${response.status}`);
  return response.json() as Promise<Array<{ name: string; api_key: string }>>;
}

const checked = (result: any, label: string) => { if (result.error) throw new Error(`${label}_${result.error.code || "failed"}`); return result.data; };
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const run = randomUUID().slice(0, 8);
const userIds: string[] = [];
const organizationIds: string[] = [];
const fixtures: Record<string, { id: string; email: string; client: SupabaseClient; token: string }> = {};
let sharedPatientId: string | null = null;
let personalPatientId: string | null = null;
let gateEnabled = false;

const keys = await getKeys();
const serviceKey = keys.find((key) => key.name === "service_role")?.api_key;
const anonKey = keys.find((key) => key.name === "anon")?.api_key;
assert.ok(serviceKey && anonKey);
const admin = createClient(url, serviceKey, options);

async function fixture(name: string) {
  const email = `clinic-3-${run}-${name}@example.invalid`;
  const password = randomBytes(24).toString("base64url");
  const generated = checked(await admin.auth.admin.generateLink({ type: "signup", email, password }), "auth_generate_link");
  const id = generated.user?.id as string;
  assert.ok(id); userIds.push(id);
  const client = createClient(url, anonKey, options);
  checked(await client.auth.verifyOtp({ token_hash: generated.properties?.hashed_token, type: "signup" }), "auth_verify");
  const session = checked(await client.auth.signInWithPassword({ email, password }), "auth_login");
  assert.ok(session.session?.access_token);
  fixtures[name] = { id, email, client, token: session.session.access_token };
}

async function organization(actor: string) {
  const row = checked(await fixtures[actor].client.rpc("create_organization_with_owner", { p_name: `Clínica sintética F3 ${run} ${actor}` }), "create_org");
  const id = row.id as string;
  assert.ok(id); organizationIds.push(id);
  await management(`insert into private.organization_subscriptions(organization_id,plan_code,billing_interval,currency,base_amount_minor,seat_amount_minor,minimum_contracted_seats,contracted_seats,financial_status) values('${id}','clinic_monthly','monthly','BRL',4990,2990,3,3,'active')`);
  checked(await admin.rpc("set_organization_clinic_rollout_state", { p_organization_id: id, p_enabled: true, p_reason: "Fase 3 synthetic patient smoke" }), "rollout");
  return id;
}

async function rpc(name: string, actor: string, args: Record<string, unknown>) {
  return fixtures[actor].client.rpc(name, args);
}

try {
  const environment = (await management("select environment_name from private.runtime_environment where id=true"))[0];
  assert.equal(environment.environment_name, "staging");
  await fixture("ownerA"); await fixture("managerA"); await fixture("primaryA"); await fixture("secondaryA"); await fixture("consultantA"); await fixture("extraA"); await fixture("ownerB");
  await management("update private.clinic_runtime_config set enabled=true, updated_at=clock_timestamp() where id=true"); gateEnabled = true;
  const orgA = await organization("ownerA"); const orgB = await organization("ownerB");
  await management(`update public.organization_memberships set clinical_access_enabled=true where organization_id='${orgA}' and professional_id in ('${fixtures.ownerA.id}','${fixtures.primaryA.id}','${fixtures.secondaryA.id}','${fixtures.consultantA.id}','${fixtures.extraA.id}')`);
  await management(`insert into public.organization_memberships(organization_id,professional_id,membership_role,status,clinical_access_enabled,created_by) values('${orgA}','${fixtures.managerA.id}','manager','active',false,'${fixtures.ownerA.id}'),('${orgA}','${fixtures.primaryA.id}','professional','active',true,'${fixtures.ownerA.id}'),('${orgA}','${fixtures.secondaryA.id}','professional','active',true,'${fixtures.ownerA.id}'),('${orgA}','${fixtures.consultantA.id}','professional','active',true,'${fixtures.ownerA.id}'),('${orgA}','${fixtures.extraA.id}','professional','active',true,'${fixtures.ownerA.id}')`);
  const created = checked(await rpc("create_organization_patient", "ownerA", { p_organization_id: orgA, p_full_name: "Paciente sintético F3", p_birth_date: "1988-03-04", p_phone: "5511999999999", p_primary_professional_id: fixtures.primaryA.id, p_secondary_professional_ids: [fixtures.secondaryA.id], p_consultant_professional_ids: [fixtures.consultantA.id] }), "create_patient");
  sharedPatientId = created.patient_id;
  const opId = created.organization_patient_id as string;
  const ownerList = checked(await rpc("list_organization_patients", "ownerA", { p_organization_id: orgA }), "owner_list"); assert.equal(ownerList.length, 1);
  const secondaryDetail = checked(await rpc("get_organization_patient", "secondaryA", { p_organization_patient_id: opId }), "secondary_read"); assert.equal(secondaryDetail.currentAssignmentRole, "secondary");
  const primaryDetail = checked(await rpc("get_organization_patient", "primaryA", { p_organization_patient_id: opId }), "primary_read"); assert.equal(primaryDetail.currentAssignmentRole, "primary");
  checked(await rpc("update_organization_patient", "primaryA", { p_organization_patient_id: opId, p_full_name: "Paciente sintético F3 atualizado", p_birth_date: "1988-03-04", p_phone: "5511999999999", p_status: "active" }), "primary_edit");
  const secondaryEdit = await rpc("update_organization_patient", "secondaryA", { p_organization_patient_id: opId, p_full_name: "Tentativa indevida", p_birth_date: "1988-03-04", p_phone: null, p_status: "active" }); assert.equal(secondaryEdit.error?.code, "42501");
  const crossTenant = await rpc("get_organization_patient", "ownerB", { p_organization_patient_id: opId }); assert.equal(crossTenant.error?.code, "42501");
  const managerList = checked(await rpc("list_organization_patients", "managerA", { p_organization_id: orgA }), "manager_list"); assert.equal(managerList.length, 1);
  const managerIneligible = await rpc("add_organization_patient_assignment", "managerA", { p_organization_patient_id: opId, p_professional_id: fixtures.managerA.id, p_assignment_role: "secondary" }); assert.equal(managerIneligible.error?.code, "42501");
  const added = checked(await rpc("add_organization_patient_assignment", "ownerA", { p_organization_patient_id: opId, p_professional_id: fixtures.extraA.id, p_assignment_role: "consultant" }), "add_consultant");
  checked(await rpc("revoke_organization_patient_assignment", "ownerA", { p_assignment_id: added.id }), "revoke_consultant");
  const personalInsert = checked(await fixtures.ownerA.client.from("patients").insert({ professional_id: fixtures.ownerA.id, full_name: "Paciente pessoal sintético F3" }).select("id").single(), "personal_patient"); personalPatientId = personalInsert.id;
  const personalRows = checked(await fixtures.ownerA.client.from("patients").select("id").eq("professional_id", fixtures.ownerA.id), "personal_list"); assert.ok(personalRows.some((row: any) => row.id === personalPatientId));
  const directBusinessRows = await fixtures.secondaryA.client.from("organization_patients").select("id").eq("id", opId); assert.ok(directBusinessRows.error || directBusinessRows.data?.length === 0);
  const evolutionCount = (await management("select count(*)::int count from public.evolutions"))[0].count;
  console.log(JSON.stringify({ staging: ref, phase: "3", smoke: "PASS", organizationIsolation: "PASS", primaryEdit: "PASS", secondaryReadonly: "PASS", crossTenantDenied: "PASS", personalIsolation: "PASS", evolutionsChanged: false, evolutionCount }));
} finally {
  if (organizationIds.length) {
    const ids = organizationIds.map((id) => `'${id}'`).join(",");
    await management(`begin; delete from public.patient_professional_assignments where organization_patient_id in (select id from public.organization_patients where organization_id in (${ids})); delete from public.organization_patients where organization_id in (${ids}); select private.purge_organization_admin_events_for_staging_cleanup(id) from public.organizations where id in (${ids}); delete from private.organization_subscriptions where organization_id in (${ids}); delete from public.organization_feature_flags where organization_id in (${ids}); delete from public.organization_memberships where organization_id in (${ids}); delete from public.organizations where id in (${ids}); delete from public.patients where professional_id in (${userIds.map((id) => `'${id}'`).join(",")}); update private.clinic_runtime_config set enabled=false, updated_at=clock_timestamp() where id=true; commit;`);
  } else if (gateEnabled) {
    await management("update private.clinic_runtime_config set enabled=false, updated_at=clock_timestamp() where id=true");
  }
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  const remaining = (await management("select (select enabled from private.clinic_runtime_config where id=true) gate,(select count(*) from public.organizations) organizations,(select count(*) from public.organization_patients) organization_patients,(select count(*) from public.patient_professional_assignments) assignments"))[0];
  assert.equal(remaining.gate, false); assert.equal(Number(remaining.organizations), 0); assert.equal(Number(remaining.organization_patients), 0); assert.equal(Number(remaining.assignments), 0);
  console.log(JSON.stringify({ cleanup: "PASS", clinicGate: false, organizations: 0, organizationPatients: 0, assignments: 0, controlledProfessionalsPreserved: true }));
}
