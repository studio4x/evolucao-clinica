-- Preserve the manual notification audience used at dispatch time.
-- Empty objects represent historical records created before this metadata existed.

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS audience_segment JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.notifications.audience_segment IS
  'Segmentacao registrada no momento do envio: tipo e, quando aplicavel, chave/rotulo da etapa do funil.';

NOTIFY pgrst, 'reload schema';
