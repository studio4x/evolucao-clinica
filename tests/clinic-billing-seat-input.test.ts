import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Execute actual Deno source with only infrastructure boundaries replaced.
const shared = readFileSync('supabase/functions/_shared/clinicBilling.ts', 'utf8').replace(/^import .*\r?\n/gm, '');
const source = readFileSync('supabase/functions/clinic-billing-seats/index.ts', 'utf8').replace(/import[\s\S]*?from [^;]+;/g, '');
const scope: any = { exports: {}, Response, Request, console: { error() {} } };
vm.runInNewContext(ts.transpileModule(shared, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, scope);
Object.assign(scope, scope.exports, {
  serve(handler: any) { scope.handler = handler; },
  createClinicAdminClient() { return {}; },
  requireClinicUser: async () => ({ id: '524d7ed9-55ce-4451-b410-5187b8346da8' }),
  assertClinicBillingOwnerAuthorized: async () => {},
  getClinicConfig: async () => ({ secretKey: 'test-only-infrastructure-stub' }),
  createClinicStripe() { return {}; },
  assertSandboxAccount: async () => {},
  recoverStaleClinicBillingOperation() { throw new Error('Invalid input reached recovery'); },
});
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, scope);
for (const contractedSeats of [2, 0, -1, 3.5, 10001, 'invalid', null]) {
  const response = await scope.handler(new Request('https://staging.example.invalid', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ organizationId: '524d7ed9-55ce-4451-b410-5187b8346da8', contractedSeats, idempotencyKey: '35b353ff-710d-43ae-a9b4-6f4501098d57' }) }));
  assert.equal(response.status, 400);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('vary'), 'Authorization');
  assert.equal((await response.json()).error, 'invalid_seat_quantity');
}
assert.equal(scope.requireSeats(3), 3); assert.equal(scope.requireSeats(10000), 10000);
console.log('clinic billing invalid seats runtime regression PASS');
