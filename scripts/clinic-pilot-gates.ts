import assert from 'node:assert/strict';
export function assertPilotGateMatrix(probes: any[]) {
  assert.equal(probes.length, 2, 'Both global states required');
  for (const global of [true, false]) {
    const probe = probes.find(row => row.global === global);
    assert.ok(probe, 'Missing global state');
    assert.equal(probe.orgAFlag, true); assert.equal(probe.orgBFlag, false);
    assert.equal(probe.orgARead, global ? 'ALLOWED_OWNER' : 'DENIED');
    assert.equal(probe.orgBRead, 'DENIED');
    assert.equal(probe.publicDashboardAndRls, 'PASS');
  }
}
