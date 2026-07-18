-- Passo 14: orientação contextual baseada na próxima ação concreta do usuário.
UPDATE public.lifecycle_rules
SET
  priority = 85,
  cooldown_hours = 96,
  description = 'Próxima ação específica identificada para uma conta sem acesso recente.',
  message_config = jsonb_set(
    jsonb_set(
      jsonb_set(
        COALESCE(message_config, '{}'::jsonb),
        '{subject}',
        '"Seu próximo passo no Evolução Clínica"'::jsonb
      ),
      '{preheader}',
      '"Uma ação concreta para continuar sua organização."'::jsonb
    ),
    '{category}',
    '"activation"'::jsonb
  ),
  updated_at = now()
WHERE rule_key = 'inactive_3d';

-- Passos 13 e 12: retomada leve e investigação/suporte, respectivamente.
UPDATE public.lifecycle_rules
SET priority = 80, cooldown_hours = 96, updated_at = now()
WHERE rule_key = 'inactive_7d';

UPDATE public.lifecycle_rules
SET priority = 75, cooldown_hours = 96, updated_at = now()
WHERE rule_key = 'inactive_14d';

UPDATE public.lifecycle_steps
SET
  priority = 85,
  subject_template = 'Seu próximo passo no Evolução Clínica',
  preheader_template = 'Uma ação concreta para continuar sua organização.',
  body_markdown = E'Olá, {{primeiro_nome}}!\n\nVocê já iniciou sua organização no Evolução Clínica, e o sistema identificou uma próxima ação concreta para continuar:\n\n**{{titulo_proxima_acao}}**\n\n{{descricao_proxima_acao}}\n\nRealize essa ação no seu ritmo e avance para as próximas etapas quando for conveniente.',
  cta_label_template = '{{texto_cta_proxima_acao}}',
  cta_route_template = '{{link_acao}}'
WHERE eligibility_rule_key = 'inactive_3d'
  AND campaign_id = (SELECT id FROM public.lifecycle_campaigns WHERE key = 'conditional_lifecycle_messages');

UPDATE public.lifecycle_steps
SET priority = 80
WHERE eligibility_rule_key = 'inactive_7d'
  AND campaign_id = (SELECT id FROM public.lifecycle_campaigns WHERE key = 'conditional_lifecycle_messages');

UPDATE public.lifecycle_steps
SET priority = 75
WHERE eligibility_rule_key = 'inactive_14d'
  AND campaign_id = (SELECT id FROM public.lifecycle_campaigns WHERE key = 'conditional_lifecycle_messages');

NOTIFY pgrst, 'reload schema';
