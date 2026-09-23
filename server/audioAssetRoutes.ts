import { createHash, randomUUID } from "node:crypto";
import multer from "multer";
import { getAudioDurationFromBytes } from "../src/utils/audioDuration.js";

const AUDIO_ASSET_BUCKET = "evolution-audio";
const MAX_UPLOAD_BYTES = 60 * 1024 * 1024;
const AUDIO_ASSET_SELECT = "id, evolution_id, duration_seconds, mime_type, transcription_status, created_at, updated_at, content_hash, creation_request_id, storage_path";
const SUPPORTED_MIME_TYPES = new Set([
  "audio/webm",
  "audio/ogg",
  "audio/wav",
  "audio/mpeg",
  "audio/mp4",
  "audio/aac",
]);
const MIME_EXTENSIONS: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
};

type AudioPolicy = {
  maxDurationSeconds: number;
  maxFileBytes: number;
};

type AudioAssetRouteDependencies = {
  supabaseAdmin: any;
  supabaseUrl: string;
  supabaseAnonKey: string;
  createUserScopedClient: (options: {
    supabaseUrl: string;
    supabaseAnonKey: string;
    accessToken: string;
  }) => any;
  requireAuth: any;
  resolveAudioPolicy: (professionalId: string) => Promise<AudioPolicy>;
};

type AudioAssetRow = {
  id: string;
  evolution_id: string;
  duration_seconds: number;
  mime_type: string;
  transcription_status: string;
  created_at: string;
  updated_at: string;
  content_hash: string;
  creation_request_id: string;
  storage_path: string;
};

const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_UPLOAD_BYTES,
    files: 1,
    fields: 4,
  },
}).single("file");

const normalizeDeclaredMimeType = (mimeType: unknown): string => {
  const normalized = String(mimeType || "").toLowerCase().split(";", 1)[0].trim();
  if (normalized === "audio/x-ogg" || normalized === "application/ogg" || normalized === "application/x-ogg" || normalized === "audio/opus") return "audio/ogg";
  if (normalized === "audio/mp3") return "audio/mpeg";
  if (normalized === "audio/x-m4a") return "audio/mp4";
  return normalized;
};

const readAscii = (bytes: Buffer, offset: number, length: number): string => bytes.subarray(offset, offset + length).toString("ascii");

const isMp3Frame = (bytes: Buffer, offset: number): boolean => {
  if (offset + 4 > bytes.length || bytes[offset] !== 0xff || (bytes[offset + 1] & 0xe0) !== 0xe0) return false;
  const versionBits = (bytes[offset + 1] >> 3) & 0x03;
  const layerBits = (bytes[offset + 1] >> 1) & 0x03;
  const bitrateIndex = (bytes[offset + 2] >> 4) & 0x0f;
  const sampleRateIndex = (bytes[offset + 2] >> 2) & 0x03;
  return versionBits !== 1 && layerBits !== 0 && bitrateIndex !== 0 && bitrateIndex !== 15 && sampleRateIndex !== 3;
};

const isAacFrame = (bytes: Buffer): boolean => bytes.length >= 7 && bytes[0] === 0xff && (bytes[1] & 0xf6) === 0xf0;

const detectAudioMimeType = (bytes: Buffer): string | null => {
  if (bytes.length >= 12 && readAscii(bytes, 0, 4) === "RIFF" && readAscii(bytes, 8, 4) === "WAVE") return "audio/wav";
  if (bytes.length >= 4 && readAscii(bytes, 0, 4) === "OggS") return "audio/ogg";
  if (bytes.length >= 12 && readAscii(bytes, 4, 4) === "ftyp") return "audio/mp4";
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return "audio/webm";
  if (isAacFrame(bytes)) return "audio/aac";
  if (readAscii(bytes, 0, 3) === "ID3") return "audio/mpeg";
  for (let offset = 0; offset < Math.min(bytes.length - 4, 4096); offset += 1) {
    if (isMp3Frame(bytes, offset)) return "audio/mpeg";
  }
  return null;
};

export const resolveAudioAssetMimeType = (declaredMimeType: unknown, bytes: Buffer): string => {
  const detectedMimeType = detectAudioMimeType(bytes);
  if (!detectedMimeType || !SUPPORTED_MIME_TYPES.has(detectedMimeType)) {
    const error = new Error("O conteúdo do arquivo não corresponde a um formato de áudio suportado.") as Error & { code?: string };
    error.code = "AUDIO_ASSET_MIME_UNSUPPORTED";
    throw error;
  }

  const declared = normalizeDeclaredMimeType(declaredMimeType);
  if (declared && declared !== "application/octet-stream" && !declared.startsWith("audio/")) {
    const error = new Error("O MIME declarado não é um formato de áudio válido.") as Error & { code?: string };
    error.code = "AUDIO_ASSET_MIME_INVALID";
    throw error;
  }

  return detectedMimeType;
};

