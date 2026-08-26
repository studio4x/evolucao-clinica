import assert from 'node:assert/strict';

const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
const windowMock = {
  location: { pathname: '/login', search: '?utm_source=facebook&fbclid=opaque', hash: '' },
  fetch: async (url: string, init?: RequestInit) => {
    requests.push({ url, body: JSON.parse(String(init?.body)) as Record<string, unknown> });
    return new Response(null, { status: 204 });
  }
};
(globalThis as unknown as { window: typeof windowMock }).window = windowMock;

const telemetry = await import('../src/services/acquisitionTelemetry');
telemetry.resetAcquisitionTelemetryForTests();
assert.equal(telemetry.sendAcquisitionTelemetry('acquisition_arrival', {
  pathname: '/login?utm_source=facebook&fbclid=opaque',
  channel: 'Meta Ads (Facebook)',
  campaignPresent: true,
  platform: 'web'
}), true);
assert.equal(telemetry.sendAcquisitionTelemetry('acquisition_arrival', { pathname: '/login' }), false, 'Strict Mode não duplica chegada');
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(requests.length, 1);
assert.deepEqual(requests[0], {
  url: '/api/analytics/acquisition-telemetry',
  body: { eventName: 'acquisition_arrival', pathname: '/login', channel: 'meta_ads', campaignPresent: true, platform: 'web' }
});
assert.equal(JSON.stringify(requests).includes('fbclid'), false, 'telemetria first-party não envia query ou click id');
console.log('acquisition-telemetry.test.ts: OK');
