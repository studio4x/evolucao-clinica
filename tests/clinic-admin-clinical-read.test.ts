import assert from "node:assert/strict";
import fs from "node:fs";
import express from "express";
import { registerClinicEvolutionRoutes } from "../server/clinic/clinicEvolutionRoutes.js";

const migration = fs.readFileSync("supabase/clinic-migrations/20260921_36_admin_clinical_read_access.sql", "utf8").replace(/\r\n/g, "\n");
const routeSource = fs.readFileSync("server/clinic/clinicEvolutionRoutes.ts", "utf8");
const pageSource = fs.readFileSync("src/components/clinic/ClinicPatientEvolutions.tsx", "utf8");
const cacheSource = fs.readFileSync("public/sw.js", "utf8");

assert.match(migration, /can_admin_read_organization_clinical_data\(organization_id, organization_patient_id\)/);
assert.match(migration, /m\.membership_role IN \('owner', 'manager'\)/);
assert.match(migration, /m\.status = 'active'/);
assert.match(migration, /o\.operational_status <> 'archived'/);
assert.match(migration, /organization_entitlement_mode\(p_organization_id\) IN \('full', 'restricted'\)/);
const adminHelper = migration.slice(migration.indexOf("CREATE FUNCTION private.can_admin_read_organization_clinical_data"), migration.indexOf("-- SELECT ganha"));
assert.doesNotMatch(adminHelper, /clinical_access_enabled|patient_professional_assignments/);
assert.doesNotMatch(migration, /CREATE POLICY evolutions_author_update|CREATE POLICY evolutions_author_delete|CREATE POLICY evolutions_personal_insert/);
assert.match(migration, /organization_patient_clinical_records_viewed/);
assert.match(migration, /organization_evolution_viewed/);
assert.match(migration, /organization_evolution_exported/);
const auditInsert = migration.slice(migration.indexOf("INSERT INTO private.organization_admin_events"), migration.indexOf("RETURNING id INTO v_event_id"));
assert.doesNotMatch(auditInsert, /transcription_text|original_transcription_text|content|payload|token/i);
for (const notScoped of ["patient_reports", "patient_files", "anamnesis", "patient_sessions", "documents"]) assert.doesNotMatch(migration, new RegExp(`ALTER TABLE (?:public\\.)?${notScoped}`));
assert.match(cacheSource, /pathname\.startsWith\("\/api\/clinic\/"\)/);
assert.match(routeSource, /hasAdminReadContract=Boolean\(access\.data\.organizationId\)/);
assert.match(routeSource, /if \(hasAdminReadContract\) query=query\.eq\("organization_id",access\.data\.organizationId\)/);
assert.match(routeSource, /else query=query\.eq\("professional_id",req\.user\.id\)/);
assert.doesNotMatch(routeSource, /select\("\*"\)\.eq\("professional_id",req\.user\.id\)/);
assert.match(routeSource, /\.eq\("professional_id",req\.user\.id\).*\.eq\("organization_patient_id",scope\.patientId\)/s);
assert.match(pageSource, /row\.isOwn === true/);
assert.match(pageSource, /Evoluções da clínica/);
assert.match(pageSource, /authorProfessionalRegister/);

const ids = {
  organizationA: "10000000-0000-4000-8000-000000000001",
  organizationB: "10000000-0000-4000-8000-000000000002",
  patientA: "20000000-0000-4000-8000-000000000001",
  patientB: "20000000-0000-4000-8000-000000000002",
  owner: "30000000-0000-4000-8000-000000000001",
  manager: "30000000-0000-4000-8000-000000000002",
  primary: "30000000-0000-4000-8000-000000000003",
  secondary: "30000000-0000-4000-8000-000000000004",
  consultant: "30000000-0000-4000-8000-000000000005",
  removed: "30000000-0000-4000-8000-000000000006",
  ownerB: "30000000-0000-4000-8000-000000000007",
  evolutionA: "40000000-0000-4000-8000-000000000001",
  evolutionB: "40000000-0000-4000-8000-000000000002",
  evolutionRemoved: "40000000-0000-4000-8000-000000000003",
  evolutionSigned: "40000000-0000-4000-8000-000000000004",
  evolutionPersonal: "40000000-0000-4000-8000-000000000005",
  evolutionTenantB: "40000000-0000-4000-8000-000000000006",
};

