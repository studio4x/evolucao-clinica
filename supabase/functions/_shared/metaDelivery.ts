export type MetaPaymentProvider = "stripe" | "google_play";

declare const Deno: { env: { get(name: string): string | undefined } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TRANSACTION_ID = /^[A-Za-z0-9._-]{1,100}$/;
const PIXEL_ID = /^\d{5,30}$/;
const MAX_ATTEMPTS = 6;
const GRAPH_API_VERSION = "v25.0";

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function metaNextAttempt(attemptCount: number) {
  return new Date(Date.now() + Math.min(6 * 60 * 60 * 1000, 60_000 * 2 ** Math.max(0, attemptCount - 1))).toISOString();
}

export function metaDeliveryFailureUpdate(attemptCount: number, lastError: string) {
  const retryable = Number(attemptCount) < MAX_ATTEMPTS;
  return {
    status: retryable ? "pending" : "failed",
    next_attempt_at: retryable ? metaNextAttempt(attemptCount) : null,
    locked_at: null,
    last_error: lastError.slice(0, 120),
    updated_at: new Date().toISOString(),
  };
}

export async function buildMetaPurchasePayload(input: {
  userId: string;
  transactionId: string;
  value: number;
  currency: string;
  occurredAt: string;
}) {
  const eventTime = Math.floor(new Date(input.occurredAt).getTime() / 1000);
  if (!UUID.test(input.userId) || !TRANSACTION_ID.test(input.transactionId) || !Number.isFinite(input.value) || input.value <= 0 || input.currency !== "BRL" || !Number.isSafeInteger(eventTime) || eventTime <= 0) return null;
  return {
    data: [{
      event_name: "Purchase",
      event_time: eventTime,
      event_id: `purchase-${input.transactionId}`,
      action_source: "website",
      user_data: { external_id: [await sha256(input.userId)] },
      custom_data: { value: input.value, currency: "BRL" },
    }],
  };
}

export function validateMetaPurchasePayload(payload: any): string | null {
  const event = payload?.data?.length === 1 ? payload.data[0] : null;
  if (!event || event.event_name !== "Purchase" || event.action_source !== "website" || !Number.isSafeInteger(event.event_time) || !/^purchase-[A-Za-z0-9._-]{1,100}$/.test(event.event_id || "")) return "invalid_event";
  const externalIds = event.user_data?.external_id;
  if (!Array.isArray(externalIds) || externalIds.length !== 1 || !/^[a-f0-9]{64}$/.test(externalIds[0])) return "invalid_user_data";
  if (event.custom_data?.currency !== "BRL" || typeof event.custom_data?.value !== "number" || !Number.isFinite(event.custom_data.value) || event.custom_data.value <= 0) return "invalid_purchase";
  if (Object.keys(event).some((key) => !["event_name", "event_time", "event_id", "action_source", "user_data", "custom_data"].includes(key))) return "unexpected_event_data";
  if (Object.keys(event.user_data).some((key) => key !== "external_id") || Object.keys(event.custom_data).some((key) => !["value", "currency"].includes(key))) return "unexpected_parameter";
  return null;
}

async function configuredPixelId(admin: any) {
  const { data } = await admin.from("settings").select("api_key").eq("id", "tracking_settings").maybeSingle();
  try {
    const parsed = typeof data?.api_key === "string" ? JSON.parse(data.api_key) : data?.api_key;
    const pixelId = String(parsed?.fb_pixel_id || "").trim();
    return PIXEL_ID.test(pixelId) ? pixelId : null;
  } catch {
    return null;
  }
}

export async function enqueueAndDeliverMetaPurchase(admin: any, input: {
  eventKey: string;
  userId: string;
  provider: MetaPaymentProvider;
  transactionId: string;
  value: number;
  currency: string;
  occurredAt: string;
}) {
  const { data: consent } = await admin.from("analytics_consents").select("marketing_granted").eq("user_id", input.userId).maybeSingle();
  if (!consent?.marketing_granted) return "consent_denied";
  const payload = { transactionId: input.transactionId, value: input.value, currency: input.currency, occurredAt: input.occurredAt };
  const { data: claimed } = await admin.rpc("claim_meta_event_delivery", {
    p_event_key: input.eventKey,
    p_user_id: input.userId,
    p_event_name: "Purchase",
    p_provider: input.provider,
    p_payload: payload,
    p_max_attempts: MAX_ATTEMPTS,
  });
  const row = Array.isArray(claimed) ? claimed[0] : null;
  if (!row) return "already_claimed";
  return await deliverMetaRow(admin, row);
}

export async function deliverMetaRow(admin: any, row: any) {
  const stored = row.payload || {};
  const payload = await buildMetaPurchasePayload({
    userId: row.user_id,
    transactionId: String(stored.transactionId || ""),
    value: Number(stored.value),
    currency: String(stored.currency || "").toUpperCase(),
    occurredAt: String(stored.occurredAt || ""),
  });
  const permanent = (message: string) => admin.from("meta_event_deliveries").update({ status: "failed", next_attempt_at: null, locked_at: null, last_error: message, updated_at: new Date().toISOString() }).eq("id", row.id);
  if (!payload) { await permanent("invalid_confirmed_purchase"); return "invalid_purchase"; }
  const validation = validateMetaPurchasePayload(payload);
  if (validation) { await permanent(`validation:${validation}`); return validation; }

  const accessToken = Deno.env.get("META_CAPI_TOKEN");
  const pixelId = await configuredPixelId(admin);
  if (!accessToken || !pixelId) {
    const update = metaDeliveryFailureUpdate(row.attempt_count, "meta_capi_configuration_unavailable");
    await admin.from("meta_event_deliveries").update(update).eq("id", row.id);
    return update.status === "pending" ? "secrets_missing_retry_scheduled" : "secrets_missing_failed";
  }

  try {
    const response = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${pixelId}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, access_token: accessToken }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || Number(result?.events_received) < 1) {
      const update = metaDeliveryFailureUpdate(row.attempt_count, `meta_capi_http_${response.status}`);
      await admin.from("meta_event_deliveries").update(update).eq("id", row.id);
      return update.status === "pending" ? "retry_scheduled" : "failed";
    }
    await admin.from("meta_event_deliveries").update({ status: "sent", sent_at: new Date().toISOString(), next_attempt_at: null, locked_at: null, last_error: null, updated_at: new Date().toISOString() }).eq("id", row.id);
    return "sent";
  } catch {
    const update = metaDeliveryFailureUpdate(row.attempt_count, "meta_capi_network_error");
    await admin.from("meta_event_deliveries").update(update).eq("id", row.id);
    return update.status === "pending" ? "retry_scheduled" : "failed";
  }
}
