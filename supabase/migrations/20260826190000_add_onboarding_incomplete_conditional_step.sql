-- Passo condicional 16: lembra profissionais de concluir o onboarding 24 horas
-- depois do cadastro. O passo nasce em rascunho e não entra no scheduler até
-- ser validado e ativado explicitamente no painel administrativo.

INSERT INTO public.lifecycle_rules (
  rule_key,
  name,
  description,
  trigger_event,
  rule_type,
  priority,
  cooldown_hours,
  delay_minutes,
  condition_config,
  message_config,
  enabled
) VALUES (
  'onboarding_incomplete_24h',
  'Onboarding não concluído após 24 horas',
  'Profissional ativo que concluiu o cadastro há pelo menos 24 horas, ainda não concluiu o onboarding e continua com acesso disponível.',
  'user_registered',
  'state',
  86,
  168,
  0,
  '{"minimum_hours":24,"requires_onboarding_completed":false}'::jsonb,
  '{"subject":"Falta pouco para concluir sua configuração","preheader":"Retome o onboarding e deixe sua conta pronta para o primeiro atendimento.","body":"Seu cadastro no Evolução Clínica foi concluído, mas a configuração inicial ainda está pendente.\n\nFinalize o onboarding para preparar sua conta e começar com segurança: cadastrar seu primeiro paciente, organizar o prontuário e conhecer o fluxo de evolução clínica.\n\nVocê pode continuar exatamente de onde parou.","cta_label":"Concluir minha configuração","cta_route":"/onboarding","category":"activation"}'::jsonb,
  true
)
ON CONFLICT (rule_key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  trigger_event = EXCLUDED.trigger_event,
  rule_type = EXCLUDED.rule_type,
  priority = EXCLUDED.priority,
  cooldown_hours = EXCLUDED.cooldown_hours,
  delay_minutes = EXCLUDED.delay_minutes,
  condition_config = EXCLUDED.condition_config,
  message_config = EXCLUDED.message_config,
  enabled = EXCLUDED.enabled,
  updated_at = now();

DO $$
DECLARE
  conditional_campaign_id uuid;
BEGIN
  SELECT id INTO conditional_campaign_id
  FROM public.lifecycle_campaigns
  WHERE key = 'conditional_lifecycle_messages';

  IF conditional_campaign_id IS NULL THEN
    RAISE EXCEPTION 'Campanha conditional_lifecycle_messages nao encontrada';
  END IF;

  INSERT INTO public.lifecycle_steps (
    campaign_id,
    step_key,
    eligibility_rule_key,
    position,
    wait_minutes,
    category,
    priority,
    status,
    subject_template,
    preheader_template,
    body_markdown,
    cta_label_template,
    cta_route_template,
    fallback_cta_route,
    enabled
  ) VALUES (
    conditional_campaign_id,
    'conditional_onboarding_incomplete_24h',
    'onboarding_incomplete_24h',
    16,
    1440,
    'activation',
    86,
    'draft',
    'Falta pouco para concluir sua configuração',
    'Retome o onboarding e deixe sua conta pronta para o primeiro atendimento.',
    E'Olá, {{primeiro_nome}}!\n\nSeu cadastro no Evolução Clínica foi concluído, mas a configuração inicial ainda está pendente.\n\nFinalize o onboarding para preparar sua conta e começar com segurança: cadastrar seu primeiro paciente, organizar o prontuário e conhecer o fluxo de evolução clínica.\n\nVocê pode continuar exatamente de onde parou.',
    'Concluir minha configuração',
    '/onboarding',
    '/painel/dashboard',
    true
  )
  ON CONFLICT (campaign_id, step_key) DO UPDATE SET
    eligibility_rule_key = EXCLUDED.eligibility_rule_key,
    position = EXCLUDED.position,
    wait_minutes = EXCLUDED.wait_minutes,
    category = EXCLUDED.category,
    priority = EXCLUDED.priority,
    status = 'draft',
    subject_template = EXCLUDED.subject_template,
    preheader_template = EXCLUDED.preheader_template,
    body_markdown = EXCLUDED.body_markdown,
    cta_label_template = EXCLUDED.cta_label_template,
    cta_route_template = EXCLUDED.cta_route_template,
    fallback_cta_route = EXCLUDED.fallback_cta_route,
    enabled = EXCLUDED.enabled,
    updated_at = now();
END $$;
