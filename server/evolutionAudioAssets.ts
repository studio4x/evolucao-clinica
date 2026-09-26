import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import {
  EVOLUTION_AUDIO_BUCKET,
  calculateSignedAudioUrlTtl,
  classifyAudioStorageError,
  detectAudioMimeType,
  getPersistentAudioExtension,
  isAudioRetentionEnabled,
  normalizePersistentAudioMimeType,
} from "./evolutionAudioPolicy.js";

type AudioPolicy = { maxDurationSeconds: number; maxFileBytes: number };
type AuthorizedAudioAsset = {
  audio_id: string;
  evolution_id: string;
  bucket: string;
  storage_path: string;
  mime_type: string;
  expires_at: string;
  remaining_seconds: number;
  authorization_status: "available" | "expired" | "revoked" | "deleted" | "not_available";
};

type RouteDependencies = {
  app: any;
  requireAuth: any;
  supabaseAdmin: SupabaseClient<any, any, any>;
  resolveAudioPolicy: (professionalId: string) => Promise<AudioPolicy>;
  getAudioDurationSeconds: (buffer: Buffer, mimeType: string) => Promise<number | null>;
  env?: NodeJS.ProcessEnv;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function firstRow<T>(value: T[] | T | null): T | null {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

function requestId(req: any): string {
  const candidate = String(req.headers?.["x-request-id"] || "").trim();
  return candidate && candidate.length <= 128 ? candidate : randomUUID();
}

async function recordAudioEvent(
  admin: SupabaseClient<any, any, any>,
  audioId: string,
  eventType: string,
  correlationId: string,
  technicalMetadata: Record<string, unknown> = {},
) {
  const { error } = await admin.from("evolution_audio_asset_events").insert({
    audio_id: audioId,
    event_type: eventType,
    request_id: correlationId,
    technical_metadata: technicalMetadata,
  });
  if (error) console.warn("[AudioRetention] technical_event_write_failed", { eventType });
}

export async function authorizeAudioAsset(
  admin: SupabaseClient<any, any, any>,
  audioId: string,
  professionalId: string,
): Promise<AuthorizedAudioAsset | null> {
  const { data, error } = await admin.rpc("authorize_evolution_audio_asset", {
    p_asset_id: audioId,
    p_professional_id: professionalId,
  });
  if (error) throw new Error("audio_authorization_failed");
  return firstRow(data as AuthorizedAudioAsset[] | null);
}

function sendAuthorizationFailure(res: any, asset: AuthorizedAudioAsset | null) {
  if (!asset) return res.status(404).json({ code: "AUDIO_ASSET_NOT_FOUND", error: "Áudio não encontrado." });
  if (["expired", "revoked", "deleted"].includes(asset.authorization_status)) {
    return res.status(410).json({ code: "AUDIO_ASSET_GONE", error: "Este áudio não está mais disponível." });
  }
  return res.status(409).json({ code: "AUDIO_ASSET_NOT_AVAILABLE", error: "O áudio ainda não está disponível." });
}

async function removeStorageObject(
  admin: SupabaseClient<any, any, any>,
  asset: { audio_id: string; bucket: string; storage_path: string },
  correlationId: string,
) {
  const { error } = await admin.storage.from(asset.bucket).remove([asset.storage_path]);
  if (!error || classifyAudioStorageError(error) === "storage_missing") {
    const { error: completeError } = await admin.rpc("complete_evolution_audio_asset_deletion", {
      p_asset_id: asset.audio_id,
      p_claim_token: null,
    });
    if (completeError) throw new Error("audio_deletion_finalize_failed");
    await recordAudioEvent(admin, asset.audio_id, "deleted", correlationId, { storageMissing: !!error });
    return { deleted: true, storageMissing: !!error };
  }

  const category = classifyAudioStorageError(error);
  await admin.rpc("fail_evolution_audio_asset_deletion", {
    p_asset_id: asset.audio_id,
    p_claim_token: null,
    p_error_category: category,
    p_increment_attempt: true,
  });
  await recordAudioEvent(admin, asset.audio_id, "deletion_failed", correlationId, { errorCategory: category });
  return { deleted: false, storageMissing: false };
}

export function registerEvolutionAudioAssetRoutes(dependencies: RouteDependencies) {
  const { app, requireAuth, supabaseAdmin, resolveAudioPolicy, getAudioDurationSeconds } = dependencies;
  const env = dependencies.env || process.env;

  app.get("/api/evolution-audio-assets/status", requireAuth, (req: any, res: any) => {
    res.set("Cache-Control", "no-store");
    return res.json({ enabled: isAudioRetentionEnabled(env, req.user.id) });
  });

  app.post("/api/evolution-audio-assets/prepare", requireAuth, async (req: any, res: any) => {
    const correlationId = requestId(req);
    if (!isAudioRetentionEnabled(env, req.user.id)) {
      return res.status(503).json({ code: "AUDIO_RETENTION_DISABLED", error: "Nova arquitetura de áudio desabilitada." });
    }

    const evolutionId = String(req.body?.evolutionId || "");
    const position = Number(req.body?.position);
    const clientUploadKey = String(req.body?.clientUploadKey || "").trim();
    const mimeType = normalizePersistentAudioMimeType(req.body?.mimeType);
    const reportedBytes = Number(req.body?.sizeBytes || 0);
    if (
      !UUID_PATTERN.test(evolutionId)
      || !Number.isInteger(position) || position < 0 || position > 99
      || !clientUploadKey || clientUploadKey.length > 128
      || !mimeType
      || !Number.isFinite(reportedBytes) || reportedBytes < 0
    ) {
      return res.status(400).json({ code: "AUDIO_PREPARE_INVALID", error: "Dados de upload inválidos." });
    }

    const policy = await resolveAudioPolicy(req.user.id);
    if (reportedBytes > policy.maxFileBytes) {
      return res.status(400).json({ code: "AUDIO_FILE_SIZE_LIMIT", error: "Arquivo acima do limite do plano." });
    }

    const extension = getPersistentAudioExtension(mimeType);
    const proposedAssetId = randomUUID();
    const storagePath = `${req.user.id}/${evolutionId}/${proposedAssetId}.${extension}`;
    const { data, error } = await supabaseAdmin.rpc("prepare_evolution_audio_asset", {
      p_asset_id: proposedAssetId,
      p_evolution_id: evolutionId,
      p_professional_id: req.user.id,
      p_position: position,
      p_storage_path: storagePath,
      p_client_upload_key: clientUploadKey,
      p_mime_type: mimeType,
    });
    if (error) return res.status(500).json({ code: "AUDIO_PREPARE_FAILED", error: "Não foi possível preparar o upload." });
    const asset: any = firstRow(data as any[] | null);
    if (!asset) return res.status(404).json({ code: "EVOLUTION_NOT_FOUND", error: "Evolução não encontrada." });
    if (asset.lifecycle_status === "available") {
      return res.json({ audioId: asset.id, status: "available", expiresAt: asset.expires_at, alreadyFinalized: true });
    }
    if (asset.lifecycle_status !== "uploading") {
      return res.status(409).json({ code: "AUDIO_UPLOAD_CLOSED", error: "Esta sessão de upload não está mais disponível." });
    }

    const { data: signedUpload, error: signedUploadError } = await supabaseAdmin.storage
      .from(EVOLUTION_AUDIO_BUCKET)
      .createSignedUploadUrl(asset.storage_path, { upsert: false });
    if (signedUploadError || !signedUpload) {
      await supabaseAdmin.rpc("reject_evolution_audio_asset", {
        p_asset_id: asset.id,
        p_professional_id: req.user.id,
        p_error_category: "signed_upload_failed",
      });
      return res.status(500).json({ code: "AUDIO_UPLOAD_AUTH_FAILED", error: "Não foi possível autorizar o upload." });
    }

    await recordAudioEvent(supabaseAdmin, asset.id, "upload_prepared", correlationId, {
      mimeType,
      position,
      reportedBytes,
    });
    return res.status(201).json({
      audioId: asset.id,
      status: "uploading",
      expiresAt: asset.expires_at,
      upload: { path: signedUpload.path, token: signedUpload.token },
    });
  });

  app.post("/api/evolution-audio-assets/:audioId/finalize", requireAuth, async (req: any, res: any) => {
    const correlationId = requestId(req);
    if (!isAudioRetentionEnabled(env, req.user.id)) {
      return res.status(503).json({ code: "AUDIO_RETENTION_DISABLED", error: "Nova arquitetura de áudio desabilitada." });
    }
    if (!UUID_PATTERN.test(String(req.params.audioId || ""))) {
      return res.status(404).json({ code: "AUDIO_ASSET_NOT_FOUND", error: "Áudio não encontrado." });
    }

    const asset = await authorizeAudioAsset(supabaseAdmin, req.params.audioId, req.user.id);
    if (!asset) return sendAuthorizationFailure(res, asset);
    if (asset.authorization_status === "available") {
      return res.json({ audioId: asset.audio_id, status: "available", expiresAt: asset.expires_at, alreadyFinalized: true });
    }
    if (asset.authorization_status !== "not_available") return sendAuthorizationFailure(res, asset);

    const { data: audioFile, error: downloadError } = await supabaseAdmin.storage
      .from(asset.bucket)
      .download(asset.storage_path);
    if (downloadError || !audioFile) {
      await supabaseAdmin.rpc("reject_evolution_audio_asset", {
        p_asset_id: asset.audio_id,
        p_professional_id: req.user.id,
        p_error_category: classifyAudioStorageError(downloadError),
      });
      if (classifyAudioStorageError(downloadError) === "storage_missing") {
        await supabaseAdmin.rpc("complete_evolution_audio_asset_deletion", { p_asset_id: asset.audio_id, p_claim_token: null });
      }
      return res.status(409).json({ code: "AUDIO_UPLOAD_MISSING", error: "Upload não encontrado para finalização." });
    }

    const buffer = Buffer.from(await audioFile.arrayBuffer());
    const detectedMimeType = detectAudioMimeType(buffer);
    const expectedMimeType = normalizePersistentAudioMimeType(asset.mime_type);
    const policy = await resolveAudioPolicy(req.user.id);
    let durationSeconds: number | null = null;
    if (detectedMimeType && detectedMimeType === expectedMimeType && buffer.byteLength <= policy.maxFileBytes) {
      durationSeconds = await getAudioDurationSeconds(buffer, detectedMimeType);
    }

    if (!detectedMimeType || detectedMimeType !== expectedMimeType || !durationSeconds || !Number.isFinite(durationSeconds)) {
      await supabaseAdmin.rpc("reject_evolution_audio_asset", {
        p_asset_id: asset.audio_id,
        p_professional_id: req.user.id,
        p_error_category: detectedMimeType ? "duration_unavailable" : "mime_invalid",
      });
      await removeStorageObject(supabaseAdmin, asset, correlationId);
      return res.status(400).json({ code: "AUDIO_UPLOAD_INVALID", error: "O arquivo enviado não é um áudio válido." });
    }

    const authoritativeDuration = Math.max(0.001, durationSeconds);
    const { data: finalizeStatus, error: finalizeError } = await supabaseAdmin.rpc("finalize_evolution_audio_asset", {
      p_asset_id: asset.audio_id,
      p_professional_id: req.user.id,
      p_mime_type: detectedMimeType,
      p_size_bytes: buffer.byteLength,
      p_duration_seconds: authoritativeDuration,
      p_max_file_bytes: policy.maxFileBytes,
      p_max_evolution_duration_seconds: policy.maxDurationSeconds,
    });
    if (finalizeError) return res.status(500).json({ code: "AUDIO_FINALIZE_FAILED", error: "Não foi possível finalizar o upload." });
    if (!["available", "already_available"].includes(String(finalizeStatus))) {
      await removeStorageObject(supabaseAdmin, asset, correlationId);
      const statusCode = finalizeStatus === "expired" ? 410 : 400;
      return res.status(statusCode).json({ code: "AUDIO_UPLOAD_REJECTED", error: "O upload não atende à política de áudio." });
    }

    await recordAudioEvent(supabaseAdmin, asset.audio_id, "upload_finalized", correlationId, {
      bytes: buffer.byteLength,
      durationSeconds: authoritativeDuration,
      mimeType: detectedMimeType,
    });
    return res.json({ audioId: asset.audio_id, status: "available", expiresAt: asset.expires_at });
  });

  app.get("/api/evolution-audio-assets/:audioId/signed-url", requireAuth, async (req: any, res: any) => {
    const correlationId = requestId(req);
    res.set("Cache-Control", "no-store");
    if (!isAudioRetentionEnabled(env, req.user.id)) {
      return res.status(503).json({ code: "AUDIO_RETENTION_DISABLED", error: "Nova arquitetura de áudio desabilitada." });
    }
    const asset = UUID_PATTERN.test(String(req.params.audioId || ""))
      ? await authorizeAudioAsset(supabaseAdmin, req.params.audioId, req.user.id)
      : null;
    if (!asset || asset.authorization_status !== "available") return sendAuthorizationFailure(res, asset);
    const ttl = calculateSignedAudioUrlTtl(Number(asset.remaining_seconds));
    if (ttl <= 0) return res.status(410).json({ code: "AUDIO_ASSET_GONE", error: "Este áudio expirou." });

    const { data, error } = await supabaseAdmin.storage.from(asset.bucket).createSignedUrl(asset.storage_path, ttl);
    if (error || !data?.signedUrl) {
      return res.status(503).json({ code: "AUDIO_ACCESS_FAILED", error: "Não foi possível autorizar o acesso ao áudio." });
    }
    await recordAudioEvent(supabaseAdmin, asset.audio_id, "access_granted", correlationId, { ttlSeconds: ttl });
    return res.json({ audioId: asset.audio_id, signedUrl: data.signedUrl, expiresInSeconds: ttl });
  });

  app.delete("/api/evolution-audio-assets/:audioId", requireAuth, async (req: any, res: any) => {
    const correlationId = requestId(req);
    if (!UUID_PATTERN.test(String(req.params.audioId || ""))) {
      return res.status(404).json({ code: "AUDIO_ASSET_NOT_FOUND", error: "Áudio não encontrado." });
    }
    const { data, error } = await supabaseAdmin.rpc("request_evolution_audio_asset_deletion", {
      p_asset_id: req.params.audioId,
      p_professional_id: req.user.id,
    });
    if (error) return res.status(500).json({ code: "AUDIO_DELETE_FAILED", error: "Não foi possível solicitar a exclusão." });
    const asset: any = firstRow(data as any[] | null);
    if (!asset) return res.status(404).json({ code: "AUDIO_ASSET_NOT_FOUND", error: "Áudio não encontrado." });
    if (asset.lifecycle_status === "deleted") return res.json({ audioId: asset.audio_id, status: "deleted", alreadyDeleted: true });

    await recordAudioEvent(supabaseAdmin, asset.audio_id, "deletion_requested", correlationId);
    const result = await removeStorageObject(supabaseAdmin, asset, correlationId);
    return res.status(result.deleted ? 200 : 202).json({
      audioId: asset.audio_id,
      status: result.deleted ? "deleted" : "deletion_pending",
    });
  });
}