export const buildAudioAssetStoragePath = (professionalId: string, evolutionId: string, assetId: string, mimeType: string): string => {
  const extension = MIME_EXTENSIONS[mimeType];
  if (!extension) throw new Error("Unsupported audio asset MIME type");
  return `${professionalId}/${evolutionId}/${assetId}/original.${extension}`;
};

export const sanitizeCreationRequestId = (value: unknown): string => {
  const requestId = String(value || "").trim();
  if (!requestId || requestId.length > 200 || /[\r\n]/.test(requestId)) {
    const error = new Error("O header Idempotency-Key é obrigatório e deve ser válido.") as Error & { code?: string };
    error.code = "AUDIO_ASSET_IDEMPOTENCY_KEY_REQUIRED";
    throw error;
  }
  return requestId;
};

const isUniqueViolation = (error: any): boolean => String(error?.code || "") === "23505";

const safeErrorMessage = (error: any): string => String(error?.message || "erro").replace(/[\r\n]/g, " ").slice(0, 240);

const isUuid = (value: string): boolean => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const publicAsset = (asset: AudioAssetRow) => ({
  id: asset.id,
  evolution_id: asset.evolution_id,
  duration_seconds: asset.duration_seconds,
  mime_type: asset.mime_type,
  transcription_status: asset.transcription_status,
  created_at: asset.created_at,
  updated_at: asset.updated_at,
});

const readExistingAsset = async (admin: any, evolutionId: string, field: "content_hash" | "creation_request_id", value: string) => {
  const result = await admin
    .from("audio_assets")
    .select(AUDIO_ASSET_SELECT)
    .eq("evolution_id", evolutionId)
    .eq(field, value)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data as AudioAssetRow | null;
};

const authorizeEvolution = async (req: any, deps: AudioAssetRouteDependencies, evolutionId: string) => {
  const evolutionResult = await deps.supabaseAdmin
    .from("evolutions")
    .select("id, professional_id, organization_patient_id, status")
    .eq("id", evolutionId)
    .maybeSingle();
  if (evolutionResult.error) throw evolutionResult.error;
  const evolution = evolutionResult.data;

  if (!evolution) {
    const error = new Error("Evolução não encontrada.") as Error & { code?: string; httpStatus?: number };
    error.code = "EVOLUTION_NOT_FOUND";
    error.httpStatus = 404;
    throw error;
  }

  if (evolution.status === "signed") {
    const error = new Error("Esta evolução está assinada e não pode receber novos arquivos.") as Error & { code?: string; httpStatus?: number };
    error.code = "EVOLUTION_SIGNED_IMMUTABLE";
    error.httpStatus = 409;
    throw error;
  }

  if (evolution.professional_id !== req.user.id) {
    const error = new Error("Você não tem permissão para adicionar áudio nesta evolução.") as Error & { code?: string; httpStatus?: number };
    error.code = "EVOLUTION_NOT_AUTHORIZED";
    error.httpStatus = 403;
    throw error;
  }

  if (evolution.organization_patient_id) {
    const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const scopedClient = deps.createUserScopedClient({
      supabaseUrl: deps.supabaseUrl,
      supabaseAnonKey: deps.supabaseAnonKey,
      accessToken: token,
    });
    const access = await scopedClient.rpc("get_organization_evolution_access", {
      p_organization_patient_id: evolution.organization_patient_id,
    });
    if (access.error) throw access.error;
    if (!access.data?.canCreate) {
      const error = new Error("Seu acesso clínico não permite criar áudio nesta evolução.") as Error & { code?: string; httpStatus?: number };
      error.code = "CLINICAL_WRITE_NOT_AUTHORIZED";
      error.httpStatus = 403;
      throw error;
    }
  }

  return evolution;
};

const parseUpload = (req: any, res: any, next: any) => {
  uploadMiddleware(req, res, (error: any) => {
    if (!error) return next();
    if (error.code === "LIMIT_FILE_SIZE") return res.status(400).json({ code: "AUDIO_ASSET_FILE_SIZE_LIMIT", error: "O arquivo de áudio excede o tamanho máximo permitido." });
    return res.status(400).json({ code: "AUDIO_ASSET_MULTIPART_INVALID", error: "Não foi possível ler o arquivo de áudio enviado." });
  });
};

