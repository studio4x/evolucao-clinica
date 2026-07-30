import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  WhatsAppConfig,
  WhatsAppDeliveryRepository,
  WhatsAppMetaError,
  WhatsAppSendResult,
  WhatsAppTextSendInput
} from "./whatsappTypes.js";

const DEFAULT_GRAPH_API_VERSION = "v25.0";

type WhatsAppLogger = Pick<Console, "info" | "warn" | "error">;

type WhatsAppClientDependencies = {
  config: WhatsAppConfig;
  repository: WhatsAppDeliveryRepository;
  fetchImpl?: typeof fetch;
  logger?: WhatsAppLogger;
};

export class WhatsAppValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WhatsAppValidationError";
  }
}

export function getWhatsAppConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env
): WhatsAppConfig {
  const graphApiVersion = String(env.WHATSAPP_GRAPH_API_VERSION || DEFAULT_GRAPH_API_VERSION).trim();
  return {
    accessToken: String(env.WHATSAPP_ACCESS_TOKEN || "").trim(),
    phoneNumberId: String(env.WHATSAPP_PHONE_NUMBER_ID || "").trim(),
    graphApiVersion,
    appSecret: String(env.WHATSAPP_APP_SECRET || "").trim(),
    webhookVerifyToken: String(env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || "").trim(),
    n8nEventsToken: String(env.WHATSAPP_N8N_EVENTS_TOKEN || "").trim(),
    allowUnsignedWebhooks:
      env.NODE_ENV !== "production" &&
      String(env.WHATSAPP_ALLOW_UNSIGNED_WEBHOOKS || "false").toLowerCase() === "true"
  };
}

export function normalizeWhatsAppPhone(value: string): string {
  const normalized = String(value || "").replace(/\D/g, "");
  if (!normalized) {
    throw new WhatsAppValidationError("Número de telefone do WhatsApp é obrigatório.");
  }
  return normalized;
}

export function maskWhatsAppPhone(value: string): string {
  const phone = String(value || "");
  if (phone.length <= 6) return "*".repeat(phone.length);
  return `${phone.slice(0, 4)}${"*".repeat(Math.max(5, phone.length - 8))}${phone.slice(-4)}`;
}

export function buildWhatsAppMessagesUrl(config: Pick<WhatsAppConfig, "graphApiVersion" | "phoneNumberId">): string {
  const version = String(config.graphApiVersion || DEFAULT_GRAPH_API_VERSION).trim();
  if (!/^v\d+\.\d+$/.test(version)) {
    throw new WhatsAppValidationError("WHATSAPP_GRAPH_API_VERSION deve seguir o formato vNN.N.");
  }
  if (!String(config.phoneNumberId || "").trim()) {
    throw new WhatsAppValidationError("WHATSAPP_PHONE_NUMBER_ID não configurada no servidor.");
  }
  return `https://graph.facebook.com/${version}/${encodeURIComponent(config.phoneNumberId.trim())}/messages`;
}

export function parseWhatsAppMetaError(payload: unknown): WhatsAppMetaError {
  const error = payload && typeof payload === "object" && "error" in payload
    ? (payload as { error?: Record<string, unknown> }).error || {}
    : {};
  return {
    code: error.code == null ? null : String(error.code),
    subcode: error.error_subcode == null ? null : String(error.error_subcode),
    type: error.type == null ? null : String(error.type),
    message: error.message == null ? null : String(error.message),
    userTitle: error.error_user_title == null ? null : String(error.error_user_title),
    userMessage: error.error_user_msg == null ? null : String(error.error_user_msg),
    fbtraceId: error.fbtrace_id == null ? null : String(error.fbtrace_id)
  };
}

