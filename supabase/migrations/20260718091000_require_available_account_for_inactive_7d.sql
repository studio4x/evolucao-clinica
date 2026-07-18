-- O passo de 7 dias deve alcançar somente contas disponíveis dentro da janela
-- de 7 a menos de 14 dias sem acesso.
UPDATE public.lifecycle_rules
SET
  description = 'Conta disponível, sem acesso há pelo menos 7 dias e há menos de 14 dias.',
  condition_config = '{"days": 7, "max_days": 14, "account_available": true}'::jsonb,
  updated_at = now()
WHERE rule_key = 'inactive_7d';

NOTIFY pgrst, 'reload schema';
