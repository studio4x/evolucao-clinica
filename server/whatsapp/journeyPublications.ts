import { timingSafeEqual } from "node:crypto";

export const JOURNEY_WHATSAPP_DESTINATION_KEY = "jornada-15-dias-operador-evolucao-clinica";
export const JOURNEY_WHATSAPP_CLAIM_MINUTES = 15;
export const JOURNEY_WHATSAPP_TIMEZONE = "America/Sao_Paulo";
export const JOURNEY_WHATSAPP_PROVIDERS = ["manual", "evolution"] as const;
export type JourneyWhatsAppProvider = typeof JOURNEY_WHATSAPP_PROVIDERS[number];

export class JourneyPublicationValidationError extends Error {}

export function verifyJourneyPublicationAuthorization(authorization: string | undefined, expectedToken: string | undefined) {
  const received = /^Bearer\s+(.+)$/i.exec(String(authorization || ""))?.[1]?.trim() || "";
  const configured = String(expectedToken || "").trim();
  if (!received || !configured) return false;
  const a = Buffer.from(received); const b = Buffer.from(configured);
  return a.length === b.length && timingSafeEqual(a, b);
}

function objectPayload(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new JourneyPublicationValidationError("Payload JSON deve ser um objeto.");
  return payload as Record<string, unknown>;
}
function requiredString(input: Record<string, unknown>, key: string, max = 255) {
  const value = String(input[key] || "").trim();
  if (!value || value.length > max) throw new JourneyPublicationValidationError(`${key} inválido.`);
  return value;
}
function provider(input: unknown): JourneyWhatsAppProvider {
  const value = String(input || "").trim();
  if (!JOURNEY_WHATSAPP_PROVIDERS.includes(value as JourneyWhatsAppProvider)) throw new JourneyPublicationValidationError("provider não suportado.");
  return value as JourneyWhatsAppProvider;
}
export function validateClaimPayload(payload: unknown) {
  const input = objectPayload(payload);
  if (Object.keys(input).some((key) => !["destinationKey", "workerId", "provider"].includes(key))) throw new JourneyPublicationValidationError("Payload contém campos não permitidos.");
  const destinationKey = requiredString(input, "destinationKey", 120);
  if (destinationKey !== JOURNEY_WHATSAPP_DESTINATION_KEY) throw new JourneyPublicationValidationError("destinationKey não suportado.");
  return { destinationKey, workerId: requiredString(input, "workerId", 120), provider: provider(input.provider) };
}
export function validateCompletePayload(payload: unknown) {
  const input = objectPayload(payload); const publicationId = requiredString(input, "publicationId", 80); const p = provider(input.provider);
  const publishedAt = input.publishedAt == null ? new Date().toISOString() : String(input.publishedAt);
  if (Number.isNaN(Date.parse(publishedAt))) throw new JourneyPublicationValidationError("publishedAt inválido.");
  const providerMessageId = input.providerMessageId == null || input.providerMessageId === "" ? null : requiredString(input, "providerMessageId", 255);
  return { publicationId, provider: p, publishedAt: new Date(publishedAt).toISOString(), providerMessageId };
}
export function validateFailPayload(payload: unknown) {
  const input = objectPayload(payload); const publicationId = requiredString(input, "publicationId", 80);
  const errorCode = requiredString(input, "errorCode", 80); const errorMessage = requiredString(input, "errorMessage", 500);
  if (typeof input.retryable !== "boolean") throw new JourneyPublicationValidationError("retryable inválido.");
  return { publicationId, errorCode, errorMessage, retryable: input.retryable };
}
export function retryDelayMinutes(attempt: number) { return [5, 15, 30, 60][Math.max(0, Math.min(3, attempt - 1))]; }
export function publicJourneyUrls(origin: string, journey: { slug: string; public_url?: string | null }, contentSlug: string) {
  const centralUrl = journey.public_url || `${origin.replace(/\/$/, "")}/jornada/${encodeURIComponent(journey.slug)}`;
  return { centralUrl, contentUrl: `${centralUrl.replace(/\/$/, "")}/${encodeURIComponent(contentSlug)}` };
}
