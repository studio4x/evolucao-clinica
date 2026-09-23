import { createHash, randomUUID } from "node:crypto";
import { GoogleGenAI } from "@google/genai";
import { getAudioDurationFromBytes } from "../src/utils/audioDuration.js";
import { resolveAudioAssetMimeType } from "./audioAssetRoutes.js";
import { transcribeGeminiAudio, type GeminiAudioTransportResult } from "./audioTranscriptionTransport.js";

const AUDIO_ASSET_BUCKET = "evolution-audio";
const DEFAULT_TRANSCRIPTION_PROMPT = "Transcreva integralmente este áudio clínico em português do Brasil, preservando o sentido do relato da terapeuta ocupacional. Corrija apenas vícios de fala, repetições desnecessárias e ruídos de linguagem. Não invente informações. Retorne somente a transcrição final em texto corrido, sem títulos, sem cabeçalhos, sem resumos, sem contexto adicional, sem explicações, sem listas e sem qualquer frase de abertura ou encerramento.";

export type ProcessingAsset = {
  id: string;
  evolutionId: string;
  professionalId: string;
  organizationPatientId: string | null;
  evolutionStatus: string | null;
  transcriptionStatus: string;
  transcriptionText: string | null;
  durationSeconds: number;
  mimeType: string;
  contentHash: string;
  storagePath: string;
};

export type ProcessingReservation = {
  reservationId: string;
  status: "pending" | "completed";
};

export type ProcessingRepository = {
  readAsset: (assetId: string) => Promise<ProcessingAsset | null>;
  reserveAsset: (input: { assetId: string; professionalId: string; limitSeconds: number; reservationId: string }) => Promise<{ status: string; reservation: ProcessingReservation | null }>;
  claimAsset: (assetId: string, professionalId: string) => Promise<string>;
  downloadAsset: (storagePath: string) => Promise<Buffer>;
  completeAsset: (input: { assetId: string; reservationId: string; professionalId: string; transcription: string }) => Promise<string>;
  failAsset: (input: { assetId: string; professionalId: string; reservationId: string | null; message: string }) => Promise<string>;
  releaseReservation: (reservationId: string, professionalId: string) => Promise<boolean>;
};

export type ProcessingRouteDependencies = {
  repository: ProcessingRepository;
  authorizeAsset: (asset: ProcessingAsset, professionalId: string, authorizationHeader: string) => Promise<void>;
  resolveAudioPolicy: (professionalId: string) => Promise<{ maxDurationSeconds: number; maxFileBytes: number }>;
  consumeRateLimit: (professionalId: string) => { allowed: boolean; retryAfterSeconds: number };
  getCurrentUsageMonth: () => string;
  getMonthlyUsageSeconds: (professionalId: string, usageMonth: string) => Promise<number>;
  incrementMonthlyUsageSeconds: (professionalId: string, usageMonth: string, deltaSeconds: number) => Promise<number>;
  monthlyLimitSeconds: number;
  getGeminiSettings: () => Promise<{ apiKey: string; modelName: string }>;
  resolveTranscriptionModel: (modelName: string) => string;
  isQuotaRelatedError: (error: any) => boolean;
  createGeminiClient: (apiKey: string) => unknown;
  transcribeGeminiAudio: typeof transcribeGeminiAudio;
  recordUsage: (input: {
    professionalId: string;
    model: string;
    durationSeconds: number;
    usageMetadata: any;
  }) => Promise<void>;
};

export type ProcessingResult = {
  cached: boolean;
  asset: {
    id: string;
    evolutionId: string;
    transcriptionStatus: string;
    transcriptionText: string;
    durationSeconds: number;
    mimeType: string;
  };
};

export class AudioAssetProcessingError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly httpStatus = 400,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "AudioAssetProcessingError";
  }
}

const safeErrorMessage = (error: any): string => String(error?.message || error || "Falha no processamento do asset de áudio.")
  .replace(/[\r\n]+/g, " ")
  .slice(0, 240);