const actorIds: Record<string, string> = {
  owner: ids.owner, manager: ids.manager, primary: ids.primary, secondary: ids.secondary,
  consultant: ids.consultant, ownerB: ids.ownerB, legacyPrimary: ids.primary,
};
const adminActors = new Set(["owner", "manager"]);
const authorProfiles: Record<string, Record<string, string>> = {
  [ids.primary]: { professional_id: ids.primary, full_name: "Profissional A", professional_title: "Psicólogo", professional_register: "CRP-A" },
  [ids.secondary]: { professional_id: ids.secondary, full_name: "Profissional B", professional_title: "Psicóloga", professional_register: "CRP-B" },
  [ids.removed]: { professional_id: ids.removed, full_name: "Profissional removido", professional_title: "Psicólogo", professional_register: "CRP-H" },
};
const rows = [
  { id: ids.evolutionA, organization_id: ids.organizationA, organization_patient_id: ids.patientA, professional_id: ids.primary, status: "completed", transcription_status: "completed", transcription_text: "conteúdo clínico A", session_date: "2026-09-20", created_at: "2026-09-20T12:00:00Z" },
  { id: ids.evolutionB, organization_id: ids.organizationA, organization_patient_id: ids.patientA, professional_id: ids.secondary, status: "completed", transcription_status: "completed", transcription_text: "conteúdo clínico B", session_date: "2026-09-19", created_at: "2026-09-19T12:00:00Z" },
  { id: ids.evolutionRemoved, organization_id: ids.organizationA, organization_patient_id: ids.patientA, professional_id: ids.removed, status: "completed", transcription_status: "completed", transcription_text: "histórico removido", session_date: "2026-09-18", created_at: "2026-09-18T12:00:00Z" },
  { id: ids.evolutionSigned, organization_id: ids.organizationA, organization_patient_id: ids.patientA, professional_id: ids.primary, status: "signed", transcription_status: "completed", transcription_text: "registro assinado", session_date: "2026-09-17", created_at: "2026-09-17T12:00:00Z" },
  { id: ids.evolutionPersonal, organization_id: null, organization_patient_id: null, professional_id: ids.primary, status: "completed", transcription_status: "completed", transcription_text: "pessoal", session_date: "2026-09-16", created_at: "2026-09-16T12:00:00Z" },
  { id: ids.evolutionTenantB, organization_id: ids.organizationB, organization_patient_id: ids.patientB, professional_id: ids.ownerB, status: "completed", transcription_status: "completed", transcription_text: "outra clínica", session_date: "2026-09-15", created_at: "2026-09-15T12:00:00Z" },
];
const auditEvents: Array<Record<string, unknown>> = [];

function accessFor(actor: string, patientId: string): any {
  if (actor === "legacyPrimary") return { canRead: true, canCreate: true };
  if (patientId === ids.patientB) return actor === "ownerB"
    ? { organizationId: ids.organizationB, canRead: true, canCreate: true, canReadAll: true, readScope: "administrative" }
    : { organizationId: ids.organizationB, canRead: false, canCreate: false, canReadAll: false, readScope: "own" };
  if (adminActors.has(actor)) return { organizationId: ids.organizationA, canRead: true, canCreate: false, canReadAll: true, readScope: "administrative" };
  if (actor === "primary" || actor === "secondary") return { organizationId: ids.organizationA, canRead: true, canCreate: true, canReadAll: false, readScope: "own" };
  if (actor === "consultant") return { organizationId: ids.organizationA, canRead: true, canCreate: false, canReadAll: false, readScope: "own" };
  return { organizationId: ids.organizationA, canRead: false, canCreate: false, canReadAll: false, readScope: "own" };
}

