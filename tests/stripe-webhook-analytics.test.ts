import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../supabase/functions/stripe-webhook/index.ts", import.meta.url), "utf8");
const deliverySource = await readFile(new URL("../supabase/functions/_shared/analyticsDelivery.ts", import.meta.url), "utf8");
assert.match(source, /enqueueAndDeliverAnalyticsEvent/);
assert.match(source, /ga4ClientId/);
assert.match(source, /purchase:\$\{invoice\.id\}/);
assert.doesNotMatch(source, /Math\.random\(\).*clientId|random non-identifying client_id/i, "webhook não pode fabricar client_id");
assert.match(deliverySource, /analytics_consents/, "a entrega deve respeitar o consentimento persistido");
console.log("stripe-webhook-analytics.test.ts: OK");
