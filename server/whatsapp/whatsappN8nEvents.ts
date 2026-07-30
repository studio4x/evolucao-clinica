import { timingSafeEqual } from "node:crypto";
import type {
  NormalizedWhatsAppN8nEvent,
  WhatsAppN8nEventType,
  WhatsAppN8nEventsRepository,
  WhatsAppN8nMessageStatus
} from "./whatsappTypes.js";

const EVENT_TYPES = new Set<WhatsAppN8nEventType>([
  "message_status",
  "business_app_echo",
  "coexistence_sync"
]);
const MESSAGE_STATUSES = new Set<WhatsAppN8nMessageStatus>([
  "sent",
  "delivered",
  "read",
  "failed"
]);
const SENSITIVE_KEYS = new Set([
  "authorization",
  "access_token",
  "app_secret",
  "client_secret",
  "service_role",
  "supabase_service_role_key",
  "whatsapp_n8n_events_token",
  "token"
]);

type WhatsAppN8nLogger = Pick<Console, "info" | "warn" | "error">;

export class WhatsAppN8nEventValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WhatsAppN8nEventValidationError";
  }
}

function requiredString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new WhatsAppN8nEventValidationError(`${field} é obrigatório.`);
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new WhatsAppN8nEventValidationError(`${field} excede o tamanho permitido.`);
  }
  return normalized;
}

function optionalString(value: unknown, field: string, maxLength: number): string | null {
  if (value == null || value === "") return null;
  return requiredString(value, field, maxLength);
}

function sanitizeRawValue(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[TRUNCATED]";
  if (typeof value === "string") return value.slice(0, 4000);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => sanitizeRawValue(item, depth + 1));
  if (!value || typeof value !== "object") return String(value).slice(0, 4000);

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .slice(0, 100)
      .filter(([key]) => !SENSITIVE_KEYS.has(key.toLowerCase()))
      .map(([key, item]) => [key, sanitizeRawValue(item, depth + 1)])
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function pickErrorValue(value: unknown): string | null {
  if (value == null) return null;
  const normalized = String(value).trim();
  return normalized ? normalized.slice(0, 1000) : null;
}

function extractEventError(rawValue: unknown) {
  const raw = asRecord(rawValue);
  const error = asRecord(raw?.error) || asRecord(raw?.errors?.[0]) || raw;
  return {
    errorCode: pickErrorValue(error?.code || error?.error_code),
    errorTitle: pickErrorValue(error?.error_user_title || error?.title || error?.type),
    errorMessage: pickErrorValue(error?.error_user_msg || error?.message || error?.details)
  };
}

export function validateNormalizedWhatsAppN8nEvent(payload: unknown): NormalizedWhatsAppN8nEvent {
  const input = asRecord(payload);
  if (!input) throw new WhatsAppN8nEventValidationError("Payload JSON deve ser um objeto.");

  const eventType = requiredString(input.eventType, "eventType", 64) as WhatsAppN8nEventType;
  if (!EVENT_TYPES.has(eventType)) {
    throw new WhatsAppN8nEventValidationError("eventType não é suportado.");
  }

  const receivedAtRaw = requiredString(input.receivedAt, "receivedAt", 64);
  const receivedAtDate = new Date(receivedAtRaw);
  if (Number.isNaN(receivedAtDate.getTime())) {
    throw new WhatsAppN8nEventValidationError("receivedAt deve ser uma data ISO válida.");
  }

  const messageId = optionalString(input.messageId, "messageId", 512);
  const statusValue = optionalString(input.status, "status", 32);
  const status = statusValue as WhatsAppN8nMessageStatus | null;

  if (eventType === "message_status") {
    if (!messageId) throw new WhatsAppN8nEventValidationError("messageId é obrigatório para message_status.");
    if (!status || !MESSAGE_STATUSES.has(status)) {
      throw new WhatsAppN8nEventValidationError("status deve ser sent, delivered, read ou failed.");
    }
  }

  return {
    tenant: requiredString(input.tenant, "tenant", 128),
    eventType,
    eventKey: requiredString(input.eventKey, "eventKey", 255),
    messageId,
    status: eventType === "message_status" ? status : null,
    receivedAt: receivedAtDate.toISOString(),
    phoneNumberId: optionalString(input.phoneNumberId, "phoneNumberId", 255),
    senderPhone: optionalString(input.senderPhone, "senderPhone", 64),
    recipientPhone: optionalString(input.recipientPhone, "recipientPhone", 64),
    rawValue: sanitizeRawValue(input.rawValue)
  };
}

export function verifyWhatsAppN8nEventsAuthorization(
  authorization: string | undefined,
  expectedToken: string
): boolean {
  const match = /^Bearer\s+(.+)$/i.exec(String(authorization || ""));
  const receivedToken = match?.[1]?.trim() || "";
  const configuredToken = String(expectedToken || "").trim();
  if (!receivedToken || !configuredToken) return false;

  const received = Buffer.from(receivedToken);
  const expected = Buffer.from(configuredToken);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export function createWhatsAppN8nEventsService(deps: {
  repository: WhatsAppN8nEventsRepository;
  logger?: WhatsAppN8nLogger;
}) {
  const logger = deps.logger || console;

  return {
    async process(event: NormalizedWhatsAppN8nEvent) {
      const claim = await deps.repository.claimN8nEvent(event);
      if (!claim.shouldProcess) {
        return { processed: true, alreadyProcessed: true, result: "already_processed" };
      }

      try {
        if (event.eventType !== "message_status") {
          await deps.repository.completeN8nEvent({
            eventId: claim.eventId,
            processingStatus: "ignored",
            deliveryId: null,
            processingResult: { action: "recorded_without_processing", eventType: event.eventType }
          });
          logger.info(`[WhatsApp n8n] eventKey=${event.eventKey} eventType=${event.eventType} result=recorded_without_processing`);
          return { processed: true, alreadyProcessed: false, result: "recorded_without_processing" };
        }

        const delivery = await deps.repository.findDeliveryByWamid(event.messageId!);
        if (!delivery) {
          await deps.repository.completeN8nEvent({
            eventId: claim.eventId,
            processingStatus: "ignored",
            deliveryId: null,
            processingResult: { action: "delivery_not_found", messageId: event.messageId }
          });
          logger.warn(`[WhatsApp n8n] eventKey=${event.eventKey} eventType=message_status result=delivery_not_found`);
          return { processed: true, alreadyProcessed: false, result: "delivery_not_found" };
        }

        const error = event.status === "failed"
          ? extractEventError(event.rawValue)
          : { errorCode: null, errorTitle: null, errorMessage: null };
        await deps.repository.updateDeliveryFromN8nEvent(delivery, {
          status: event.status!,
          receivedAt: event.receivedAt,
          eventKey: event.eventKey,
          tenant: event.tenant,
          phoneNumberId: event.phoneNumberId,
          ...error
        });
        await deps.repository.completeN8nEvent({
          eventId: claim.eventId,
          processingStatus: "processed",
          deliveryId: delivery.id,
          processingResult: { action: "delivery_status_updated", status: event.status }
        });
        logger.info(`[WhatsApp n8n] eventKey=${event.eventKey} eventType=message_status status=${event.status} result=updated`);
        return { processed: true, alreadyProcessed: false, result: "delivery_status_updated" };
      } catch (error) {
        const message = error instanceof Error ? error.message.slice(0, 1000) : "Erro interno ao processar evento.";
        await deps.repository.failN8nEvent(claim.eventId, message).catch(() => {});
        throw error;
      }
    }
  };
}
