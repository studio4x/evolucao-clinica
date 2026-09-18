import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

export function loadRuntime() {
  assert.ok(process.argv.includes('--confirm-staging-only'), 'Staging confirmation required');
  assert.ok(process.env.F6_RUNTIME_FILE, 'Use an external temporary runtime file');
  const runtime = JSON.parse(readFileSync(process.env.F6_RUNTIME_FILE!, 'utf8'));
  assert.equal(runtime.ref, 'hwkdwinfckmjoriqxbjk');
  assert.equal(runtime.origin, 'https://staging.evolucaoclinica.app.br');
  assert.equal(runtime.projectId, 'prj_Hmm2uRREtw4qOqPf3Lhg78702hlM');
  assert.equal(runtime.stripeAccountId, 'acct_1TmBy9PI1KSTkIQA');
  assert.ok(/^(sk|rk)_test_/.test(runtime.stripeKey), 'Test credential required');
  return runtime;
}

export async function sql(runtime: any, query: string): Promise<any[]> {
  const response = await fetch(`https://api.supabase.com/v1/projects/${runtime.ref}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${runtime.managementToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const code = String(error.message || '').match(/ERROR:\s+([0-9A-Z]{5})/)?.[1] || 'failed';
    throw new Error(`staging_sql_${response.status}_${code}`);
  }
  return response.json();
}

export function quoteIds(values: string[]) {
  for (const value of values) assert.match(value, /^[0-9a-f-]{36}$/);
  return values.length ? values.map(value => `'${value}'`).join(',') : 'NULL';
}

export async function edgeSecrets(runtime: any, values?: Record<string, string>) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${runtime.ref}/secrets`, {
    method: values ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${runtime.managementToken}`, 'Content-Type': 'application/json' },
    ...(values ? { body: JSON.stringify(Object.entries(values).map(([name, value]) => ({ name, value }))) } : {}),
  });
  assert.ok(response.ok, `staging_secrets_${response.status}`);
  const body = await response.text();
  return body ? JSON.parse(body) : [];
}

export async function stripe(runtime: any, path: string, method = 'GET', fields?: Record<string, string>) {
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method, headers: { Authorization: `Bearer ${runtime.stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    ...(fields ? { body: new URLSearchParams(fields) } : {}),
  });
  const data = await response.json();
  assert.ok(data.livemode !== true && !data.data?.some((row: any) => row.livemode === true), 'ABORT: Stripe livemode detected');
  if (!response.ok) throw new Error(`stripe_test_${response.status}_${data.error?.code || data.error?.type || 'failed'}`);
  return data;
}
