import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import express from "express";
import { registerClinicInvitationRoutes, hashInvitationSecret, INVITATION_LANDING_SCRIPT, INVITATION_CSP } from "../server/clinic/clinicInvitationRoutes.js";
import { createInvitationTransport, renderInvitationMail } from "../server/clinic/clinicInvitationEmail.js";
import { canEnterInvitedClinic } from "../src/utils/clinicInvitationAccess.js";

const origin = "https://staging.evolucaoclinica.app.br";
const org = randomUUID(), otherOrg = randomUUID(), owner = randomUUID(), manager = randomUUID(), recipient = randomUUID(), stranger = randomUUID();
let clock = Date.now();
const users = new Map([["owner", { id: owner, email: "owner@example.invalid", confirmed: true }], ["manager", { id: manager, email: "manager@example.invalid", confirmed: true }], ["recipient", { id: recipient, email: "recipient@example.invalid", confirmed: true }], ["stranger", { id: stranger, email: "stranger@example.invalid", confirmed: true }]]);
const rows: any[] = [], deliveries: any[] = [], handoffs: any[] = [], memberships: any[] = [], audits: any[] = [], genericEmails: any[] = [], analytics: any[] = [];
const providerPayloads: any[] = [];
const capturedLogs: string[] = [];
const originalConsole = { log: console.log, warn: console.warn, error: console.error };
for (const level of ["log", "warn", "error"] as const) console[level] = (...values: unknown[]) => { capturedLogs.push(values.map((value) => value instanceof Error ? value.stack || value.message : typeof value === "string" ? value : JSON.stringify(value)).join(" ")); };
const sentinel = randomBytes(32).toString("hex");
let nextToken = sentinel, failTransport = false, maliciousError = false;
let seq = Promise.resolve();
const error = (code = "42501", message = "not authorized") => ({ data: null, error: { code, message } });
const snapshots = () => JSON.stringify({ rows, deliveries, handoffs, memberships, audits, genericEmails, analytics });
const seats = () => ({ reserved: rows.filter((r) => r.status === "pending" && r.clinical && r.expires > clock).length, active: memberships.filter((m) => m.clinical).length });
const admin: any = {
  auth: { getUser: async (token: string) => ({ data: { user: users.get(token) || null }, error: null }) },
  rpc: async (name: string, args: any) => {
    // Serializable deterministic model exercises HTTP behavior; real SQL
    // concurrency is a separate staging smoke, never claimed by this mock.
    let release!: () => void;
    const previous = seq; seq = new Promise<void>((r) => { release = r; }); await previous;
    try {
      if (maliciousError) return error("XX000", sentinel);
      const actor = [...users.values()].find((u) => u.id === args.p_actor);
      const adminActor = args.p_organization_id === org && [owner, manager].includes(args.p_actor);
      const i = rows.find((r) => r.id === args.p_invitation_id);
      if (name === "issue_organization_invitation_server" || name === "resend_organization_invitation_server") {
        if (!adminActor || (args.p_actor === manager && (args.p_intended_role || i?.role) !== "professional")) return error();
        let row: any;
        if (name.startsWith("issue")) {
          if (rows.some((r) => r.email === args.p_email && r.status === "pending")) return error("23505");
          if (args.p_intended_clinical_access && seats().reserved + seats().active >= 3) return error("P0001", "no clinical seats available");
          row = { id: randomUUID(), email: args.p_email, role: args.p_intended_role, clinical: args.p_intended_clinical_access, status: "pending", hash: hashInvitationSecret(nextToken), expires: clock + 72 * 3600000, version: 1 };
          rows.push(row); audits.push({ event: "invitation_created", id: row.id });
        } else {
          if (!i || i.status !== "pending") return error();
          row = i; row.hash = hashInvitationSecret(nextToken); row.version++; row.expires = clock + 72 * 3600000;
          handoffs.filter((h) => h.invitation === i.id).forEach((h) => { h.consumed = true; });
          audits.push({ event: "invitation_resent", id: i.id });
        }
        const delivery = { id: randomUUID(), invitation_id: row.id, status: "pending", attempt: deliveries.filter((d) => d.invitation_id === row.id).length + 1 };
        deliveries.push(delivery);
        return { error: null, data: { invitation_id: row.id, delivery_id: delivery.id, normalized_email: row.email, organization_name: "Clínica sintética", intended_role: row.role, intended_clinical_access: row.clinical, expires_at: new Date(row.expires).toISOString(), status: row.status, token: nextToken } };
      }
      if (name === "finish_organization_invitation_delivery_server") {
        Object.assign(deliveries.find((d) => d.id === args.p_delivery_id), { status: args.p_status, message_id: args.p_message_id });
        return { data: null, error: null };
      }
      if (name === "list_organization_invitations_server") {
        if (!adminActor) return error();
        return { error: null, data: rows.map((r) => ({ invitation_id: r.id, normalized_email: r.email, intended_role: r.role, intended_clinical_access: r.clinical, status: r.status, token: sentinel })) };
      }
      if (name === "revoke_organization_invitation_server") {
        if (!adminActor || !i || (args.p_actor === manager && i.role !== "professional")) return error();
        i.status = "revoked"; return { error: null, data: { status: i.status } };
      }
      if (name === "create_organization_invitation_handoff_server") {
        const row = rows.find((r) => r.hash === args.p_token_hash);
        if (!row || row.status !== "pending" || row.expires <= clock) return { error: null, data: { status: "unavailable" } };
        handoffs.push({ hash: args.p_secret_hash, invitation: row.id, version: row.version, expires: clock + 2700000, consumed: false });
        return { error: null, data: { status: "pending" } };
      }
      if (name === "resolve_organization_invitation_handoff_server") {
        const h = handoffs.find((r) => r.hash === args.p_secret_hash); const row = rows.find((r) => r.id === h?.invitation);
        if (!h || !row || h.consumed || h.expires <= clock || row.status !== "pending" || h.version !== row.version || row.expires <= clock) return { error: null, data: { status: "unavailable" } };
        if (!args.p_accept) return { error: null, data: { status: "pending", organization_name: "Clínica sintética", intended_role: row.role, intended_clinical_access: row.clinical, expires_at: new Date(row.expires).toISOString() } };
        if (!actor?.confirmed) return error("42501", "email_unconfirmed");
        if (actor.email !== row.email) return error("42501", "email_mismatch");
        if (memberships.some((m) => m.actor === actor.id)) return error();
        const member = { id: randomUUID(), actor: actor.id, clinical: row.clinical };
        memberships.push(member); row.status = "accepted"; h.consumed = true;
        return { error: null, data: { status: "accepted", organization_id: org, membership_id: member.id } };
      }
      throw new Error("unknown mock RPC");
    } finally { release(); }
  },
};
const deps: any = { appEnv: "staging", supabaseUrl: "https://hwkdwinfckmjoriqxbjk.supabase.co", publicOrigin: origin, clinicFeatureEnabled: true, deliveryEnabled: true, admin,
  transport: { provider: "mock", ready: true, send: async (mail: any) => { providerPayloads.push(renderInvitationMail(mail)); if (failTransport) throw new Error(sentinel); return { messageId: `${randomUUID()}@staging.evolucaoclinica.app.br` }; } } };
