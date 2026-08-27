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
  n8nEventsToken: string;
  optOutWebhookToken?: string;
  userLookupToken?: string;
};

export type WhatsAppN8nEventType =
  | "message_status"
  | "business_app_echo"
  | "coexistence_sync";

export type WhatsAppN8nMessageStatus = "sent" | "delivered" | "read" | "failed";

export type NormalizedWhatsAppN8nEvent = {
  tenant: string;
  eventType: WhatsAppN8nEventType;
  eventKey: string;
  messageId: string | null;
  status: WhatsAppN8nMessageStatus | null;
  receivedAt: string;
  phoneNumberId: string | null;
  senderPhone: string | null;
  recipientPhone: string | null;
  rawValue: unknown;
};

export type WhatsAppN8nEventClaim = {
  eventId: string;
  shouldProcess: boolean;
  alreadyProcessed: boolean;
};

export type WhatsAppN8nDelivery = {
  id: string;
  responsePayload: Record<string, unknown> | null;
};

export type WhatsAppN8nDeliveryUpdate = {
  status: WhatsAppN8nMessageStatus;
  receivedAt: string;
  eventKey: string;
  tenant: string;
  phoneNumberId: string | null;
  errorCode: string | null;
  errorTitle: string | null;
  errorMessage: string | null;
};

export type WhatsAppN8nEventsRepository = {
  claimN8nEvent(event: NormalizedWhatsAppN8nEvent): Promise<WhatsAppN8nEventClaim>;
  completeN8nEvent(input: {
    eventId: string;
    processingStatus: "processed" | "ignored";
    deliveryId: string | null;
    processingResult: Record<string, unknown>;
  }): Promise<void>;
  failN8nEvent(eventId: string, errorMessage: string): Promise<void>;
  findDeliveryByWamid(wamid: string): Promise<WhatsAppN8nDelivery | null>;
  updateDeliveryFromN8nEvent(
    delivery: WhatsAppN8nDelivery,
    update: WhatsAppN8nDeliveryUpdate
  ): Promise<void>;
};

export type WhatsAppTextSendInput = {
  userId?: string | null;
  lifecycleDispatchId?: string | null;
  recipientPhone: string;
  type: "text";
  text: string;
  previewUrl?: boolean;
};

export type WhatsAppTemplateParameter = {
  type: "text";
  text: string;
};

export type WhatsAppTemplateComponent =
  | {
      type: "body";
      parameters: WhatsAppTemplateParameter[];
    }
  | {
      type: "button";
      sub_type: "url";
      index: string;
      parameters: WhatsAppTemplateParameter[];
    };

export type WhatsAppTemplateSendInput = {
  userId?: string | null;
  lifecycleDispatchId?: string | null;
  recipientPhone: string;
  type: "template";
  templateName: string;
  languageCode: string;
  components?: WhatsAppTemplateComponent[];
};

export type WhatsAppSendInput = WhatsAppTextSendInput | WhatsAppTemplateSendInput;

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
