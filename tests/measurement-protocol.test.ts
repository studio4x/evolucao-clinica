import assert from "node:assert/strict";
import { buildMeasurementPayload, deliverAnalyticsRow, deliveryFailureUpdate, enqueueAndDeliverAnalyticsEvent, nextAttempt, validateMeasurementPayload } from "../supabase/functions/_shared/analyticsDelivery.ts";

const base = {
  userId: "550e8400-e29b-41d4-a716-446655440000",
  attribution: { clientId: "123456789.987654321", sessionId: 123, sessionNumber: 4 },
  occurredAt: "2026-08-13T12:00:00.000Z",
};
const params = { transaction_id: "in_123", plan_id: "monthly", plan_name: "Plano Mensal", value: 39, currency: "BRL", payment_provider: "stripe" };

const purchase = buildMeasurementPayload({ ...base, eventName: "purchase", params });
assert.ok(purchase, "purchase com identificação web real deve formar payload");
assert.equal(purchase.client_id, base.attribution.clientId, "client_id deve ser exatamente o capturado pelo Google tag");
assert.equal(purchase.events[0].params.session_id, 123);
assert.equal(purchase.events[0].params.session_number, 4);
assert.equal(validateMeasurementPayload(purchase), null);
const playPurchase = buildMeasurementPayload({ ...base, eventName: "purchase", params: { ...params, payment_provider: "google_play", transaction_id: "GPA.0000-0000-0000-00000" } });
assert.ok(playPurchase, "compra Google Play confirmada deve formar payload");
assert.equal(validateMeasurementPayload(playPurchase), null);
const stripeAcquisition = buildMeasurementPayload({ ...base, eventName: "purchase_stripe", params: { ...params, transaction_id: "in_first_paid", is_first_activation: true } });
assert.ok(stripeAcquisition, "primeira ativação Stripe deve formar payload exclusivo");
assert.equal(validateMeasurementPayload(stripeAcquisition), null);
assert.equal(validateMeasurementPayload(buildMeasurementPayload({ ...base, eventName: "purchase_stripe", params: { ...params, payment_provider: "google_play", transaction_id: "GPA.invalid", is_first_activation: true } })), "invalid_purchase_stripe");
assert.equal(validateMeasurementPayload(buildMeasurementPayload({ ...base, eventName: "purchase_stripe", params: { ...params, value: 0, transaction_id: "in_zero", is_first_activation: true } })), "invalid_purchase_stripe");

assert.equal(buildMeasurementPayload({ ...base, attribution: {}, eventName: "purchase", params }), null, "sem client_id real não pode existir fallback aleatório");
for (const eventName of ["subscription_started", "subscription_renewed", "subscription_cancelled"] as const) {
  const payload = buildMeasurementPayload({ ...base, eventName, params: { ...params, transaction_id: `sub_${eventName}` } });
  assert.ok(payload);
  assert.equal(validateMeasurementPayload(payload), null, `${eventName} deve respeitar o contrato Measurement Protocol`);
}

const sensitive = JSON.parse(JSON.stringify(purchase));
sensitive.events[0].params.clinical_text = "não enviar";
assert.equal(validateMeasurementPayload(sensitive), "invalid_parameter", "dados clínicos não podem entrar no payload servidor");
const retry1 = new Date(nextAttempt(1)).getTime() - Date.now();
const retry2 = new Date(nextAttempt(2)).getTime() - Date.now();
assert.ok(retry1 >= 55_000 && retry2 >= 110_000, "backoff deve aumentar entre tentativas");

const penultimate = deliveryFailureUpdate(5, "measurement_protocol_configuration_unavailable");
assert.equal(penultimate.status, "pending", "a penúltima tentativa deve agendar retry");
assert.ok(penultimate.next_attempt_at, "retry precisa de next_attempt_at");
const last = deliveryFailureUpdate(6, "measurement_protocol_configuration_unavailable");
assert.equal(last.status, "failed", "a última tentativa deve encerrar como failed");
assert.equal(last.next_attempt_at, null, "falha terminal não pode permanecer reivindicável");
assert.equal(last.locked_at, null, "falha terminal deve liberar o lock");

const updates: Array<Record<string, unknown>> = [];
const fakeAdmin = {
  from() {
    return {
      update(value: Record<string, unknown>) {
        return { eq: async () => { updates.push(value); return { error: null }; } };
      }
    };
  }
};
(globalThis as unknown as { Deno: { env: { get(name: string): string | undefined } } }).Deno = { env: { get: () => undefined } };
const storedPayload = { params, attribution: base.attribution, occurredAt: base.occurredAt };
assert.equal(await deliverAnalyticsRow(fakeAdmin, { id: 1, event_name: "purchase", user_id: base.userId, payload: storedPayload, attempt_count: 5 }), "secrets_missing_retry_scheduled");
assert.equal(updates.at(-1)?.status, "pending");
assert.ok(updates.at(-1)?.next_attempt_at);
assert.equal(await deliverAnalyticsRow(fakeAdmin, { id: 2, event_name: "purchase", user_id: base.userId, payload: storedPayload, attempt_count: 6 }), "secrets_missing_failed");
assert.equal(updates.at(-1)?.status, "failed");
assert.equal(updates.at(-1)?.next_attempt_at, null);
assert.equal(updates.at(-1)?.last_error, "measurement_protocol_configuration_unavailable", "erro armazenado deve ser técnico e não conter segredo");

const recoveryUpdates: Array<{ value: Record<string, unknown>; filters: Array<[string, unknown]> }> = [];
const claimArgs: Array<Record<string, unknown>> = [];
const recoveryAdmin = {
  from(table: string) {
    if (table === "analytics_consents") {
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { analytics_granted: true } }) }) }) };
    }
    return {
      update(value: Record<string, unknown>) {
        const record = { value, filters: [] as Array<[string, unknown]> };
        recoveryUpdates.push(record);
        const chain = { eq(name: string, value: unknown) { record.filters.push([name, value]); return chain; } };
        return chain;
      }
    };
  },
  async rpc(_name: string, args: Record<string, unknown>) {
    claimArgs.push(args);
    if (claimArgs.length === 1) return { data: [] };
    return {
      data: [{
        id: 3,
        event_name: "purchase",
        user_id: base.userId,
        payload: args.p_payload,
        attempt_count: 2
      }]
    };
  }
};
assert.equal(
  await enqueueAndDeliverAnalyticsEvent(recoveryAdmin, {
    eventKey: "purchase:google_play:GPA.0000-0000-0000-00000",
    userId: base.userId,
    eventName: "purchase",
    provider: "google_play",
    params: { ...params, payment_provider: "google_play", transaction_id: "GPA.0000-0000-0000-00000" },
    attribution: base.attribution,
    occurredAt: base.occurredAt
  }),
  "secrets_missing_retry_scheduled",
  "falha antiga sem atribuição deve voltar à fila usando a mesma chave"
);
assert.equal(claimArgs.length, 2, "a mesma chave deve ser reivindicada novamente após a recuperação");
const recovery = recoveryUpdates[0];
assert.ok(recovery.filters.some(([name, value]) => name === "status" && value === "failed"));
assert.ok(recovery.filters.some(([name, value]) => name === "last_error" && value === "missing_real_web_attribution"));
assert.ok(recovery.filters.some(([name, value]) => name === "event_key" && value === "purchase:google_play:GPA.0000-0000-0000-00000"));
assert.equal((recovery.value.payload as { attribution: typeof base.attribution }).attribution.clientId, base.attribution.clientId);
console.log("measurement-protocol.test.ts: OK");
