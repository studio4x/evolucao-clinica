import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerClinicTeamRoutes } from "../server/clinic/clinicTeamRoutes.js";

const routeSource = readFileSync("server/clinic/clinicTeamRoutes.ts", "utf8");
const contextSource = readFileSync("server/clinic/clinicContextRoutes.ts", "utf8");
const helperSource = readFileSync("server/supabase/createUserScopedClient.ts", "utf8");
const migrationSource = readFileSync("supabase/clinic-migrations/20260916_10_organization_team_directory.sql", "utf8");
const pageSource = readFileSync("src/pages/ClinicTeam.tsx", "utf8");
const appSource = readFileSync("src/App.tsx", "utf8");
const layoutSource = readFileSync("src/components/Layout.tsx", "utf8");

assert.match(helperSource, /createClient\(supabaseUrl, supabaseAnonKey/);
assert.match(helperSource, /persistSession: false/);
assert.match(helperSource, /autoRefreshToken: false/);
assert.match(helperSource, /Authorization: `Bearer \$\{accessToken\}`/);
assert.doesNotMatch(helperSource, /serviceRoleKey|SUPABASE_SERVICE_ROLE_KEY/);
assert.doesNotMatch(contextSource, /serviceRoleKey|SUPABASE_SERVICE_ROLE_KEY/);
assert.doesNotMatch(routeSource, /serviceRoleKey|SUPABASE_SERVICE_ROLE_KEY/);
assert.match(routeSource, /app\.get\("\/api\/clinic\/team"/);
assert.match(routeSource, /get_organization_team/);
assert.match(routeSource, /suspend_organization_member/);
assert.match(routeSource, /reactivate_organization_member/);
assert.match(routeSource, /remove_organization_member/);
assert.match(routeSource, /change_organization_member_role/);
assert.match(routeSource, /transfer_organization_owner/);
assert.doesNotMatch(routeSource, /actor_professional_id|created_by|current_owner_id/);
assert.match(routeSource, /Cache-Control/);
assert.match(routeSource, /Vary.*Authorization/);
assert.match(migrationSource, /RETURNS TABLE/);
assert.match(migrationSource, /m\.status IN \('active', 'suspended'\)/);
assert.match(migrationSource, /v_actor_role NOT IN \('owner', 'manager'\)/);
assert.match(migrationSource, /clinical_access_enabled/);
assert.match(migrationSource, /REVOKE ALL ON FUNCTION public\.get_organization_team\(uuid\) FROM PUBLIC, anon, authenticated/);
assert.doesNotMatch(migrationSource, /CREATE POLICY.*professionals|ALTER TABLE public\.professionals/i);
assert.match(pageSource, /Equipe/);
assert.match(pageSource, /Remover da clínica/);
assert.match(pageSource, /transferClinicOwner/);
assert.match(pageSource, /professional.*=>.*\/painel\/clinica|!isAdmin/);
assert.doesNotMatch(pageSource, /create_organization_invitation|raw_token|seat|Stripe|billing/i);
assert.match(appSource, /clinica\/equipe/);
assert.match(layoutSource, /name: 'Equipe'/);

let captured: { path: string; middleware: unknown; handler: (request: any, response: any) => Promise<unknown> } | null = null;
registerClinicTeamRoutes(
  {
    get: (path: string, middleware: unknown, handler: (request: any, response: any) => Promise<unknown>) => { captured = { path, middleware, handler }; },
    post: () => undefined,
    patch: () => undefined,
  },
  { requireAuth: () => undefined, supabaseUrl: "https://staging.example.com", supabaseAnonKey: "anon-test", clinicFeatureEnabled: false },
);
assert.equal(captured?.path, "/api/clinic/team");
assert.equal(typeof captured?.middleware, "function");
assert.ok(captured?.handler);
let responseStatus = 200;
let responseBody: any = null;
const response = {
  setHeader: () => undefined,
  status: (status: number) => { responseStatus = status; return response; },
  json: (body: unknown) => { responseBody = body; return body; },
};
await captured?.handler({ headers: { authorization: "Bearer token" }, user: { id: "user-a" }, query: {} }, response);
assert.equal(responseStatus, 503);
assert.deepEqual(responseBody, { ok: false, error: "feature_unavailable" });

console.log("clinic team tests: ok");
