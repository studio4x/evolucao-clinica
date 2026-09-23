import { createHash, randomUUID } from "node:crypto";
import { getAudioDurationFromBytes } from "../src/utils/audioDuration.js";

const AUDIO_ASSET_BUCKET = "evolution-audio";
const MAX_UPLOAD_BYTES = 60 * 1024 * 1024;
const SIGNED_UPLOAD_TTL_SECONDS = 2 * 60 * 60;
const AUDIO_ASSET_SELECT = "id, evolution_id, duration_seconds, mime_type, transcription_status, created_at, updated_at, content_hash, creation_request_id, storage_path";
const UPLOAD_SESSION_SELECT = "audio_asset_id, professional_id, evolution_id, storage_path, creation_request_id, file_name, declared_mime_type, declared_file_size, status, resolved_asset_id, expires_at, created_at, updated_at";
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
const EXTENSION_MIME_TYPES: Record<string, string> = {
  webm: "audio/webm",
  weba: "audio/webm",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/ogg",
  wav: "audio/wav",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  mp4: "audio/mp4",
  aac: "audio/aac",
};

export const DIRECT_UPLOAD_TUS_THRESHOLD_BYTES = 6 * 1024 * 1024;

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

type UploadSessionRow = {
  audio_asset_id: string;
  professional_id: string;
  evolution_id: string;
  storage_path: string;
  creation_request_id: string;
  file_name: string;
  declared_mime_type: string;
  declared_file_size: number;
  status: "prepared" | "finalized" | "reused";
  resolved_asset_id: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
};

type RouteError = Error & { code?: string; httpStatus?: number };

const routeError = (message: string, code: string, httpStatus = 400): RouteError => {
  const error = new Error(message) as RouteError;
  error.code = code;
  error.httpStatus = httpStatus;
  return error;
};

const safeErrorMessage = (error: any): string => String(error?.message || "erro").replace(/[\r\n]/g, " ").slice(0, 240);

const isUniqueViolation = (error: any): boolean => String(error?.code || "") === "23505";

const isUuid = (value: string): boolean => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const normalizeDeclaredMimeType = (mimeType: unknown): string => {
  const normalized = String(mimeType || "").toLowerCase().split(";", 1)[0].trim();
  if (normalized === "audio/x-ogg" || normalized === "application/ogg" || normalized === "application/x-ogg" || normalized === "audio/opus") return "audio/ogg";
  if (normalized === "audio/mp3") return "audio/mpeg";
  if (normalized === "audio/x-m4a") return "audio/mp4";
  return normalized;
};

const sanitizeFileName = (value: unknown): string => {
  const basename = String(value || "audio").trim().split(/[\\/]/).pop() || "audio";
  return basename.replace(/[\u0000-\u001f\u007f]/g, "_").slice(0, 255) || "audio";
};

const inferMimeTypeFromFileName = (fileName: string): string | null => {
  const extension = fileName.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || "";
  return EXTENSION_MIME_TYPES[extension] || null;
};

export const resolveDeclaredAudioMimeType = (mimeType: unknown, fileName: unknown): string => {
  const declared = normalizeDeclaredMimeType(mimeType);
  const inferred = inferMimeTypeFromFileName(sanitizeFileName(fileName));
  const resolved = !declared || declared === "application/octet-stream" ? inferred : declared;

  if (!resolved || !SUPPORTED_MIME_TYPES.has(resolved)) {
    throw routeError("O formato MIME declarado não é um áudio suportado.", "AUDIO_ASSET_MIME_INVALID");
  }

  return resolved;
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
    throw routeError("O conteúdo do arquivo não corresponde a um formato de áudio suportado.", "AUDIO_ASSET_MIME_UNSUPPORTED");
  }

  const declared = normalizeDeclaredMimeType(declaredMimeType);
  if (declared && declared !== "application/octet-stream" && !declared.startsWith("audio/")) {
    throw routeError("O MIME declarado não é um formato de áudio válido.", "AUDIO_ASSET_MIME_INVALID");
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
    throw routeError("O header Idempotency-Key é obrigatório e deve ser válido.", "AUDIO_ASSET_IDEMPOTENCY_KEY_REQUIRED");
  }
  return requestId;
};

const parseDeclaredFileSize = (value: unknown): number => {
  const fileSize = Number(value);
  if (!Number.isSafeInteger(fileSize) || fileSize <= 0 || fileSize > MAX_UPLOAD_BYTES) {
    throw routeError("O tamanho declarado do arquivo é inválido ou excede o limite máximo.", "AUDIO_ASSET_FILE_SIZE_INVALID");
  }
  return fileSize;
};

