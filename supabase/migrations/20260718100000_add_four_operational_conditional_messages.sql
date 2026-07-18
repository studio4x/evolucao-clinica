-- Quatro mensagens operacionais condicionais, sem dados clínicos ou identificadores internos no conteúdo.
INSERT INTO public.lifecycle_rules
  (rule_key, name, description, trigger_event, rule_type, priority, cooldown_hours, delay_minutes, condition_config, message_config)
VALUES
('evolution_processing_failed', 'Falha no processamento da evolução', 'Falha terminal no processamento de uma evolução após as tentativas automáticas.', 'evolution_failed', 'state', 80, 96, 0, '{"transcription_status":"failed","requires_user_action":true}'::jsonb, '{"subject":"Não foi possível concluir sua evolução","preheader":"Confira a evolução e veja como continuar.","body":"Não foi possível concluir o processamento de uma evolução. Acesse a plataforma para verificar o status e, se necessário, fale com o suporte.","cta_label":"Verificar evolução","cta_route":"/painel/history","category":"operational"}'::jsonb),
('evolution_not_added_to_record', 'Evolução não adicionada ao prontuário', 'Evolução concluída, mas pendente de inclusão no prontuário.', NULL, 'state', 70, 96, 0, '{"transcription_status":"completed","google_doc_append_status":"failed","requires_user_action":true}'::jsonb, '{"subject":"Sua evolução precisa ser adicionada ao prontuário","preheader":"Uma ação ficou pendente para concluir o registro.","body":"A evolução foi processada, mas não foi adicionada ao prontuário. Acesse a plataforma para concluir esse registro ou falar com o suporte.","cta_label":"Adicionar ao prontuário","cta_route":"/painel/history","category":"operational"}'::jsonb),
('google_connection_interrupted', 'Conexão com Google interrompida', 'A conexão Google precisa ser autorizada novamente para continuar o uso dos prontuários.', NULL, 'state', 90, 96, 0, '{"force_google_disconnect":true,"requires_user_action":true}'::jsonb, '{"subject":"Sua conexão com o Google precisa ser reconectada","preheader":"Reconecte o Google para continuar usando seus prontuários.","body":"A conexão com o Google foi interrompida. Reconecte sua conta para continuar acessando e atualizando seus prontuários.","cta_label":"Reconectar Google","cta_route":"/painel/dashboard","category":"operational"}'::jsonb),
('subscription_payment_failed', 'Falha no pagamento da assinatura', 'Pagamento da assinatura falhou e exige atualização da forma de pagamento.', 'subscription_status_changed', 'state', 100, 96, 0, '{"transaction_status":"failed","requires_user_action":true}'::jsonb, '{"subject":"Não foi possível processar seu pagamento","preheader":"Atualize sua forma de pagamento para manter o acesso.","body":"Não foi possível processar o pagamento da sua assinatura. {{bloco_status_acesso}} Atualize sua forma de pagamento ou fale com o suporte.","cta_label":"Atualizar pagamento","cta_route":"/painel/subscription","category":"billing"}'::jsonb)
ON CONFLICT (rule_key) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, trigger_event = EXCLUDED.trigger_event,
  rule_type = EXCLUDED.rule_type, priority = EXCLUDED.priority, cooldown_hours = EXCLUDED.cooldown_hours,
  delay_minutes = EXCLUDED.delay_minutes, condition_config = EXCLUDED.condition_config,
  message_config = EXCLUDED.message_config, enabled = true, updated_at = now();

-- A ordem operacional deve prevalecer sobre os lembretes genéricos.
UPDATE public.lifecycle_rules SET priority = 60, cooldown_hours = 96, updated_at = now() WHERE rule_key = 'inactive_3d';
UPDATE public.lifecycle_rules SET priority = 50, cooldown_hours = 96, updated_at = now() WHERE rule_key = 'inactive_7d';
UPDATE public.lifecycle_rules SET priority = 40, cooldown_hours = 96, updated_at = now() WHERE rule_key = 'inactive_14d';

DO $$
DECLARE
  conditional_campaign_id uuid;
