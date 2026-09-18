// Runtime regression for SQL 42702: execute the joined aggregation with a real owner JWT.
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { randomUUID, randomBytes } from 'node:crypto';
import { loadRuntime, sql, quoteIds } from '../scripts/clinic-preproduction-runtime.js';

const runtime = loadRuntime();
const url = `https://${runtime.ref}.supabase.co`;
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, runtime.serviceKey, options);
const client = createClient(url, runtime.anonKey, options);
const users: string[] = [], orgs: string[] = [], patients: string[] = [];
function checked(value: any) { assert.ok(!value.error, `runtime_${value.error?.code}`); return value.data; }
try {
  assert.equal((await sql(runtime, 'select enabled from private.clinic_runtime_config where id=true'))[0].enabled, false);
  const created = checked(await admin.auth.admin.generateLink({ type: 'signup', email: `clinic-f6-dashboard-${randomUUID()}@example.invalid`, password: randomBytes(24).toString('base64url') }));
  users.push(created.user.id);
  checked(await client.auth.verifyOtp({ type: 'signup', token_hash: created.properties.hashed_token }));
  await sql(runtime, 'update private.clinic_runtime_config set enabled=true where id=true');
  const org = checked(await client.rpc('create_organization_with_owner', { p_name: 'Clínica sintética F6 regressão dashboard' })); orgs.push(org.id);
  await sql(runtime, `insert into private.organization_subscriptions(organization_id,plan_code,billing_interval,currency,base_amount_minor,seat_amount_minor,minimum_contracted_seats,contracted_seats,financial_status) values('${org.id}','clinic_monthly','monthly','BRL',4990,2990,3,3,'active')`);
  checked(await admin.rpc('set_organization_clinic_rollout_state', { p_organization_id: org.id, p_enabled: true, p_reason: 'F6 runtime dashboard regression' }));
  checked(await client.rpc('enable_organization_member_clinical_access', { p_organization_id: org.id, p_target_professional_id: users[0] }));
  const patient = checked(await client.rpc('create_organization_patient', { p_organization_id: org.id, p_full_name: 'Paciente sintético regressão dashboard', p_primary_professional_id: users[0] })); patients.push(patient.patient_id);
  const dashboard = checked(await client.rpc('get_organization_dashboard', { p_organization_id: org.id }));
  assert.equal(dashboard.scope, 'administrative'); assert.equal(dashboard.patients.active, 1);
  assert.equal(dashboard.assignments.active, 1); assert.equal(dashboard.assignments.primary, 1);
  console.log('clinic-dashboard staging regression PASS');
} finally {
  await sql(runtime, 'update private.clinic_runtime_config set enabled=false where id=true');
  const organizations = quoteIds(orgs);
  await sql(runtime, `begin; select private.purge_organization_admin_events_for_staging_cleanup(id) from public.organizations where id in (${organizations}); delete from public.patient_professional_assignments where organization_patient_id in (select id from public.organization_patients where organization_id in (${organizations})); delete from public.organization_patients where organization_id in (${organizations}); delete from private.organization_subscriptions where organization_id in (${organizations}); delete from public.organization_feature_flags where organization_id in (${organizations}); delete from public.organization_memberships where organization_id in (${organizations}); delete from public.organizations where id in (${organizations}); delete from public.patients where id in (${quoteIds(patients)}); commit;`);
  for (const id of users) checked(await admin.auth.admin.deleteUser(id));
  assert.equal(Number((await sql(runtime, `select count(*) count from auth.users where id in (${quoteIds(users)})`))[0].count), 0);
}
