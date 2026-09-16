import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerClinicContextRoutes, resolveClinicOrganizations } from "../server/clinic/clinicContextRoutes.js";
import { clinicContextStorageKey, useClinicContextStore } from "../src/store/clinicContextStore";

const routeSource = readFileSync("server/clinic/clinicContextRoutes.ts", "utf8");
const selectorSource = readFileSync("src/components/clinic/ClinicContextSelector.tsx", "utf8");
const publicFlagsSource = readFileSync("src/config/publicFlags.ts", "utf8");
const appSource = readFileSync("src/App.tsx", "utf8");
const layoutSource = readFileSync("src/components/Layout.tsx", "utf8");
const storeSource = readFileSync("src/store/clinicContextStore.ts", "utf8");

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

useClinicContextStore.getState().reset();
assert.equal(useClinicContextStore.getState().userId, null);
assert.equal(useClinicContextStore.getState().organizations.length, 0);
console.log("clinic context tests: ok");