const publicAsset = (asset: AudioAssetRow) => ({
  id: asset.id,
  evolution_id: asset.evolution_id,
  duration_seconds: asset.duration_seconds,
  mime_type: asset.mime_type,
  transcription_status: asset.transcription_status,
  created_at: asset.created_at,
  updated_at: asset.updated_at,
});

const getDirectStorageHost = (supabaseUrl: string): string => {
  const host = new URL(supabaseUrl).hostname;
  const projectRef = host.split(".")[0];
  return `https://${projectRef}.storage.supabase.co`;
};

const readExistingAsset = async (admin: any, evolutionId: string, field: "id" | "content_hash" | "creation_request_id", value: string) => {
  const result = await admin
    .from("audio_assets")
    .select(AUDIO_ASSET_SELECT)
    .eq("evolution_id", evolutionId)
    .eq(field, value)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data as AudioAssetRow | null;
};

const readUploadSession = async (admin: any, audioAssetId: string) => {
  const result = await admin
    .from("audio_asset_upload_sessions")
    .select(UPLOAD_SESSION_SELECT)
    .eq("audio_asset_id", audioAssetId)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data as UploadSessionRow | null;
};

const readUploadSessionByRequest = async (admin: any, evolutionId: string, creationRequestId: string) => {
  const result = await admin
    .from("audio_asset_upload_sessions")
    .select(UPLOAD_SESSION_SELECT)
    .eq("evolution_id", evolutionId)
    .eq("creation_request_id", creationRequestId)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data as UploadSessionRow | null;
};

const assertSessionContext = (session: UploadSessionRow, input: { professionalId: string; fileName: string; mimeType: string; fileSize: number }) => {
  if (
    session.professional_id !== input.professionalId
    || session.file_name !== input.fileName
    || session.declared_mime_type !== input.mimeType
    || Number(session.declared_file_size) !== input.fileSize
  ) {
    throw routeError("A mesma solicitação de upload foi usada com outro contexto.", "AUDIO_ASSET_IDEMPOTENCY_CONFLICT", 409);
  }
};

const updateUploadSession = async (admin: any, audioAssetId: string, values: Record<string, unknown>) => {
  const result = await admin
    .from("audio_asset_upload_sessions")
    .update(values)
    .eq("audio_asset_id", audioAssetId);
  if (result.error) throw result.error;
};

const cleanupExpiredUploadSessions = async (admin: any) => {
  const expired = await admin
    .from("audio_asset_upload_sessions")
    .select("audio_asset_id, storage_path")
    .eq("status", "prepared")
    .lt("expires_at", new Date().toISOString())
    .limit(25);
  if (expired.error) {
    console.error("[AudioAsset] Falha ao localizar sessões expiradas:", safeErrorMessage(expired.error));
    return;
  }

  for (const session of expired.data || []) {
    const removed = await admin.storage.from(AUDIO_ASSET_BUCKET).remove([session.storage_path]);
    if (removed.error) {
      console.error("[AudioAsset] Falha ao remover upload expirado:", safeErrorMessage(removed.error));
      continue;
    }
    const deleted = await admin.from("audio_asset_upload_sessions").delete().eq("audio_asset_id", session.audio_asset_id);
    if (deleted.error) console.error("[AudioAsset] Falha ao remover sessão expirada:", safeErrorMessage(deleted.error));
  }
};

const objectExists = async (admin: any, storagePath: string): Promise<boolean> => {
  const parts = storagePath.split("/");
  const name = parts.pop();
  const folder = parts.join("/");
  if (!name) return false;
  const result = await admin.storage.from(AUDIO_ASSET_BUCKET).list(folder, { limit: 10, search: name });
  if (result.error) throw result.error;
  return Boolean(result.data?.some((item: any) => item.name === name));
};

const authorizeEvolution = async (req: any, deps: AudioAssetRouteDependencies, evolutionId: string, allowSigned = false) => {
  const evolutionResult = await deps.supabaseAdmin
    .from("evolutions")
    .select("id, professional_id, organization_patient_id, status")
    .eq("id", evolutionId)
    .maybeSingle();
  if (evolutionResult.error) throw evolutionResult.error;
  const evolution = evolutionResult.data;

  if (!evolution) throw routeError("Evolução não encontrada.", "EVOLUTION_NOT_FOUND", 404);
  if (!allowSigned && evolution.status === "signed") throw routeError("Esta evolução está assinada e não pode receber novos arquivos.", "EVOLUTION_SIGNED_IMMUTABLE", 409);
  if (evolution.professional_id !== req.user.id) throw routeError("Você não tem permissão para adicionar áudio nesta evolução.", "EVOLUTION_NOT_AUTHORIZED", 403);

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
    if (!access.data?.canCreate) throw routeError("Seu acesso clínico não permite criar áudio nesta evolução.", "CLINICAL_WRITE_NOT_AUTHORIZED", 403);
  }

  return evolution;
};

