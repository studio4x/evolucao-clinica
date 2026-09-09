-- Fundacao de ativacao e conversao:
-- 1. registra o funil de checkout de forma duravel e sem PII;
-- 2. inicia os sete dias completos quando a primeira evolucao real e concluida;
-- 3. corrige atividade lifecycle para considerar apenas uso real do produto;
-- 4. alinha a jornada ao proximo passo e encerra a sequencia apos o bloqueio.

CREATE TABLE IF NOT EXISTS public.checkout_attempts (
  attempt_id uuid PRIMARY KEY,
  professional_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id text NOT NULL CHECK (plan_id IN ('monthly', 'yearly')),
  provider text NOT NULL CHECK (provider IN ('stripe', 'google_play', 'android_billing')),
  channel text NOT NULL CHECK (channel IN ('web', 'android')),
  status text NOT NULL CHECK (status IN (
    'started',
    'session_created',
    'provider_opened',
    'pending',
    'paid',
    'cancelled',
    'failed',
    'expired'
  )),
  coupon_present boolean NOT NULL DEFAULT false,
  error_code text,
  provider_reference text,
  started_at timestamptz NOT NULL DEFAULT now(),
  provider_opened_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (error_code IS NULL OR error_code ~ '^[a-z0-9_:-]{1,80}$'),
  CHECK (provider_reference IS NULL OR length(provider_reference) <= 255)
);

CREATE INDEX IF NOT EXISTS checkout_attempts_professional_created_idx
  ON public.checkout_attempts(professional_id, created_at DESC);
CREATE INDEX IF NOT EXISTS checkout_attempts_status_created_idx
  ON public.checkout_attempts(status, created_at DESC);

ALTER TABLE public.checkout_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.checkout_attempts FROM anon, authenticated;
GRANT SELECT, INSERT ON public.checkout_attempts TO authenticated;
GRANT UPDATE (status, provider_opened_at, completed_at, error_code, updated_at)
  ON public.checkout_attempts TO authenticated;
GRANT ALL ON public.checkout_attempts TO service_role;

DROP POLICY IF EXISTS checkout_attempts_select_own ON public.checkout_attempts;
CREATE POLICY checkout_attempts_select_own
  ON public.checkout_attempts
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = professional_id);

DROP POLICY IF EXISTS checkout_attempts_insert_own ON public.checkout_attempts;
CREATE POLICY checkout_attempts_insert_own
  ON public.checkout_attempts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = professional_id
    AND status = 'started'
  );

DROP POLICY IF EXISTS checkout_attempts_update_own ON public.checkout_attempts;
CREATE POLICY checkout_attempts_update_own
  ON public.checkout_attempts
  FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = professional_id)
  WITH CHECK (
    (SELECT auth.uid()) = professional_id
    AND status IN ('started', 'provider_opened', 'cancelled', 'failed')
  );

COMMENT ON TABLE public.checkout_attempts IS
  'Funil operacional de checkout sem dados clinicos, e-mail, telefone ou conteudo de pagamento.';

ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS trial_activation_deadline_at timestamptz,
  ADD COLUMN IF NOT EXISTS trial_activated_at timestamptz;

COMMENT ON COLUMN public.professionals.trial_activation_deadline_at IS
  'Prazo curto para concluir a primeira experiencia antes do inicio dos sete dias completos.';
COMMENT ON COLUMN public.professionals.trial_activated_at IS
  'Instante em que a primeira evolucao real iniciou os sete dias completos de avaliacao.';

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;

