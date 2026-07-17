UPDATE public.lifecycle_steps
SET body_markdown = E'Olá, {{primeiro_nome}}!\n\nSeu período de teste terminou, mas você pode retomar sua organização no Evolução Clínica de onde parou.\n\n{{bloco_progresso_teste}}\n\nEsses registros podem ser o início de uma rotina mais organizada.\n\nCaso alguma dúvida ou dificuldade tenha impedido você de aproveitar melhor o período de teste, fale com nossa equipe. Podemos orientar você sobre o funcionamento da plataforma e os próximos passos.'
WHERE step_key = 'conditional_trial_recovery_2d'
  AND campaign_id = (SELECT id FROM public.lifecycle_campaigns WHERE key = 'conditional_lifecycle_messages');