BEGIN
  SELECT id INTO conditional_campaign_id
  FROM public.lifecycle_campaigns
  WHERE key = 'conditional_lifecycle_messages';

  IF conditional_campaign_id IS NULL THEN
    RAISE EXCEPTION 'Campanha conditional_lifecycle_messages não encontrada';
  END IF;

  -- Evita conflitos temporários com a constraint de posição única.
  UPDATE public.lifecycle_steps
  SET position = position + 1000
  WHERE campaign_id = conditional_campaign_id;

  WITH ordered AS (
    SELECT id, row_number() OVER (ORDER BY position) AS new_position
    FROM public.lifecycle_steps
    WHERE campaign_id = conditional_campaign_id
      AND eligibility_rule_key NOT IN ('inactive_3d', 'inactive_7d', 'inactive_14d')
  )
  UPDATE public.lifecycle_steps step
  SET position = ordered.new_position
  FROM ordered
  WHERE step.id = ordered.id;

  UPDATE public.lifecycle_steps SET position = 12 WHERE campaign_id = conditional_campaign_id AND eligibility_rule_key = 'inactive_14d';
  UPDATE public.lifecycle_steps SET position = 13 WHERE campaign_id = conditional_campaign_id AND eligibility_rule_key = 'inactive_7d';
  UPDATE public.lifecycle_steps SET position = 14 WHERE campaign_id = conditional_campaign_id AND eligibility_rule_key = 'inactive_3d';

  INSERT INTO public.lifecycle_steps
    (campaign_id, step_key, eligibility_rule_key, position, wait_minutes, category, priority, status, subject_template, preheader_template, body_markdown, cta_label_template, cta_route_template, fallback_cta_route, enabled)
  VALUES
    (conditional_campaign_id, 'conditional_evolution_processing_failed', 'evolution_processing_failed', 15, 0, 'operational', 80, 'active', 'Não foi possível concluir sua evolução', 'Confira a evolução e veja como continuar.', 'Olá, {{primeiro_nome}}!\n\nNão foi possível concluir o processamento de uma evolução. Acesse a plataforma para verificar o status e, se necessário, fale com o suporte.', 'Verificar evolução', '/painel/history', '/painel/support', true),
    (conditional_campaign_id, 'conditional_evolution_not_added_to_record', 'evolution_not_added_to_record', 16, 0, 'operational', 70, 'active', 'Sua evolução precisa ser adicionada ao prontuário', 'Uma ação ficou pendente para concluir o registro.', 'Olá, {{primeiro_nome}}!\n\nA evolução foi processada, mas não foi adicionada ao prontuário. Acesse a plataforma para concluir esse registro ou falar com o suporte.', 'Adicionar ao prontuário', '/painel/history', '/painel/support', true),
    (conditional_campaign_id, 'conditional_google_connection_interrupted', 'google_connection_interrupted', 17, 0, 'operational', 90, 'active', 'Sua conexão com o Google precisa ser reconectada', 'Reconecte o Google para continuar usando seus prontuários.', 'Olá, {{primeiro_nome}}!\n\nA conexão com o Google foi interrompida. Reconecte sua conta para continuar acessando e atualizando seus prontuários.', 'Reconectar Google', '/painel/dashboard', '/painel/support', true),
    (conditional_campaign_id, 'conditional_subscription_payment_failed', 'subscription_payment_failed', 18, 0, 'billing', 100, 'active', 'Não foi possível processar seu pagamento', 'Atualize sua forma de pagamento para manter o acesso.', 'Olá, {{primeiro_nome}}!\n\nNão foi possível processar o pagamento da sua assinatura.\n\n{{bloco_status_acesso}}\n\nAtualize sua forma de pagamento ou fale com o suporte.', 'Atualizar pagamento', '/painel/subscription', '/painel/support', true)
  ON CONFLICT (campaign_id, step_key) DO UPDATE SET
    eligibility_rule_key = EXCLUDED.eligibility_rule_key, position = EXCLUDED.position,
    category = EXCLUDED.category, priority = EXCLUDED.priority, status = EXCLUDED.status,
    subject_template = EXCLUDED.subject_template, preheader_template = EXCLUDED.preheader_template,
    body_markdown = EXCLUDED.body_markdown, cta_label_template = EXCLUDED.cta_label_template,
    cta_route_template = EXCLUDED.cta_route_template, fallback_cta_route = EXCLUDED.fallback_cta_route,
    enabled = EXCLUDED.enabled;
END $$;

NOTIFY pgrst, 'reload schema';
