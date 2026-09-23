import { Upload } from "tus-js-client";
import { supabase } from "../supabaseClient";

export const AUDIO_ASSET_TUS_THRESHOLD_BYTES = 6 * 1024 * 1024;

export type AudioAssetClientErrorCode = string;

export class AudioAssetClientError extends Error {
  constructor(
    message: string,
    public readonly code: AudioAssetClientErrorCode,
    public readonly status: number,
  ) {
    super(message);
    this.name = "AudioAssetClientError";
  }
}

type PreparedUpload = {
  audioAssetId: string;
  bucket: "evolution-audio";
  path: string;
  mimeType: string;
  fileSize: number;
  token: string | null;
  alreadyUploaded: boolean;
  expiresAt: string;
  tusEndpoint: string;
  tusChunkSize: number;
};

type PreparedResponse = {
  success: true;
  reused: boolean;
  alreadyFinalized: boolean;
  upload?: PreparedUpload;
  asset?: Record<string, unknown>;
};

type UploadProgress = (bytesUploaded: number, bytesTotal: number) => void;

export type ProcessEvolutionAudioAssetInput = {
  file: Blob;
  fileName: string;
  mimeType: string;
  evolutionId: string;
  idempotencyKey: string;
  onUploadProgress?: UploadProgress;
  maxProcessAttempts?: number;
  wait?: (milliseconds: number) => Promise<void>;
};

export type ProcessEvolutionAudioAssetResult = {
  audioAssetId: string;
  transcriptionText: string;
  durationSeconds: number;
  mimeType: string;
  cached: boolean;
  uploadMode: "standard" | "tus" | "already-uploaded";
};

const getAccessToken = async (): Promise<string> => {
  const { data, error } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (error || !token) throw new Error("Usuário não autenticado. Faça login novamente.");
  return token;
};

const readError = async (response: Response): Promise<AudioAssetClientError> => {
  const text = await response.text();
  let body: { code?: string; error?: string } = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    // Mantém a mensagem genérica quando o runtime retornar HTML ou texto cru.
  }
  return new AudioAssetClientError(
    String(body.error || `Falha no upload de áudio (HTTP ${response.status}).`).slice(0, 240),
    String(body.code || "AUDIO_ASSET_REQUEST_FAILED"),
    response.status,
  );
};

const prepareUpload = async (file: File, evolutionId: string, idempotencyKey: string, token: string): Promise<PreparedResponse> => {
  const response = await fetch("/api/ai/evolution-assets/prepare", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({
      evolutionId,
      fileName: file.name,
      mimeType: file.type,
      fileSize: file.size,
    }),
  });

  if (!response.ok) throw await readError(response);
  return await response.json() as PreparedResponse;
};

const uploadWithSignedUrl = async (file: File, upload: PreparedUpload, onProgress?: UploadProgress): Promise<void> => {
  if (!upload.token) throw new Error("O token do upload direto não foi emitido.");

  const result = await supabase.storage.from(upload.bucket).uploadToSignedUrl(upload.path, upload.token, file, {
    cacheControl: "31536000",
    contentType: upload.mimeType,
  });
  if (result.error) throw new Error(String(result.error.message || "Falha no upload direto ao Storage.").slice(0, 240));
  onProgress?.(file.size, file.size);
};

const isTusSignedTokenRejected = (error: unknown): boolean => {
  const candidate = error as any;
  const responseBody = candidate?.originalResponse?.getBody?.() || candidate?.originalResponse?.body || "";
  const message = `${candidate?.message || ""} ${responseBody}`;
  return /Invalid Compact JWS|new row violates row-level security policy/i.test(message);
};

const uploadWithTus = async (file: File, upload: PreparedUpload, onProgress?: UploadProgress): Promise<"tus" | "standard"> => {
  if (!upload.token) throw new Error("O token do upload resumível não foi emitido.");

  try {
    await new Promise<void>((resolve, reject) => {
      const resumable = new Upload(file, {
        endpoint: upload.tusEndpoint,
        headers: {
          "x-signature": upload.token,
        },
        metadata: {
          bucketName: upload.bucket,
          objectName: upload.path,
          contentType: upload.mimeType,
          cacheControl: "31536000",
        },
        chunkSize: upload.tusChunkSize || AUDIO_ASSET_TUS_THRESHOLD_BYTES,
        retryDelays: [0, 3000, 5000, 10000, 20000],
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        onError: reject,
        onProgress: (bytesUploaded, bytesTotal) => onProgress?.(bytesUploaded, bytesTotal),
        onSuccess: () => resolve(),
      });

      void resumable.findPreviousUploads().then((previousUploads) => {
        if (previousUploads.length > 0) resumable.resumeFromPreviousUpload(previousUploads[0]);
        resumable.start();
      }).catch(reject);
    });
    return "tus";
  } catch (error) {
    if (!isTusSignedTokenRejected(error)) throw error;
    await uploadWithSignedUrl(file, upload, onProgress);
    return "standard";
  }
};

