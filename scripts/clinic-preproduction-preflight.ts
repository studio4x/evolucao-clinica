import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import dotenv from 'dotenv';

const ref = 'hwkdwinfckmjoriqxbjk';
const origin = 'https://staging.evolucaoclinica.app.br';
const env = dotenv.parse(readFileSync(process.env.SUPABASE_SMOKE_ENV_FILE || '.env.local'));
assert.ok(env.SUPABASE_ACCESS_TOKEN, 'Management credential required');
async function json(url: string, token: string, init: RequestInit = {}) {
  const response = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init.headers } });
  if (!response.ok) throw new Error(`preflight_http_${response.status}_${new URL(url).hostname}`);
  return response.json();
}
const keys = await json(`https://api.supabase.com/v1/projects/${ref}/api-keys`, env.SUPABASE_ACCESS_TOKEN);
const serviceKey = keys.find((key: any) => key.name === 'service_role')?.api_key;
const anonKey = keys.find((key: any) => key.name === 'anon')?.api_key;
for (const key of [anonKey, serviceKey]) assert.equal(JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).ref, ref);
const candidates = [
  [env.VERCEL_TARGET_TOKEN, env.VERCEL_TARGET_TEAM_ID],
  [env.VERCEL_ACCESS_TOKEN, undefined],
  [env.VERCEL_SOURCE_TOKEN, env.VERCEL_SOURCE_TEAM_ID],
];
let project: any; let vercelToken = ''; let teamId = '';
for (const [token, team] of candidates) {
  if (!token) continue;
  try { project = await json(`https://api.vercel.com/v9/projects/evolucao-clinica-staging${team ? `?teamId=${team}` : ''}`, token); vercelToken = token; teamId = team || project.accountId; break; } catch { /* Try another already configured account, read only. */ }
}
assert.equal(project?.name, 'evolucao-clinica-staging', 'Authorized staging project required');
const query = `?teamId=${teamId}`;
const alias = await json(`https://api.vercel.com/v4/aliases/staging.evolucaoclinica.app.br${query}`, vercelToken);
const deployment = await json(`https://api.vercel.com/v13/deployments/${alias.deployment?.id || alias.deploymentId}${query}`, vercelToken);
const variables = await json(`https://api.vercel.com/v10/projects/${project.id}/env${query}`, vercelToken);
const decrypted: any[] = [];
const relevant = variables.envs.filter((row: any) => row.target?.includes('production'));
for (let offset = 0; offset < relevant.length; offset += 6) decrypted.push(...await Promise.all(relevant.slice(offset, offset + 6).map((row: any) => json(`https://api.vercel.com/v1/projects/${project.id}/env/${row.id}${query}`, vercelToken))));
const stagingEnv = Object.fromEntries(decrypted.map((row: any) => [row.key, row.value]));
const gateValue = (key: string) => stagingEnv[key] ?? (decrypted.some((row: any) => row.key === key && row.type === 'sensitive') ? 'SENSITIVE_UNREADABLE' : 'UNSET');
assert.ok(stagingEnv.APP_ENV === 'staging', 'Vercel staging runtime required');
assert.ok(stagingEnv.EXPECTED_SUPABASE_PROJECT_REF === ref, 'Vercel staging database required');
const bypass = Object.entries(project.protectionBypass || {}).find(([, value]: any) => value.scope === 'automation-bypass')?.[0] || '';
const healthResponse = await fetch(`${origin}/api/health`, { redirect: 'manual', headers: bypass ? { 'x-vercel-protection-bypass': bypass } : {} });
const health = healthResponse.headers.get('content-type')?.includes('application/json') ? await healthResponse.json() : null;
const stripeKey = env.STRIPE_SECRET_KEY_TEST || stagingEnv.STRIPE_SECRET_KEY_TEST;
assert.match(stripeKey || '', /^(sk|rk)_test_/);
const stripeAccount = await json('https://api.stripe.com/v1/account', stripeKey);
const baseline = await json(`https://api.supabase.com/v1/projects/${ref}/database/query`, env.SUPABASE_ACCESS_TOKEN, { method: 'POST', body: JSON.stringify({ query: "select (select environment_name from private.runtime_environment where id=true) environment,(select enabled from private.clinic_runtime_config where id=true) gate,(select count(*) from public.organizations) organizations,(select count(*) from public.professionals) professionals" }) });
const flags = ['CLINIC_FEATURE_ENABLED', 'VITE_CLINIC_FEATURE_ENABLED', 'CLINIC_INVITATION_DELIVERY_ENABLED', 'CLINIC_BILLING_ENABLED', 'GOOGLE_INTEGRATIONS_ENABLED', 'VITE_GOOGLE_INTEGRATIONS_ENABLED'];
const report = { ref, projectId: project.id, teamId, deployment: { id: deployment.id, state: deployment.readyState, sha: deployment.meta?.githubCommitSha, branch: deployment.meta?.githubCommitRef }, health: { status: healthResponse.status, redirected: healthResponse.status >= 300, json: !!health, body: health }, flags: Object.fromEntries(flags.map((key) => [key, gateValue(key)])), baseline, stripe: { accountId: stripeAccount.id, keyMode: 'test' }, brevo: { host: stagingEnv.CLINIC_INVITATION_SMTP_HOST || '', credentialConfigured: !!stagingEnv.CLINIC_INVITATION_SMTP_PASS, fromConfigured: !!stagingEnv.CLINIC_INVITATION_SMTP_FROM, trackingDisabled: stagingEnv.CLINIC_INVITATION_SMTP_TRACKING_DISABLED, deliveryEnabled: gateValue('CLINIC_INVITATION_DELIVERY_ENABLED') } };
console.log(JSON.stringify(report, null, 2));
if (process.env.F6_RUNTIME_FILE) writeFileSync(process.env.F6_RUNTIME_FILE, JSON.stringify({ ref, origin, managementToken: env.SUPABASE_ACCESS_TOKEN, serviceKey, anonKey, vercelToken, teamId, projectId: project.id, bypass, stripeKey, stripeAccountId: stripeAccount.id, stagingEnv, envIds: variables.envs.map((row: any) => ({ id: row.id, key: row.key, target: row.target })) }));
