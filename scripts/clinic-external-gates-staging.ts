// Fase 6B: one synthetic owner, one interactive subscription and a two-org gate probe.
// No invitation transport or SEND exists in this runner.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { loadRuntime, sql, quoteIds, stripe, edgeSecrets } from './clinic-preproduction-runtime.js';
import { assertTestResource } from './clinic-external-gates.js';
import { assertPilotGateMatrix } from './clinic-pilot-gates.js';

const runtime = loadRuntime();
assert.ok(process.env.F6B_CHECKPOINT_FILE && process.env.F6B_RESULT_FILE, 'External checkpoint/result paths required');
const checkpoint = process.env.F6B_CHECKPOINT_FILE!, output = process.env.F6B_RESULT_FILE!;
const run = randomUUID(), users: string[] = [], orgs: string[] = [];
const customerIds = new Set<string>(), subscriptionIds = new Set<string>(), checkoutIds = new Set<string>();
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(`https://${runtime.ref}.supabase.co`, runtime.serviceKey, options);
const owner = createClient(`https://${runtime.ref}.supabase.co`, runtime.anonKey, options);
const result: any = { phase: '6B', run, staging: runtime.ref, interactive: 'NOT_EXECUTED', stripeLivemode: false };
let baseline: any, organizationId: string | undefined;
function checked(value: any, label: string) { if (value.error) throw new Error(`${label}_${value.error.code || 'failed'}`); return value.data; }
function journal() { writeFileSync(`${output}.journal`, JSON.stringify({ run, users, orgs, customerIds: [...customerIds], subscriptionIds: [...subscriptionIds], checkoutIds: [...checkoutIds] })); }
async function discoverResources() {
  if (!orgs.length) return;
  for (const row of await sql(runtime, `select stripe_checkout_session_id,stripe_customer_id,stripe_subscription_id from private.organization_checkout_attempts where organization_id in (${quoteIds(orgs)})`)) {
    if (row.stripe_checkout_session_id) checkoutIds.add(row.stripe_checkout_session_id);
    if (row.stripe_customer_id) customerIds.add(row.stripe_customer_id);
    if (row.stripe_subscription_id) subscriptionIds.add(row.stripe_subscription_id);
  }
  for (const id of checkoutIds) { const session = await stripe(runtime, `checkout/sessions/${id}`); assertTestResource(session); if (session.subscription) subscriptionIds.add(typeof session.subscription === 'string' ? session.subscription : session.subscription.id); }
  journal();
}
async function pilotProbe(global: boolean, expectedA: boolean) {
  await sql(runtime, `update private.clinic_runtime_config set enabled=${global},updated_at=clock_timestamp() where id=true`);
  const reads = checked(await owner.from('organizations').select('id').in('id', orgs), 'pilot_rls');
  assert.equal(reads.some((row: any) => row.id === orgs[0]), expectedA);
  assert.equal(reads.some((row: any) => row.id === orgs[1]), false);
  const a = await owner.rpc('get_organization_dashboard', { p_organization_id: orgs[0] });
  const b = await owner.rpc('get_organization_dashboard', { p_organization_id: orgs[1] });
  if (expectedA) assert.equal(checked(a, 'pilot_a').scope, 'administrative'); else assert.equal(a.error?.code, '42501');
  assert.equal(b.error?.code, '42501');
  return { global, orgAFlag: true, orgBFlag: false, orgARead: expectedA ? 'ALLOWED_OWNER' : 'DENIED', orgBRead: 'DENIED', publicDashboardAndRls: 'PASS' };
}
try {
  baseline = (await sql(runtime, `select (select environment_name from private.runtime_environment where id=true) environment,(select enabled from private.clinic_runtime_config where id=true) gate,(select jsonb_agg(id order by id) from public.professionals) professionals,(select jsonb_agg(id order by id) from auth.users) auth_users,(select count(*) from public.organizations) organizations`))[0];
  assert.equal(baseline.environment, 'staging'); assert.equal(baseline.gate, false); assert.equal(Number(baseline.organizations), 0);
  assert.equal((await stripe(runtime, 'account')).id, runtime.stripeAccountId);
  for (const priceId of ['price_1UGJTnPI1KSTkIQAuk7DIIIo', 'price_1UGJTnPI1KSTkIQAxsHEU1my']) assertTestResource(await stripe(runtime, `prices/${priceId}`));
  const email = `clinic-f6b-${run.slice(0, 8)}@example.invalid`, password = randomBytes(24).toString('base64url');
  const generated = checked(await admin.auth.admin.generateLink({ type: 'signup', email, password }), 'owner_create');
  users.push(generated.user.id); journal();
  checked(await owner.auth.verifyOtp({ token_hash: generated.properties.hashed_token, type: 'signup' }), 'owner_confirm');
  const session = checked(await owner.auth.signInWithPassword({ email, password }), 'owner_auth');
  await sql(runtime, `update public.professionals set status='active',onboarding_completed=true,full_name='Owner sintético F6B',professional_register='SYNTHETIC-F6B' where id in (${quoteIds(users)}); update private.clinic_runtime_config set enabled=true,updated_at=clock_timestamp() where id=true`);
  await edgeSecrets(runtime, { CLINIC_BILLING_ENABLED: 'true' });
  organizationId = checked(await owner.rpc('create_organization_with_owner', { p_name: `Clínica sintética F6B ${run.slice(0, 8)}` }), 'organization_create').id;
  orgs.push(organizationId!); journal();
  await sql(runtime, `insert into public.organization_feature_flags(organization_id,feature_key,enabled,created_by,reason) values ('${organizationId}','clinic',true,'${users[0]}','F6B synthetic interactive fixture') on conflict(organization_id,feature_key) do update set enabled=true`);
  const magic = checked(await admin.auth.admin.generateLink({ type: 'magiclink', email, options: { redirectTo: `${runtime.origin}/painel/clinica/contratar` } }), 'owner_browser_auth');
  writeFileSync(checkpoint, JSON.stringify({ run, origin: runtime.origin, organizationId, organizationName: `Clínica sintética F6B ${run.slice(0, 8)}`, ownerActionLink: magic.properties.action_link, accessToken: session.session.access_token }));
  console.log(JSON.stringify({ checkpoint: 'INTERACTIVE_READY', run, organizationId, testAccountConfirmed: true, currency: 'brl', deliveryGate: 'OFF' }));
  const deadline = Date.now() + 1800000;
  while (!existsSync(`${checkpoint}.continue`)) { assert.ok(Date.now() < deadline, 'interactive_checkpoint_timeout'); await new Promise(resolve => setTimeout(resolve, 1500)); }
  const browserProof = JSON.parse(readFileSync(`${checkpoint}.continue`, 'utf8'));
  assert.equal(browserProof.returnedToStaging, true); assert.equal(browserProof.persistedConfirmationVisible, true);
  await discoverResources(); assert.equal(checkoutIds.size, 1, 'one interactive Checkout only');
  const checkout = await stripe(runtime, `checkout/sessions/${[...checkoutIds][0]}?expand[]=line_items.data.price`); assertTestResource(checkout);
  assert.equal(checkout.status, 'complete'); assert.equal(checkout.payment_status, 'paid');
  assert.equal(new URL(checkout.success_url).origin, runtime.origin);
  const subscription = await stripe(runtime, `subscriptions/${checkout.subscription}`); assertTestResource(subscription); assert.equal(subscription.status, 'active');
  assertTestResource(await stripe(runtime, `customers/${checkout.customer}`));
  assert.equal(subscription.items.data.length, 2);
  assert.equal(subscription.items.data.find((item: any) => item.price.id === 'price_1UGJTnPI1KSTkIQAuk7DIIIo').quantity, 1);
  assert.equal(subscription.items.data.find((item: any) => item.price.id === 'price_1UGJTnPI1KSTkIQAxsHEU1my').quantity, 3);
  const persisted = (await sql(runtime, `select s.financial_status,s.contracted_seats,private.organization_entitlement_mode(s.organization_id) entitlement,(select count(*) from private.organization_subscriptions where organization_id=s.organization_id) contracts,(select count(*) from private.clinic_stripe_events where organization_id=s.organization_id and event_type='checkout.session.completed' and processing_status='processed') completed_webhooks from private.organization_subscriptions s where organization_id='${organizationId}'`))[0];
  assert.equal(persisted.financial_status, 'active'); assert.equal(Number(persisted.contracted_seats), 3); assert.equal(persisted.entitlement, 'full'); assert.equal(Number(persisted.contracts), 1); assert.ok(Number(persisted.completed_webhooks) >= 1);
  result.interactive = 'PASS'; result.webhookAfterInteractive = 'PASS'; result.checkout = { id: checkout.id, status: checkout.status, paymentStatus: checkout.payment_status, livemode: false, currency: checkout.currency, successOrigin: runtime.origin };
  result.subscription = { id: subscription.id, status: subscription.status, livemode: false, baseQuantity: 1, seatQuantity: 3 }; result.persisted = persisted; result.browser = browserProof;
  const b = checked(await owner.rpc('create_organization_with_owner', { p_name: `Clínica sintética F6B B ${run.slice(0, 8)}` }), 'pilot_b_create'); orgs.push(b.id); journal();
  await sql(runtime, `insert into private.organization_subscriptions(organization_id,plan_code,billing_interval,currency,base_amount_minor,seat_amount_minor,minimum_contracted_seats,contracted_seats,financial_status) select '${b.id}',plan_code,billing_interval,currency,base_amount_minor,seat_amount_minor,minimum_contracted_seats,3,'active' from private.clinic_plan_catalog where plan_code='clinic_monthly'; update public.organizations set operational_status='active' where id='${b.id}'; insert into public.organization_feature_flags(organization_id,feature_key,enabled,created_by,reason) values ('${b.id}','clinic',false,'${users[0]}','F6B synthetic excluded organization') on conflict(organization_id,feature_key) do update set enabled=false`);
  result.pilotGateMatrix = { status: 'PASS', probes: [await pilotProbe(true, true), await pilotProbe(false, false)], financialFixtureB: 'SYNTHETIC_DB_ONLY' };
  assertPilotGateMatrix(result.pilotGateMatrix.probes);
} catch (error: any) {
  result.interactive = 'FAIL'; result.failureCode = String(error.message || 'unknown').replace(/eyJ[A-Za-z0-9._-]+/g, '[REDACTED]'); process.exitCode = 1;
} finally {
  await edgeSecrets(runtime, { CLINIC_BILLING_ENABLED: 'false' });
  await sql(runtime, 'update private.clinic_runtime_config set enabled=false,updated_at=clock_timestamp() where id=true');
  await discoverResources();
  for (const id of subscriptionIds) await stripe(runtime, `subscriptions/${id}`, 'DELETE');
  for (const id of checkoutIds) { const checkout = await stripe(runtime, `checkout/sessions/${id}`); if (checkout.status === 'open') await stripe(runtime, `checkout/sessions/${id}/expire`, 'POST', {}); }
  if (subscriptionIds.size) await new Promise(resolve => setTimeout(resolve, 3500));
  for (const id of customerIds) await stripe(runtime, `customers/${id}`, 'DELETE');
  await sql(runtime, `begin; select private.purge_organization_admin_events_for_staging_cleanup(id) from public.organizations where id in (${quoteIds(orgs)}); delete from private.clinic_billing_operations where organization_id in (${quoteIds(orgs)}); delete from private.clinic_stripe_events where organization_id in (${quoteIds(orgs)}); delete from private.clinic_stripe_transactions where organization_id in (${quoteIds(orgs)}); delete from private.organization_checkout_attempts where organization_id in (${quoteIds(orgs)}); delete from private.organization_subscriptions where organization_id in (${quoteIds(orgs)}); delete from public.organization_feature_flags where organization_id in (${quoteIds(orgs)}); delete from public.organization_memberships where organization_id in (${quoteIds(orgs)}); delete from public.organizations where id in (${quoteIds(orgs)}); commit;`);
  for (const id of users) checked(await admin.auth.admin.deleteUser(id), 'owner_cleanup');
  const after = (await sql(runtime, `select (select count(*) from public.organizations where id in (${quoteIds(orgs)})) organizations,(select count(*) from auth.users where id in (${quoteIds(users)})) users,(select count(*) from private.organization_admin_events where organization_id in (${quoteIds(orgs)})) audit,(select jsonb_agg(id order by id) from public.professionals) professionals,(select jsonb_agg(id order by id) from auth.users) auth_users`))[0];
  assert.equal(Number(after.organizations), 0); assert.equal(Number(after.users), 0); assert.equal(Number(after.audit), 0); if (baseline) { assert.deepEqual(after.professionals, baseline.professionals); assert.deepEqual(after.auth_users, baseline.auth_users); }
  result.cleanup = 'PASS'; result.stripeCleanup = 'PASS'; result.gateFinal = 'OFF'; result.preexistingIdsPreserved = true;
  writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
}
