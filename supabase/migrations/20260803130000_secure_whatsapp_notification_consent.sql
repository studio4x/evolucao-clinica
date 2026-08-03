-- Canonical international digits for WhatsApp preferences. Duplicates are
-- intentionally retained: the opt-out webhook returns a controlled conflict.
UPDATE public.communication_preferences
SET whatsapp_number = NULLIF(regexp_replace(COALESCE(whatsapp_number, ''), '\\D', '', 'g'), '')
WHERE whatsapp_number IS NOT NULL;

UPDATE public.communication_preferences
SET whatsapp_number = NULL
WHERE whatsapp_number IS NOT NULL
  AND (length(whatsapp_number) < 8 OR length(whatsapp_number) > 15);

ALTER TABLE public.communication_preferences
  ADD COLUMN IF NOT EXISTS whatsapp_opt_out_source text,
  ADD COLUMN IF NOT EXISTS whatsapp_opt_out_reason text;

ALTER TABLE public.communication_preferences
  DROP CONSTRAINT IF EXISTS communication_preferences_whatsapp_opt_out_source_check;
ALTER TABLE public.communication_preferences
  ADD CONSTRAINT communication_preferences_whatsapp_opt_out_source_check
  CHECK (whatsapp_opt_out_source IS NULL OR whatsapp_opt_out_source IN ('typebot', 'n8n', 'chatbot', 'admin'));

CREATE INDEX IF NOT EXISTS communication_preferences_whatsapp_number_lookup_idx
  ON public.communication_preferences (whatsapp_number)
  WHERE whatsapp_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.whatsapp_opt_out_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text UNIQUE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  phone_hash text NOT NULL CHECK (phone_hash ~ '^[a-f0-9]{64}$'),
  source text NOT NULL CHECK (source IN ('typebot', 'n8n', 'chatbot', 'admin')),
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 200),
  status text NOT NULL CHECK (status IN ('processed', 'already_opted_out', 'not_found', 'conflict')),
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_opt_out_events_processed_at_idx
  ON public.whatsapp_opt_out_events (processed_at DESC);

ALTER TABLE public.whatsapp_opt_out_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.whatsapp_opt_out_events FROM anon, authenticated;
GRANT ALL ON TABLE public.whatsapp_opt_out_events TO service_role;

COMMENT ON TABLE public.whatsapp_opt_out_events IS 'Auditoria segura de descadastramento do canal WhatsApp; não contém telefone, token, headers ou payload bruto.';
