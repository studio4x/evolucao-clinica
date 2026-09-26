export const EVOLUTION_AUDIO_BUCKET = "evolution-audio-assets";
export const EVOLUTION_AUDIO_SIGNED_URL_MAX_SECONDS = 5 * 60;

const AUDIO_MIME_ALIASES: Record<string, string> = {
  "audio/webm": "audio/webm",
  "audio/ogg": "audio/ogg",
  "audio/x-ogg": "audio/ogg",
  "application/ogg": "audio/ogg",
  "application/x-ogg": "audio/ogg",
  "audio/opus": "audio/ogg",
  "audio/wav": "audio/wav",
  "audio/x-wav": "audio/wav",
  "audio/mpeg": "audio/mpeg",
  "audio/mp3": "audio/mpeg",
  "audio/mp4": "audio/mp4",
  "audio/x-m4a": "audio/mp4",
  "audio/m4a": "audio/mp4",
  "audio/aac": "audio/aac",
};

const AUDIO_EXTENSIONS: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
};

export function normalizePersistentAudioMimeType(value: unknown): string | null {
  const raw = String(value || "").split(";")[0].trim().toLowerCase();
  return AUDIO_MIME_ALIASES[raw] || null;
}

export function getPersistentAudioExtension(mimeType: string): string | null {
  return AUDIO_EXTENSIONS[mimeType] || null;
}

export function isAudioRetentionEnabled(
  env: NodeJS.ProcessEnv,
  professionalId?: string,
): boolean {
  if (String(env.AUDIO_RETENTION_ENABLED || "").trim().toLowerCase() !== "true") return false;
  const cohort = String(env.AUDIO_RETENTION_PROFESSIONAL_IDS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return cohort.length === 0 || (!!professionalId && cohort.includes(professionalId.toLowerCase()));
}

export function calculateSignedAudioUrlTtl(remainingSeconds: number): number {
  if (!Number.isFinite(remainingSeconds) || remainingSeconds <= 0) return 0;
  return Math.min(EVOLUTION_AUDIO_SIGNED_URL_MAX_SECONDS, Math.floor(remainingSeconds));
}

export function isAudioExpired(expiresAt: Date | string | number, databaseNow: Date | string | number): boolean {
  return new Date(expiresAt).getTime() <= new Date(databaseNow).getTime();
}

export function detectAudioMimeType(buffer: Uint8Array): string | null {
  if (buffer.length >= 4 && String.fromCharCode(...buffer.subarray(0, 4)) === "OggS") return "audio/ogg";
  if (
    buffer.length >= 12
    && String.fromCharCode(...buffer.subarray(0, 4)) === "RIFF"
    && String.fromCharCode(...buffer.subarray(8, 12)) === "WAVE"
  ) return "audio/wav";
  if (buffer.length >= 4 && buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
    return "audio/webm";
  }
  if (buffer.length >= 3 && String.fromCharCode(...buffer.subarray(0, 3)) === "ID3") return "audio/mpeg";
  if (buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) {
    return (buffer[1] & 0xf6) === 0xf0 ? "audio/aac" : "audio/mpeg";
  }
  if (buffer.length >= 12 && String.fromCharCode(...buffer.subarray(4, 8)) === "ftyp") return "audio/mp4";
  return null;
}

export function classifyAudioStorageError(error: unknown): string {
  const value = error as { status?: number; statusCode?: number; message?: string } | null;
  const status = Number(value?.statusCode || value?.status || 0);
  const message = String(value?.message || "").toLowerCase();
  if (status === 401 || status === 403) return "storage_auth";
  if (status === 404 || message.includes("not found")) return "storage_missing";
  if (status === 408 || status === 504 || message.includes("timeout")) return "storage_timeout";
  if (status >= 500 || message.includes("unavailable")) return "storage_unavailable";
  return "storage_unknown";
}