export function extractWhatsAppWamid(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const messages = (payload as { messages?: unknown }).messages;
  if (!Array.isArray(messages) || !messages[0] || typeof messages[0] !== "object") return null;
  const id = (messages[0] as { id?: unknown }).id;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

function sanitizedSuccessPayload(payload: unknown): Record<string, unknown> {
  return {
    messaging_product:
      payload && typeof payload === "object" && "messaging_product" in payload
        ? String((payload as { messaging_product?: unknown }).messaging_product || "")
        : "whatsapp",
    messages: extractWhatsAppWamid(payload) ? [{ id: extractWhatsAppWamid(payload) }] : []
  };
}

function sanitizedErrorPayload(error: WhatsAppMetaError): Record<string, unknown> {
  return {
    error: {
      code: error.code,
      error_subcode: error.subcode,
      type: error.type,
      message: error.message,
      error_user_title: error.userTitle,
      error_user_msg: error.userMessage,
      fbtrace_id: error.fbtraceId
    }
  };
}

function getConfigurationError(config: WhatsAppConfig): string | null {
  const missing: string[] = [];
  if (!config.accessToken) missing.push("WHATSAPP_ACCESS_TOKEN");
  if (!config.phoneNumberId) missing.push("WHATSAPP_PHONE_NUMBER_ID");
  return missing.length ? `Configuração obrigatória ausente: ${missing.join(", ")}.` : null;
}

function combinedErrorCode(error: WhatsAppMetaError): string | null {
  if (!error.code) return null;
  return error.subcode ? `${error.code}:${error.subcode}` : error.code;
}

function sanitizeProviderText(
  value: string | null,
  config: WhatsAppConfig,
  additionalSensitiveValues: string[] = []
): string | null {
  if (!value) return null;
  let sanitized = value;
  for (const secret of [
    config.accessToken,
    config.appSecret,
    config.webhookVerifyToken,
    config.n8nEventsToken,
    ...additionalSensitiveValues
  ]) {
    if (secret) sanitized = sanitized.split(secret).join("[REDACTED]");
  }
  return sanitized.slice(0, 1000);
}

function sanitizeMetaError(
  error: WhatsAppMetaError,
  config: WhatsAppConfig,
  additionalSensitiveValues: string[] = []
): WhatsAppMetaError {
  return {
    ...error,
    type: sanitizeProviderText(error.type, config, additionalSensitiveValues),
    message: sanitizeProviderText(error.message, config, additionalSensitiveValues),
    userTitle: sanitizeProviderText(error.userTitle, config, additionalSensitiveValues),
    userMessage: sanitizeProviderText(error.userMessage, config, additionalSensitiveValues),
    fbtraceId: sanitizeProviderText(error.fbtraceId, config, additionalSensitiveValues)
  };
}

export function verifyWhatsAppWebhookSignature(input: {
  rawBody: Buffer;
  signature: string;
  appSecret: string;
  allowUnsigned: boolean;
}): boolean {
  if (!input.appSecret) return input.allowUnsigned;
  if (!input.signature.startsWith("sha256=")) return false;

  const receivedHex = input.signature.slice("sha256=".length);
  if (!/^[a-fA-F0-9]{64}$/.test(receivedHex)) return false;
  const expected = createHmac("sha256", input.appSecret).update(input.rawBody).digest();
  const received = Buffer.from(receivedHex, "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export function createWhatsAppClient(deps: WhatsAppClientDependencies) {
  const fetchImpl = deps.fetchImpl || fetch;
  const logger = deps.logger || console;

  return {
    async sendText(input: WhatsAppTextSendInput): Promise<WhatsAppSendResult> {
      const configurationError = getConfigurationError(deps.config);
      if (configurationError) {
        logger.error(`[WhatsApp] ${configurationError}`);
        return {
          success: false,
          deliveryId: null,
          wamid: null,
          status: "not_configured",
          httpStatus: null,
          errorCode: "configuration_error",
          errorTitle: "WhatsApp não configurado",
          errorMessage: configurationError
        };
      }

      const recipientPhone = normalizeWhatsAppPhone(input.recipientPhone);
      const maskedPhone = maskWhatsAppPhone(recipientPhone);
      const requestBody = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: recipientPhone,
        type: "text",
        text: {
          preview_url: input.previewUrl !== false,
          body: input.text
        }
      };
      const pending = await deps.repository.createPending({
        userId: input.userId || null,
        lifecycleDispatchId: input.lifecycleDispatchId || null,
        recipientPhone,
        phoneNumberId: deps.config.phoneNumberId,
        messageType: "text",
        templateName: null,
        requestPayload: {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          type: "text",
          text: {
            preview_url: requestBody.text.preview_url,
            character_count: input.text.length
          }
        }
      });

      let response: Response;
      let payload: unknown;
      try {
        response = await fetchImpl(buildWhatsAppMessagesUrl(deps.config), {
          method: "POST",
          headers: {
            Authorization: `Bearer ${deps.config.accessToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(requestBody)
        });
        payload = await response.json().catch(() => ({}));
      } catch (error) {
        const errorMessage = sanitizeProviderText(
          error instanceof Error ? error.message : "Falha de conexão com a WhatsApp Graph API.",
          deps.config,
          [recipientPhone]
        ) || "Falha de conexão com a WhatsApp Graph API.";
        await deps.repository.markFailed(pending.id, {
          responsePayload: null,
          errorCode: "network_error",
          errorTitle: "Falha de conexão",
          errorMessage
        });
        logger.error(`[WhatsApp] deliveryId=${pending.id} phone=${maskedPhone} status=failed http=none code=network_error`);
        return {
          success: false,
          deliveryId: pending.id,
          wamid: null,
          status: "failed",
          httpStatus: null,
          errorCode: "network_error",
          errorTitle: "Falha de conexão",
          errorMessage
        };
      }

      if (!response.ok) {
        const metaError = sanitizeMetaError(parseWhatsAppMetaError(payload), deps.config, [recipientPhone]);
        const errorCode = combinedErrorCode(metaError);
        const errorTitle = metaError.userTitle || metaError.type || "Erro da WhatsApp Graph API";
        const errorMessage = metaError.userMessage || metaError.message || "A Meta rejeitou o envio.";
        await deps.repository.markFailed(pending.id, {
          responsePayload: sanitizedErrorPayload(metaError),
          errorCode,
          errorTitle,
          errorMessage
        });
        logger.warn(`[WhatsApp] deliveryId=${pending.id} phone=${maskedPhone} status=failed http=${response.status} code=${errorCode || "unknown"}`);
        return {
          success: false,
          deliveryId: pending.id,
          wamid: null,
          status: "failed",
          httpStatus: response.status,
          errorCode,
          errorTitle,
          errorMessage
        };
      }

      const wamid = extractWhatsAppWamid(payload);
      await deps.repository.markAccepted(pending.id, wamid, sanitizedSuccessPayload(payload));
      logger.info(`[WhatsApp] deliveryId=${pending.id} wamid=${wamid || "missing"} phone=${maskedPhone} status=accepted http=${response.status}`);
      return {
        success: true,
        deliveryId: pending.id,
        wamid,
        status: "accepted",
        httpStatus: response.status,
        errorCode: null,
        errorTitle: null,
        errorMessage: null
      };
    }
  };
}

export type WhatsAppClient = ReturnType<typeof createWhatsAppClient>;