const createSignedUpload = async (admin: any, storagePath: string) => {
  const result = await admin.storage.from(AUDIO_ASSET_BUCKET).createSignedUploadUrl(storagePath, { upsert: false });
  if (result.error || !result.data?.token) {
    const error = routeError("Não foi possível preparar o upload direto no Storage.", "AUDIO_ASSET_SIGNED_UPLOAD_FAILED", 502);
    if (result.error) console.error("[AudioAsset] Signed upload falhou:", safeErrorMessage(result.error));
    throw error;
  }
  return result.data;
};

const uploadDescriptor = (session: UploadSessionRow, signed: { token: string }, supabaseUrl: string, alreadyUploaded: boolean) => ({
  audioAssetId: session.audio_asset_id,
  bucket: AUDIO_ASSET_BUCKET,
  path: session.storage_path,
  mimeType: session.declared_mime_type,
  fileSize: Number(session.declared_file_size),
  token: alreadyUploaded ? null : signed.token,
  alreadyUploaded,
  expiresAt: session.expires_at,
  tusEndpoint: getDirectStorageHost(supabaseUrl) + "/storage/v1/upload/resumable",
  tusChunkSize: DIRECT_UPLOAD_TUS_THRESHOLD_BYTES,
});

const respondError = (res: any, error: any) => {
  const status = Number(error?.httpStatus) || (String(error?.code || "").startsWith("AUDIO_ASSET_") ? 400 : 500);
  if (status >= 500) console.error("[AudioAsset] Falha controlada:", safeErrorMessage(error));
  return res.status(status).json({
    code: error?.code || "AUDIO_ASSET_REQUEST_FAILED",
    error: status >= 500 ? "Não foi possível processar o asset de áudio." : String(error?.message || "Não foi possível processar o asset de áudio.").slice(0, 240),
  });
};

const invalidateUploadedSession = async (admin: any, session: UploadSessionRow) => {
  const removed = await admin.storage.from(AUDIO_ASSET_BUCKET).remove([session.storage_path]);
  if (removed.error) {
    console.error("[AudioAsset] Falha ao limpar objeto inválido:", safeErrorMessage(removed.error));
    throw routeError("Não foi possível limpar o upload inválido.", "AUDIO_ASSET_CLEANUP_FAILED", 502);
  }
  const deleted = await admin.from("audio_asset_upload_sessions").delete().eq("audio_asset_id", session.audio_asset_id);
  if (deleted.error) console.error("[AudioAsset] Falha ao limpar sessão inválida:", safeErrorMessage(deleted.error));
};

