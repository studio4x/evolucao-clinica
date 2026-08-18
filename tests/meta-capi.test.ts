import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildMetaPurchasePayload,
  enqueueAndDeliverMetaPurchase,
  metaDeliveryFailureUpdate,
  validateMetaPurchasePayload,
} from "../supabase/functions/_shared/metaDelivery.ts";

const userId = "550e8400-e29b-41d4-a716-446655440000";
const transactionId = "GPA.3301-4935-4297-12532";
const occurredAt = "2026-08-18T18:29:00.000Z";
const payload = await buildMetaPurchasePayload({ userId, transactionId, value: 39, currency: "BRL", occurredAt });
assert.ok(payload, "compra confirmada deve formar o evento da Meta");
assert.equal(validateMetaPurchasePayload(payload), null);
assert.equal(payload.data[0].event_id, `purchase-${transactionId}`, "Pixel e CAPI devem compartilhar o event_id");
assert.deepEqual(Object.keys(payload.data[0].user_data), ["external_id"], "somente a conta profissional com hash pode identificar o evento");
assert.deepEqual(Object.keys(payload.data[0].custom_data).sort(), ["currency", "value"], "o payload de saúde deve ser mínimo");
assert.notEqual(payload.data[0].user_data.external_id[0], userId, "o UUID interno não pode ser enviado em texto aberto");
assert.equal(await buildMetaPurchasePayload({ userId, transactionId, value: 0, currency: "BRL", occurredAt }), null, "valor não positivo não pode gerar conversão");
const contaminated = structuredClone(payload);
(contaminated.data[0].custom_data as Record<string, unknown>).patient_id = "paciente";
assert.equal(validateMetaPurchasePayload(contaminated), "unexpected_parameter", "identificador de paciente deve ser recusado");

const terminal = metaDeliveryFailureUpdate(6, "meta_capi_configuration_unavailable");
assert.equal(terminal.status, "failed");
assert.equal(terminal.next_attempt_at, null);

let deniedRpcCalls = 0;
const deniedAdmin = {
  from(table: string) {
    assert.equal(table, "analytics_consents");
    return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { marketing_granted: false } }) }) }) };
  },
  async rpc() { deniedRpcCalls += 1; return { data: [] }; },
};
assert.equal(await enqueueAndDeliverMetaPurchase(deniedAdmin, { eventKey: `purchase:google_play:${transactionId}`, userId, provider: "google_play", transactionId, value: 39, currency: "BRL", occurredAt }), "consent_denied");
assert.equal(deniedRpcCalls, 0, "sem consentimento de Marketing nada deve entrar na fila");

const updates: Array<Record<string, unknown>> = [];
let claimCount = 0;
const sentAdmin = {
  from(table: string) {
    if (table === "analytics_consents") return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { marketing_granted: true } }) }) }) };
    if (table === "settings") return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { api_key: JSON.stringify({ fb_pixel_id: "4050515911745193" }) } }) }) }) };
    if (table === "meta_event_deliveries") return { update: (value: Record<string, unknown>) => ({ eq: async () => { updates.push(value); return { error: null }; } }) };
    throw new Error(`Tabela inesperada: ${table}`);
  },
  async rpc(name: string, args: Record<string, unknown>) {
    assert.equal(name, "claim_meta_event_delivery");
    claimCount += 1;
    if (claimCount > 1) return { data: [] };
    return { data: [{ id: 1, user_id: userId, event_name: "Purchase", provider: "google_play", payload: args.p_payload, attempt_count: 1 }] };
  },
};

(globalThis as unknown as { Deno: { env: { get(name: string): string | undefined } } }).Deno = { env: { get: (name) => name === "META_CAPI_TOKEN" ? "test-secret-token" : undefined } };
const originalFetch = globalThis.fetch;
let requestBody: Record<string, unknown> | null = null;
globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
  assert.equal(String(url).includes("test-secret-token"), false, "o token não pode aparecer na URL ou em logs de proxy");
  requestBody = JSON.parse(String(init?.body || "{}"));
  return new Response(JSON.stringify({ events_received: 1 }), { status: 200, headers: { "Content-Type": "application/json" } });
}) as typeof fetch;
try {
  const input = { eventKey: `purchase:google_play:${transactionId}`, userId, provider: "google_play" as const, transactionId, value: 39, currency: "BRL", occurredAt };
  assert.equal(await enqueueAndDeliverMetaPurchase(sentAdmin, input), "sent");
  assert.equal(await enqueueAndDeliverMetaPurchase(sentAdmin, input), "already_claimed", "reabertura e RTDN repetida não podem reenviar a conversão");
} finally {
  globalThis.fetch = originalFetch;
}
assert.equal(requestBody?.access_token, "test-secret-token");
assert.equal(updates.at(-1)?.status, "sent");
assert.equal(JSON.stringify(requestBody).match(/patient|clinical|diagnos|email|phone/gi), null, "nenhum dado clínico ou contato pode ser enviado");

const [migration, verifier, rtdn, stripe, processor] = await Promise.all([
  readFile(new URL("../supabase/migrations/20260818190000_add_meta_capi_delivery.sql", import.meta.url), "utf8"),
  readFile(new URL("../supabase/functions/verify-google-play-subscription/index.ts", import.meta.url), "utf8"),
  readFile(new URL("../supabase/functions/google-play-rtdn/index.ts", import.meta.url), "utf8"),
  readFile(new URL("../supabase/functions/stripe-webhook/index.ts", import.meta.url), "utf8"),
  readFile(new URL("../supabase/functions/process-analytics-deliveries/index.ts", import.meta.url), "utf8"),
]);
assert.match(migration, /ON CONFLICT ON CONSTRAINT meta_event_deliveries_event_key_key DO NOTHING/, "claim deve ser atômico");
assert.match(verifier, /if \(isInitialOrder\)[\s\S]*enqueueAndDeliverMetaPurchase/, "verificação autoritativa deve enviar somente a ativação inicial");
assert.match(rtdn, /if \(isInitialOrder\)[\s\S]*enqueueAndDeliverMetaPurchase/, "RTDN deve reutilizar o mesmo fato confirmado");
assert.match(stripe, /if \(isInitialInvoice\)[\s\S]*enqueueAndDeliverMetaPurchase/, "Stripe deve enviar somente a primeira cobrança paga");
assert.match(processor, /claim_meta_event_delivery[\s\S]*deliverMetaRow/, "retries da Meta devem usar a fila idempotente");

console.log("meta-capi.test.ts: OK");
