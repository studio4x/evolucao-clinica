-- Agendamento de notificações push criadas manualmente pelo painel administrativo.
-- Os destinatários são armazenados como snapshot para que mudanças posteriores
-- no funil ou no cadastro não alterem uma campanha já programada.

CREATE TABLE IF NOT EXISTS public.manual_push_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
    message TEXT NOT NULL CHECK (char_length(message) BETWEEN 1 AND 4000),
    type TEXT NOT NULL DEFAULT 'info' CHECK (type IN ('info', 'success', 'warning', 'error')),
    link TEXT,
    image_url TEXT,
    audience_segment JSONB NOT NULL DEFAULT '{}'::jsonb,
    recipient_ids JSONB NOT NULL CHECK (jsonb_typeof(recipient_ids) = 'array'),
    scheduled_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
    sent_count INTEGER NOT NULL DEFAULT 0 CHECK (sent_count >= 0),
    failed_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
    push_accepted_count INTEGER NOT NULL DEFAULT 0 CHECK (push_accepted_count >= 0),
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    processing_started_at TIMESTAMPTZ,
    executed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_manual_push_schedules_due
    ON public.manual_push_schedules(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_manual_push_schedules_created_at
    ON public.manual_push_schedules(created_at DESC);

ALTER TABLE public.manual_push_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage manual push schedules" ON public.manual_push_schedules;
CREATE POLICY "Admins can manage manual push schedules"
    ON public.manual_push_schedules
    FOR ALL
    USING (is_admin())
    WITH CHECK (is_admin());

COMMENT ON TABLE public.manual_push_schedules IS
    'Notificações push manuais agendadas pelo painel administrativo, com snapshot dos destinatários.';
COMMENT ON COLUMN public.manual_push_schedules.recipient_ids IS
    'Array JSONB de IDs de profissionais resolvidos no momento do agendamento.';
COMMENT ON COLUMN public.manual_push_schedules.push_accepted_count IS
    'Quantidade de destinatários para os quais o provedor aceitou pelo menos um push; não confirma entrega no aparelho.';
