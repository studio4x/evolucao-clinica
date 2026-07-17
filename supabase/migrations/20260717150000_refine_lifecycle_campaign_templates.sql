-- Alinha as campanhas lifecycle aos e-mails que já são enviados pela plataforma.
-- Mantemos somente modelos complementares, evitando repetir mensagens transacionais,
-- avisos de trial, reativação por inatividade e coleta de motivo de cancelamento.

-- Estas campanhas foram criadas como placeholders e não possuem passos nem matrículas.
-- Removê-las elimina os cards vazios do painel sem apagar uma configuração já utilizada.
DELETE FROM public.lifecycle_campaigns c
WHERE c.key IN ('inactive_user_reactivation', 'trial_conversion', 'cancellation_feedback')
  AND NOT EXISTS (
    SELECT 1
    FROM public.lifecycle_steps s
    WHERE s.campaign_id = c.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.lifecycle_enrollments e
    WHERE e.campaign_id = c.id
  );

-- A confirmação de assinatura já é enviada por /api/subscriptions/payment-email.
-- O aviso de trial expirado já é enviado pelo cron /api/cron/send-trial-expiration-notices.
-- Desativamos apenas as regras duplicadas; as recuperações posteriores do trial continuam ativas.
UPDATE public.lifecycle_rules
SET enabled = false,
    updated_at = now()
WHERE rule_key IN ('subscription_started', 'trial_expired');

-- Modelos de adoção pós-assinatura: conteúdos de uso contínuo, sem repetir boas-vindas,
-- vencimento do trial, reativação por inatividade ou confirmação de pagamento.
INSERT INTO public.lifecycle_steps (
  campaign_id,
  step_key,
  position,
  day_offset,
  category,
  priority,
  status,
  subject_template,
  preheader_template,
  body_markdown,
  cta_label_template,
  cta_route_template,
  fallback_cta_route
)
SELECT c.id, v.step_key, v.position, v.day_offset, v.category, v.priority, 'draft',
       v.subject_template, v.preheader_template, v.body_markdown,
       v.cta_label_template, v.cta_route_template, v.fallback_cta_route
FROM public.lifecycle_campaigns c
CROSS JOIN (VALUES
  (
    'post_subscription_checkin',
    1,
    7,
    'adoption',
    55,
    'Ajuste a plataforma à sua rotina',
    'Uma pequena revisão pode deixar seus registros mais simples.',
    E'Olá, {{primeiro_nome}}!\n\nDepois dos primeiros dias com sua assinatura, vale observar como a plataforma se encaixa no seu atendimento.\n\nEscolha uma rotina real e revise o caminho completo: cadastrar o paciente, consultar o histórico, gravar o resumo e conferir a evolução antes de utilizá-la. Se algo estiver diferente do que você precisa, ajuste seu fluxo ou fale com nossa equipe.\n\nA inteligência artificial apoia a organização; a conferência profissional continua essencial.',
    'Revisar minha rotina',
    '/painel/dashboard',
    '/painel/dashboard'
  ),
  (
    'support_for_adoption',
    2,
    21,
    'adoption',
    55,
    'Existe algum recurso que você ainda não experimentou?',
    'Conte com a equipe para encontrar o melhor próximo passo.',
    E'Olá, {{primeiro_nome}}!\n\nSua assinatura foi pensada para acompanhar a rotina, não apenas uma tarefa isolada. Se você ainda não explorou algum recurso disponível no seu plano, acesse o painel e veja o que pode fazer sentido para o seu trabalho.\n\nSe surgir alguma dúvida sobre pacientes, evoluções, documentos ou recursos do plano, envie uma mensagem à equipe. Uma orientação rápida pode ajudar a adaptar o uso da plataforma à sua rotina.',
    'Falar com o suporte',
    '/painel/support',
    '/painel/dashboard'
  )
) AS v(step_key, position, day_offset, category, priority, subject_template, preheader_template, body_markdown, cta_label_template, cta_route_template, fallback_cta_route)
WHERE c.key = 'customer_adoption'
ON CONFLICT (campaign_id, step_key) DO NOTHING;
