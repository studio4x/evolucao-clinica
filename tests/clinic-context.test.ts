import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerClinicContextRoutes, resolveClinicOrganizations } from "../server/clinic/clinicContextRoutes.js";
import { clinicContextStorageKey, useClinicContextStore } from "../src/store/clinicContextStore";
import { selectAcceptedClinicContext } from "../src/utils/clinicInvitationAccess";

const routeSource = readFileSync("server/clinic/clinicContextRoutes.ts", "utf8");
const selectorSource = readFileSync("src/components/clinic/ClinicContextSelector.tsx", "utf8");
const publicFlagsSource = readFileSync("src/config/publicFlags.ts", "utf8");
const appSource = readFileSync("src/App.tsx", "utf8");
const layoutSource = readFileSync("src/components/Layout.tsx", "utf8");
const storeSource = readFileSync("src/store/clinicContextStore.ts", "utf8");
const acceptSource = readFileSync("src/pages/ClinicInvitationAccept.tsx", "utf8");

assert.match(routeSource, /app\.get\("\/api\/clinic\/contexts"/);
assert.match(routeSource, /organization_memberships/);
assert.match(routeSource, /organizations!inner\(id,name,trade_name,operational_status\)/);
assert.match(routeSource, /createUserScopedClient/);
assert.doesNotMatch(routeSource, /serviceRoleKey|SUPABASE_SERVICE_ROLE_KEY/);
assert.match(routeSource, /\.eq\("professional_id", userId\)/);
assert.doesNotMatch(routeSource, /req\.(query|body|params).*professional_id/);
assert.match(routeSource, /Cache-Control/);
assert.match(routeSource, /feature_unavailable/);
assert.match(routeSource, /authentication_required/);
assert.doesNotMatch(routeSource, /\.filter\(\(organization\) => organization\.operationalStatus !== "archived" && organization\.clinicalAccessEnabled/);
assert.doesNotMatch(storeSource, /clinicalAccessEnabled === true/);
assert.match(selectorSource, /publicEffectFlags\.clinicFeature/);
assert.match(publicFlagsSource, /VITE_CLINIC_FEATURE_ENABLED/);
assert.match(appSource, /ClinicRoute/);
assert.match(appSource, /PersonalContextRoute/);
assert.match(layoutSource, /md:hidden/);
assert.match(selectorSource, /aria-label="Selecionar contexto"/);
assert.match(storeSource, /refreshAfterMutation/);
assert.match(storeSource, /currentGeneration\(userId\) !== generation/);
assert.match(acceptSource, /supabase\.auth\.signOut\(\)/);
assert.match(acceptSource, /Sair e acessar com outra conta/);

const mixedMembershipRows = [
  { status: "active", membership_role: "owner", clinical_access_enabled: false, organizations: { id: "org-owner", name: "Clínica Owner", trade_name: null, operational_status: "active" } },
  { status: "active", membership_role: "manager", clinical_access_enabled: false, organizations: { id: "org-manager", name: "Clínica Manager", trade_name: null, operational_status: "active" } },
  { status: "active", membership_role: "professional", clinical_access_enabled: false, organizations: { id: "org-professional", name: "Clínica Professional", trade_name: null, operational_status: "active" } },
  { status: "active", membership_role: "professional", clinical_access_enabled: true, organizations: { id: "org-clinical", name: "Clínica Clinical", trade_name: null, operational_status: "active" } },
  { status: "suspended", membership_role: "owner", clinical_access_enabled: true, organizations: { id: "org-suspended", name: "Clínica Suspensa", trade_name: null, operational_status: "active" } },
  { status: "removed", membership_role: "owner", clinical_access_enabled: true, organizations: { id: "org-removed", name: "Clínica Removida", trade_name: null, operational_status: "active" } },
  { status: "active", membership_role: "owner", clinical_access_enabled: true, organizations: { id: "org-archived", name: "Clínica Arquivada", trade_name: null, operational_status: "archived" } },
  { status: "removed", membership_role: "professional", clinical_access_enabled: true, organizations: { id: "org-history", name: "Clínica Histórica", trade_name: null, operational_status: "active" } },
  { status: "active", membership_role: "professional", clinical_access_enabled: false, organizations: { id: "org-history", name: "Clínica Histórica", trade_name: null, operational_status: "active" } },
];
const resolvedOrganizations = resolveClinicOrganizations(mixedMembershipRows);
assert.deepEqual(resolvedOrganizations.map(({ id }) => id), ["org-owner", "org-manager", "org-professional", "org-clinical", "org-history"]);
assert.equal(resolvedOrganizations.find(({ id }) => id === "org-owner")?.clinicalAccessEnabled, false);
assert.equal(resolvedOrganizations.find(({ id }) => id === "org-manager")?.clinicalAccessEnabled, false);
assert.equal(resolvedOrganizations.find(({ id }) => id === "org-professional")?.clinicalAccessEnabled, false);
assert.equal(resolvedOrganizations.find(({ id }) => id === "org-clinical")?.clinicalAccessEnabled, true);
assert.equal(resolvedOrganizations.find(({ id }) => id === "org-history")?.clinicalAccessEnabled, false);

let capturedHandler: ((request: any, response: any) => Promise<unknown>) | null = null;
let capturedMiddleware: unknown;
registerClinicContextRoutes(
  { get: (_path: string, middleware: unknown, handler: (request: any, response: any) => Promise<unknown>) => { capturedMiddleware = middleware; capturedHandler = handler; } },
  { requireAuth: () => undefined, supabaseUrl: "https://staging.example.com", supabaseAnonKey: "anon-test", clinicFeatureEnabled: false },
);
assert.equal(typeof capturedMiddleware, "function");
assert.ok(capturedHandler);
let responseStatus = 200;
let responseBody: any = null;
const response = {
  setHeader: () => undefined,
  status: (status: number) => { responseStatus = status; return response; },
  json: (body: unknown) => { responseBody = body; return body; },
};
await capturedHandler?.({ headers: { authorization: "Bearer token" }, user: { id: "user-a" } }, response);
assert.equal(responseStatus, 503);
assert.deepEqual(responseBody, { ok: false, error: "feature_unavailable" });

const storage = new Map<string, string>();
(globalThis as any).window = {
  sessionStorage: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  },
};

let contexts = [{
  id: "org-a",
  name: "Clínica A",
  tradeName: "A Saúde",
  operationalStatus: "active",
  membershipRole: "owner",
  clinicalAccessEnabled: false,
}];
(globalThis as any).fetch = async () => new Response(JSON.stringify({ personal: { available: true }, organizations: contexts }), {
  status: 200,
  headers: { "Content-Type": "application/json" },
});

useClinicContextStore.getState().reset();
await useClinicContextStore.getState().hydrateForUser("user-a", "token-a");
let state = useClinicContextStore.getState();
assert.equal(state.status, "ready");
assert.equal(state.activeContext.type, "personal");
assert.equal(state.organizations[0]?.id, "org-a");

state.selectContext({ type: "organization", organizationId: "org-a" });
assert.deepEqual(useClinicContextStore.getState().activeContext, { type: "organization", organizationId: "org-a" });
assert.equal(storage.has(clinicContextStorageKey("user-a")), true);

contexts = [];
await useClinicContextStore.getState().revalidateForUser("user-a", "token-a");
state = useClinicContextStore.getState();
assert.deepEqual(state.activeContext, { type: "personal" });
assert.equal(state.organizations.length, 0);
assert.equal(storage.has(clinicContextStorageKey("user-a")), false);

contexts = [{
  id: "org-b",
  name: "Clínica B",
  tradeName: null,
  operationalStatus: "active",
  membershipRole: "manager",
  clinicalAccessEnabled: false,
}];
await useClinicContextStore.getState().hydrateForUser("user-b", "token-b");
state = useClinicContextStore.getState();
assert.equal(state.userId, "user-b");
assert.deepEqual(state.activeContext, { type: "personal" });
assert.equal(storage.has(clinicContextStorageKey("user-a")), false);

let fetchCount = 0;
let releaseInitialContexts!: (response: Response) => void;
const initialContextsPending = new Promise<Response>((resolve) => { releaseInitialContexts = resolve; });
(globalThis as any).fetch = async () => {
  fetchCount += 1;
  if (fetchCount === 1) return initialContextsPending;
  return new Response(JSON.stringify({ personal: { available: true }, organizations: [{
    id: "org-new", name: "Clínica Nova", tradeName: null, operationalStatus: "active",
    membershipRole: "professional", clinicalAccessEnabled: true,
  }] }), { status: 200, headers: { "Content-Type": "application/json" } });
};

useClinicContextStore.getState().reset();
const initialHydration = useClinicContextStore.getState().hydrateForUser("user-a", "token-a");
assert.equal(fetchCount, 1);
const firstRevalidation = useClinicContextStore.getState().revalidateForUser("user-a", "token-a");
const secondRevalidation = useClinicContextStore.getState().revalidateForUser("user-a", "token-a");
await Promise.resolve();
assert.equal(fetchCount, 1);
releaseInitialContexts(new Response(JSON.stringify({ personal: { available: true }, organizations: [{
  id: "org-old", name: "Clínica Antiga", tradeName: null, operationalStatus: "active",
  membershipRole: "professional", clinicalAccessEnabled: true,
}] }), { status: 200, headers: { "Content-Type": "application/json" } }));
await Promise.all([initialHydration, firstRevalidation, secondRevalidation]);
assert.equal(fetchCount, 2);
state = useClinicContextStore.getState();
assert.deepEqual(state.organizations.map(({ id }) => id), ["org-new"]);
state.selectContext({ type: "organization", organizationId: "org-new" });
assert.deepEqual(useClinicContextStore.getState().activeContext, { type: "organization", organizationId: "org-new" });

// A post-accept refresh must not reuse the pre-accept revalidation. The stale
// response is released first here, proving that the second network request is
// still required before the accepted organization can be selected.
useClinicContextStore.getState().reset();
(globalThis as any).fetch = async () => new Response(JSON.stringify({ personal: { available: true }, organizations: [] }), {
  status: 200, headers: { "Content-Type": "application/json" },
});
await useClinicContextStore.getState().hydrateForUser("user-a", "token-a");
let mutationFetchCount = 0;
let releasePreAccept!: (response: Response) => void;
let releasePostAccept!: (response: Response) => void;
const preAcceptPending = new Promise<Response>((resolve) => { releasePreAccept = resolve; });
const postAcceptPending = new Promise<Response>((resolve) => { releasePostAccept = resolve; });
(globalThis as any).fetch = async () => {
  mutationFetchCount += 1;
  return mutationFetchCount === 1 ? preAcceptPending : postAcceptPending;
};
const preAcceptRevalidation = useClinicContextStore.getState().revalidateForUser("user-a", "token-a");
await Promise.resolve();
assert.equal(mutationFetchCount, 1);
const postAcceptRefresh = useClinicContextStore.getState().refreshAfterMutation("user-a", "token-a");
await Promise.resolve();
assert.equal(mutationFetchCount, 2);
releasePreAccept(new Response(JSON.stringify({ personal: { available: true }, organizations: [] }), {
  status: 200, headers: { "Content-Type": "application/json" },
}));
await Promise.resolve();
assert.equal(useClinicContextStore.getState().organizations.length, 0);
releasePostAccept(new Response(JSON.stringify({ personal: { available: true }, organizations: [{
  id: "org-accepted", name: "Clínica Aceita", tradeName: null, operationalStatus: "active",
  membershipRole: "professional", clinicalAccessEnabled: true,
}] }), { status: 200, headers: { "Content-Type": "application/json" } }));
await Promise.all([preAcceptRevalidation, postAcceptRefresh]);
state = useClinicContextStore.getState();
assert.deepEqual(state.organizations.map(({ id }) => id), ["org-accepted"]);
selectAcceptedClinicContext(state, "org-accepted");
assert.deepEqual(useClinicContextStore.getState().activeContext, { type: "organization", organizationId: "org-accepted" });

// If the fresh request wins the race, the old pre-mutation response must not
// revert the organization or start a third request.
useClinicContextStore.getState().reset();
(globalThis as any).fetch = async () => new Response(JSON.stringify({ personal: { available: true }, organizations: [] }), {
  status: 200, headers: { "Content-Type": "application/json" },
});
await useClinicContextStore.getState().hydrateForUser("user-a", "token-a");
let staleFetchCount = 0;
let releaseStale!: (response: Response) => void;
let releaseFresh!: (response: Response) => void;
const stalePending = new Promise<Response>((resolve) => { releaseStale = resolve; });
const freshPending = new Promise<Response>((resolve) => { releaseFresh = resolve; });
(globalThis as any).fetch = async () => {
  staleFetchCount += 1;
  return staleFetchCount === 1 ? stalePending : freshPending;
};
const staleRevalidation = useClinicContextStore.getState().revalidateForUser("user-a", "token-a");
const freshRefresh = useClinicContextStore.getState().refreshAfterMutation("user-a", "token-a");
await Promise.resolve();
assert.equal(staleFetchCount, 2);
releaseFresh(new Response(JSON.stringify({ personal: { available: true }, organizations: [{
  id: "org-race", name: "Clínica Race", tradeName: null, operationalStatus: "active",
  membershipRole: "professional", clinicalAccessEnabled: true,
}] }), { status: 200, headers: { "Content-Type": "application/json" } }));
await freshRefresh;
assert.deepEqual(useClinicContextStore.getState().organizations.map(({ id }) => id), ["org-race"]);
releaseStale(new Response(JSON.stringify({ personal: { available: true }, organizations: [] }), {
  status: 200, headers: { "Content-Type": "application/json" },
}));
await staleRevalidation;
assert.equal(staleFetchCount, 2);
assert.deepEqual(useClinicContextStore.getState().organizations.map(({ id }) => id), ["org-race"]);

const acceptedState: { organizations: { id: string }[]; activeContext: { type: "personal" } | { type: "organization"; organizationId: string }; selectContext: (context: { type: "organization"; organizationId: string }) => void } = {
  organizations: [{ id: "org-pending" }], activeContext: { type: "personal" }, selectContext(context) {
    this.activeContext = context;
  },
};
selectAcceptedClinicContext(acceptedState, "org-pending");
assert.deepEqual(acceptedState.activeContext, { type: "organization", organizationId: "org-pending" });
assert.throws(() => selectAcceptedClinicContext({
  organizations: [],
  selectContext: acceptedState.selectContext,
}, "org-pending"), /context_unavailable/);

let releaseUserA!: (response: Response) => void;
const userAPending = new Promise<Response>((resolve) => { releaseUserA = resolve; });
(globalThis as any).fetch = async (_input: unknown, init?: RequestInit) => {
  if (init?.headers && String(new Headers(init.headers).get("Authorization")) === "Bearer token-a") return userAPending;
  return new Response(JSON.stringify({ personal: { available: true }, organizations: [{
    id: "org-b", name: "Clínica B", tradeName: null, operationalStatus: "active",
    membershipRole: "manager", clinicalAccessEnabled: false,
  }] }), { status: 200, headers: { "Content-Type": "application/json" } });
};

useClinicContextStore.getState().reset();
const pendingUserAHydration = useClinicContextStore.getState().hydrateForUser("user-a", "token-a");
const userBHydration = useClinicContextStore.getState().hydrateForUser("user-b", "token-b");
await userBHydration;
assert.equal(useClinicContextStore.getState().userId, "user-b");
assert.deepEqual(useClinicContextStore.getState().organizations.map(({ id }) => id), ["org-b"]);
releaseUserA(new Response(JSON.stringify({ personal: { available: true }, organizations: [{
  id: "org-a", name: "Clínica A", tradeName: null, operationalStatus: "active",
  membershipRole: "professional", clinicalAccessEnabled: true,
}] }), { status: 200, headers: { "Content-Type": "application/json" } }));
await pendingUserAHydration;
assert.equal(useClinicContextStore.getState().userId, "user-b");
assert.deepEqual(useClinicContextStore.getState().organizations.map(({ id }) => id), ["org-b"]);

useClinicContextStore.getState().reset();
assert.equal(useClinicContextStore.getState().userId, null);
assert.equal(useClinicContextStore.getState().organizations.length, 0);

// The accept route can finish before global auth hydration initializes this
// store. A mutation refresh must still fetch and authorize the new membership.
let coldRefreshRequests = 0;
(globalThis as any).fetch = async () => {
  coldRefreshRequests += 1;
  return new Response(JSON.stringify({ personal: { available: true }, organizations: [{
    id: "org-cold", name: "Clínica Cold", tradeName: null, operationalStatus: "active",
    membershipRole: "professional", clinicalAccessEnabled: true,
  }] }), { status: 200, headers: { "Content-Type": "application/json" } });
};
await useClinicContextStore.getState().refreshAfterMutation("user-cold", "token-cold");
assert.equal(coldRefreshRequests, 1);
state = useClinicContextStore.getState();
assert.equal(state.userId, "user-cold");
assert.equal(state.status, "ready");
selectAcceptedClinicContext(state, "org-cold");
assert.deepEqual(useClinicContextStore.getState().activeContext, { type: "organization", organizationId: "org-cold" });

// A refresh for an earlier account cannot replace the current account's list.
await useClinicContextStore.getState().refreshAfterMutation("user-previous", "token-previous");
assert.equal(coldRefreshRequests, 1);
assert.equal(useClinicContextStore.getState().userId, "user-cold");
assert.throws(() => selectAcceptedClinicContext(useClinicContextStore.getState(), "org-forged"), /context_unavailable/);

// A new login does not inherit a selection; explicit, server-validated entry
// can select the clinic again without resubmitting an already accepted invite.
useClinicContextStore.getState().reset();
await useClinicContextStore.getState().hydrateForUser("user-cold", "token-cold");
assert.deepEqual(useClinicContextStore.getState().activeContext, { type: "personal" });
await useClinicContextStore.getState().refreshAfterMutation("user-cold", "token-cold");
selectAcceptedClinicContext(useClinicContextStore.getState(), "org-cold");
assert.deepEqual(useClinicContextStore.getState().activeContext, { type: "organization", organizationId: "org-cold" });

// Removed membership: the next authoritative read revokes the old selection.
(globalThis as any).fetch = async () => new Response(JSON.stringify({ personal: { available: true }, organizations: [] }), {
  status: 200, headers: { "Content-Type": "application/json" },
});
await useClinicContextStore.getState().refreshAfterMutation("user-cold", "token-cold");
assert.throws(() => selectAcceptedClinicContext(useClinicContextStore.getState(), "org-cold"), /context_unavailable/);
assert.deepEqual(useClinicContextStore.getState().activeContext, { type: "personal" });
useClinicContextStore.getState().reset();
console.log("clinic context tests: ok");
