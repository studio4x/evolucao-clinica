UPDATE public.lifecycle_rules
SET name = 'Trial cancelado há mais de 3 dias',
    description = 'Profissional ativo no plano trial, com status canceled há pelo menos 3 dias. Ao processar o e-mail, concede uma única extensão gratuita de 7 dias.',
    updated_at = now()
WHERE rule_key = 'trial_canceled_reengagement_3d';

UPDATE public.lifecycle_steps
SET body_markdown = E'Olá, {{primeiro_nome}}!\n\nPercebemos que seu período de teste foi interrompido antes de você conhecer tudo o que o Evolução Clínica pode fazer pela sua rotina.\n\nPor isso, reativamos seu acesso gratuitamente por mais 7 dias. É uma nova oportunidade para cadastrar pacientes, organizar prontuários e experimentar a criação de evoluções com mais calma.\n\nSe quiser, comece por um atendimento recente e veja como a plataforma pode ajudar a reduzir o tempo dos seus registros.',
    updated_at = now()
WHERE step_key = 'conditional_trial_canceled_reengagement_3d';

NOTIFY pgrst, 'reload schema';
