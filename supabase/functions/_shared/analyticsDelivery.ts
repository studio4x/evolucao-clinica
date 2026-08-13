export type AnalyticsEventName = "purchase" | "purchase_stripe" | "subscription_started" | "subscription_renewed" | "subscription_cancelled";
export type AnalyticsPaymentProvider = "stripe" | "google_play";
declare const Deno: { env: { get(name: string): string | undefined } };
type Attribution = { clientId?: string; sessionId?: number; sessionNumber?: number };
type AnalyticsParameter = string | number | boolean;
const EVENT_NAMES = new Set<AnalyticsEventName>(["purchase", "purchase_stripe", "subscription_started", "subscription_renewed", "subscription_cancelled"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CLIENT_ID = /^\d+\.\d+$/;
const PARAMETER_NAME = /^[a-z][a-z0-9_]{0,39}$/;
const MAX_ATTEMPTS = 6;
const ALLOWED_PARAMS = new Set(["transaction_id", "value", "currency", "plan_id", "plan_name", "payment_provider", "is_first_activation", "session_id", "session_number", "engagement_time_msec"]);

export function nextAttempt(attemptCount: number) {
  return new Date(Date.now() + Math.min(6 * 60 * 60 * 1000, 60_000 * 2 ** Math.max(0, attemptCount - 1))).toISOString();
}

export function deliveryFailureUpdate(attemptCount: number, lastError: string) {
  const retryable = Number(attemptCount) < MAX_ATTEMPTS;
  return {
    status: retryable ? "pending" : "failed",
    next_attempt_at: retryable ? nextAttempt(attemptCount) : null,
    locked_at: null,
    last_error: lastError.slice(0, 240),
    updated_at: new Date().toISOString(),
  };
}

export function buildMeasurementPayload(input: { eventName: AnalyticsEventName; userId: string; params: Record<string, AnalyticsParameter>; attribution: Attribution; occurredAt: string }) {
  if (!EVENT_NAMES.has(input.eventName) || !UUID.test(input.userId) || !input.attribution.clientId || !CLIENT_ID.test(input.attribution.clientId)) return null;
  const occurredAt = new Date(input.occurredAt).getTime();
  if (!Number.isFinite(occurredAt)) return null;
  const params: Record<string, AnalyticsParameter> = { ...input.params, engagement_time_msec: 1 };
  if (input.attribution.sessionId) params.session_id = input.attribution.sessionId;
  if (input.attribution.sessionNumber) params.session_number = input.attribution.sessionNumber;
  return { client_id: input.attribution.clientId, user_id: input.userId, timestamp_micros: occurredAt * 1000, events: [{ name: input.eventName, params }] };
}

export function validateMeasurementPayload(payload: any): string | null {
  if (!payload || !CLIENT_ID.test(payload.client_id || "") || !UUID.test(payload.user_id || "") || !Number.isSafeInteger(payload.timestamp_micros) || !Array.isArray(payload.events) || payload.events.length !== 1) return "invalid_envelope";
  const event = payload.events[0];
  if (!EVENT_NAMES.has(event?.name) || !event?.params || Object.keys(event.params).length > 25) return "invalid_event";
  if (event.name === "purchase" && (!event.params.transaction_id || typeof event.params.value !== "number" || event.params.value <= 0 || event.params.currency !== "BRL" || !event.params.plan_id || !event.params.plan_name || !["stripe", "google_play"].includes(event.params.payment_provider))) return "invalid_purchase";
  if (event.name === "purchase_stripe" && (!event.params.transaction_id || typeof event.params.value !== "number" || event.params.value <= 0 || event.params.currency !== "BRL" || !event.params.plan_id || !event.params.plan_name || event.params.payment_provider !== "stripe" || event.params.is_first_activation !== true)) return "invalid_purchase_stripe";
  for (const [key, value] of Object.entries(event.params)) if (!ALLOWED_PARAMS.has(key) || !PARAMETER_NAME.test(key) || (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") || (typeof value === "string" && value.length > 100) || (typeof value === "number" && !Number.isFinite(value))) return "invalid_parameter";
  return null;
}

export async function enqueueAndDeliverAnalyticsEvent(admin: any, input: { eventKey: string; userId: string; eventName: AnalyticsEventName; provider?: AnalyticsPaymentProvider; params: Record<string, AnalyticsParameter>; attribution: Attribution; occurredAt: string }) {
  const { data: consent } = await admin.from("analytics_consents").select("analytics_granted").eq("user_id", input.userId).maybeSingle();
  if (!consent?.analytics_granted) return "consent_denied";
  const payload = { params: input.params, attribution: input.attribution, occurredAt: input.occurredAt };
  const { data: claimed } = await admin.rpc("claim_analytics_event_delivery", { p_event_key: input.eventKey, p_user_id: input.userId, p_event_name: input.eventName, p_provider: input.provider || "stripe", p_payload: payload, p_max_attempts: MAX_ATTEMPTS });
  const row = Array.isArray(claimed) ? claimed[0] : null;
  if (!row) return "already_claimed";
  return await deliverAnalyticsRow(admin, row);
}

export async function deliverAnalyticsRow(admin: any, row: any) {
  const stored = row.payload || {};
  const eventPayload = buildMeasurementPayload({ eventName: row.event_name, userId: row.user_id, params: stored.params || {}, attribution: stored.attribution || {}, occurredAt: stored.occurredAt });
  const permanent = (message: string) => admin.from("analytics_event_deliveries").update({ status: "failed", next_attempt_at: null, locked_at: null, last_error: message, updated_at: new Date().toISOString() }).eq("id", row.id);
  if (!eventPayload) { await permanent("missing_real_web_attribution"); return "missing_attribution"; }
  const validation = validateMeasurementPayload(eventPayload);
  if (validation) { await permanent(`validation:${validation}`); return validation; }
  const measurementId = Deno.env.get("GA4_MEASUREMENT_ID");
  const apiSecret = Deno.env.get("GA4_API_SECRET");
  if (!measurementId || !apiSecret) {
    const update = deliveryFailureUpdate(row.attempt_count, "measurement_protocol_configuration_unavailable");
    await admin.from("analytics_event_deliveries").update(update).eq("id", row.id);
    return update.status === "pending" ? "secrets_missing_retry_scheduled" : "secrets_missing_failed";
  }
  const shouldValidate = ["development", "test", "staging"].includes(String(Deno.env.get("ANALYTICS_MEASUREMENT_ENV") || "").toLowerCase());
  try {
    if (shouldValidate) {
      const validationResponse = await fetch(`https://www.google-analytics.com/debug/mp/collect?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...eventPayload, validation_behavior: "ENFORCE_RECOMMENDATIONS" }) });
      const validationBody = await validationResponse.json().catch(() => ({}));
      if (!validationResponse.ok || (validationBody.validationMessages || []).length) {
        const codes = (validationBody.validationMessages || []).map((message: { validationCode?: string }) => message.validationCode || "unknown").slice(0, 5);
        console.warn("[analytics] Measurement Protocol validation failed", codes);
        await permanent("measurement_protocol_validation_failed");
        return "validation_failed";
      }
    }
    const response = await fetch(`https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(eventPayload) });
    if (!response.ok) throw new Error(`Measurement Protocol HTTP ${response.status}`);
    await admin.from("analytics_event_deliveries").update({ status: "sent", sent_at: new Date().toISOString(), locked_at: null, last_error: null, updated_at: new Date().toISOString() }).eq("id", row.id);
    return "sent";
  } catch (error) {
    const update = deliveryFailureUpdate(row.attempt_count, "measurement_protocol_network_error");
    await admin.from("analytics_event_deliveries").update(update).eq("id", row.id);
    return update.status === "pending" ? "retry_scheduled" : "failed";
  }
}
