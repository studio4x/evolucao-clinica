-- Passo condicional 15: reengajamento de trials cancelados ha pelo menos 3 dias.
-- O passo nasce em rascunho. A concessao dos 7 dias so ocorre no worker, depois
-- que um administrador ativar explicitamente o passo.

CREATE TABLE IF NOT EXISTS public.lifecycle_trial_extensions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dispatch_id uuid UNIQUE REFERENCES public.lifecycle_dispatches(id) ON DELETE SET NULL,
  cancellation_event_at timestamptz NOT NULL,
  previous_trial_ends_at timestamptz,
  previous_subscription_ends_at timestamptz,
  new_trial_ends_at timestamptz NOT NULL,
  bonus_days integer NOT NULL CHECK (bonus_days BETWEEN 1 AND 30),
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, cancellation_event_at)
);

CREATE INDEX IF NOT EXISTS lifecycle_trial_extensions_user_created_idx
  ON public.lifecycle_trial_extensions(user_id, created_at DESC);

ALTER TABLE public.lifecycle_trial_extensions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lifecycle_trial_extensions FROM anon, authenticated;
GRANT ALL ON public.lifecycle_trial_extensions TO service_role;

COMMENT ON TABLE public.lifecycle_trial_extensions IS
  'Auditoria idempotente das extensoes gratuitas concedidas por automacoes lifecycle.';

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
  'trial_canceled_reengagement_3d',
  'Trial cancelado ha mais de 3 dias',
  'Profissional ativo no plano trial, com status canceled ha pelo menos 3 dias. Ao processar o e-mail, concede uma unica extensao gratuita de 7 dias.',
  'subscription_cancelled',
  'state',
  88,
  168,
  0,
  '{"minimum_hours":72,"bonus_days":7,"required_plan":"trial","required_status":"canceled","email_only":true}'::jsonb,
  '{"subject":"Liberamos mais 7 dias para você conhecer o Evolução Clínica","preheader":"Seu acesso gratuito foi reativado por mais 7 dias.","body":"Percebemos que seu período de teste foi interrompido antes de você conhecer tudo o que o Evolução Clínica pode fazer pela sua rotina.\n\nPor isso, reativamos seu acesso gratuitamente por mais 7 dias. É uma nova oportunidade para cadastrar pacientes, organizar prontuários e experimentar a criação de evoluções com mais calma.\n\nSe quiser, comece por um atendimento recente e veja como a plataforma pode ajudar a reduzir o tempo dos seus registros.","cta_label":"Aproveitar meus 7 dias","cta_route":"/painel/dashboard","category":"commercial","commercial":true}'::jsonb,
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
    'conditional_trial_canceled_reengagement_3d',
    'trial_canceled_reengagement_3d',
    15,
    4320,
    'commercial',
    88,
    'draft',
    'Liberamos mais 7 dias para você conhecer o Evolução Clínica',
    'Seu acesso gratuito foi reativado por mais 7 dias.',
    'Olá, {{primeiro_nome}}!\n\nPercebemos que seu período de teste foi interrompido antes de você conhecer tudo o que o Evolução Clínica pode fazer pela sua rotina.\n\nPor isso, reativamos seu acesso gratuitamente por mais 7 dias. É uma nova oportunidade para cadastrar pacientes, organizar prontuários e experimentar a criação de evoluções com mais calma.\n\nSe quiser, comece por um atendimento recente e veja como a plataforma pode ajudar a reduzir o tempo dos seus registros.',
    'Aproveitar meus 7 dias',
    '/painel/dashboard',
    '/painel/subscription',
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

-- Contas canceladas antes da criacao dos eventos lifecycle recebem uma ancora
-- conservadora baseada na ultima atualizacao conhecida do perfil.
INSERT INTO public.lifecycle_events (
  user_id,
  event_name,
  source,
  entity_type,
  entity_id,
  occurred_at,
  idempotency_key,
  metadata
)
SELECT
  p.id,
  'subscription_cancelled',
  'backend',
  'professional',
  p.id,
  COALESCE(p.updated_at, p.created_at, now()),
  'trial_cancelled_backfill:' || p.id::text,
  jsonb_build_object('status', 'canceled', 'plan', 'trial', 'backfilled', true)
FROM public.professionals p
WHERE p.status = 'active'
  AND p.subscription_plan = 'trial'
  AND p.subscription_status = 'canceled'
  AND NOT EXISTS (
    SELECT 1
    FROM public.lifecycle_events e
    WHERE e.user_id = p.id
      AND e.event_name = 'subscription_cancelled'
  )
ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING;

DO $$
DECLARE
  target record;