const uploadDirectly = async (file: File, upload: PreparedUpload, onProgress?: UploadProgress): Promise<"standard" | "tus" | "already-uploaded"> => {
  if (upload.alreadyUploaded) {
    onProgress?.(file.size, file.size);
    return "already-uploaded";
  }
  if (!upload.token) throw new Error("O token do upload direto não foi emitido.");

  if (file.size > AUDIO_ASSET_TUS_THRESHOLD_BYTES) {
    return await uploadWithTus(file, upload, onProgress);
  }

  await uploadWithSignedUrl(file, upload, onProgress);
  return "standard";
};

const finalizeUpload = async (upload: PreparedUpload, token: string): Promise<Record<string, unknown>> => {
  const response = await fetch(`/api/ai/evolution-assets/${encodeURIComponent(upload.audioAssetId)}/finalize`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: "{}",
  });
  if (!response.ok) throw await readError(response);
  const body = await response.json() as { asset?: Record<string, unknown> };
  if (!body.asset) throw new Error("O servidor não retornou o asset finalizado.");
  return body.asset;
};

export async function uploadEvolutionAudioAsset(input: {
  file: Blob;
  fileName: string;
  mimeType: string;
  evolutionId: string;
  idempotencyKey: string;
  onProgress?: UploadProgress;
}): Promise<{ asset: Record<string, unknown>; uploadMode: "standard" | "tus" | "already-uploaded" }> {
  const token = await getAccessToken();
  const file = input.file instanceof File
    ? input.file
    : new File([input.file], input.fileName, { type: input.mimeType || input.file.type || "audio/webm" });
  const prepared = await prepareUpload(file, input.evolutionId, input.idempotencyKey, token);

  if (prepared.alreadyFinalized && prepared.asset) {
    return { asset: prepared.asset, uploadMode: "already-uploaded" };
  }

  if (!prepared.upload) throw new Error("O servidor não retornou os dados do upload direto.");
  const uploadMode = await uploadDirectly(file, prepared.upload, input.onProgress);
  const asset = await finalizeUpload(prepared.upload, token);
  return {
    asset,
    uploadMode,
  };
}

const waitForRetry = (milliseconds: number): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

const processAudioAsset = async (audioAssetId: string, token: string): Promise<{ cached: boolean; asset: Record<string, unknown> }> => {
  const response = await fetch(`/api/ai/evolution-assets/${encodeURIComponent(audioAssetId)}/process`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: "{}",
  });
  if (!response.ok) throw await readError(response);
  const body = await response.json() as { cached?: boolean; asset?: Record<string, unknown> };
  if (!body.asset) throw new AudioAssetClientError("O servidor não retornou o asset processado.", "AUDIO_ASSET_PROCESSING_FAILED", response.status);
  return { cached: body.cached === true, asset: body.asset };
};

export async function processEvolutionAudioAsset(input: ProcessEvolutionAudioAssetInput): Promise<ProcessEvolutionAudioAssetResult> {
  const uploaded = await uploadEvolutionAudioAsset(input);
  const audioAssetId = String(uploaded.asset.id || uploaded.asset.audioAssetId || "");
  if (!audioAssetId) throw new AudioAssetClientError("O servidor não retornou o identificador do asset.", "AUDIO_ASSET_ID_MISSING", 502);

  const token = await getAccessToken();
  const maxAttempts = Math.max(1, Math.min(5, input.maxProcessAttempts || 4));
  const sleep = input.wait || waitForRetry;
  let processed: { cached: boolean; asset: Record<string, unknown> } | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      processed = await processAudioAsset(audioAssetId, token);
      break;
    } catch (error) {
      const isProcessing = error instanceof AudioAssetClientError && error.code === "AUDIO_ASSET_PROCESSING_IN_PROGRESS";
      if (!isProcessing || attempt >= maxAttempts) throw error;
      await sleep(Math.min(5000, 1500 * attempt));
    }
  }

  if (!processed) throw new AudioAssetClientError("O processamento do áudio não foi concluído.", "AUDIO_ASSET_PROCESSING_FAILED", 502);
  const asset = processed.asset;
  const transcriptionText = String(asset.transcriptionText || "").trim();
  const durationSeconds = Number(asset.durationSeconds);
  const mimeType = String(asset.mimeType || input.mimeType);
  if (!transcriptionText) throw new AudioAssetClientError("A IA não retornou uma transcrição utilizável.", "AUDIO_ASSET_TRANSCRIPTION_EMPTY", 502);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new AudioAssetClientError("O servidor não retornou uma duração válida.", "AUDIO_ASSET_DURATION_INVALID", 502);

  return {
    audioAssetId,
    transcriptionText,
    durationSeconds,
    mimeType,
    cached: processed.cached,
    uploadMode: uploaded.uploadMode,
  };
}