const normalizeMime = (value: string): string => {
  const normalized = String(value || "").toLowerCase().split(";", 1)[0].trim();
  if (["audio/x-ogg", "application/ogg", "application/x-ogg", "audio/opus"].includes(normalized)) return "audio/ogg";
  if (normalized === "audio/mp3") return "audio/mpeg";
  if (normalized === "audio/x-m4a") return "audio/mp4";
  return normalized;
};

const mapRepositoryStatus = (status: string): never => {
  switch (status) {
    case "asset_not_found": throw new AudioAssetProcessingError("Asset de áudio não encontrado.", "AUDIO_ASSET_NOT_FOUND", 404);
    case "not_authorized": throw new AudioAssetProcessingError("Você não tem permissão para processar este asset.", "AUDIO_ASSET_NOT_AUTHORIZED", 403);
    case "signed": throw new AudioAssetProcessingError("Esta evolução está assinada e não pode ser processada.", "EVOLUTION_SIGNED_IMMUTABLE", 409);
    case "asset_invalid": throw new AudioAssetProcessingError("O asset de áudio está inválido.", "AUDIO_ASSET_INVALID", 422);
    case "legacy_unsupported": throw new AudioAssetProcessingError("Esta evolução usa o ledger legado e ainda não é compatível com assets persistentes.", "AUDIO_ASSET_LEGACY_EVOLUTION_UNSUPPORTED", 409);
    case "rejected": throw new AudioAssetProcessingError("Esta evolução pode ter até o limite de áudio permitido.", "AUDIO_EVOLUTION_DURATION_LIMIT", 403);
    case "existing_pending": throw new AudioAssetProcessingError("Este asset já está sendo processado.", "AUDIO_ASSET_PROCESSING_IN_PROGRESS", 409);
    case "already_processing": throw new AudioAssetProcessingError("Este asset já está sendo processado.", "AUDIO_ASSET_PROCESSING_IN_PROGRESS", 409);
    case "existing_completed": throw new AudioAssetProcessingError("A reserva deste asset já foi concluída.", "AUDIO_ASSET_ALREADY_RESERVED", 409);
    default: throw new AudioAssetProcessingError("Não foi possível reservar o budget do asset.", "AUDIO_ASSET_BUDGET_FAILED", 502);
  }
};

const resultFor = (asset: ProcessingAsset, cached: boolean): ProcessingResult => ({
  cached,
  asset: {
    id: asset.id,
    evolutionId: asset.evolutionId,
    transcriptionStatus: asset.transcriptionStatus,
    transcriptionText: asset.transcriptionText || "",
    durationSeconds: asset.durationSeconds,
    mimeType: asset.mimeType,
  },
});

