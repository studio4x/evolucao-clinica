import { createAdminClient } from "../_shared/billing.ts";
import { deliverAnalyticsRow } from "../_shared/analyticsDelivery.ts";
import { deliverMetaRow } from "../_shared/metaDelivery.ts";

function safeEqual(left: string, right: string) {
  if (!left || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Método não permitido.", { status: 405 });
  const configuredToken = Deno.env.get("ANALYTICS_DELIVERY_CRON_TOKEN") || "";
  if (!safeEqual(req.headers.get("x-analytics-delivery-token") || "", configuredToken)) return new Response("Não autorizado.", { status: 401 });
  const body = await req.json().catch(() => ({}));
  const limit = Math.max(1, Math.min(50, Number(body?.limit) || 25));
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data: rows, error } = await admin.from("analytics_event_deliveries")
    .select("event_key, user_id, event_name, provider, payload, status, next_attempt_at, locked_at")
    .in("status", ["pending", "failed", "processing"])
    .order("next_attempt_at", { ascending: true, nullsFirst: false })
    .limit(limit * 4);
  if (error) return new Response("Falha ao buscar entregas.", { status: 500 });
  const expiredLock = Date.now() - 15 * 60_000;
  const candidates = (rows || []).filter((row: any) => {
    if ((row.status === "pending" || row.status === "failed") && row.next_attempt_at) return new Date(row.next_attempt_at).getTime() <= Date.now();
    return row.status === "processing" && row.locked_at && new Date(row.locked_at).getTime() < expiredLock;
  }).slice(0, limit);
  let claimed = 0;
  for (const candidate of candidates || []) {
    const { data: rows } = await admin.rpc("claim_analytics_event_delivery", {
      p_event_key: candidate.event_key,
      p_user_id: candidate.user_id,
      p_event_name: candidate.event_name,
      p_provider: candidate.provider,
      p_payload: candidate.payload,
      p_max_attempts: 6,
    });
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) continue;
    claimed += 1;
    await deliverAnalyticsRow(admin, row);
  }

  const { data: metaRows, error: metaError } = await admin.from("meta_event_deliveries")
    .select("event_key, user_id, event_name, provider, payload, status, next_attempt_at, locked_at")
    .in("status", ["pending", "failed", "processing"])
    .order("next_attempt_at", { ascending: true, nullsFirst: false })
    .limit(limit * 4);
  if (metaError) return new Response("Falha ao buscar entregas da Meta.", { status: 500 });
  const metaCandidates = (metaRows || []).filter((row: any) => {
    if ((row.status === "pending" || row.status === "failed") && row.next_attempt_at) return new Date(row.next_attempt_at).getTime() <= Date.now();
    return row.status === "processing" && row.locked_at && new Date(row.locked_at).getTime() < expiredLock;
  }).slice(0, limit);
  let metaClaimed = 0;
  for (const candidate of metaCandidates) {
    const { data: claimedRows } = await admin.rpc("claim_meta_event_delivery", {
      p_event_key: candidate.event_key,
      p_user_id: candidate.user_id,
      p_event_name: candidate.event_name,
      p_provider: candidate.provider,
      p_payload: candidate.payload,
      p_max_attempts: 6,
    });
    const row = Array.isArray(claimedRows) ? claimedRows[0] : null;
    if (!row) continue;
    metaClaimed += 1;
    await deliverMetaRow(admin, row);
  }
  return Response.json({ processed: { analytics: claimed, meta: metaClaimed } });
});
