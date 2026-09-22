type TranscriptionErrorLike = {
  message?: string;
  code?: string;
  status?: number;
};

const NON_RETRYABLE_TRANSCRIPTION_CODES = new Set([
  "integration_disabled",
  "environment_configuration_error",
  "missing_gemini_api_key",
  "feature_unavailable",
  "GEMINI_ENABLED=false",
]);

const isBucketMissingError = (message: string): boolean => {
  const normalized = message.toLowerCase();
  return normalized.includes("bucket not found") || normalized.includes("nosuchbucket") || normalized.includes("temp-audio");
};

const isModelConfigurationError = (message: string): boolean => {
  const normalized = message.toLowerCase();
  return normalized.includes("not found for api version")
    || normalized.includes("not supported for generatecontent")
    || (normalized.includes("model") && normalized.includes("not found"))
    || normalized.includes("models/");
};

const isHardLimitError = (message: string): boolean => {
  const normalized = message.toLowerCase();
  return normalized.includes("(http 400)")
    || normalized.includes("(http 403)")
    || normalized.includes("limite máximo de 20 minutos")
    || normalized.includes("limite máximo de 50 minutos")
    || normalized.includes("tamanho máximo permitido de 20 mb")
    || normalized.includes("arquivo de áudio pode ter no máximo 20 mb")
    || normalized.includes("arquivo de áudio pode ter no máximo 60 mb")
    || normalized.includes("muitas solicitações de transcrição")
    || normalized.includes("limite mensal de transcrição de áudio atingido")
    || normalized.includes("duração do áudio é obrigatória");
};

const isConfigurationErrorText = (value: string) => {
  const normalized = value.toLowerCase();
  return normalized.includes("gemini_enabled=false")
    || normalized.includes("integração bloqueada pelo ambiente")
    || normalized.includes("environmentconfigurationerror")
    || normalized.includes("environment configuration")
    || normalized.includes("missing_gemini_api_key")
    || normalized.includes("chave do gemini não configurada")
    || normalized.includes("feature_unavailable");
};

export function isTranscriptionErrorRetryable(error: unknown): boolean {
  const details = (error || {}) as TranscriptionErrorLike;
  const message = String(details.message || error || "");
  const code = String(details.code || "");
  if (NON_RETRYABLE_TRANSCRIPTION_CODES.has(code) || isConfigurationErrorText(`${code} ${message}`)) return false;
  if (isBucketMissingError(message) || isModelConfigurationError(message) || isHardLimitError(message)) return false;

  const status = Number(details.status || message.match(/\(HTTP\s+(\d{3})\)/i)?.[1] || 0);
  const normalized = message.toLowerCase();
  return [429, 502, 503, 504].includes(status)
    || normalized.includes("failed to fetch")
    || normalized.includes("networkerror")
    || normalized.includes("network interruption")
    || normalized.includes("timeout")
    || normalized.includes("timed out")
    || normalized.includes("aborted");
}

export function getTranscriptionUserMessage(error: unknown): string | null {
  const details = (error || {}) as TranscriptionErrorLike;
  const message = String(details.message || error || "");
  if (!isConfigurationErrorText(`${details.code || ""} ${message}`)) return null;

  const publicEnv = ((import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env || {}) as Record<string, string | undefined>;
  const isStaging = String(publicEnv.VITE_APP_ENV || "").trim().toLowerCase() === "staging";
  return isStaging
    ? "O processamento por IA está temporariamente desabilitado neste ambiente."
    : "Não foi possível processar o áudio agora. Tente novamente mais tarde.";
}
