import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const serviceWorkerSource = fs.readFileSync("public/sw.js", "utf8");

type MockRequest = {
  method: string;
  url: string;
  destination: string;
  mode: string;
  cache: RequestCache;
};

function createServiceWorkerHarness() {
  const listeners = new Map<string, (event: any) => void>();
  const cacheOperations: string[] = [];
  const networkRequests: MockRequest[] = [];

  const cache = {
    put: async () => {
      cacheOperations.push("put");
    },
  };
  const cachesApi = {
    match: async () => {
      cacheOperations.push("match");
      return undefined;
    },
    open: async () => {
      cacheOperations.push("open");
      return cache;
    },
    keys: async () => [],
    delete: async () => true,
  };

  const networkFetch = async (request: MockRequest) => {
    networkRequests.push(request);
    return new Response("network", { status: 200 });
  };

  const self = {
    location: {
      href: "https://staging.evolucaoclinica.app.br/sw.js?v=v1.10.903",
      origin: "https://staging.evolucaoclinica.app.br",
    },
    addEventListener: (type: string, listener: (event: any) => void) => listeners.set(type, listener),
    skipWaiting: () => undefined,
    clients: { claim: async () => undefined },
  };

  vm.runInNewContext(serviceWorkerSource, {
    URL,
    Response,
    caches: cachesApi,
    console,
    fetch: networkFetch,
    self,
  });

  async function dispatch(request: MockRequest) {
    let responsePromise: Promise<Response> | undefined;
    const event = {
      request,
      respondWith: (response: Promise<Response>) => {
        responsePromise = response;
      },
    };
    listeners.get("fetch")?.(event);
    return {
      intercepted: responsePromise !== undefined,
      response: responsePromise ? await responsePromise : undefined,
    };
  }

  return { cacheOperations, dispatch, networkFetch, networkRequests };
}

const request = (url: string, overrides: Partial<MockRequest> = {}): MockRequest => ({
  method: "GET",
  url: `https://staging.evolucaoclinica.app.br${url}`,
  destination: "",
  mode: "cors",
  cache: "default",
  ...overrides,
});

const harness = createServiceWorkerHarness();

for (const path of [
  "/api/clinic/patients",
  "/api/clinic/patients?id=organization-patient-01",
  "/api/clinic/contexts",
  "/api/clinic/invitations",
]) {
  const result = await harness.dispatch(request(path));
  assert.equal(result.intercepted, false, `${path} must bypass the service worker`);
}

const noStoreResult = await harness.dispatch(request("/api/future-dynamic-endpoint", { cache: "no-store" }));
assert.equal(noStoreResult.intercepted, false, "explicit no-store requests must bypass the service worker");
assert.deepEqual(harness.cacheOperations, [], "network-only API requests must not inspect or write Cache Storage");

const staticAssetResult = await harness.dispatch(request("/assets/app.js", {
  destination: "script",
  mode: "same-origin",
}));
assert.equal(staticAssetResult.intercepted, true, "static assets must keep the normal cache strategy");

const patientNames: string[] = [];
const originalNetworkFetch = harness.networkFetch;
const browserFetch = async (patientRequest: MockRequest) => {
  const serviceWorkerResult = await harness.dispatch(patientRequest);
  if (serviceWorkerResult.intercepted) return serviceWorkerResult.response;
  if (patientRequest.method === "POST") patientNames.push("Paciente 01");
  return originalNetworkFetch(patientRequest);
};

await browserFetch(request("/api/clinic/patients"));
await browserFetch(request("/api/clinic/patients", { method: "POST" }));
await browserFetch(request("/api/clinic/patients"));

assert.deepEqual(patientNames, ["Paciente 01"], "the POST must update the simulated network state");
assert.equal(
  harness.networkRequests.filter(({ method, url }) => method === "GET" && url.endsWith("/api/clinic/patients")).length,
  2,
  "GET list before and after creation must both reach the network",
);

console.log("clinic PWA cache bypass and GET-POST-GET regression: PASS");
