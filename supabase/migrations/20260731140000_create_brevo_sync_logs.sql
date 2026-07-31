-- Tabela de histórico de sincronizações manuais com a Brevo
CREATE TABLE IF NOT EXISTS public.brevo_sync_logs (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at       timestamptz NOT NULL DEFAULT now(),
  finished_at      timestamptz,
  status           text        NOT NULL DEFAULT 'running',
  total_contacts   int,
  brevo_process_id text,
  error_message    text,
  triggered_by     text        NOT NULL,
  CONSTRAINT brevo_sync_logs_status_check
    CHECK (status IN ('running', 'success', 'error')),
  CONSTRAINT brevo_sync_logs_total_contacts_check
    CHECK (total_contacts IS NULL OR total_contacts >= 0)
);

-- Habilita RLS (acesso exclusivo via service_role no backend)
ALTER TABLE public.brevo_sync_logs ENABLE ROW LEVEL SECURITY;

-- Sem políticas públicas: apenas o service_role (backend) tem acesso
CREATE INDEX IF NOT EXISTS brevo_sync_logs_started_at_idx
  ON public.brevo_sync_logs (started_at DESC);

COMMENT ON TABLE public.brevo_sync_logs IS
  'Histórico das solicitações administrativas de importação de contatos aceitas ou rejeitadas pela Brevo.';