export async function processAudioAsset(
  input: { audioAssetId: string; professionalId: string; authorizationHeader: string },
  deps: ProcessingRouteDependencies,
): Promise<ProcessingResult> {
  let asset: ProcessingAsset | null = null;
  let reservationId: string | null = null;
  let reservationOwnedByThisAttempt = false;
  let claimed = false;
  let completed = false;

  try {
    asset = await deps.repository.readAsset(input.audioAssetId);
    if (!asset) throw new AudioAssetProcessingError("Asset de áudio não encontrado.", "AUDIO_ASSET_NOT_FOUND", 404);

    await deps.authorizeAsset(asset, input.professionalId, input.authorizationHeader);

    if (asset.evolutionStatus === "signed") {
      throw new AudioAssetProcessingError("Esta evolução está assinada e não pode ser processada.", "EVOLUTION_SIGNED_IMMUTABLE", 409);
    }

    if (asset.transcriptionStatus === "completed") {
      return resultFor(asset, true);
    }

    if (asset.transcriptionStatus === "processing") {
      throw new AudioAssetProcessingError("Este asset já está sendo processado.", "AUDIO_ASSET_PROCESSING_IN_PROGRESS", 409);
    }

    if (!["pending", "failed"].includes(asset.transcriptionStatus)) {
      throw new AudioAssetProcessingError("O estado do asset de áudio não permite processamento.", "AUDIO_ASSET_INVALID_STATE", 409);
    }

    const audioPolicy = await deps.resolveAudioPolicy(input.professionalId);
    if (asset.durationSeconds > audioPolicy.maxDurationSeconds) {
      throw new AudioAssetProcessingError("O áudio excede o limite máximo permitido para esta evolução.", "AUDIO_EVOLUTION_DURATION_LIMIT", 403);
    }

    const usageMonth = deps.getCurrentUsageMonth();
    const currentUsageSeconds = await deps.getMonthlyUsageSeconds(input.professionalId, usageMonth);
    const monthlyLimitSeconds = deps.monthlyLimitSeconds;
    if (currentUsageSeconds >= monthlyLimitSeconds || currentUsageSeconds + asset.durationSeconds > monthlyLimitSeconds) {
      throw new AudioAssetProcessingError("Limite mensal de transcrição de áudio atingido.", "AUDIO_MONTHLY_QUOTA_LIMIT", 403);
    }

    const rateLimit = deps.consumeRateLimit(input.professionalId);
    if (!rateLimit.allowed) {
      throw new AudioAssetProcessingError("Muitas solicitações de transcrição em pouco tempo.", "AUDIO_TRANSCRIPTION_RATE_LIMIT", 429, rateLimit.retryAfterSeconds);
    }

    const requestedReservationId = randomUUID();
    const reservationResult = await deps.repository.reserveAsset({
      assetId: asset.id,
      professionalId: input.professionalId,
      limitSeconds: audioPolicy.maxDurationSeconds,
      reservationId: requestedReservationId,
    });

    if (reservationResult.status === "reserved") {
      reservationId = reservationResult.reservation?.reservationId || requestedReservationId;
      reservationOwnedByThisAttempt = true;
    } else if (reservationResult.status === "existing_completed") {
      reservationId = reservationResult.reservation?.reservationId || null;
    } else if (reservationResult.status === "existing_pending") {
      mapRepositoryStatus(reservationResult.status);
    } else if (reservationResult.status !== "reserved") {
      mapRepositoryStatus(reservationResult.status);
    }

    if (!reservationId) {
      throw new AudioAssetProcessingError("A reserva do asset não foi encontrada.", "AUDIO_ASSET_RESERVATION_NOT_FOUND", 502);
    }

    const claimStatus = await deps.repository.claimAsset(asset.id, input.professionalId);
    if (claimStatus === "already_completed") {
      if (reservationOwnedByThisAttempt) await deps.repository.releaseReservation(reservationId, input.professionalId);
      const refreshed = await deps.repository.readAsset(asset.id);
      if (!refreshed) throw new AudioAssetProcessingError("Asset de áudio não encontrado.", "AUDIO_ASSET_NOT_FOUND", 404);
      return resultFor(refreshed, true);
    }
    if (claimStatus !== "claimed") mapRepositoryStatus(claimStatus);
    claimed = true;

    const { apiKey, modelName } = await deps.getGeminiSettings();
    if (!apiKey) throw new AudioAssetProcessingError("Chave do Gemini não configurada no servidor.", "missing_gemini_api_key", 500);
    const transcriptionModel = deps.resolveTranscriptionModel(modelName);
    const ai = deps.createGeminiClient(apiKey);
    const audioBuffer = await deps.repository.downloadAsset(asset.storagePath);
    if (!audioBuffer.length) throw new AudioAssetProcessingError("O objeto de áudio está vazio.", "AUDIO_ASSET_STORAGE_MISSING", 404);
    if (audioBuffer.byteLength > audioPolicy.maxFileBytes) throw new AudioAssetProcessingError("O arquivo de áudio excede o limite permitido.", "AUDIO_ASSET_FILE_SIZE_LIMIT", 422);

    let detectedMimeType: string;
    try {
      detectedMimeType = resolveAudioAssetMimeType(asset.mimeType, audioBuffer);
    } catch (mimeError: any) {
      throw new AudioAssetProcessingError("O MIME real do objeto não é um áudio suportado.", mimeError?.code || "AUDIO_ASSET_MIME_INVALID", 422);
    }
    if (normalizeMime(detectedMimeType) !== normalizeMime(asset.mimeType)) {
      throw new AudioAssetProcessingError("O MIME real do objeto não corresponde ao asset persistido.", "AUDIO_ASSET_MIME_MISMATCH", 422);
    }

    const contentHash = createHash("sha256").update(audioBuffer).digest("hex");
    if (contentHash !== asset.contentHash) throw new AudioAssetProcessingError("A integridade do objeto de áudio não pôde ser confirmada.", "AUDIO_ASSET_INTEGRITY_MISMATCH", 422);

    let realDuration: number;
    try {
      realDuration = getAudioDurationFromBytes(new Uint8Array(audioBuffer));
    } catch {
      throw new AudioAssetProcessingError("Não foi possível validar a duração real do áudio.", "AUDIO_ASSET_DURATION_UNREADABLE", 422);
    }
    if (Number.isFinite(realDuration) && realDuration > 0 && Math.abs(Math.ceil(realDuration) - asset.durationSeconds) > 1) {
      throw new AudioAssetProcessingError("A duração real do objeto não corresponde ao asset persistido.", "AUDIO_ASSET_DURATION_MISMATCH", 422);
    }

    const transportResult: GeminiAudioTransportResult = await deps.transcribeGeminiAudio(ai as any, {
      audioBuffer,
      mimeType: asset.mimeType,
      prompt: DEFAULT_TRANSCRIPTION_PROMPT,
      model: transcriptionModel,
      durationSeconds: asset.durationSeconds,
    });
    const transcription = String(transportResult.transcription || "").trim();
    if (!transcription) throw new AudioAssetProcessingError("O Gemini não retornou uma transcrição utilizável.", "AUDIO_ASSET_TRANSCRIPTION_EMPTY", 502);

    const completeStatus = await deps.repository.completeAsset({
      assetId: asset.id,
      reservationId,
      professionalId: input.professionalId,
      transcription,
    });
    if (completeStatus !== "completed") mapRepositoryStatus(completeStatus);
    completed = true;

    try {
      const updatedUsageSeconds = await deps.incrementMonthlyUsageSeconds(input.professionalId, usageMonth, asset.durationSeconds);
      console.log(`[AI-Backend] Uso mensal de asset atualizado: ${updatedUsageSeconds}s no mês ${usageMonth}.`);
    } catch (usageError) {
      console.error("[AI-Backend] Erro best-effort ao atualizar usage_tracking:", safeErrorMessage(usageError));
    }

    try {
      await deps.recordUsage({
        professionalId: input.professionalId,
        model: transcriptionModel,
        durationSeconds: asset.durationSeconds,
        usageMetadata: transportResult.usageMetadata,
      });
    } catch (usageLogError) {
      console.error("[AI-Backend] Erro best-effort ao gravar log de uso do asset:", safeErrorMessage(usageLogError));
    }

    return resultFor({ ...asset, transcriptionStatus: "completed", transcriptionText: transcription }, false);
  } catch (error: any) {
    if (asset && !completed) {
      try {
        if (claimed) {
          await deps.repository.failAsset({
            assetId: asset.id,
            professionalId: input.professionalId,
            reservationId: reservationOwnedByThisAttempt ? reservationId : null,
            message: safeErrorMessage(error),
          });
        } else if (reservationOwnedByThisAttempt && reservationId) {
          await deps.repository.releaseReservation(reservationId, input.professionalId);
        }
      } catch (cleanupError) {
        console.error("[AI-Backend] Falha ao restaurar o estado do audio_asset:", safeErrorMessage(cleanupError));
      }
    }
    if (error instanceof AudioAssetProcessingError) throw error;
    if (deps.isQuotaRelatedError(error)) throw new AudioAssetProcessingError("O provedor de transcrição atingiu um limite temporário.", "AUDIO_TRANSCRIPTION_PROVIDER_QUOTA", 429);
    if (error?.code === "missing_gemini_api_key") throw new AudioAssetProcessingError("Chave do Gemini não configurada no servidor.", "missing_gemini_api_key", 500);
    if (error?.name === "EnvironmentConfigurationError" || String(error?.message || "").toLowerCase().includes("gemini_enabled=false")) {
      throw new AudioAssetProcessingError("O processamento por IA está temporariamente desabilitado neste ambiente.", "integration_disabled", 503);
    }
    throw new AudioAssetProcessingError("Não foi possível processar o asset de áudio.", "AUDIO_ASSET_PROCESSING_FAILED", 500);
  }
}

