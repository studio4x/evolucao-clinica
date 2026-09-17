import { INLINE_AUDIO_MAX_RAW_BYTES } from "../src/utils/audioLimits.js";
import { createPartFromUri } from "@google/genai";

export type GeminiAudioTransportResult = {
  transcription: string;
  method: "inline" | "files-api";
  cleanupSucceeded: boolean;
  usageMetadata?: any;
};

type GeminiClient = {
  files: {
    upload(input: { file: Blob; config: { mimeType: string; displayName: string } }): Promise<{ name?: string; uri?: string; mimeType?: string }>;
    delete(input: { name: string }): Promise<unknown>;
  };
  models: {
    generateContent(input: { model: string; contents: { parts: Array<Record<string, unknown>> } }): Promise<{ text?: string; usageMetadata?: any }>;
  };
};

const safeError = (error: unknown) => String((error as { message?: string })?.message || "erro").replace(/[\r\n]/g, " ").slice(0, 160);

export async function transcribeGeminiAudio(
  ai: GeminiClient,
  input: { audioBuffer: Buffer; mimeType: string; prompt: string; model: string; durationSeconds: number },
  log: (event: Record<string, unknown>) => void = (event) => console.log("[AI-Backend]", event),
): Promise<GeminiAudioTransportResult> {
  const useInline = input.audioBuffer.byteLength <= INLINE_AUDIO_MAX_RAW_BYTES;
  const method = useInline ? "inline" : "files-api";
  let geminiFileName: string | null = null;
  let cleanupSucceeded = true;
  let result: GeminiAudioTransportResult | null = null;

  try {
    let audioPart: any;
    if (useInline) {
      audioPart = { inlineData: { data: input.audioBuffer.toString("base64"), mimeType: input.mimeType } };
    } else {
      const geminiFile = await ai.files.upload({
        file: new Blob([input.audioBuffer], { type: input.mimeType }),
        config: { mimeType: input.mimeType, displayName: "temporary-audio" },
      });
      geminiFileName = geminiFile.name || null;
      if (!geminiFile.uri) throw new Error("A Files API do Gemini não retornou uma URI válida.");
      audioPart = createPartFromUri(geminiFile.uri, geminiFile.mimeType || input.mimeType);
    }

    const response = await ai.models.generateContent({
      model: input.model,
      contents: { parts: [{ text: input.prompt }, audioPart] },
    });
    const transcription = response.text;
    if (!transcription) throw new Error("O Gemini não retornou nenhum texto de transcrição.");
    result = { transcription, method, cleanupSucceeded, usageMetadata: response.usageMetadata };
    return result;
  } finally {
    if (geminiFileName) {
      try {
        await ai.files.delete({ name: geminiFileName });
        log({ method, bytes: input.audioBuffer.byteLength, durationSeconds: input.durationSeconds, mimeType: input.mimeType, cleanupSucceeded: true });
      } catch (error) {
        cleanupSucceeded = false;
        if (result) result.cleanupSucceeded = false;
        log({ method, bytes: input.audioBuffer.byteLength, durationSeconds: input.durationSeconds, mimeType: input.mimeType, cleanupSucceeded: false, cleanupError: safeError(error) });
      }
    } else {
      log({ method, bytes: input.audioBuffer.byteLength, durationSeconds: input.durationSeconds, mimeType: input.mimeType, cleanupSucceeded: true });
    }
  }
}
