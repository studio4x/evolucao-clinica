-- Keep the professional communication timeline responsive as each history grows.

CREATE INDEX IF NOT EXISTS email_deliveries_user_created_idx
  ON public.email_deliveries(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS notifications_user_created_idx
  ON public.notifications(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS whatsapp_message_deliveries_user_created_idx
  ON public.whatsapp_message_deliveries(user_id, created_at DESC);
