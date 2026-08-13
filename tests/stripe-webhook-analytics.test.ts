import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildFirstStripePurchaseEvent } from "../supabase/functions/_shared/stripeAnalytics.ts";

const [source, deliverySource, migration, deliveryMigration, claimMigration] = await Promise.all([
  readFile(new URL("../supabase/functions/stripe-webhook/index.ts", import.meta.url), "utf8"),
  readFile(new URL("../supabase/functions/_shared/analyticsDelivery.ts", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/20260813231926_add_purchase_stripe_and_billing_realtime.sql", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/20260813122425_analytics_consents_and_server_delivery.sql", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/20260813192711_fix_analytics_delivery_claim_ambiguity.sql", import.meta.url), "utf8"),
]);

const confirmed = {
  provider: "stripe",
  paymentStatus: "paid",
  subscriptionId: "sub_confirmed_123",
  transactionId: "in_confirmed_123",
  value: 39,
  currency: "brl",
  planId: "monthly",
  planName: "Plano Mensal",
  hasPreviousPaidTransaction: false,
};
const acquisition = buildFirstStripePurchaseEvent(confirmed);
assert.ok(acquisition, "a primeira cobrança Stripe paga deve gerar purchase_stripe");
assert.equal(acquisition.eventName, "purchase_stripe");
assert.equal(acquisition.eventKey, "stripe:purchase_stripe:sub_confirmed_123");
assert.deepEqual(acquisition.params, {
  transaction_id: "in_confirmed_123",
  value: 39,
  currency: "BRL",
  payment_provider: "stripe",
  plan_id: "monthly",
  plan_name: "Plano Mensal",
  is_first_activation: true,
});
assert.equal(
  buildFirstStripePurchaseEvent({ ...confirmed })?.eventKey,
  acquisition.eventKey,
  "webhook repetido deve reivindicar a mesma chave server-side",
);
assert.equal(
  buildFirstStripePurchaseEvent({ ...confirmed, transactionId: "in_correlated_replay" })?.eventKey,
  acquisition.eventKey,
  "invoice, Checkout Session ou PaymentIntent correlato não pode duplicar a aquisição da assinatura",
);
assert.equal(buildFirstStripePurchaseEvent({ ...confirmed, hasPreviousPaidTransaction: true }), null, "renovação não gera purchase_stripe");
assert.equal(buildFirstStripePurchaseEvent({ ...confirmed, provider: "google_play" }), null, "Google Play nunca gera purchase_stripe");
assert.equal(buildFirstStripePurchaseEvent({ ...confirmed, paymentStatus: "processing" }), null, "pagamento pendente não gera conversão");
assert.equal(buildFirstStripePurchaseEvent({ ...confirmed, paymentStatus: "canceled" }), null, "pagamento cancelado não gera conversão");
assert.equal(buildFirstStripePurchaseEvent({ ...confirmed, value: 0 }), null, "valor não positivo não gera conversão");
assert.deepEqual(
  Object.keys(acquisition.params).sort(),
  ["currency", "is_first_activation", "payment_provider", "plan_id", "plan_name", "transaction_id", "value"].sort(),
  "payload não pode conter informação clínica ou identificador de paciente",
);

assert.match(source, /eventName: "purchase"/, "a receita consolidada deve preservar purchase");
assert.match(source, /buildFirstStripePurchaseEvent/, "o webhook deve construir a aquisição exclusiva Stripe");
assert.match(source, /amount: Number\(invoice\.amount_paid \|\| 0\) \/ 100/, "value deve vir da invoice paga");
assert.match(source, /currency: invoice\.currency \|\| "brl"/, "currency deve vir da invoice paga");
assert.match(source, /transactionId: invoice\.id/, "transaction_id deve vir da invoice paga");
assert.match(source, /\.neq\("stripe_invoice_id", invoice\.id\)/, "a primeira ativação deve ignorar somente o replay da própria invoice");
assert.match(source, /ga4ClientId/);
assert.doesNotMatch(source, /Math\.random\(\).*clientId|random non-identifying client_id/i, "webhook não pode fabricar client_id");
assert.match(deliverySource, /analytics_consents/, "a entrega deve respeitar o consentimento persistido");
assert.match(deliverySource, /event\.name === "purchase_stripe"[\s\S]*payment_provider !== "stripe"/, "o contrato deve rejeitar purchase_stripe de outro provedor");
assert.match(migration, /purchase_stripe/, "a restrição persistida deve aceitar o novo evento");
assert.match(migration, /pg_publication_tables[\s\S]*billing_subscriptions/, "a migração deve garantir billing_subscriptions no Realtime");
assert.match(migration, /not exists/i, "a inclusão no Realtime deve ser idempotente");
assert.match(deliveryMigration, /event_key text not null unique/, "a chave da aquisição deve ser única no banco");
assert.match(claimMigration, /ON CONFLICT ON CONSTRAINT analytics_event_deliveries_event_key_key DO NOTHING/, "replays devem ser ignorados atomicamente");

console.log("stripe-webhook-analytics.test.ts: OK");