const app = express(); registerClinicInvitationRoutes(app, deps);
const server = app.listen(0, "127.0.0.1"); await new Promise<void>((resolve) => server.once("listening", resolve));
const address = server.address(); assert.ok(address && typeof address !== "string"); const base = `http://127.0.0.1:${address.port}`;
const responses: string[] = [];
async function request(path = "", actor?: string, body?: any, cookie?: string, requestOrigin = origin) {
  const result = await fetch(`${base}/api/clinic/invitations${path}`, { method: body === undefined ? "GET" : "POST", headers: { Origin: requestOrigin, ...(actor ? { Authorization: `Bearer ${actor}` } : {}), ...(cookie ? { Cookie: cookie } : {}), "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = await result.json(); responses.push(JSON.stringify(data)); return { status: result.status, data, cookie: result.headers.get("set-cookie") || "" };
}
const createBody = (email = "recipient@example.invalid", clinical = true, role = "professional") => ({ organizationId: org, email, clinical, role, actor: stranger });
try {
  let gatedSendAttempts = 0;
  const deliveryGatedApp = express();
  registerClinicInvitationRoutes(deliveryGatedApp, { ...deps, deliveryEnabled: false, transport: { ...deps.transport, send: async (...args: any[]) => { gatedSendAttempts++; return deps.transport.send(...args); } } });
  const deliveryGatedServer = deliveryGatedApp.listen(0, "127.0.0.1"); await new Promise<void>((resolve) => deliveryGatedServer.once("listening", resolve));
  try {
    const gatedAddress = deliveryGatedServer.address(); assert.ok(gatedAddress && typeof gatedAddress !== "string");
    const gatedResult = await fetch(`http://127.0.0.1:${gatedAddress.port}/api/clinic/invitations`, { method: "POST", headers: { Origin: origin, Authorization: "Bearer owner", "Content-Type": "application/json" }, body: JSON.stringify(createBody()) });
    assert.equal(gatedResult.status, 503); assert.equal((await gatedResult.json()).error, "delivery_unavailable"); assert.equal(gatedSendAttempts, 0);
  } finally { await new Promise<void>((resolve) => deliveryGatedServer.close(() => resolve())); }
  const invitedAccess = { pathname: "/painel/clinica", featureEnabled: true, contextStatus: "ready", contextUserId: recipient, userId: recipient, activeContext: { type: "organization", organizationId: org }, organizations: [{ id: org }] };
  // A pending professional may enter only through the resolved organization
  // context; personal and unrelated contexts remain denied.
  assert.equal(canEnterInvitedClinic(invitedAccess), true);
  assert.equal(canEnterInvitedClinic({ ...invitedAccess, activeContext: { type: "personal" } }), false);
  assert.equal(canEnterInvitedClinic({ ...invitedAccess, activeContext: { type: "organization", organizationId: otherOrg } }), false);
  assert.equal(canEnterInvitedClinic(invitedAccess), true);
  for (const overrides of [{ pathname: "/painel/patients" }, { pathname: "/painel/clinicas-falso" }, { contextStatus: "loading" }, { contextUserId: stranger }, { featureEnabled: false }, { organizations: [] }, { activeContext: { type: "personal" } }]) assert.equal(canEnterInvitedClinic({ ...invitedAccess, ...overrides }), false);
  assert.equal(createInvitationTransport({}).ready, false);
  assert.equal((await request("", "owner", createBody(), undefined, "https://evil.invalid")).status, 403);
  assert.equal((await request("", "invalid", createBody())).status, 401);
  assert.equal((await request("", "manager", createBody("x@example.invalid", false, "manager"))).status, 403);
  const initial = await Promise.all([request("", "owner", createBody()), request("", "owner", createBody())]);
  assert.deepEqual(initial.map((r) => r.status).sort(), [201, 409]); assert.equal(rows.length, 1); assert.deepEqual(seats(), { reserved: 1, active: 0 });
  assert.ok(providerPayloads[0].html.includes(`#invite=${sentinel}`)); assert.ok(!snapshots().includes(sentinel));
  assert.doesNotMatch(providerPayloads[0].html, /<img|<script|utm_|tracking|facebook|analytics/i);
  assert.equal((providerPayloads[0].html.match(/<a /g) || []).length, 1);
  const listing = await request(`?organizationId=${org}`, "owner"); assert.equal(listing.status, 200); assert.ok(!JSON.stringify(listing.data).includes(sentinel));
  for (const action of ["resend", "revoke"]) assert.equal((await request(`/${rows[0].id}/${action}`, "owner", { organizationId: otherOrg })).status, 403);
  assert.equal((await request(`?organizationId=${otherOrg}`, "owner")).status, 403);
  const landing = await fetch(`${base}/convite-clinica`); const html = await landing.text();
  assert.equal(landing.headers.get("referrer-policy"), "no-referrer"); assert.match(landing.headers.get("content-security-policy")!, /default-src 'none'/);
  assert.doesNotMatch(html, /analytics|googletagmanager|facebook|stripe|index\.html|src\/App/i);
  let replaced = "", navigated = "", posted = "";
  await vm.runInNewContext(INVITATION_LANDING_SCRIPT, { location: { hash: `#invite=${sentinel}`, replace: (path: string) => { navigated = path; } }, history: { replaceState: (_state: any, _title: string, path: string) => { replaced = path; } }, URLSearchParams, fetch: async (_path: string, options: any) => { assert.equal(replaced, "/convite-clinica"); posted = JSON.parse(options.body).token; return { ok: true }; }, document: { getElementById: () => ({ textContent: "" }), querySelector: () => ({ remove: () => undefined }) } });
  assert.equal(posted, sentinel); assert.equal(navigated, "/painel/convite-clinica"); assert.equal(memberships.length, 0);
  const handoff = await request("/handoff", undefined, { token: sentinel });
  assert.equal(handoff.status, 200); assert.match(handoff.cookie, /HttpOnly; Secure; SameSite=Lax/); assert.match(handoff.cookie, /Max-Age=2700/); assert.ok(!handoff.cookie.includes(sentinel));
  const status = await request("/handoff", undefined, undefined, handoff.cookie); assert.equal(status.status, 200); assert.ok(!JSON.stringify(status.data).includes("recipient@example.invalid")); assert.equal(memberships.length, 0);
  assert.equal((await request("/accept", "stranger", {}, handoff.cookie)).data.error, "email_mismatch");
  users.get("recipient")!.confirmed = false;
  assert.equal((await request("/accept", "recipient", {}, handoff.cookie)).data.error, "email_unconfirmed"); assert.equal(memberships.length, 0);
  users.get("recipient")!.confirmed = true;
  const accepted = await Promise.all([request("/accept", "recipient", {}, handoff.cookie), request("/accept", "recipient", {}, handoff.cookie)]);
  assert.deepEqual(accepted.map((r) => r.status).sort(), [200, 410]); assert.deepEqual(seats(), { reserved: 0, active: 1 }); assert.equal(memberships.length, 1);
  assert.match(accepted.find((r) => r.status === 200)!.cookie, /Max-Age=0/);
  nextToken = randomBytes(32).toString("hex"); failTransport = true;
  const failed = await request("", "owner", createBody("new@example.invalid", false)); assert.equal(failed.data.deliveryStatus, "failed"); assert.equal(rows[1].status, "pending"); assert.equal(deliveries[1].status, "failed"); assert.deepEqual(seats(), { reserved: 0, active: 1 });
  const oldToken = nextToken; const oldHandoff = await request("/handoff", undefined, { token: oldToken });
  nextToken = randomBytes(32).toString("hex"); failTransport = false;
  assert.equal((await request(`/${rows[1].id}/resend`, "owner", { organizationId: org })).status, 201);
  assert.equal((await request("/handoff", undefined, { token: oldToken })).status, 410);
  assert.equal((await request("/handoff", undefined, undefined, oldHandoff.cookie)).status, 410);
  const newHandoff = await request("/handoff", undefined, { token: nextToken });
  clock += 2700001; assert.equal((await request("/handoff", undefined, undefined, newHandoff.cookie)).status, 410);
  assert.equal((await request(`/${rows[1].id}/revoke`, "owner", { organizationId: org })).status, 200);
  assert.equal((await request("/handoff", undefined, { token: nextToken })).status, 410);
  maliciousError = true; assert.equal((await request(`?organizationId=${org}`, "owner")).data.error, "invitation_operation_failed"); maliciousError = false;
  const badJson = await fetch(`${base}/api/clinic/invitations/handoff`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: `{"token":"${sentinel}"` }); assert.equal(badJson.status, 400); assert.ok(!(await badJson.text()).includes(sentinel));
  assert.ok(!snapshots().includes(sentinel)); assert.ok(!responses.join("").includes(sentinel)); assert.equal(genericEmails.length, 0); assert.equal(analytics.length, 0);
  assert.ok(!capturedLogs.join("\n").includes(sentinel), "No invitation secret in captured runtime logs/errors");
  for (const path of ["src/pages/ClinicTeam.tsx", "src/pages/ClinicInvitationAccept.tsx", "src/components/clinic/ClinicInvitations.tsx", "docs/roadmap-empresarial.md"]) assert.ok(!readFileSync(path, "utf8").includes(sentinel));
  const sql = readFileSync("supabase/clinic-migrations/20260916_21_secure_clinic_invitation_delivery.sql", "utf8");
  const vercel = JSON.parse(readFileSync("vercel.json", "utf8"));
  for (const rewrite of vercel.rewrites) { assert.equal(typeof rewrite.destination, "string"); assert.deepEqual(Object.keys(rewrite).sort(), ["destination", "source"]); }
  assert.ok(vercel.routes.some((route: any) => route.src === "^/convite-clinica$" && route.dest === "/api/index.ts"));
  assert.ok(vercel.headers.find((entry: any) => entry.source === "/convite-clinica").headers.some((header: any) => header.key === "Content-Security-Policy" && header.value === INVITATION_CSP));
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.create_organization_invitation\(uuid,text,text,boolean\) FROM PUBLIC,anon,authenticated,service_role/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION[\s\S]+TO service_role/); assert.match(sql, /v_usage\.reserved_seats < 1/);
  // The entire subsystem fails closed in production, even with delivery enabled.
  const prod = express(); registerClinicInvitationRoutes(prod, { ...deps, appEnv: "production" });
  const prodServer = prod.listen(0, "127.0.0.1"); await new Promise<void>((r) => prodServer.once("listening", r));
  try { const addr = prodServer.address() as any; const result = await fetch(`http://127.0.0.1:${addr.port}/api/clinic/invitations/handoff`); assert.equal(result.status, 503); }
  finally { await new Promise<void>((r) => prodServer.close(() => r())); }
  originalConsole.log("clinic invitations: HTTP issuance/handoff/acceptance, privacy, captured logs, rotation, seats, tenant isolation and mock concurrency PASS");
} finally {
  Object.assign(console, originalConsole);
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
