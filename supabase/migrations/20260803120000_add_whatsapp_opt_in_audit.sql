-- Consentimento explícito para notificações operacionais pelo WhatsApp.
ALTER TABLE public.communication_preferences
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in_source text,
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in_text_version text,
  ADD COLUMN IF NOT EXISTS whatsapp_opt_out_at timestamptz;

ALTER TABLE public.communication_preferences
  DROP CONSTRAINT IF EXISTS communication_preferences_whatsapp_opt_in_source_check;

ALTER TABLE public.communication_preferences
  ADD CONSTRAINT communication_preferences_whatsapp_opt_in_source_check
  CHECK (whatsapp_opt_in_source IS NULL OR whatsapp_opt_in_source IN ('cadastro', 'configurações', 'checkout'));

COMMENT ON COLUMN public.communication_preferences.whatsapp_opt_in IS 'Autorização explícita para notificações operacionais pelo WhatsApp.';
COMMENT ON COLUMN public.communication_preferences.whatsapp_opt_in_at IS 'Data e hora em que a autorização atual foi concedida.';
COMMENT ON COLUMN public.communication_preferences.whatsapp_opt_in_source IS 'Origem da autorização: cadastro, configurações ou checkout.';
COMMENT ON COLUMN public.communication_preferences.whatsapp_opt_in_text_version IS 'Versão do texto de consentimento aceito.';
COMMENT ON COLUMN public.communication_preferences.whatsapp_opt_out_at IS 'Data e hora da última retirada da autorização.';
