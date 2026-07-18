-- O passo de 14 dias sem acesso só pode ser disparado para assinantes ativos,
-- sem erro técnico pendente.
UPDATE public.lifecycle_rules
SET
  description = 'Assinatura ativa, sem acesso há pelo menos 14 dias e sem erro técnico pendente.',
  condition_config = '{"days": 14, "subscription_active": true, "no_pending_technical_error": true}'::jsonb,
  updated_at = now()
WHERE rule_key = 'inactive_14d';

NOTIFY pgrst, 'reload schema';