export function registerAudioAssetRoutes(app: any, deps: AudioAssetRouteDependencies) {
  app.post("/api/ai/evolution-assets", deps.requireAuth, (_req: any, res: any) => {
    return res.status(410).json({
      code: "AUDIO_ASSET_MULTIPART_DEPRECATED",
      error: "O upload multipart foi desativado. Use prepare, upload direto ao Storage e finalize.",
    });
  });

  app.post("/api/ai/evolution-assets/prepare", deps.requireAuth, async (req: any, res: any) => {
    try {
      await cleanupExpiredUploadSessions(deps.supabaseAdmin);

      const evolutionId = typeof req.body?.evolutionId === "string" ? req.body.evolutionId.trim() : "";
      if (!evolutionId) throw routeError("A evolução é obrigatória.", "AUDIO_ASSET_EVOLUTION_REQUIRED");
      if (!isUuid(evolutionId)) throw routeError("A evolução informada é inválida.", "AUDIO_ASSET_EVOLUTION_INVALID");

      const creationRequestId = sanitizeCreationRequestId(req.headers["idempotency-key"]);
      const fileName = sanitizeFileName(req.body?.fileName);
      const mimeType = resolveDeclaredAudioMimeType(req.body?.mimeType, fileName);
      const fileSize = parseDeclaredFileSize(req.body?.fileSize);
      const evolution = await authorizeEvolution(req, deps, evolutionId);
      const audioPolicy = await deps.resolveAudioPolicy(req.user.id);
      if (fileSize > audioPolicy.maxFileBytes) throw routeError("O arquivo de áudio excede o limite permitido para o plano atual.", "AUDIO_ASSET_FILE_SIZE_LIMIT");

      let session = await readUploadSessionByRequest(deps.supabaseAdmin, evolution.id, creationRequestId);
      if (session) {
        assertSessionContext(session, { professionalId: req.user.id, fileName, mimeType, fileSize });
      } else {
        const audioAssetId = randomUUID();
        const storagePath = buildAudioAssetStoragePath(req.user.id, evolution.id, audioAssetId, mimeType);
        const inserted = await deps.supabaseAdmin
          .from("audio_asset_upload_sessions")
          .insert({
            audio_asset_id: audioAssetId,
            professional_id: req.user.id,
            evolution_id: evolution.id,
            storage_path: storagePath,
            creation_request_id: creationRequestId,
            file_name: fileName,
            declared_mime_type: mimeType,
            declared_file_size: fileSize,
            status: "prepared",
            expires_at: new Date(Date.now() + SIGNED_UPLOAD_TTL_SECONDS * 1000).toISOString(),
          })
          .select(UPLOAD_SESSION_SELECT)
          .single();

        if (inserted.error && isUniqueViolation(inserted.error)) {
          session = await readUploadSessionByRequest(deps.supabaseAdmin, evolution.id, creationRequestId);
          if (!session) throw inserted.error;
          assertSessionContext(session, { professionalId: req.user.id, fileName, mimeType, fileSize });
        } else if (inserted.error) {
          throw inserted.error;
        } else {
          session = inserted.data as UploadSessionRow;
        }
      }

      if (session.status !== "prepared" && session.resolved_asset_id) {
        const resolved = await readExistingAsset(deps.supabaseAdmin, session.evolution_id, "id", session.resolved_asset_id);
        if (!resolved) throw routeError("O asset finalizado não foi encontrado.", "AUDIO_ASSET_FINALIZED_MISSING", 409);
        return res.status(200).json({ success: true, reused: session.status === "reused", alreadyFinalized: true, asset: publicAsset(resolved) });
      }

      const alreadyUploaded = await objectExists(deps.supabaseAdmin, session.storage_path);
      const signed = alreadyUploaded ? { token: "" } : await createSignedUpload(deps.supabaseAdmin, session.storage_path);
      return res.status(200).json({
        success: true,
        reused: false,
        alreadyFinalized: false,
        upload: uploadDescriptor(session, signed, deps.supabaseUrl, alreadyUploaded),
      });
    } catch (error) {
      return respondError(res, error);
    }
  });

  app.post("/api/ai/evolution-assets/:audioAssetId/finalize", deps.requireAuth, async (req: any, res: any) => {
    let session: UploadSessionRow | null = null;
    try {
      const audioAssetId = String(req.params.audioAssetId || "").trim();
      if (!isUuid(audioAssetId)) throw routeError("O asset informado é inválido.", "AUDIO_ASSET_ID_INVALID");
      session = await readUploadSession(deps.supabaseAdmin, audioAssetId);
      if (!session) throw routeError("A sessão de upload não foi encontrada.", "AUDIO_ASSET_UPLOAD_SESSION_NOT_FOUND", 404);
      if (session.professional_id !== req.user.id) throw routeError("Você não tem permissão para finalizar este asset.", "AUDIO_ASSET_NOT_AUTHORIZED", 403);

      if (session.status !== "prepared" && session.resolved_asset_id) {
        const resolved = await readExistingAsset(deps.supabaseAdmin, session.evolution_id, "id", session.resolved_asset_id);
        if (!resolved) throw routeError("O asset finalizado não foi encontrado.", "AUDIO_ASSET_FINALIZED_MISSING", 409);
        return res.status(200).json({ success: true, reused: session.status === "reused", asset: publicAsset(resolved) });
      }

      await authorizeEvolution(req, deps, session.evolution_id);
      const audioPolicy = await deps.resolveAudioPolicy(req.user.id);
      const object = await deps.supabaseAdmin.storage.from(AUDIO_ASSET_BUCKET).download(session.storage_path);
      if (object.error || !object.data) throw routeError("O upload direto ainda não está disponível para finalização.", "AUDIO_ASSET_UPLOAD_NOT_FOUND", 404);

      const audioBuffer = Buffer.from(await object.data.arrayBuffer());
      if (!audioBuffer.length || audioBuffer.length > audioPolicy.maxFileBytes) {
        await invalidateUploadedSession(deps.supabaseAdmin, session);
        throw routeError("O tamanho real do áudio excede o limite permitido.", "AUDIO_ASSET_FILE_SIZE_LIMIT");
      }

      let mimeType: string;
      try {
        mimeType = resolveAudioAssetMimeType(session.declared_mime_type, audioBuffer);
      } catch (error) {
        await invalidateUploadedSession(deps.supabaseAdmin, session);
        throw error;
      }
      if (mimeType !== session.declared_mime_type) {
        await invalidateUploadedSession(deps.supabaseAdmin, session);
        throw routeError("O conteúdo real não corresponde ao MIME declarado no preparo.", "AUDIO_ASSET_MIME_MISMATCH");
      }

      const duration = getAudioDurationFromBytes(new Uint8Array(audioBuffer));
      if (!Number.isFinite(duration) || duration <= 0) {
        await invalidateUploadedSession(deps.supabaseAdmin, session);
        throw routeError("Não foi possível determinar a duração do áudio no servidor.", "AUDIO_ASSET_DURATION_UNREADABLE");
      }
      const durationSeconds = Math.ceil(duration);
      if (durationSeconds > audioPolicy.maxDurationSeconds) {
        await invalidateUploadedSession(deps.supabaseAdmin, session);
        throw routeError("O áudio excede o limite máximo permitido para o plano atual.", "AUDIO_ASSET_DURATION_LIMIT");
      }

      const contentHash = createHash("sha256").update(audioBuffer).digest("hex");
      const duplicate = await readExistingAsset(deps.supabaseAdmin, session.evolution_id, "content_hash", contentHash);
      if (duplicate) {
        if (duplicate.id === session.audio_asset_id) {
          await updateUploadSession(deps.supabaseAdmin, session.audio_asset_id, { status: "finalized", resolved_asset_id: session.audio_asset_id });
          return res.status(200).json({ success: true, reused: true, asset: publicAsset(duplicate) });
        }
        const removed = await deps.supabaseAdmin.storage.from(AUDIO_ASSET_BUCKET).remove([session.storage_path]);
        if (removed.error) throw routeError("Não foi possível limpar o upload duplicado.", "AUDIO_ASSET_CLEANUP_FAILED", 502);
        await updateUploadSession(deps.supabaseAdmin, session.audio_asset_id, { status: "reused", resolved_asset_id: duplicate.id });
        return res.status(200).json({ success: true, reused: true, asset: publicAsset(duplicate) });
      }

      const inserted = await deps.supabaseAdmin
        .from("audio_assets")
        .insert({
          id: session.audio_asset_id,
          evolution_id: session.evolution_id,
          storage_path: session.storage_path,
          duration_seconds: durationSeconds,
          content_hash: contentHash,
          mime_type: mimeType,
          transcription_status: "pending",
          creation_request_id: session.creation_request_id,
        })
        .select(AUDIO_ASSET_SELECT)
        .single();

      if (inserted.error) {
        const existing = isUniqueViolation(inserted.error)
          ? await readExistingAsset(deps.supabaseAdmin, session.evolution_id, "content_hash", contentHash)
            || await readExistingAsset(deps.supabaseAdmin, session.evolution_id, "creation_request_id", session.creation_request_id)
            || await readExistingAsset(deps.supabaseAdmin, session.evolution_id, "id", session.audio_asset_id)
          : null;
        if (!existing) throw inserted.error;
        if (existing.id === session.audio_asset_id) {
          await updateUploadSession(deps.supabaseAdmin, session.audio_asset_id, { status: "finalized", resolved_asset_id: session.audio_asset_id });
          return res.status(200).json({ success: true, reused: true, asset: publicAsset(existing) });
        }
        const removed = await deps.supabaseAdmin.storage.from(AUDIO_ASSET_BUCKET).remove([session.storage_path]);
        if (removed.error) throw routeError("Não foi possível limpar o upload duplicado.", "AUDIO_ASSET_CLEANUP_FAILED", 502);
        await updateUploadSession(deps.supabaseAdmin, session.audio_asset_id, { status: "reused", resolved_asset_id: existing.id });
        return res.status(200).json({ success: true, reused: true, asset: publicAsset(existing) });
      }

      await updateUploadSession(deps.supabaseAdmin, session.audio_asset_id, { status: "finalized", resolved_asset_id: session.audio_asset_id });
      return res.status(201).json({ success: true, reused: false, asset: publicAsset(inserted.data as AudioAssetRow) });
    } catch (error) {
      return respondError(res, error);
    }
  });
}