function createMockClient(actor: string) {
  const actorId = actorIds[actor];
  return {
    rpc: async (name: string, args: Record<string, any>) => {
      if (name === "get_organization_evolution_access") return { data: accessFor(actor, args.p_organization_patient_id), error: null };
      if (name === "get_organization_evolution_author_profiles") {
        const access = accessFor(actor, args.p_organization_patient_id);
        const visibleAuthors = rows
          .filter((row) => row.organization_patient_id === args.p_organization_patient_id && (access.canReadAll || row.professional_id === actorId))
          .map((row) => authorProfiles[row.professional_id]).filter(Boolean);
        return { data: [...new Map(visibleAuthors.map((profile) => [profile.professional_id, profile])).values()], error: null };
      }
      if (name === "record_organization_clinical_read") { auditEvents.push({ actor, ...args }); return { data: ids.evolutionA, error: null }; }
      if (name === "create_organization_evolution") return accessFor(actor, args.p_organization_patient_id).canCreate
        ? { data: [{ ...rows[0], professional_id: actorId }], error: null }
        : { data: null, error: { code: "42501" } };
      throw new Error(`Unexpected RPC ${name}`);
    },
    from: (_table: string) => {
      let operation: "select" | "update" | "delete" = "select";
      let update: Record<string, unknown> = {};
      const filters: Array<[string, unknown, boolean]> = [];
      const query: any = {
        select: () => query,
        update: (value: Record<string, unknown>) => { operation = "update"; update = value; return query; },
        delete: () => { operation = "delete"; return query; },
        eq: (column: string, value: unknown) => { filters.push([column, value, true]); return query; },
        neq: (column: string, value: unknown) => { filters.push([column, value, false]); return query; },
        order: () => query,
        then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => {
          const access = accessFor(actor, filters.find(([column]) => column === "organization_patient_id")?.[1] as string);
          let visible = rows.filter((row) => access.canReadAll || row.professional_id === actorId);
          for (const [column, value, equal] of filters) visible = visible.filter((row) => equal ? (row as any)[column] === value : (row as any)[column] !== value);
          if (operation === "update" && visible.some((row) => row.status === "signed")) return Promise.resolve({ data: null, error: { code: "23514" } }).then(resolve, reject);
          const data = operation === "update" ? visible.map((row) => ({ ...row, ...update })) : visible;
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  };
}

const app = express();
app.use(express.json());
registerClinicEvolutionRoutes(app, {
  clinicFeatureEnabled: true,
  supabaseUrl: "https://staging.example.invalid",
  supabaseAnonKey: "synthetic-anon",
  createUserScopedClient: ({ accessToken }: { accessToken: string }) => createMockClient(accessToken) as any,
  requireAuth: (req: any, res: any, next: any) => {
    const actor = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!actorIds[actor]) return res.status(401).json({ error: "authentication_required" });
    req.user = { id: actorIds[actor] }; next();
  },
});
const listener = app.listen(0, "127.0.0.1");
await new Promise<void>((resolve) => listener.once("listening", resolve));
const port = (listener.address() as { port: number }).port;
const base = `http://127.0.0.1:${port}/api/clinic/patients`;
async function api(actor: string, patientId: string, suffix = "", method = "GET", body?: unknown) {
  const response = await fetch(`${base}/${patientId}/evolutions${suffix}`, { method, headers: { Authorization: `Bearer ${actor}`, ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, body: await response.json() };
}

try {
  for (const actor of ["owner", "manager"]) {
    const result = await api(actor, ids.patientA);
    assert.equal(result.status, 200);
    assert.equal(result.body.readScope, "administrative");
    assert.equal(result.body.canWrite, false);
    assert.deepEqual(result.body.evolutions.map((row: any) => row.id), [ids.evolutionA, ids.evolutionB, ids.evolutionRemoved, ids.evolutionSigned]);
    assert.equal(result.body.evolutions.find((row: any) => row.id === ids.evolutionA).authorName, "Profissional A");
    assert.equal(result.body.evolutions.find((row: any) => row.id === ids.evolutionRemoved).authorProfessionalRegister, "CRP-H");
    assert.ok(result.body.evolutions.every((row: any) => row.id !== ids.evolutionPersonal && row.id !== ids.evolutionTenantB));
  }
  const primary = await api("primary", ids.patientA);
  assert.deepEqual(primary.body.evolutions.map((row: any) => row.id), [ids.evolutionA, ids.evolutionSigned]);
  const secondary = await api("secondary", ids.patientA);
  assert.deepEqual(secondary.body.evolutions.map((row: any) => row.id), [ids.evolutionB]);
  const legacyPrimary = await api("legacyPrimary", ids.patientA);
  assert.equal(legacyPrimary.status, 200);
  assert.deepEqual(legacyPrimary.body.evolutions.map((row: any) => row.id), [ids.evolutionA, ids.evolutionSigned]);
  assert.equal(legacyPrimary.body.readScope, "own");
  const consultant = await api("consultant", ids.patientA);
  assert.equal(consultant.status, 200); assert.deepEqual(consultant.body.evolutions, []); assert.equal(consultant.body.canWrite, false);

  assert.equal((await api("owner", ids.patientA, `/${ids.evolutionA}`, "PATCH", { transcriptionText: "forbidden" })).status, 404);
  assert.equal((await api("owner", ids.patientA, `/${ids.evolutionA}`, "DELETE")).status, 404);
  assert.equal((await api("owner", ids.patientA, `/${ids.evolutionA}`, "PATCH", { status: "signed" })).status, 404);
  assert.equal((await api("manager", ids.patientA, `/${ids.evolutionB}`, "PATCH", { transcriptionText: "forbidden" })).status, 404);
  assert.equal((await api("owner", ids.patientA, "", "POST", { sessionDate: "2026-09-21" })).status, 403);
  assert.equal((await api("consultant", ids.patientA, "", "POST", { sessionDate: "2026-09-21" })).status, 403);
  assert.equal((await api("primary", ids.patientA, `/${ids.evolutionA}`, "PATCH", { transcriptionText: "own eligible" })).status, 200);
  assert.equal((await api("primary", ids.patientA, `/${ids.evolutionSigned}`, "PATCH", { transcriptionText: "immutable" })).status, 400);
  assert.equal((await api("owner", ids.patientB)).status, 403);

  const detail = await api("owner", ids.patientA, `/${ids.evolutionA}`);
  assert.equal(detail.status, 200); assert.equal(detail.body.evolution.authorProfessionalId, ids.primary);
  const exported = await api("owner", ids.patientA, `/${ids.evolutionA}?purpose=export`);
  assert.equal(exported.status, 200);
  assert.ok(auditEvents.some((event) => event.p_action === "organization_patient_clinical_records_viewed"));
  assert.ok(auditEvents.some((event) => event.p_action === "organization_evolution_viewed"));
  assert.ok(auditEvents.some((event) => event.p_action === "organization_evolution_exported"));
  assert.doesNotMatch(JSON.stringify(auditEvents), /conteúdo|transcription|original_transcription/i);
} finally {
  await new Promise<void>((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
}

console.log("clinic admin organization-scoped clinical read, author-only mutation and audit: PASS");
