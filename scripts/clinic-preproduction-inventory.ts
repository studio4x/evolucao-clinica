import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import dotenv from 'dotenv';
import { loadRuntime, sql, edgeSecrets, stripe } from './clinic-preproduction-runtime.js';

const runtime = loadRuntime();
const tables = await sql(runtime, `select n.nspname schema,c.relname name,c.relrowsecurity rls,c.relforcerowsecurity force_rls,
  (select count(*) from pg_policy p where p.polrelid=c.oid) policies,
  has_table_privilege('anon',c.oid,'SELECT') anon_select,has_table_privilege('anon',c.oid,'INSERT,UPDATE,DELETE') anon_write,
  has_table_privilege('authenticated',c.oid,'SELECT') authenticated_select,has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE') authenticated_write,
  has_table_privilege('service_role',c.oid,'SELECT') service_select
  from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and
  ((n.nspname='private' and c.relname ~ '(clinic|organization|runtime_environment)') or
  (n.nspname='public' and c.relname in ('organizations','organization_memberships','organization_invitations','organization_feature_flags','organization_patients','patient_professional_assignments','evolutions','patient_reports'))) order by 1,2`);
const functions = await sql(runtime, `select n.nspname schema,p.proname name,pg_get_function_identity_arguments(p.oid) args,p.prosecdef definer,p.proconfig config,
  has_function_privilege('anon',p.oid,'EXECUTE') anon_execute,has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated_execute,
  has_function_privilege('service_role',p.oid,'EXECUTE') service_execute,
  exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE') public_execute
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.proname ~ '(organization|clinic|invitation|active_owner)' order by 1,2,3`);
for (const table of tables) {
  assert.equal(table.rls, true, `${table.schema}.${table.name}: RLS`);
  if (table.schema === 'private') { assert.equal(table.authenticated_select, false); assert.equal(table.authenticated_write, false); assert.equal(table.anon_select, false); assert.equal(table.anon_write, false); }
}
for (const fn of functions) {
  assert.equal(fn.anon_execute, false, `${fn.name}: anon`);
  assert.equal(fn.public_execute, false, `${fn.name}: PUBLIC`);
  if (fn.definer) assert.ok(fn.config?.some((setting: string) => setting.startsWith('search_path=') && !setting.includes('pg_temp')), `${fn.name}: fixed search_path`);
}
const files = readdirSync('supabase/clinic-migrations').filter(file => file.endsWith('.sql')).sort();
const history = await sql(runtime, 'select version,name from supabase_migrations.schema_migrations order by version');
const definitions = await sql(runtime, `select n.nspname schema,p.proname name,p.prosrc body from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.proname ~ '(organization|clinic|invitation|active_owner)'`);
const latest = new Map<string, string>();
for (const file of files) {
  const source = readFileSync(`supabase/clinic-migrations/${file}`, 'utf8');
  for (const match of source.matchAll(/CREATE(?: OR REPLACE)? FUNCTION\s+(public|private)\.([a-z_]+)([\s\S]*?)\$\$([\s\S]*?)\$\$;/gi)) latest.set(`${match[1]}.${match[2]}`, match[4]);
}
const normalize = (body: string) => body.replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').trim();
const functionDrift = [...latest].map(([name, body]) => {
  const deployed = definitions.filter(row => `${row.schema}.${row.name}` === name);
  const expected = normalize(body), actual = normalize(deployed[0]?.body || '');
  let firstDifference = 0; while (firstDifference < expected.length && expected[firstDifference] === actual[firstDifference]) firstDifference++;
  return { name, matches: deployed.some(row => normalize(row.body) === expected), expectedLength: expected.length, actualLength: actual.length, firstDifference, expectedExcerpt: expected.slice(Math.max(0, firstDifference - 12), firstDifference + 55), actualExcerpt: actual.slice(Math.max(0, firstDifference - 12), firstDifference + 55) };
});
const catalog = await sql(runtime, 'select environment,plan_code,stripe_base_price_id,stripe_seat_price_id from private.clinic_stripe_catalog order by plan_code');
for (const row of catalog) { assert.equal(row.environment, 'test'); await stripe(runtime, `prices/${row.stripe_base_price_id}`); await stripe(runtime, `prices/${row.stripe_seat_price_id}`); }
const secrets = await edgeSecrets(runtime);
const env = dotenv.parse(readFileSync(process.env.SUPABASE_SMOKE_ENV_FILE || '.env.local'));
const candidates = [env.STRIPE_WEBHOOK_SECRET_TEST, runtime.stagingEnv.STRIPE_CLINIC_WEBHOOK_SECRET_TEST].filter(Boolean);
const digest = secrets.find((row: any) => row.name === 'STRIPE_CLINIC_WEBHOOK_SECRET_TEST')?.value;
const webhookSecret = candidates.find(value => value === digest || createHash('sha256').update(value).digest('hex') === digest);
if (webhookSecret) { runtime.webhookSecret = webhookSecret; writeFileSync(process.env.F6_RUNTIME_FILE!, JSON.stringify(runtime)); }
const webhookEndpoints = await stripe(runtime, 'webhook_endpoints?limit=100');
const report = { staging: runtime.ref, tables, functions, migrations: files.map(file => ({ file, sha256: createHash('sha256').update(readFileSync(`supabase/clinic-migrations/${file}`)).digest('hex'), stagingGuard: /environment_name\s*(?:<>|!=|=)\s*'staging'|staging-only|Staging-only/i.test(readFileSync(`supabase/clinic-migrations/${file}`, 'utf8')) })), history, catalog, edgeGates: secrets.filter((row: any) => /^(APP_ENV|CLINIC_BILLING_ENABLED|GOOGLE_INTEGRATIONS_ENABLED)$/.test(row.name)).map((row: any) => ({ name: row.name, falseDigest: row.value === createHash('sha256').update('false').digest('hex'), stagingDigest: row.value === createHash('sha256').update('staging').digest('hex') })), webhookReplayCredentialAvailable: !!webhookSecret, webhookEndpoints: webhookEndpoints.data.map((row: any) => ({ id: row.id, url: row.url, status: row.status, livemode: row.livemode })) };
assert.ok(process.env.F6_INVENTORY_FILE, 'Sanitized inventory output required');
Object.assign(report, { functionDrift });
writeFileSync(process.env.F6_INVENTORY_FILE!, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ inventory: 'PASS', tables: tables.length, functions: functions.length, manifest: files.length, recordedHistory: history.length, webhookReplayCredentialAvailable: !!webhookSecret, edgeGates: report.edgeGates, endpoints: report.webhookEndpoints }));
