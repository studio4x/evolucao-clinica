UPDATE public.lifecycle_steps
SET
  subject_template = 'O que dificultou sua continuidade?',
  preheader_template = 'Sua experiência pode nos ajudar a melhorar o Evolução Clínica.',
  body_markdown = E'Olá, {{primeiro_nome}}!\n\nPercebemos que você não continuou utilizando o Evolução Clínica depois do período de teste e gostaríamos de entender o que aconteceu.\n\nTalvez tenha faltado tempo para explorar a plataforma, surgido alguma dificuldade com a conexão ao Google, ficado alguma dúvida sobre a primeira evolução ou o plano não tenha se encaixado no momento.\n\nConte para nós qual foi o principal motivo. A resposta é rápida e pode nos ajudar a melhorar a experiência de outros profissionais.\n\nCaso tenha interesse em retomar o uso, nossa equipe também pode ajudar você a continuar pela etapa em que encontrou dificuldade.',
  cta_label_template = 'Contar o que aconteceu',
  cta_route_template = '{{link_feedback}}'
WHERE step_key = 'conditional_trial_recovery_7d'
  AND campaign_id = (SELECT id FROM public.lifecycle_campaigns WHERE key = 'conditional_lifecycle_messages');
