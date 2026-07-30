import type {
  WhatsAppDeliveryRepository,
  WhatsAppFailedDelivery,
  WhatsAppPendingDelivery
} from "./whatsappTypes.js";

export function createWhatsAppRepository(supabaseAdmin: any): WhatsAppDeliveryRepository {
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
    }
  };
}
