-- WhatsApp Cloud API delivery audit trail.
-- Access tokens, app secrets, authorization headers and message bodies are never stored here.

CREATE TABLE IF NOT EXISTS public.whatsapp_message_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  lifecycle_dispatch_id uuid REFERENCES public.lifecycle_dispatches(id) ON DELETE SET NULL,
  recipient_phone text NOT NULL,
  phone_number_id text NOT NULL,
  wamid text UNIQUE,
  message_type text NOT NULL CHECK (message_type IN ('text', 'template', 'image', 'document', 'interactive')),
  template_name text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'sent', 'delivered', 'read', 'failed')),
  request_payload jsonb,
  response_payload jsonb,
  error_code text,
  error_title text,
  error_message text,
  attempt_count integer NOT NULL DEFAULT 1 CHECK (attempt_count > 0),
  accepted_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_message_deliveries_wamid_idx
  ON public.whatsapp_message_deliveries(wamid)
  WHERE wamid IS NOT NULL;
CREATE INDEX IF NOT EXISTS whatsapp_message_deliveries_lifecycle_dispatch_idx
  ON public.whatsapp_message_deliveries(lifecycle_dispatch_id)
  WHERE lifecycle_dispatch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS whatsapp_message_deliveries_user_idx
  ON public.whatsapp_message_deliveries(user_id)
  WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS whatsapp_message_deliveries_status_idx
  ON public.whatsapp_message_deliveries(status);
CREATE INDEX IF NOT EXISTS whatsapp_message_deliveries_created_at_idx
  ON public.whatsapp_message_deliveries(created_at DESC);

DROP TRIGGER IF EXISTS set_whatsapp_message_deliveries_updated_at
  ON public.whatsapp_message_deliveries;
CREATE TRIGGER set_whatsapp_message_deliveries_updated_at
  BEFORE UPDATE ON public.whatsapp_message_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.whatsapp_message_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.whatsapp_message_deliveries FROM anon, authenticated;
GRANT ALL ON TABLE public.whatsapp_message_deliveries TO service_role;

-- Remove legacy WhatsApp credentials and personal test data from the shared settings JSON.
-- WhatsApp configuration is server-environment-only from this migration onward.
UPDATE public.settings
SET
  api_key = (
    api_key::jsonb
      - 'whatsapp_access_token'
      - 'whatsapp_app_secret'
      - 'whatsapp_phone_number_id'
      - 'whatsapp_webhook_verify_token'
      - 'whatsapp_test_number'
  )::text,
  updated_at = now()
WHERE id = 'notification_settings'
  AND api_key IS NOT NULL;

COMMENT ON TABLE public.whatsapp_message_deliveries IS
  'Auditoria backend-only das tentativas de envio pela WhatsApp Cloud API; status de entrega serão atualizados futuramente por webhook.';
COMMENT ON COLUMN public.whatsapp_message_deliveries.wamid IS
  'Identificador da mensagem retornado pela Meta, usado para correlacionar futuros webhooks.';
COMMENT ON COLUMN public.whatsapp_message_deliveries.status IS
  'accepted significa apenas que a Meta aceitou o POST; sent, delivered e read dependem de webhook.';
