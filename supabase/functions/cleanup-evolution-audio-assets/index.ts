import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";

type ClaimedAudio = {
  audio_id: string;
  bucket: string;
  storage_path: string;
  deletion_attempts: number;
  claim_token: string;
};

function safeEqual(left: string, right: string) {
  if (!left || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function classifyStorageError(error: unknown): string {
  const value = error as { status?: number; statusCode?: number; message?: string } | null;
  const status = Number(value?.statusCode || value?.status || 0);
  const message = String(value?.message || "").toLowerCase();
  if (status === 401 || status === 403) return "storage_auth";
  if (status === 404 || message.includes("not found")) return "storage_missing";
  if (status === 408 || status === 504 || message.includes("timeout")) return "storage_timeout";
  if (status >= 500 || message.includes("unavailable")) return "storage_unavailable";
  return "storage_unknown";
}

function adminClient() {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !key) throw new Error("edge_environment_invalid");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Método não permitido.", { status: 405 });
  const configuredSecret = Deno.env.get("AUDIO_RETENTION_CLEANUP_SECRET") || "";
  if (configuredSecret.length < 32 || !safeEqual(request.headers.get("x-audio-cleanup-secret") || "", configuredSecret)) {
    return new Response("Não autorizado.", { status: 401 });
  }

  const input = await request.json().catch(() => ({}));
  const batchSize = Math.max(1, Math.min(100, Number(input?.batchSize) || 25));
  const claimToken = crypto.randomUUID();
  const requestId = crypto.randomUUID();
  const admin = adminClient();
  const { data, error } = await admin.rpc("claim_evolution_audio_asset_cleanup", {
    p_batch_size: batchSize,
    p_claim_token: claimToken,
  });
  if (error) return Response.json({ error: "cleanup_claim_failed" }, { status: 500 });

  let deleted = 0;
  let pending = 0;
  let missing = 0;
  for (const asset of (data || []) as ClaimedAudio[]) {
    const { error: removeError } = await admin.storage.from(asset.bucket).remove([asset.storage_path]);
    const errorCategory = classifyStorageError(removeError);
    if (!removeError || errorCategory === "storage_missing") {
      const { error: finalizeError } = await admin.rpc("complete_evolution_audio_asset_deletion", {
        p_asset_id: asset.audio_id,
        p_claim_token: claimToken,
      });
      if (finalizeError) {
        pending += 1;
        await admin.rpc("fail_evolution_audio_asset_deletion", {
          p_asset_id: asset.audio_id,
          p_claim_token: claimToken,
          p_error_category: "metadata_finalize_failed",
          p_increment_attempt: false,
        });
        continue;
      }
      deleted += 1;
      if (removeError) missing += 1;
      await admin.from("evolution_audio_asset_events").insert({
        audio_id: asset.audio_id,
        event_type: removeError ? "reconciled_storage_missing" : "cleanup_deleted",
        request_id: requestId,
        technical_metadata: { attempt: asset.deletion_attempts },
      });
      continue;
    }

    pending += 1;
    await admin.rpc("fail_evolution_audio_asset_deletion", {
      p_asset_id: asset.audio_id,
      p_claim_token: claimToken,
      p_error_category: errorCategory,
      p_increment_attempt: false,
    });
    await admin.from("evolution_audio_asset_events").insert({
      audio_id: asset.audio_id,
      event_type: "cleanup_failed",
      request_id: requestId,
      technical_metadata: { attempt: asset.deletion_attempts, errorCategory },
    });
  }

  return Response.json({ claimed: (data || []).length, deleted, pending, storageMissing: missing });
});
