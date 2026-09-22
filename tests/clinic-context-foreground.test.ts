import assert from "node:assert/strict";
import { useClinicContextStore } from "../src/store/clinicContextStore";

const response = (organizations: unknown[], personalAvailable = true) => new Response(JSON.stringify({
  personal: { available: personalAvailable },
  accessMode: organizations.length > 0 ? "hybrid" : "personal",
  organizations,
}), { status: 200, headers: { "Content-Type": "application/json" } });

const organization = (id: string) => ({
  id,
  name: id,
  tradeName: null,
  operationalStatus: "active",
  membershipRole: "professional",
  clinicalAccessEnabled: true,
  planCode: null,
  planLabel: null,
  entitlementMode: "included",
  accessSource: "organization_membership",
  licenseActive: true,
});

useClinicContextStore.getState().reset();
let fetchCount = 0;
let releaseForeground!: (value: Response) => void;
const foregroundResponse = new Promise<Response>((resolve) => { releaseForeground = resolve; });
(globalThis as any).fetch = async () => {
  fetchCount += 1;
  if (fetchCount === 1) return response([organization("org-a")]);
  return foregroundResponse;
};

await useClinicContextStore.getState().hydrateForUser("user-a", "token-a");
useClinicContextStore.getState().selectContext({ type: "organization", organizationId: "org-a" });
const pendingRevalidation = useClinicContextStore.getState().revalidateForUser("user-a", "token-a");
const duplicateRevalidation = useClinicContextStore.getState().revalidateForUser("user-a", "token-a");
await Promise.resolve();
assert.equal(fetchCount, 2, "foreground revalidation must issue one request while in flight");
assert.equal(useClinicContextStore.getState().status, "ready");
assert.deepEqual(useClinicContextStore.getState().activeContext, { type: "organization", organizationId: "org-a" });
assert.deepEqual(useClinicContextStore.getState().organizations.map(({ id }) => id), ["org-a"]);
releaseForeground(response([organization("org-a")]));
await Promise.all([pendingRevalidation, duplicateRevalidation]);

(globalThis as any).fetch = async () => { throw new Error("network timeout"); };
await useClinicContextStore.getState().revalidateForUser("user-a", "token-a");
assert.equal(useClinicContextStore.getState().status, "ready");
assert.deepEqual(useClinicContextStore.getState().activeContext, { type: "organization", organizationId: "org-a" });

(globalThis as any).fetch = async () => response([]);
await useClinicContextStore.getState().revalidateForUser("user-a", "token-a");
assert.deepEqual(useClinicContextStore.getState().activeContext, { type: "personal" }, "revocation must be authoritative");
assert.deepEqual(useClinicContextStore.getState().organizations, []);

let accountSwitchRequests = 0;
(globalThis as any).fetch = async () => {
  accountSwitchRequests += 1;
  return response([organization("org-b")]);
};
await useClinicContextStore.getState().hydrateForUser("user-b", "token-b");
assert.equal(accountSwitchRequests, 1);
assert.equal(useClinicContextStore.getState().userId, "user-b");
assert.equal(useClinicContextStore.getState().status, "ready");
assert.deepEqual(useClinicContextStore.getState().organizations.map(({ id }) => id), ["org-b"]);
assert.deepEqual(useClinicContextStore.getState().activeContext, { type: "personal" });

useClinicContextStore.getState().reset();
console.log("clinic context foreground tests: ok");