export function registerAudioAssetRoutes(app: any, deps: AudioAssetRouteDependencies) {
  app.post("/api/ai/evolution-assets", deps.requireAuth, parseUpload, async (req: any, res: any) => {
    let storagePath: string | null = null;
    let assetPersisted = false;

    try {
      const evolutionId = typeof req.body?.evolutionId === "string" ? req.body.evolutionId.trim() : "";
      if (!evolutionId) return res.status(400).json({ code: "AUDIO_ASSET_EVOLUTION_REQUIRED", error: "A evolução é obrigatória." });
      if (!isUuid(evolutionId)) return res.status(400).json({ code: "AUDIO_ASSET_EVOLUTION_INVALID", error: "A evolução informada é inválida." });
      const creationRequestId = sanitizeCreationRequestId(req.headers["idempotency-key"]);
      if (!req.file?.buffer || !req.file.size) return res.status(400).json({ code: "AUDIO_ASSET_FILE_REQUIRED", error: "Selecione um arquivo de áudio." });

      const evolution = await authorizeEvolution(req, deps, evolutionId);
      const audioPolicy = await deps.resolveAudioPolicy(req.user.id);
      if (req.file.size > audioPolicy.maxFileBytes) return res.status(400).json({ code: "AUDIO_ASSET_FILE_SIZE_LIMIT", error: "O arquivo de áudio excede o limite permitido para o plano atual." });

      const audioBuffer = req.file.buffer as Buffer;
      const contentHash = createHash("sha256").update(audioBuffer).digest("hex");
      const mimeType = resolveAudioAssetMimeType(req.file.mimetype, audioBuffer);
      const duration = getAudioDurationFromBytes(new Uint8Array(audioBuffer));
      if (!Number.isFinite(duration) || duration <= 0) {
        const error = new Error("Não foi possível determinar a duração do áudio no servidor.") as Error & { code?: string };
        error.code = "AUDIO_ASSET_DURATION_UNREADABLE";
        throw error;
      }
      const durationSeconds = Math.ceil(duration);
      if (durationSeconds > audioPolicy.maxDurationSeconds) return res.status(400).json({ code: "AUDIO_ASSET_DURATION_LIMIT", error: "O áudio excede o limite máximo permitido para o plano atual." });

      const existingByRequest = await readExistingAsset(deps.supabaseAdmin, evolution.id, "creation_request_id", creationRequestId);
      if (existingByRequest) {
        if (existingByRequest.content_hash !== contentHash) return res.status(409).json({ code: "AUDIO_ASSET_IDEMPOTENCY_CONFLICT", error: "A mesma solicitação de criação foi usada para outro conteúdo." });
        return res.status(200).json({ success: true, reused: true, asset: publicAsset(existingByRequest) });
      }

      const existingByContent = await readExistingAsset(deps.supabaseAdmin, evolution.id, "content_hash", contentHash);
      if (existingByContent) return res.status(200).json({ success: true, reused: true, asset: publicAsset(existingByContent) });

      const assetId = randomUUID();
      storagePath = buildAudioAssetStoragePath(req.user.id, evolution.id, assetId, mimeType);
      const upload = await deps.supabaseAdmin.storage.from(AUDIO_ASSET_BUCKET).upload(storagePath, audioBuffer, {
        contentType: mimeType,
        cacheControl: "31536000",
        upsert: false,
      });
      if (upload.error) {
        const error = new Error("Não foi possível persistir o áudio no Storage.") as Error & { code?: string; httpStatus?: number };
        error.code = "AUDIO_ASSET_STORAGE_UPLOAD_FAILED";
        error.httpStatus = 502;
        throw error;
      }

      const insert = await deps.supabaseAdmin
        .from("audio_assets")
        .insert({
          id: assetId,
          evolution_id: evolution.id,
          storage_path: storagePath,
          duration_seconds: durationSeconds,
          content_hash: contentHash,
          mime_type: mimeType,
          transcription_status: "pending",
          creation_request_id: creationRequestId,
        })
        .select(AUDIO_ASSET_SELECT)
        .single();

      if (insert.error) {
        if (isUniqueViolation(insert.error)) {
          const concurrent = await readExistingAsset(deps.supabaseAdmin, evolution.id, "content_hash", contentHash)
            || await readExistingAsset(deps.supabaseAdmin, evolution.id, "creation_request_id", creationRequestId);
          if (concurrent) {
            if (concurrent.creation_request_id === creationRequestId && concurrent.content_hash !== contentHash) return res.status(409).json({ code: "AUDIO_ASSET_IDEMPOTENCY_CONFLICT", error: "A mesma solicitação de criação foi usada para outro conteúdo." });
            return res.status(200).json({ success: true, reused: true, asset: publicAsset(concurrent) });
          }
        }
        throw insert.error;
      }

      assetPersisted = true;
      return res.status(201).json({ success: true, reused: false, asset: publicAsset(insert.data as AudioAssetRow) });
    } catch (error: any) {
      const status = Number(error?.httpStatus) || (error?.code === "AUDIO_ASSET_DURATION_UNREADABLE" || error?.code?.startsWith("AUDIO_ASSET_") ? 400 : 500);
      if (status >= 500) console.error("[AudioAsset] Falha controlada:", safeErrorMessage(error));
      return res.status(status).json({ code: error?.code || "AUDIO_ASSET_CREATION_FAILED", error: status >= 500 ? "Não foi possível criar o asset de áudio." : error.message });
    } finally {
      if (storagePath && !assetPersisted) {
        const cleanup = await deps.supabaseAdmin.storage.from(AUDIO_ASSET_BUCKET).remove([storagePath]);
        if (cleanup.error) console.error("[AudioAsset] Falha ao limpar objeto órfão:", safeErrorMessage(cleanup.error));
      }
    }
  });
}
