UPDATE public.lifecycle_steps
SET
  subject_template = 'Vamos aproveitar melhor sua assinatura?',
  preheader_template = 'Escolha uma ação simples para incorporar a plataforma à sua rotina.',
  body_markdown = E'Olá, {{primeiro_nome}}!\n\nSua assinatura do Evolução Clínica está ativa, mas percebemos que você utilizou poucos recursos da plataforma nos últimos dias.\n\nVocê não precisa configurar ou explorar tudo de uma vez. Comece pela próxima ação que mais combina com o estágio atual da sua conta:\n\n**{{proxima_acao}}**\n\nUma ação simples já pode ajudar você a retomar o uso e descobrir como a plataforma pode apoiar melhor sua rotina de registros.\n\nCaso tenha encontrado alguma dificuldade ou não saiba como continuar, fale com nossa equipe. Podemos orientar você nos próximos passos.',
  cta_label_template = '{{texto_cta_proxima_acao}}',
  cta_route_template = '{{link_acao}}'
WHERE eligibility_rule_key = 'subscriber_low_usage'
  AND campaign_id = (SELECT id FROM public.lifecycle_campaigns WHERE key = 'conditional_lifecycle_messages');
