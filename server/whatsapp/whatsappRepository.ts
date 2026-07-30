import type {
  WhatsAppDeliveryRepository,
  WhatsAppFailedDelivery,
  WhatsAppN8nDelivery,
  WhatsAppN8nDeliveryUpdate,
  WhatsAppN8nEventClaim,
  WhatsAppN8nEventsRepository,
  WhatsAppPendingDelivery
} from "./whatsappTypes.js";

export function createWhatsAppRepository(supabaseAdmin: any): WhatsAppDeliveryRepository & WhatsAppN8nEventsRepository {
  return {
    async createPending(input: WhatsAppPendingDelivery) {
      const { data, error } = await supabaseAdmin
        .from("whatsapp_message_deliveries")
        .insert({
          user_id: input.userId,
          lifecycle_dispatch_id: input.lifecycleDispatchId,
          recipient_phone: input.recipientPhone,
          phone_number_id: input.phoneNumberId,
          message_type: input.messageType,
          template_name: input.templateName,
          status: "pending",
          request_payload: input.requestPayload,
          attempt_count: 1
        })
        .select("id")
        .single();

      if (error || !data?.id) {
        throw new Error(error?.message || "Não foi possível registrar a tentativa de envio do WhatsApp.");
      }

      return { id: String(data.id) };
    },

    async markAccepted(
      deliveryId: string,
      wamid: string | null,
      responsePayload: Record<string, unknown>
    ) {
      const acceptedAt = new Date().toISOString();
      const { error } = await supabaseAdmin
        .from("whatsapp_message_deliveries")
        .update({
          wamid,
          status: "accepted",
          response_payload: responsePayload,
          accepted_at: acceptedAt,
          updated_at: acceptedAt
        })
        .eq("id", deliveryId);

      if (error) {
        throw new Error(error.message || "Não foi possível registrar a aceitação do WhatsApp.");
      }
    },

    async markFailed(deliveryId: string, failure: WhatsAppFailedDelivery) {
      const failedAt = new Date().toISOString();
      const { error } = await supabaseAdmin
        .from("whatsapp_message_deliveries")
        .update({
          status: "failed",
          response_payload: failure.responsePayload,
          error_code: failure.errorCode,
          error_title: failure.errorTitle,
          error_message: failure.errorMessage,
          failed_at: failedAt,
          updated_at: failedAt
        })
        .eq("id", deliveryId);

      if (error) {
        throw new Error(error.message || "Não foi possível registrar a falha do WhatsApp.");
      }
    },

    async claimN8nEvent(event): Promise<WhatsAppN8nEventClaim> {
      const eventRecord = {
        event_key: event.eventKey,
        tenant: event.tenant,
        event_type: event.eventType,
        message_id: event.messageId,
        status: event.status,
        received_at: event.receivedAt,
        phone_number_id: event.phoneNumberId,
        sender_phone: event.senderPhone,
        recipient_phone: event.recipientPhone,
        raw_value: event.rawValue,
        processing_status: "processing"
      };
      const { data, error } = await supabaseAdmin
        .from("whatsapp_integration_events")
        .insert(eventRecord)
        .select("id")
        .single();

      if (!error && data?.id) {
        return { eventId: String(data.id), shouldProcess: true, alreadyProcessed: false };
      }
      if (error?.code !== "23505") {
        throw new Error(error?.message || "Não foi possível registrar o evento interno do WhatsApp.");
      }

      const { data: existing, error: existingError } = await supabaseAdmin
        .from("whatsapp_integration_events")
        .select("id, processing_status")
        .eq("event_key", event.eventKey)
        .single();
      if (existingError || !existing?.id) {
        throw new Error(existingError?.message || "Não foi possível consultar o evento interno duplicado.");
      }
      if (["processed", "ignored"].includes(existing.processing_status)) {
        return { eventId: String(existing.id), shouldProcess: false, alreadyProcessed: true };
      }

      const { error: retryError } = await supabaseAdmin
        .from("whatsapp_integration_events")
        .update({ processing_status: "processing", processing_error: null, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
      if (retryError) throw new Error(retryError.message || "Não foi possível recuperar o evento interno.");
      return { eventId: String(existing.id), shouldProcess: true, alreadyProcessed: false };
    },

    async completeN8nEvent(input) {
      const { error } = await supabaseAdmin
        .from("whatsapp_integration_events")
        .update({
          processing_status: input.processingStatus,
          delivery_id: input.deliveryId,
          processing_result: input.processingResult,
          processing_error: null,
          processed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq("id", input.eventId);
      if (error) throw new Error(error.message || "Não foi possível concluir o evento interno.");
    },

    async failN8nEvent(eventId, errorMessage) {
      const { error } = await supabaseAdmin
        .from("whatsapp_integration_events")
        .update({
          processing_status: "failed",
          processing_error: errorMessage.slice(0, 1000),
          updated_at: new Date().toISOString()
        })
        .eq("id", eventId);
      if (error) throw new Error(error.message || "Não foi possível registrar a falha do evento interno.");
    },

    async findDeliveryByWamid(wamid): Promise<WhatsAppN8nDelivery | null> {
      const { data, error } = await supabaseAdmin
        .from("whatsapp_message_deliveries")
        .select("id, response_payload")
        .eq("wamid", wamid)
        .maybeSingle();
      if (error) throw new Error(error.message || "Não foi possível localizar a entrega do WhatsApp.");
      return data?.id
        ? { id: String(data.id), responsePayload: data.response_payload && typeof data.response_payload === "object" ? data.response_payload : null }
        : null;
    },

    async updateDeliveryFromN8nEvent(delivery, update: WhatsAppN8nDeliveryUpdate) {
      const responsePayload = {
        ...(delivery.responsePayload || {}),
        n8n_last_status_event: {
          event_key: update.eventKey,
          tenant: update.tenant,
          status: update.status,
          received_at: update.receivedAt,
          phone_number_id: update.phoneNumberId
        }
      };
      const timestampColumn = `${update.status}_at`;
      const payload: Record<string, unknown> = {
        status: update.status,
        response_payload: responsePayload,
        updated_at: new Date().toISOString(),
        [timestampColumn]: update.receivedAt
      };
      if (update.status === "failed") {
        payload.error_code = update.errorCode;
        payload.error_title = update.errorTitle;
        payload.error_message = update.errorMessage;
      }
      const { error } = await supabaseAdmin
        .from("whatsapp_message_deliveries")
        .update(payload)
        .eq("id", delivery.id);
      if (error) throw new Error(error.message || "Não foi possível atualizar o status da entrega do WhatsApp.");
    }
  };
}
