-- Keep onboarding records in their dedicated admin module instead of the
-- centralized platform notification history.

UPDATE public.notifications
SET source = 'onboarding'
WHERE source = 'platform'
  AND (
    (title = 'Cadastro recebido e em análise' AND link = '/pending')
    OR (title = 'Novo cadastro aguardando aprovação' AND link = '/admin/professionals')
    OR (title IN ('Acesso liberado', 'Cadastro Aprovado!') AND link = '/painel/dashboard')
  );

COMMENT ON COLUMN public.notifications.source IS
  'Origem da notificação: platform, manual-push, manual-email ou onboarding.';

NOTIFY pgrst, 'reload schema';
