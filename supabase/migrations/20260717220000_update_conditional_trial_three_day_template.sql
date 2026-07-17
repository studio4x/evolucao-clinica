UPDATE public.lifecycle_steps
SET
  subject_template = 'Seu período de teste termina em 3 dias',
  preheader_template = 'Continue explorando os recursos do Evolução Clínica.',
  body_markdown = E'Olá, {{primeiro_nome}}!\n\nSeu período de teste do Evolução Clínica termina em **{{data_fim_teste}}**.\n\n{{bloco_progresso_teste}}\n\nAinda dá tempo de explorar os recursos disponíveis e perceber como eles podem apoiar a organização dos seus registros no dia a dia.\n\nPara manter o acesso após o encerramento do teste, conheça os planos e escolha a opção mais adequada à sua rotina profissional.'
WHERE step_key = 'conditional_trial_expiring_3d'
  AND campaign_id = (SELECT id FROM public.lifecycle_campaigns WHERE key = 'conditional_lifecycle_messages');
