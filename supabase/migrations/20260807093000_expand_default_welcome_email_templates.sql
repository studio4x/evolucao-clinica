UPDATE public.email_templates
SET body_template = CASE key
  WHEN 'welcome-pending' THEN 'Você já faz parte da plataforma. O próximo passo é a liberação do seu acesso por um administrador.\n\nO que você encontrará:\n• Prontuários e evoluções clínicas organizados no Google Docs\n• Transcrição e automação para acelerar a rotina clínica\n• Gestão de pacientes, acompanhamento e notificações\n• Fluxos pensados para segurança e organização do atendimento\n\nAssim que a aprovação acontecer, você receberá acesso completo ao painel.'
  WHEN 'welcome-active' THEN 'Sua conta foi criada com sucesso e você já pode entrar na plataforma para começar a usar os recursos.\n\nO que você encontrará:\n• Prontuários e evoluções clínicas organizados no Google Docs\n• Transcrição e automação para acelerar a rotina clínica\n• Gestão de pacientes, acompanhamento e notificações\n• Fluxos pensados para segurança e organização do atendimento\n\nUse seu e-mail para acessar o painel e explorar os recursos liberados no seu plano.'
  ELSE body_template
END
WHERE key IN ('welcome-pending', 'welcome-active')
  AND body_template IN (
    'Você já faz parte da plataforma. O próximo passo é a liberação do seu acesso por um administrador.',
    'Sua conta foi criada com sucesso e você já pode entrar na plataforma para começar a usar os recursos.'
  );