CREATE OR REPLACE FUNCTION private.activate_trial_after_first_evolution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  activated_until timestamptz;
BEGIN
  IF NEW.transcription_status <> 'completed'
     OR NEW.google_doc_append_status <> 'completed' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.transcription_status = 'completed'
       AND OLD.google_doc_append_status = 'completed' THEN
      RETURN NEW;
    END IF;
  END IF;

  activated_until := now() + interval '7 days';

  UPDATE public.professionals
  SET trial_activated_at = now(),
      trial_ends_at = activated_until,
      subscription_ends_at = activated_until,
      trial_expiration_email_sent_at = NULL,
      onboarding_completed = true,
      onboarding_status = 'completed',
      onboarding_current_step = 'complete',
      updated_at = now()
  WHERE id = NEW.professional_id
    AND status = 'active'
    AND subscription_plan = 'trial'
    AND subscription_status = 'trialing'
    AND trial_activation_deadline_at IS NOT NULL
    AND trial_activated_at IS NULL
    AND trial_activation_deadline_at >= now() - interval '10 minutes';

  IF FOUND THEN
    PERFORM public.record_lifecycle_event(
      NEW.professional_id,
      'trial_activated',
      'database_trigger',
      'evolution',
      NEW.id,
      jsonb_build_object('trial_ends_at', activated_until),
      'trial_activated:' || NEW.professional_id::text,
      now()
    );
    PERFORM public.record_lifecycle_event(
      NEW.professional_id,
      'onboarding_completed',
      'database_trigger',
      'evolution',
      NEW.id,
      jsonb_build_object('source', 'first_evolution'),
      'onboarding_completed:first_evolution:' || NEW.professional_id::text,
      now()
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.activate_trial_after_first_evolution() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS activate_trial_after_first_evolution ON public.evolutions;
CREATE TRIGGER activate_trial_after_first_evolution
AFTER INSERT OR UPDATE OF transcription_status, google_doc_append_status
ON public.evolutions
FOR EACH ROW
EXECUTE FUNCTION private.activate_trial_after_first_evolution();

CREATE OR REPLACE FUNCTION private.correct_lifecycle_product_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  meaningful_days text[];
  meaningful_day_count integer;
  latest_meaningful_activity timestamptz;
BEGIN
  SELECT count(DISTINCT activity_day)::integer,
         array_agg(DISTINCT activity_day::text ORDER BY activity_day::text)
  INTO meaningful_day_count, meaningful_days
  FROM (
    SELECT (occurred_at AT TIME ZONE 'America/Sao_Paulo')::date AS activity_day
    FROM public.lifecycle_events
    WHERE user_id = NEW.user_id
      AND event_name IN (
        'user_logged_in', 'patient_created', 'patient_record_linked',
        'evolution_started', 'evolution_completed', 'audio_evolution_completed',
        'patient_history_viewed', 'document_area_viewed', 'feature_discovered',
        'report_generated', 'migration_completed', 'backup_configured',
        'custom_logo_added', 'digital_signature_used', 'subscription_page_viewed',
        'support_opened', 'guided_demo_started', 'guided_demo_completed'
      )
    UNION
    SELECT (created_at AT TIME ZONE 'America/Sao_Paulo')::date
    FROM public.patients WHERE professional_id = NEW.user_id
    UNION
    SELECT (created_at AT TIME ZONE 'America/Sao_Paulo')::date
    FROM public.evolutions WHERE professional_id = NEW.user_id
    UNION
    SELECT (created_at AT TIME ZONE 'America/Sao_Paulo')::date
    FROM public.patient_reports WHERE professional_id = NEW.user_id
  ) product_days;

  SELECT max(activity_at)
  INTO latest_meaningful_activity
  FROM (
    SELECT occurred_at AS activity_at
    FROM public.lifecycle_events
    WHERE user_id = NEW.user_id
      AND event_name IN (
        'user_logged_in', 'patient_created', 'patient_record_linked',
        'evolution_started', 'evolution_completed', 'audio_evolution_completed',
        'patient_history_viewed', 'document_area_viewed', 'feature_discovered',
        'report_generated', 'migration_completed', 'backup_configured',
        'custom_logo_added', 'digital_signature_used', 'subscription_page_viewed',
        'support_opened', 'guided_demo_started', 'guided_demo_completed'
      )
    UNION ALL
    SELECT coalesce(updated_at, created_at) FROM public.patients WHERE professional_id = NEW.user_id
    UNION ALL
    SELECT coalesce(updated_at, created_at) FROM public.evolutions WHERE professional_id = NEW.user_id
    UNION ALL
    SELECT coalesce(updated_at, created_at) FROM public.patient_reports WHERE professional_id = NEW.user_id
  ) product_activity;

  UPDATE public.lifecycle_user_state
  SET usage_days_count = coalesce(meaningful_day_count, 0),
      distinct_activity_days = coalesce(meaningful_days, '{}'::text[]),
      last_activity_at = latest_meaningful_activity
  WHERE user_id = NEW.user_id;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.correct_lifecycle_product_activity() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS correct_lifecycle_product_activity ON public.lifecycle_user_state;
CREATE TRIGGER correct_lifecycle_product_activity
AFTER INSERT OR UPDATE OF usage_days_count, distinct_activity_days, last_activity_at
ON public.lifecycle_user_state
FOR EACH ROW
WHEN (pg_trigger_depth() = 0)
EXECUTE FUNCTION private.correct_lifecycle_product_activity();

-- Reprocessa somente os estados existentes. O gatilho acima corrige os tres
-- campos sem alterar planos, expiracoes ou historico de comunicacao.
UPDATE public.lifecycle_user_state
SET usage_days_count = usage_days_count,
    updated_at = updated_at;

UPDATE public.lifecycle_rules
SET message_config = jsonb_build_object(
      'subject', 'Seu próximo passo no Evolução Clínica',
      'preheader', 'Continue exatamente do ponto em que você parou.',
      'body', E'Você já iniciou sua configuração. O próximo passo recomendado é: {{titulo_proxima_acao}}.\n\n{{descricao_proxima_acao}}',
      'cta_label', '{{texto_cta_proxima_acao}}',
      'cta_route', '{{url_proxima_acao}}',
      'category', 'activation'
    ),
    updated_at = now()
WHERE rule_key = 'onboarding_incomplete_24h';

UPDATE public.lifecycle_steps
SET subject_template = 'Seu próximo passo no Evolução Clínica',
    preheader_template = 'Continue exatamente do ponto em que você parou.',
    body_markdown = E'Olá, {{primeiro_nome}}!\n\nVocê já iniciou sua configuração. O próximo passo recomendado é: **{{titulo_proxima_acao}}**.\n\n{{descricao_proxima_acao}}',
    cta_label_template = '{{texto_cta_proxima_acao}}',
    cta_route_template = '{{url_proxima_acao}}',
    status = 'draft',
    updated_at = now()
WHERE step_key = 'conditional_onboarding_incomplete_24h';

NOTIFY pgrst, 'reload schema';
