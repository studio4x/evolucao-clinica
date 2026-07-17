UPDATE public.lifecycle_steps
SET
  cta_label_template = '{{texto_cta_proxima_acao}}',
  cta_route_template = '{{link_acao}}',
  body_markdown = E'Olá, {{primeiro_nome}}!\n\nVocê já iniciou sua organização no Evolução Clínica, mas ainda há uma etapa disponível para continuar o fluxo:\n\n**{{titulo_proxima_acao}}**\n\n{{descricao_proxima_acao}}\n\nVocê não precisa concluir toda a configuração de uma vez. Realize essa ação no seu ritmo e avance para as próximas etapas quando for mais conveniente.\n\nCaso tenha encontrado alguma dificuldade, nossa equipe está disponível para orientar você.'
WHERE step_key = 'conditional_inactive_3d'
  AND campaign_id = (SELECT id FROM public.lifecycle_campaigns WHERE key = 'conditional_lifecycle_messages');
