-- Separa o lembrete de onboarding do primeiro passo da jornada de ativação,
-- que permanece configurado para 24 horas. O identificador técnico original é
-- mantido para preservar deduplicação e referências existentes.

UPDATE public.lifecycle_rules
SET
  name = 'Onboarding não concluído após 12 horas',
  description = 'Profissional ativo que concluiu o cadastro há pelo menos 12 horas, ainda não concluiu o onboarding e continua com acesso disponível.',
  condition_config = jsonb_set(condition_config, '{minimum_hours}', '12'::jsonb, true),
  updated_at = now()
WHERE rule_key = 'onboarding_incomplete_24h';

UPDATE public.lifecycle_steps
SET
  wait_minutes = 720,
  status = 'draft',
  updated_at = now()
WHERE step_key = 'conditional_onboarding_incomplete_24h'
  AND campaign_id = (
    SELECT id
    FROM public.lifecycle_campaigns
    WHERE key = 'conditional_lifecycle_messages'
  );
