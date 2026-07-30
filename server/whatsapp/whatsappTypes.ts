export type WhatsAppDeliveryStatus =
  | "pending"
  | "accepted"
  | "sent"
  | "delivered"
  | "read"
  | "failed";

export type WhatsAppChannelStatus =
  | "disabled"
  | "not_configured"
  | "accepted"
  | "failed";

export type WhatsAppMessageType =
  | "text"
  | "template"
  | "image"
  | "document"
  | "interactive";

export type WhatsAppConfig = {
  accessToken: string;
  phoneNumberId: string;
  graphApiVersion: string;
  appSecret: string;
  webhookVerifyToken: string;
  allowUnsignedWebhooks: boolean;
};

export type WhatsAppTextSendInput = {
  userId?: string | null;
  lifecycleDispatchId?: string | null;
  recipientPhone: string;
  type: "text";
  text: string;
  previewUrl?: boolean;
};

// Contrato reservado para mensagens proativas futuras. O envio funcional desta
// etapa permanece exclusivamente em texto; templates exigirão nomes aprovados
// pela Meta e não são selecionados automaticamente.
export type WhatsAppTemplateSendInput = {
  userId?: string | null;
  lifecycleDispatchId?: string | null;
  recipientPhone: string;
  type: "template";
  templateName: string;
  languageCode: string;
  components?: unknown[];
};

export type WhatsAppSendStatus = "accepted" | "failed" | "not_configured";

export type WhatsAppSendResult = {
  success: boolean;
  deliveryId: string | null;
  wamid: string | null;
  status: WhatsAppSendStatus;
  httpStatus: number | null;
  errorCode: string | null;
  errorTitle: string | null;
  errorMessage: string | null;
};

export type WhatsAppMetaError = {
  code: string | null;
  subcode: string | null;
  type: string | null;
  message: string | null;
  userTitle: string | null;
  userMessage: string | null;
  fbtraceId: string | null;
};

export type WhatsAppPendingDelivery = {
  userId: string | null;
  lifecycleDispatchId: string | null;
  recipientPhone: string;
  phoneNumberId: string;
  messageType: WhatsAppMessageType;
  templateName: string | null;
  requestPayload: Record<string, unknown>;
};

export type WhatsAppFailedDelivery = {
  responsePayload: Record<string, unknown> | null;
  errorCode: string | null;
  errorTitle: string | null;
  errorMessage: string | null;
};

export type WhatsAppDeliveryRepository = {
  createPending(input: WhatsAppPendingDelivery): Promise<{ id: string }>;
  markAccepted(
    deliveryId: string,
    wamid: string | null,
    responsePayload: Record<string, unknown>
  ): Promise<void>;
  markFailed(deliveryId: string, failure: WhatsAppFailedDelivery): Promise<void>;
};
