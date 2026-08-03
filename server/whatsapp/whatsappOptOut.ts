import { createHash, timingSafeEqual } from "node:crypto";
import { normalizeWhatsAppPhone, WhatsAppValidationError } from "./whatsappClient.js";

const SOURCES = new Set(["typebot", "n8n", "chatbot", "admin"]);

export class WhatsAppOptOutValidationError extends Error {
  constructor(message: string) { super(message); this.name = "WhatsAppOptOutValidationError"; }
}

export function verifyWhatsAppOptOutAuthorization(authorization: string | undefined, expectedToken: string): boolean {
  const receivedToken = /^Bearer\s+(.+)$/i.exec(String(authorization || ""))?.[1]?.trim() || "";
  const configuredToken = String(expectedToken || "").trim();
  if (!receivedToken || !configuredToken) return false;
  const received = Buffer.from(receivedToken);
  const expected = Buffer.from(configuredToken);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export function validateWhatsAppOptOutPayload(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new WhatsAppOptOutValidationError("Payload JSON deve ser um objeto.");
  const input = payload as Record<string, unknown>;
  const allowed = new Set(["phoneNumber", "source", "reason", "eventId"]);
  if (Object.keys(input).some((key) => !allowed.has(key))) throw new WhatsAppOptOutValidationError("Payload contém campos não permitidos.");
  let phoneNumber: string;
  try { phoneNumber = normalizeWhatsAppPhone(String(input.phoneNumber || "")); }
  catch (error) { throw new WhatsAppOptOutValidationError(error instanceof Error ? error.message : "phoneNumber inválido."); }
  if (phoneNumber.length < 8 || phoneNumber.length > 15) throw new WhatsAppOptOutValidationError("phoneNumber deve estar no formato internacional com DDI.");
  const source = String(input.source || "").trim();
  if (!SOURCES.has(source)) throw new WhatsAppOptOutValidationError("source não é suportado.");
  const reason = String(input.reason || "").trim();
  if (!reason || reason.length > 200) throw new WhatsAppOptOutValidationError("reason é obrigatório e deve ter no máximo 200 caracteres.");
  const eventId = input.eventId == null || input.eventId === "" ? null : String(input.eventId).trim();
  if (eventId && eventId.length > 255) throw new WhatsAppOptOutValidationError("eventId excede o tamanho permitido.");
  return { phoneNumber, phoneHash: createHash("sha256").update(phoneNumber).digest("hex"), source, reason, eventId };
}

export function safeWhatsAppOptOutLog(input: { eventId?: string | null; source?: string; status: string }) {
  return `[WhatsApp opt-out] status=${input.status} source=${String(input.source || "unknown").slice(0, 32)} eventId=${String(input.eventId || "none").slice(0, 64)}`;
}
