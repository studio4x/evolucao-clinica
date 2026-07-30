-- Eventos normalizados recebidos exclusivamente do roteador interno n8n.
-- Não armazena Authorization, tokens, App Secret ou outras credenciais.

CREATE TABLE IF NOT EXISTS public.whatsapp_integration_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL UNIQUE,
  tenant text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('message_status', 'business_app_echo', 'coexistence_sync')),
  message_id text,
  status text CHECK (status IS NULL OR status IN ('sent', 'delivered', 'read', 'failed')),
  received_at timestamptz NOT NULL,
  phone_number_id text,
  sender_phone text,
  recipient_phone text,
  raw_value jsonb,
  delivery_id uuid REFERENCES public.whatsapp_message_deliveries(id) ON DELETE SET NULL,
  processing_status text NOT NULL DEFAULT 'processing'
    CHECK (processing_status IN ('processing', 'processed', 'ignored', 'failed')),
  processing_result jsonb,
  processing_error text,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_integration_events_message_status_fields CHECK (
    event_type <> 'message_status'
    OR (message_id IS NOT NULL AND status IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS whatsapp_integration_events_message_id_idx
  ON public.whatsapp_integration_events(message_id)
  WHERE message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS whatsapp_integration_events_created_at_idx
  ON public.whatsapp_integration_events(created_at DESC);

DROP TRIGGER IF EXISTS set_whatsapp_integration_events_updated_at
  ON public.whatsapp_integration_events;
CREATE TRIGGER set_whatsapp_integration_events_updated_at
  BEFORE UPDATE ON public.whatsapp_integration_events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.whatsapp_integration_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.whatsapp_integration_events FROM anon, authenticated;
GRANT ALL ON TABLE public.whatsapp_integration_events TO service_role;

COMMENT ON TABLE public.whatsapp_integration_events IS
  'Eventos normalizados recebidos do roteador n8n. A chave event_key garante idempotência e não substitui o webhook público da Meta.';
