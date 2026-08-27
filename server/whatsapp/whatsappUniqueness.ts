export const WHATSAPP_ALREADY_IN_USE_MESSAGE = "Este número de WhatsApp já está vinculado a outro profissional.";

export function isWhatsAppNumberUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  return String((error as { code?: unknown }).code || "") === "23505";
}

export class WhatsAppNumberAlreadyInUseError extends Error {
  readonly code = "whatsapp_already_in_use";
  readonly httpStatus = 409;

  constructor() {
    super(WHATSAPP_ALREADY_IN_USE_MESSAGE);
    this.name = "WhatsAppNumberAlreadyInUseError";
  }
}
