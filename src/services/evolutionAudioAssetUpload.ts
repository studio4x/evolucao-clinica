import { Upload } from "tus-js-client";
import { supabase } from "../supabaseClient";

export const AUDIO_ASSET_TUS_THRESHOLD_BYTES = 6 * 1024 * 1024;

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

const getAccessToken = async (): Promise<string> => {
  const { data, error } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (error || !token) throw new Error("Usuário não autenticado. Faça login novamente.");
  return token;
};

const readError = async (response: Response): Promise<Error> => {
  const text = await response.text();
  let body: { error?: string } = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    // Mantém a mensagem genérica quando o runtime retornar HTML ou texto cru.
  }
  return new Error(String(body.error || `Falha no upload de áudio (HTTP ${response.status}).`).slice(0, 240));
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

const uploadWithTus = async (file: File, upload: PreparedUpload, onProgress?: UploadProgress): Promise<void> => {
  if (!upload.token) throw new Error("O token do upload resumível não foi emitido.");

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
};

const uploadDirectly = async (file: File, upload: PreparedUpload, onProgress?: UploadProgress): Promise<void> => {
  if (upload.alreadyUploaded) {
    onProgress?.(file.size, file.size);
    return;
  }
  if (!upload.token) throw new Error("O token do upload direto não foi emitido.");

  if (file.size > AUDIO_ASSET_TUS_THRESHOLD_BYTES) {
    await uploadWithTus(file, upload, onProgress);
    return;
  }

  const result = await supabase.storage.from(upload.bucket).uploadToSignedUrl(upload.path, upload.token, file, {
    cacheControl: "31536000",
    contentType: upload.mimeType,
  });
  if (result.error) throw new Error(String(result.error.message || "Falha no upload direto ao Storage.").slice(0, 240));
  onProgress?.(file.size, file.size);
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
  file: File;
  evolutionId: string;
  idempotencyKey: string;
  onProgress?: UploadProgress;
}): Promise<{ asset: Record<string, unknown>; uploadMode: "standard" | "tus" | "already-uploaded" }> {
  const token = await getAccessToken();
  const prepared = await prepareUpload(input.file, input.evolutionId, input.idempotencyKey, token);

  if (prepared.alreadyFinalized && prepared.asset) {
    return { asset: prepared.asset, uploadMode: "already-uploaded" };
  }

  if (!prepared.upload) throw new Error("O servidor não retornou os dados do upload direto.");
  await uploadDirectly(input.file, prepared.upload, input.onProgress);
  const asset = await finalizeUpload(prepared.upload, token);
  return {
    asset,
    uploadMode: prepared.upload.alreadyUploaded ? "already-uploaded" : input.file.size > AUDIO_ASSET_TUS_THRESHOLD_BYTES ? "tus" : "standard",
  };
}
