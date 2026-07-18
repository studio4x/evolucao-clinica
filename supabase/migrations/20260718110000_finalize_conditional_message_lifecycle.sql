-- Finaliza a campanha de mensagens condicionais sem apagar histórico de dispatches.
-- Identificadores técnicos permanecem estáveis; a posição é somente de exibição/ordenação.

DO $$
DECLARE
  conditional_campaign_id uuid;
BEGIN
  SELECT id INTO conditional_campaign_id
  FROM public.lifecycle_campaigns
  WHERE key = 'conditional_lifecycle_messages';

  IF conditional_campaign_id IS NULL THEN
    RETURN;
  END IF;

  -- Duplicatas transacionais: regras permanecem no histórico, mas não podem gerar novos candidatos.
  UPDATE public.lifecycle_rules
  SET enabled = false, updated_at = now()
  WHERE rule_key IN (
    'linked_record_without_evolution',
    'first_evolution_completed',
    'patient_without_linked_record',
    'logged_in_without_patient'
  );

  -- Arquivar mantém step_id e a legibilidade de registros administrativos antigos.
  UPDATE public.lifecycle_steps
  SET status = 'archived', enabled = false, updated_at = now()
  WHERE campaign_id = conditional_campaign_id
    AND eligibility_rule_key NOT IN (
      'evolution_processing_too_long',
      'trial_expiring_1d',
      'trial_expiring_3d',
      'no_return_after_registration',
      'subscriber_low_usage',
      'trial_recovery_2d',
      'trial_recovery_7d',
      'inactive_14d',
      'inactive_7d',
      'inactive_3d',
      'evolution_processing_failed',
      'evolution_not_added_to_record',
      'google_connection_interrupted',
      'subscription_payment_failed'
    );

  -- Nenhum dispatch futuro de duplicata deve permanecer na fila; enviados não são alterados.
  UPDATE public.lifecycle_dispatches AS d
  SET status = 'cancelled',
      skip_reason = 'conditional_message_removed_as_transactional_duplicate',
      skipped_at = now(),
      updated_at = now()
  WHERE d.status IN ('queued', 'retry', 'processing')
    AND (
      d.message_key IN (
        'conditional:linked_record_without_evolution',
        'conditional:first_evolution_completed',
        'conditional:patient_without_linked_record',
        'conditional:logged_in_without_patient'
      )
      OR d.rule_id IN (
        SELECT id FROM public.lifecycle_rules
        WHERE rule_key IN (
          'linked_record_without_evolution',
          'first_evolution_completed',
          'patient_without_linked_record',
          'logged_in_without_patient'
        )
      )
    );

  -- Reserva espaço para evitar colisão com a constraint de posição única.
  UPDATE public.lifecycle_steps
  SET position = position + 1000, updated_at = now()
  WHERE campaign_id = conditional_campaign_id;

  -- Atrasos adicionais e condições finais. O processamento usa 120 min técnicos + 20 min de tolerância.
  UPDATE public.lifecycle_rules
  SET delay_minutes = CASE rule_key
        WHEN 'evolution_processing_too_long' THEN 20
        WHEN 'evolution_processing_failed' THEN 10
        WHEN 'evolution_not_added_to_record' THEN 15
        WHEN 'google_connection_interrupted' THEN 20
        WHEN 'subscription_payment_failed' THEN 15
        ELSE 0
      END,
      cooldown_hours = 96,
      priority = CASE rule_key
        WHEN 'subscription_payment_failed' THEN 100
        WHEN 'google_connection_interrupted' THEN 95
        WHEN 'evolution_processing_too_long' THEN 92
        WHEN 'evolution_processing_failed' THEN 90
        WHEN 'evolution_not_added_to_record' THEN 85
        WHEN 'inactive_3d' THEN 80
        WHEN 'no_return_after_registration' THEN 75
        WHEN 'inactive_7d' THEN 70
        WHEN 'trial_expiring_1d' THEN 65
        WHEN 'trial_expiring_3d' THEN 65
        WHEN 'subscriber_low_usage' THEN 60
        WHEN 'inactive_14d' THEN 55
        WHEN 'trial_recovery_2d' THEN 50
        WHEN 'trial_recovery_7d' THEN 45
        ELSE priority
      END,
      condition_config = CASE rule_key
        WHEN 'evolution_processing_too_long' THEN COALESCE(condition_config, '{}'::jsonb) || '{"processing_threshold_minutes":120}'::jsonb
        WHEN 'inactive_3d' THEN '{"days":3,"pending_hours":72,"contextual_action":true}'::jsonb
        WHEN 'evolution_processing_failed' THEN COALESCE(condition_config, '{}'::jsonb) || '{"terminal_failure_confirmed":true,"automatic_retry_pending":false,"requires_user_action":true}'::jsonb
        WHEN 'evolution_not_added_to_record' THEN COALESCE(condition_config, '{}'::jsonb) || '{"record_append_confirmed":false,"automatic_retry_pending":false,"requires_user_action":true}'::jsonb
        WHEN 'google_connection_interrupted' THEN COALESCE(condition_config, '{}'::jsonb) || '{"google_connection_status":"reconnect_required","failure_confirmed":true,"automatic_recovery_pending":false,"requires_user_action":true}'::jsonb
        WHEN 'subscription_payment_failed' THEN COALESCE(condition_config, '{}'::jsonb) || '{"payment_resolved":false,"automatic_retry_pending":false,"requires_user_action":true}'::jsonb
        ELSE condition_config
      END,
      message_config = CASE rule_key
        WHEN 'inactive_3d' THEN COALESCE(message_config, '{}'::jsonb) || '{"subject":"Seu próximo passo no Evolução Clínica","preheader":"Uma ação concreta para continuar sua organização.","body":"Você já iniciou sua organização no Evolução Clínica. Continue pela próxima ação disponível: {{titulo_proxima_acao}}.\n\n{{descricao_proxima_acao}}","cta_label":"{{texto_cta_proxima_acao}}","cta_route":"{{url_proxima_acao}}"}'::jsonb
        WHEN 'evolution_not_added_to_record' THEN jsonb_set(COALESCE(message_config, '{}'::jsonb), '{subject}', '"Sua evolução está pronta, mas falta adicioná-la ao prontuário"'::jsonb)
        WHEN 'google_connection_interrupted' THEN jsonb_set(COALESCE(message_config, '{}'::jsonb), '{subject}', '"Reconecte sua conta Google para continuar"'::jsonb)
        WHEN 'subscription_payment_failed' THEN jsonb_set(COALESCE(message_config, '{}'::jsonb), '{subject}', '"Não foi possível concluir o pagamento da sua assinatura"'::jsonb)
        ELSE message_config
      END,
      updated_at = now()
  WHERE rule_key IN (
    'evolution_processing_too_long', 'trial_expiring_1d', 'trial_expiring_3d',
    'no_return_after_registration', 'subscriber_low_usage', 'trial_recovery_2d',
    'trial_recovery_7d', 'inactive_14d', 'inactive_7d', 'inactive_3d',
    'evolution_processing_failed', 'evolution_not_added_to_record',
    'google_connection_interrupted', 'subscription_payment_failed'
  );

  WITH desired(rule_key, new_position, wait_minutes) AS (
    VALUES
      ('evolution_processing_too_long', 1, 20),
      ('trial_expiring_1d', 2, 0),
      ('trial_expiring_3d', 3, 0),
      ('no_return_after_registration', 4, 0),
      ('subscriber_low_usage', 5, 0),
      ('trial_recovery_2d', 6, 0),
      ('trial_recovery_7d', 7, 0),
      ('inactive_14d', 8, 0),
      ('inactive_7d', 9, 0),
      ('inactive_3d', 10, 0),
      ('evolution_processing_failed', 11, 10),
      ('evolution_not_added_to_record', 12, 15),
      ('google_connection_interrupted', 13, 20),
      ('subscription_payment_failed', 14, 15)
  )
  INSERT INTO public.lifecycle_steps (
    campaign_id, step_key, eligibility_rule_key, position, wait_minutes, category, priority,
    status, subject_template, preheader_template, body_markdown, cta_label_template,
    cta_route_template, fallback_cta_route, enabled
  )
  SELECT
    conditional_campaign_id,
    'conditional_' || desired.rule_key,
    desired.rule_key,
    desired.new_position,
    desired.wait_minutes,
    COALESCE(r.message_config ->> 'category', 'activation'),
    r.priority,
    'active',
    COALESCE(r.message_config ->> 'subject', r.name),
    r.message_config ->> 'preheader',
    COALESCE(r.message_config ->> 'body', r.description, 'Acesse a plataforma para continuar.'),
    r.message_config ->> 'cta_label',
    r.message_config ->> 'cta_route',
    r.message_config ->> 'cta_route',
    true
  FROM desired
  JOIN public.lifecycle_rules r ON r.rule_key = desired.rule_key
  ON CONFLICT (campaign_id, step_key) DO UPDATE SET
    eligibility_rule_key = EXCLUDED.eligibility_rule_key,
    position = EXCLUDED.position,
    wait_minutes = EXCLUDED.wait_minutes,
    category = EXCLUDED.category,
    priority = EXCLUDED.priority,
    status = EXCLUDED.status,
    subject_template = EXCLUDED.subject_template,
    preheader_template = EXCLUDED.preheader_template,
    body_markdown = EXCLUDED.body_markdown,
    cta_label_template = EXCLUDED.cta_label_template,
    cta_route_template = EXCLUDED.cta_route_template,
    fallback_cta_route = EXCLUDED.fallback_cta_route,
    enabled = EXCLUDED.enabled,
    updated_at = now();
END $$;

NOTIFY pgrst, 'reload schema';
