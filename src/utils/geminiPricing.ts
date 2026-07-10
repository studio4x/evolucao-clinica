export interface GeminiTranscriptionPricing {
  inputAudioUsdPerMillion: number;
  outputTextUsdPerMillion: number;
}

const GEMINI_TRANSCRIPTION_MODEL_ALIASES: Record<string, string> = {
  "gemini-1.5-flash": "gemini-3.5-flash",
  "gemini-1.5-flash-001": "gemini-3.5-flash",
  "gemini-2.0-flash": "gemini-2.0-flash",
  "gemini-2.0-flash-001": "gemini-2.0-flash",
  "gemini-2.0-flash-lite": "gemini-2.0-flash-lite",
  "gemini-2.0-flash-lite-001": "gemini-2.0-flash-lite",
  "gemini-2.5-flash-preview-05-20": "gemini-2.5-flash",
  "gemini-2.5-flash-lite-preview-09-2025": "gemini-2.5-flash-lite",
};

const GEMINI_TRANSCRIPTION_PRICING: Record<string, GeminiTranscriptionPricing> = {
  "gemini-3.5-flash": {
    inputAudioUsdPerMillion: 1.5,
    outputTextUsdPerMillion: 9.0,
  },
  "gemini-3-flash-preview": {
    inputAudioUsdPerMillion: 1.0,
    outputTextUsdPerMillion: 3.0,
  },
  "gemini-3.1-flash-lite": {
    inputAudioUsdPerMillion: 0.5,
    outputTextUsdPerMillion: 1.5,
  },
  "gemini-2.5-flash": {
    inputAudioUsdPerMillion: 1.0,
    outputTextUsdPerMillion: 2.5,
  },
  "gemini-2.5-flash-lite": {
    inputAudioUsdPerMillion: 0.3,
    outputTextUsdPerMillion: 0.4,
  },
  "gemini-2.0-flash": {
    inputAudioUsdPerMillion: 0.7,
    outputTextUsdPerMillion: 0.4,
  },
  "gemini-2.0-flash-lite": {
    inputAudioUsdPerMillion: 0.35,
    outputTextUsdPerMillion: 0.2,
  },
};

export function normalizeGeminiPricingModel(model?: string | null): string {
  const normalized = (model || "").trim();
  return GEMINI_TRANSCRIPTION_MODEL_ALIASES[normalized] || normalized;
}

export function getGeminiTranscriptionPricing(model?: string | null): GeminiTranscriptionPricing | null {
  const normalizedModel = normalizeGeminiPricingModel(model);
  return GEMINI_TRANSCRIPTION_PRICING[normalizedModel] || null;
}

export function estimateGeminiTranscriptionCostUsd(options: {
  model?: string | null;
  promptTokens?: number | null;
  candidatesTokens?: number | null;
  fallbackCostUsd?: number | null;
}): number {
  const pricing = getGeminiTranscriptionPricing(options.model);

  if (!pricing) {
    return Number(options.fallbackCostUsd || 0);
  }

  const promptTokens = Number(options.promptTokens || 0);
  const candidatesTokens = Number(options.candidatesTokens || 0);

  return (
    (promptTokens / 1_000_000) * pricing.inputAudioUsdPerMillion +
    (candidatesTokens / 1_000_000) * pricing.outputTextUsdPerMillion
  );
}
