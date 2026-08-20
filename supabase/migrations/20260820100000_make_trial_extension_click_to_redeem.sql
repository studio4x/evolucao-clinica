-- O passo 15 passa a oferecer (e nao conceder) a extensao no envio.
-- A concessao acontece somente apos confirmacao em uma pagina publica, usando
-- token individual, com validade limitada e consumo unico.

CREATE TABLE IF NOT EXISTS public.lifecycle_trial_extension_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dispatch_id uuid NOT NULL UNIQUE REFERENCES public.lifecycle_dispatches(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  cancellation_event_at timestamptz NOT NULL,
  bonus_days integer NOT NULL CHECK (bonus_days BETWEEN 1 AND 30),
  expires_at timestamptz NOT NULL,
  redeemed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lifecycle_trial_extension_offers_user_created_idx
  ON public.lifecycle_trial_extension_offers(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS lifecycle_trial_extension_offers_pending_idx
  ON public.lifecycle_trial_extension_offers(expires_at)
  WHERE redeemed_at IS NULL;

ALTER TABLE public.lifecycle_trial_extension_offers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lifecycle_trial_extension_offers FROM anon, authenticated;
GRANT ALL ON public.lifecycle_trial_extension_offers TO service_role;

COMMENT ON TABLE public.lifecycle_trial_extension_offers IS
  'Tokens de uso unico para aceite de extensoes gratuitas oferecidas por lifecycle.';

CREATE OR REPLACE FUNCTION public.issue_lifecycle_trial_reengagement_offer(
  p_dispatch_id uuid,
  p_token_hash text,
  p_bonus_days integer DEFAULT 7,
  p_valid_days integer DEFAULT 14
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  dispatch_user_id uuid;
  dispatch_rule_key text;
  professional_row public.professionals%ROWTYPE;
  existing_offer public.lifecycle_trial_extension_offers%ROWTYPE;
  cancellation_at timestamptz;
  offer_expiration timestamptz;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('code', 'invalid_token_hash');
  END IF;
  IF p_bonus_days IS NULL OR p_bonus_days < 1 OR p_bonus_days > 30
     OR p_valid_days IS NULL OR p_valid_days < 1 OR p_valid_days > 30 THEN
    RETURN jsonb_build_object('code', 'invalid_offer_configuration');
  END IF;

  SELECT d.user_id, r.rule_key
  INTO dispatch_user_id, dispatch_rule_key
  FROM public.lifecycle_dispatches d
  JOIN public.lifecycle_rules r ON r.id = d.rule_id
  WHERE d.id = p_dispatch_id;

  IF dispatch_user_id IS NULL OR dispatch_rule_key <> 'trial_canceled_reengagement_3d' THEN
    RETURN jsonb_build_object('code', 'invalid_dispatch');
  END IF;

  SELECT * INTO existing_offer
  FROM public.lifecycle_trial_extension_offers
  WHERE dispatch_id = p_dispatch_id
  FOR UPDATE;

  IF FOUND AND existing_offer.redeemed_at IS NOT NULL THEN
    RETURN jsonb_build_object('code', 'already_redeemed');
  END IF;

  SELECT * INTO professional_row
  FROM public.professionals
  WHERE id = dispatch_user_id;

  IF NOT FOUND OR professional_row.status <> 'active' THEN
    RETURN jsonb_build_object('code', 'account_not_recoverable');
  END IF;
  IF professional_row.subscription_plan <> 'trial'
     OR professional_row.subscription_status <> 'canceled' THEN
    RETURN jsonb_build_object('code', 'trial_no_longer_canceled');
  END IF;

  SELECT max(occurred_at) INTO cancellation_at
  FROM public.lifecycle_events
  WHERE user_id = dispatch_user_id
    AND event_name = 'subscription_cancelled';
  cancellation_at := COALESCE(cancellation_at, professional_row.updated_at, professional_row.created_at);

  IF cancellation_at IS NULL OR cancellation_at > now() - interval '72 hours' THEN
    RETURN jsonb_build_object('code', 'cancellation_interval_not_elapsed');
  END IF;

  offer_expiration := now() + make_interval(days => p_valid_days);

  INSERT INTO public.lifecycle_trial_extension_offers (
    user_id,
    dispatch_id,
    token_hash,
    cancellation_event_at,
    bonus_days,
    expires_at
  ) VALUES (
    dispatch_user_id,
    p_dispatch_id,
    p_token_hash,
    cancellation_at,
    p_bonus_days,
    offer_expiration
  )
  ON CONFLICT (dispatch_id) DO UPDATE SET
    token_hash = EXCLUDED.token_hash,
    cancellation_event_at = EXCLUDED.cancellation_event_at,
    bonus_days = EXCLUDED.bonus_days,
    expires_at = EXCLUDED.expires_at,
    updated_at = now();

  RETURN jsonb_build_object(
    'code', 'issued',
    'bonus_days', p_bonus_days,
    'expires_at', offer_expiration
  );
END;
$$;

REVOKE ALL ON FUNCTION public.issue_lifecycle_trial_reengagement_offer(uuid, text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_lifecycle_trial_reengagement_offer(uuid, text, integer, integer)
  TO service_role;

CREATE OR REPLACE FUNCTION public.redeem_lifecycle_trial_reengagement_offer(
  p_token_hash text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  offer_row public.lifecycle_trial_extension_offers%ROWTYPE;
  grant_result jsonb;
  grant_code text;
  granted_until timestamptz;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('code', 'invalid_token');
  END IF;

  SELECT * INTO offer_row
  FROM public.lifecycle_trial_extension_offers
  WHERE token_hash = p_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('code', 'invalid_token');
  END IF;
  IF offer_row.redeemed_at IS NOT NULL THEN
    SELECT new_trial_ends_at INTO granted_until
    FROM public.lifecycle_trial_extensions
    WHERE dispatch_id = offer_row.dispatch_id;
    RETURN jsonb_build_object(
      'code', 'already_redeemed',
      'new_trial_ends_at', granted_until,
      'bonus_days', offer_row.bonus_days
    );
  END IF;
  IF offer_row.expires_at <= now() THEN
    RETURN jsonb_build_object('code', 'offer_expired');
  END IF;

  grant_result := public.grant_lifecycle_trial_reengagement_bonus(
    offer_row.user_id,
    offer_row.dispatch_id,
    offer_row.bonus_days
  );
  grant_code := grant_result ->> 'code';

  IF grant_code NOT IN ('granted', 'already_granted') THEN
    RETURN grant_result;
  END IF;

  UPDATE public.lifecycle_trial_extension_offers
  SET redeemed_at = now(), updated_at = now()
  WHERE id = offer_row.id;

  RETURN jsonb_build_object(
    'code', CASE WHEN grant_code = 'granted' THEN 'redeemed' ELSE 'already_redeemed' END,
    'new_trial_ends_at', grant_result ->> 'new_trial_ends_at',
    'bonus_days', offer_row.bonus_days
  );
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_lifecycle_trial_reengagement_offer(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_lifecycle_trial_reengagement_offer(text)
  TO service_role;

UPDATE public.lifecycle_rules
SET message_config = COALESCE(message_config, '{}'::jsonb) || jsonb_build_object(
      'subject', 'Ganhe mais 7 dias para conhecer o Evolução Clínica',
      'preheader', 'Ative uma nova semana gratuita para experimentar a plataforma com mais calma.',
      'body', E'Queremos que você tenha mais tempo para conhecer o que o Evolução Clínica pode fazer pela sua rotina.\n\nPor isso, preparamos uma extensão gratuita de 7 dias para sua conta. Para ativá-la, clique no botão abaixo e confirme a liberação.\n\nOs 7 dias só começarão a contar depois da sua confirmação.',
      'cta_label', 'Ativar mais 7 dias grátis',
      'cta_route', '/reativar-teste',
      'commercial', true
    ),
    condition_config = COALESCE(condition_config, '{}'::jsonb) || '{"bonus_days":7,"offer_valid_days":14,"email_only":true}'::jsonb,
    updated_at = now()
WHERE rule_key = 'trial_canceled_reengagement_3d';

UPDATE public.lifecycle_steps
SET subject_template = 'Ganhe mais 7 dias para conhecer o Evolução Clínica',
    preheader_template = 'Ative uma nova semana gratuita para experimentar a plataforma com mais calma.',
    body_markdown = E'Olá, {{primeiro_nome}}!\n\nQueremos que você tenha mais tempo para conhecer o que o Evolução Clínica pode fazer pela sua rotina.\n\nPor isso, preparamos uma extensão gratuita de 7 dias para sua conta. Para ativá-la, clique no botão abaixo e confirme a liberação.\n\nOs 7 dias só começarão a contar depois da sua confirmação.',
    cta_label_template = 'Ativar mais 7 dias grátis',
    cta_route_template = '/reativar-teste',
    fallback_cta_route = '/painel/subscription',
    status = 'draft',
    enabled = true,
    updated_at = now()
WHERE step_key = 'conditional_trial_canceled_reengagement_3d';

NOTIFY pgrst, 'reload schema';