const routeErrorResponse = (res: any, error: any) => {
  const known = error instanceof AudioAssetProcessingError;
  const code = known ? error.code : "AUDIO_ASSET_PROCESSING_FAILED";
  const status = known ? error.httpStatus : 500;
  if (status >= 500) console.error("[AI-Backend] Falha controlada no processamento do asset:", safeErrorMessage(error));
  if (known && error.retryAfterSeconds) res.set("Retry-After", String(error.retryAfterSeconds));
  return res.status(status).json({
    code,
    error: status >= 500 ? "Não foi possível processar o asset de áudio." : error.message,
  });
};

export function registerAudioAssetProcessingRoutes(app: any, deps: {
  supabaseAdmin: any;
  supabaseUrl: string;
  supabaseAnonKey: string;
  createUserScopedClient: (options: { supabaseUrl: string; supabaseAnonKey: string; accessToken: string }) => any;
  requireAuth: any;
  resolveAudioPolicy: ProcessingRouteDependencies["resolveAudioPolicy"];
  consumeRateLimit: ProcessingRouteDependencies["consumeRateLimit"];
  getCurrentUsageMonth: ProcessingRouteDependencies["getCurrentUsageMonth"];
  getMonthlyUsageSeconds: ProcessingRouteDependencies["getMonthlyUsageSeconds"];
  incrementMonthlyUsageSeconds: ProcessingRouteDependencies["incrementMonthlyUsageSeconds"];
  monthlyLimitSeconds: number;
  getGeminiSettings: ProcessingRouteDependencies["getGeminiSettings"];
  resolveTranscriptionModel: ProcessingRouteDependencies["resolveTranscriptionModel"];
  isQuotaRelatedError: ProcessingRouteDependencies["isQuotaRelatedError"];
  recordUsage: ProcessingRouteDependencies["recordUsage"];
}) {
  const repository: ProcessingRepository = {
    async readAsset(assetId) {
      const assetResult = await deps.supabaseAdmin.from("audio_assets").select("id,evolution_id,duration_seconds,mime_type,transcription_status,transcription_text,content_hash,storage_path").eq("id", assetId).maybeSingle();
      if (assetResult.error) throw assetResult.error;
      if (!assetResult.data) return null;
      const evolutionResult = await deps.supabaseAdmin.from("evolutions").select("id,professional_id,organization_patient_id,status").eq("id", assetResult.data.evolution_id).maybeSingle();
      if (evolutionResult.error) throw evolutionResult.error;
      if (!evolutionResult.data) return null;
      return {
        id: assetResult.data.id,
        evolutionId: assetResult.data.evolution_id,
        professionalId: evolutionResult.data.professional_id,
        organizationPatientId: evolutionResult.data.organization_patient_id || null,
        evolutionStatus: evolutionResult.data.status || null,
        transcriptionStatus: assetResult.data.transcription_status,
        transcriptionText: assetResult.data.transcription_text || null,
        durationSeconds: Number(assetResult.data.duration_seconds),
        mimeType: assetResult.data.mime_type,
        contentHash: assetResult.data.content_hash,
        storagePath: assetResult.data.storage_path,
      };
    },
    async reserveAsset(input) {
      const result = await deps.supabaseAdmin.rpc("reserve_evolution_audio_asset", {
        p_audio_asset_id: input.assetId,
        p_professional_id: input.professionalId,
        p_limit_seconds: input.limitSeconds,
        p_reservation_id: input.reservationId,
      });
      if (result.error) throw result.error;
      const status = String(result.data || "");
      if (!["reserved", "existing_pending", "existing_completed"].includes(status)) return { status, reservation: null };
      const reservationResult = await deps.supabaseAdmin.from("evolution_audio_budget_reservations").select("reservation_id,status").eq("professional_id", input.professionalId).eq("audio_asset_id", input.assetId).maybeSingle();
      if (reservationResult.error) throw reservationResult.error;
      return { status, reservation: reservationResult.data ? { reservationId: reservationResult.data.reservation_id, status: reservationResult.data.status } : null };
    },
    async claimAsset(assetId, professionalId) {
      const result = await deps.supabaseAdmin.rpc("claim_audio_asset_processing", { p_audio_asset_id: assetId, p_professional_id: professionalId });
      if (result.error) throw result.error;
      return String(result.data || "");
    },
    async downloadAsset(storagePath) {
      const result = await deps.supabaseAdmin.storage.from(AUDIO_ASSET_BUCKET).download(storagePath);
      if (result.error || !result.data) throw new AudioAssetProcessingError("O objeto de áudio não está disponível no Storage privado.", "AUDIO_ASSET_STORAGE_MISSING", 404);
      return Buffer.from(await result.data.arrayBuffer());
    },
    async completeAsset(input) {
      const result = await deps.supabaseAdmin.rpc("complete_audio_asset_processing", {
        p_audio_asset_id: input.assetId,
        p_reservation_id: input.reservationId,
        p_professional_id: input.professionalId,
        p_transcription_text: input.transcription,
      });
      if (result.error) throw result.error;
      return String(result.data || "");
    },
    async failAsset(input) {
      const result = await deps.supabaseAdmin.rpc("fail_audio_asset_processing", {
        p_audio_asset_id: input.assetId,
        p_professional_id: input.professionalId,
        p_reservation_id: input.reservationId,
        p_error_message: input.message,
      });
      if (result.error) throw result.error;
      return String(result.data || "");
    },
    async releaseReservation(reservationId, professionalId) {
      const result = await deps.supabaseAdmin.rpc("release_evolution_audio_seconds", { p_reservation_id: reservationId, p_professional_id: professionalId });
      if (result.error) throw result.error;
      return result.data === true;
    },
  };

  app.post("/api/ai/evolution-assets/:audioAssetId/process", deps.requireAuth, async (req: any, res: any) => {
    try {
      const audioAssetId = String(req.params.audioAssetId || "").trim();
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(audioAssetId)) {
        throw new AudioAssetProcessingError("O asset informado é inválido.", "AUDIO_ASSET_ID_INVALID", 400);
      }
      const authorizationHeader = String(req.headers.authorization || "");
      const result = await processAudioAsset({ audioAssetId, professionalId: req.user.id, authorizationHeader }, {
        repository,
        authorizeAsset: async (asset, professionalId, authorization) => {
          if (asset.professionalId !== professionalId) throw new AudioAssetProcessingError("Você não tem permissão para processar este asset.", "AUDIO_ASSET_NOT_AUTHORIZED", 403);
          if (!asset.organizationPatientId) return;
          const token = authorization.replace(/^Bearer\s+/i, "");
          const scopedClient = deps.createUserScopedClient({ supabaseUrl: deps.supabaseUrl, supabaseAnonKey: deps.supabaseAnonKey, accessToken: token });
          const access = await scopedClient.rpc("get_organization_evolution_access", { p_organization_patient_id: asset.organizationPatientId });
          if (access.error || !access.data?.canCreate) throw new AudioAssetProcessingError("Seu acesso clínico não permite processar este asset.", "CLINICAL_WRITE_NOT_AUTHORIZED", 403);
        },
        resolveAudioPolicy: deps.resolveAudioPolicy,
        consumeRateLimit: deps.consumeRateLimit,
        getCurrentUsageMonth: deps.getCurrentUsageMonth,
        getMonthlyUsageSeconds: deps.getMonthlyUsageSeconds,
        incrementMonthlyUsageSeconds: deps.incrementMonthlyUsageSeconds,
        monthlyLimitSeconds: deps.monthlyLimitSeconds,
        getGeminiSettings: deps.getGeminiSettings,
        resolveTranscriptionModel: deps.resolveTranscriptionModel,
        isQuotaRelatedError: deps.isQuotaRelatedError,
        createGeminiClient: (apiKey) => new GoogleGenAI({ apiKey }),
        transcribeGeminiAudio,
        recordUsage: deps.recordUsage,
      });
      return res.json({ success: true, cached: result.cached, asset: result.asset });
    } catch (error) {
      return routeErrorResponse(res, error);
    }
  });
}
