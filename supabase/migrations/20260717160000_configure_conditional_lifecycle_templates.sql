-- Cria a campanha de templates para mensagens condicionais.
-- Cada passo é vinculado a uma lifecycle_rule e passa a ser a fonte editável
-- do assunto, conteúdo e CTA dessa regra quando estiver ativo.

INSERT INTO public.lifecycle_campaigns (
  key,
  name,
  description,
  campaign_type,
  status,
  enrollment_mode,
  eligible_from,
  timezone,
  default_send_time,
  max_messages_per_24h,
  completion_window_days
)
VALUES (
  'conditional_lifecycle_messages',
  'Mensagens Condicionais',
  'Templates vinculados a eventos, estados, prazos e períodos de inatividade.',
  'conditional',
  'active',
  'all_eligible_users',
  now(),
  'America/Sao_Paulo',
  '08:30',
  1,
  3650
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.lifecycle_steps (
  campaign_id,
  step_key,
  position,
  day_offset,
  category,
  priority,
  status,
  subject_template,
  preheader_template,
  body_markdown,
  cta_label_template,
  cta_route_template,
  fallback_cta_route,
  eligibility_rule_key,
  enabled
)
SELECT
  c.id,
  'conditional_' || r.rule_key,
  row_number() OVER (ORDER BY r.priority DESC, r.rule_key),
  0,
  COALESCE(r.message_config ->> 'category', 'activation'),
  r.priority,
  'active',
  COALESCE(r.message_config ->> 'subject', r.name),
  r.message_config ->> 'preheader',
  COALESCE(r.message_config ->> 'body', r.description, 'Acesse a plataforma para continuar.'),
  r.message_config ->> 'cta_label',
  r.message_config ->> 'cta_route',
  r.message_config ->> 'cta_route',
  r.rule_key,
  true
FROM public.lifecycle_campaigns c
CROSS JOIN public.lifecycle_rules r
WHERE c.key = 'conditional_lifecycle_messages'
  AND r.enabled = true
ON CONFLICT (campaign_id, step_key) DO NOTHING;
