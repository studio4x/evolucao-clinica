-- Migration: Track notification origin for admin push history

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS source TEXT;

UPDATE public.notifications
SET source = 'platform'
WHERE source IS NULL;

ALTER TABLE public.notifications
  ALTER COLUMN source SET DEFAULT 'platform';

ALTER TABLE public.notifications
  ALTER COLUMN source SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_source_created_at
  ON public.notifications(source, created_at DESC);

COMMENT ON COLUMN public.notifications.source IS
  'Origem da notificacao: platform para alertas automaticos da plataforma e manual para envios feitos pelo painel/usuario.';

NOTIFY pgrst, 'reload schema';
