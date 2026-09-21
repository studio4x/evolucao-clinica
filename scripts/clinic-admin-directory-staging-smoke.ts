import assert from 'node:assert/strict';

assert(process.argv.includes('--confirm-staging-only'), 'Staging confirmation required');
const ref = process.env.SUPABASE_STAGING_PROJECT_REF || 'hwkdwinfckmjoriqxbjk';
const url = process.env.SUPABASE_STAGING_URL || `https://${ref}.supabase.co`;
const serviceRoleKey = process.env.SUPABASE_STAGING_SERVICE_ROLE_KEY;
assert.equal(ref, 'hwkdwinfckmjoriqxbjk');
assert.equal(url, 'https://hwkdwinfckmjoriqxbjk.supabase.co');
assert.ok(serviceRoleKey, 'SUPABASE_STAGING_SERVICE_ROLE_KEY is required');

const response = await fetch(`${url}/rest/v1/rpc/list_admin_clinic_directory`, {
  method: 'POST',
  headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, 'Content-Type': 'application/json' },
  body: '{}',
});
assert.equal(response.status, 200, `directory_rpc_${response.status}`);
const rows = await response.json() as any[];
assert.equal(rows.length, 1, 'Expected the preserved staging fixture only');
const fixture = rows.find((row) => row.name === 'Clínica Sintética — Brevo Controlled Delivery');
assert.ok(fixture, 'Preserved clinic fixture missing');
assert.equal(fixture.operationalStatus, 'active');
assert.equal(fixture.featureEnabled, true);
assert.equal(fixture.subscription?.contractedSeats, 3);
assert.deepEqual(fixture.seatUsage, { activeSeats: 1, reservedSeats: 0, availableSeats: 2, minimumSeats: 3 });
assert.deepEqual(fixture.members, { total: 2, clinical: 1, administrative: 1 });
assert.equal(fixture.pendingInvitations?.total, 0);
assert.equal(fixture.ownerIntegrity, 'OK');
assert.doesNotMatch(JSON.stringify(rows), /patients|organization_patients|evolutions|anamnese|report|clinical.?notes|transcription|document/i);
console.log(JSON.stringify({ rpc: 'PASS', rowCount: rows.length, fixture: 'PASS', operationalStatus: fixture.operationalStatus, featureEnabled: fixture.featureEnabled, contractedSeats: fixture.subscription.contractedSeats, activeSeats: fixture.seatUsage.activeSeats, reservedSeats: fixture.seatUsage.reservedSeats, availableSeats: fixture.seatUsage.availableSeats, minimumSeats: fixture.seatUsage.minimumSeats, members: fixture.members, pendingInvitations: fixture.pendingInvitations.total, ownerIntegrity: fixture.ownerIntegrity, clinicalDataExposed: false }));
