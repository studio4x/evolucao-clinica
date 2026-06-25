-- Migration: Create email deliveries audit table and backfill legacy SMTP history

CREATE TABLE IF NOT EXISTS public.email_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    recipient_email TEXT NOT NULL DEFAULT '',
    recipient_name TEXT,
    subject TEXT NOT NULL,
    message TEXT NOT NULL,
    provider TEXT NOT NULL CHECK (provider IN ('smtp', 'brevo')),
    source TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed')),
    error_message TEXT,
    provider_message_id TEXT,
    related_notification_id UUID REFERENCES public.notifications(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_deliveries_created_at ON public.email_deliveries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_deliveries_provider ON public.email_deliveries(provider);
CREATE INDEX IF NOT EXISTS idx_email_deliveries_user_id ON public.email_deliveries(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_deliveries_related_notification_id
    ON public.email_deliveries(related_notification_id)
    WHERE related_notification_id IS NOT NULL;

ALTER TABLE public.email_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage email deliveries" ON public.email_deliveries;
CREATE POLICY "Admins can manage email deliveries"
    ON public.email_deliveries
    FOR ALL
    USING (is_admin())
    WITH CHECK (is_admin());

COMMENT ON TABLE public.email_deliveries IS 'Auditoria de e-mails enviados pela plataforma via SMTP ou Brevo.';
COMMENT ON COLUMN public.email_deliveries.provider IS 'Provedor usado no envio do e-mail (smtp ou brevo).';
COMMENT ON COLUMN public.email_deliveries.source IS 'Origem funcional do envio (notification, test-email, trial-expiration, report).';
COMMENT ON COLUMN public.email_deliveries.status IS 'Status final do disparo do e-mail.';

INSERT INTO public.email_deliveries (
    user_id,
    recipient_email,
    recipient_name,
    subject,
    message,
    provider,
    source,
    status,
    error_message,
    provider_message_id,
    related_notification_id,
    created_at
)
SELECT
    n.user_id,
    COALESCE(p.google_email, ''),
    p.full_name,
    n.title,
    n.message,
    'smtp',
    'legacy-notification',
    'sent',
    NULL,
    NULL,
    n.id,
    n.created_at
FROM public.notifications n
LEFT JOIN public.professionals p ON p.id = n.user_id
WHERE NOT EXISTS (
    SELECT 1
    FROM public.email_deliveries ed
    WHERE ed.related_notification_id = n.id
);