BEGIN
  FOR target IN
    SELECT id
    FROM public.professionals
    WHERE status = 'active'
      AND subscription_plan = 'trial'
      AND subscription_status = 'canceled'
  LOOP
    PERFORM public.recalculate_lifecycle_user_state(target.id);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.grant_lifecycle_trial_reengagement_bonus(
  p_user_id uuid,
  p_dispatch_id uuid,
  p_bonus_days integer DEFAULT 7
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  professional_row public.professionals%ROWTYPE;
  existing_extension public.lifecycle_trial_extensions%ROWTYPE;
  cancellation_at timestamptz;
  new_expiration timestamptz;
  dispatch_rule_key text;
  dispatch_user_id uuid;
BEGIN
  IF p_bonus_days IS NULL OR p_bonus_days < 1 OR p_bonus_days > 30 THEN
    RETURN jsonb_build_object('code', 'invalid_bonus_days');
  END IF;

  SELECT d.user_id, r.rule_key
  INTO dispatch_user_id, dispatch_rule_key
  FROM public.lifecycle_dispatches d
  JOIN public.lifecycle_rules r ON r.id = d.rule_id
  WHERE d.id = p_dispatch_id;

  IF dispatch_user_id IS NULL OR dispatch_user_id <> p_user_id
     OR dispatch_rule_key <> 'trial_canceled_reengagement_3d' THEN
    RETURN jsonb_build_object('code', 'invalid_dispatch');
  END IF;

  SELECT * INTO existing_extension
  FROM public.lifecycle_trial_extensions
  WHERE dispatch_id = p_dispatch_id;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'code', 'already_granted',
      'new_trial_ends_at', existing_extension.new_trial_ends_at,
      'bonus_days', existing_extension.bonus_days
    );
  END IF;

  SELECT * INTO professional_row
  FROM public.professionals
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND OR professional_row.status <> 'active' THEN
    RETURN jsonb_build_object('code', 'account_not_recoverable');
  END IF;
  IF professional_row.subscription_plan <> 'trial'
     OR professional_row.subscription_status <> 'canceled' THEN
    RETURN jsonb_build_object('code', 'trial_no_longer_canceled');
  END IF;

  SELECT max(occurred_at) INTO cancellation_at
  FROM public.lifecycle_events
  WHERE user_id = p_user_id
    AND event_name = 'subscription_cancelled';
  cancellation_at := COALESCE(cancellation_at, professional_row.updated_at, professional_row.created_at);

  IF cancellation_at IS NULL OR cancellation_at > now() - interval '72 hours' THEN
    RETURN jsonb_build_object('code', 'cancellation_interval_not_elapsed');
  END IF;

  SELECT * INTO existing_extension
  FROM public.lifecycle_trial_extensions
  WHERE user_id = p_user_id
    AND cancellation_event_at = cancellation_at;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'code', 'already_granted',
      'new_trial_ends_at', existing_extension.new_trial_ends_at,
      'bonus_days', existing_extension.bonus_days
    );
  END IF;

  new_expiration := now() + make_interval(days => p_bonus_days);

  UPDATE public.professionals
  SET subscription_plan = 'trial',
      subscription_status = 'trialing',
      trial_ends_at = new_expiration,
      subscription_ends_at = new_expiration,
      updated_at = now()
  WHERE id = p_user_id;

  UPDATE public.lifecycle_user_state
  SET subscription_plan = 'trial',
      subscription_status = 'trialing',
      trial_ends_at = new_expiration,
      recalculated_at = now(),
      updated_at = now()
  WHERE user_id = p_user_id;

  INSERT INTO public.lifecycle_trial_extensions (
    user_id,
    dispatch_id,
    cancellation_event_at,
    previous_trial_ends_at,
    previous_subscription_ends_at,
    new_trial_ends_at,
    bonus_days,
    reason
  ) VALUES (
    p_user_id,
    p_dispatch_id,
    cancellation_at,
    professional_row.trial_ends_at,
    professional_row.subscription_ends_at,
    new_expiration,
    p_bonus_days,
    'trial_canceled_reengagement_3d'
  );

  PERFORM public.record_lifecycle_event(
    p_user_id,
    'trial_bonus_granted',
    'backend',
    'lifecycle_dispatch',
    p_dispatch_id,
    jsonb_build_object('bonus_days', p_bonus_days, 'new_trial_ends_at', new_expiration),
    'trial_bonus_granted:' || p_dispatch_id::text,
    now()
  );

  RETURN jsonb_build_object(
    'code', 'granted',
    'new_trial_ends_at', new_expiration,
    'bonus_days', p_bonus_days
  );
END;
$$;

REVOKE ALL ON FUNCTION public.grant_lifecycle_trial_reengagement_bonus(uuid, uuid, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_lifecycle_trial_reengagement_bonus(uuid, uuid, integer)
  TO service_role;

NOTIFY pgrst, 'reload schema';
