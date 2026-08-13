import assert from "node:assert/strict";
import { buildMeasurementPayload, nextAttempt, validateMeasurementPayload } from "../supabase/functions/_shared/analyticsDelivery.ts";

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
console.log("measurement-protocol.test.ts: OK");
