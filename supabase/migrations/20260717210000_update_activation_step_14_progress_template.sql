-- Atualiza o Passo 14 com progresso dinâmico e CTA contextual.
UPDATE public.lifecycle_steps AS s
SET
  subject_template = 'Veja o que você já começou a organizar',
  preheader_template = 'Confira seu progresso e veja qual é o próximo passo recomendado.',
  body_markdown = E'Olá, {{primeiro_nome}}!\n\nDesde que sua conta foi ativada, você já começou a organizar sua rotina no Evolução Clínica.\n\nAté agora, você:\n\n{{resumo_progresso}}\n\nSeu próximo passo recomendado é:\n\n{{proxima_acao}}\n\nContinue no seu ritmo. Cada paciente cadastrado, prontuário vinculado ou evolução concluída ajuda a construir um histórico mais organizado para os próximos atendimentos.',
  cta_label_template = '{{texto_cta_proxima_acao}}',
  cta_route_template = '{{link_acao}}',
  updated_at = now()
FROM public.lifecycle_campaigns AS c
WHERE s.campaign_id = c.id
  AND c.key = 'new_user_activation_15d'
  AND s.step_key = 'day_14';

NOTIFY pgrst, 'reload schema';
