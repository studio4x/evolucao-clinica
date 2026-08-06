CREATE TABLE IF NOT EXISTS public.email_templates (
  key text PRIMARY KEY,
  label text NOT NULL,
  source text NOT NULL,
  subject_template text NOT NULL,
  preheader_template text,
  body_template text NOT NULL,
  cta_label_template text,
  sort_order integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_templates_admin_manage ON public.email_templates;
CREATE POLICY email_templates_admin_manage
  ON public.email_templates
  FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

DROP TRIGGER IF EXISTS set_email_templates_updated_at ON public.email_templates;
CREATE TRIGGER set_email_templates_updated_at
  BEFORE UPDATE ON public.email_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.email_templates (
  key, label, source, subject_template, preheader_template, body_template, cta_label_template, sort_order
) VALUES
  (
    'welcome-pending',
    'Boas-vindas - cadastro em análise',
    'Cadastro de profissional',
    'Bem-vindo(a) à Evolução Clínica',
    'Seu cadastro está em análise',
    'Você já faz parte da plataforma. O próximo passo é a liberação do seu acesso por um administrador.',
    'Acessar a plataforma',
    10
  ),
  (
    'welcome-active',
    'Boas-vindas - conta liberada',
    'Cadastro de profissional',
    'Sua conta foi criada com sucesso',
    'Sua conta já está liberada',
    'Sua conta foi criada com sucesso e você já pode entrar na plataforma para começar a usar os recursos.',
    'Acessar a plataforma',
    20
  ),
  (
    'platform-notification',
    'Notificação administrativa',
    'Central de notificações',
    '{{icone}} {{titulo}}',
    'Notificação do Sistema',
    'Olá, {{nome}}!\n\n{{conteudo}}',
    'Ver no Aplicativo',
    30
  ),
  (
    'trial-expiration',
    'Término do período gratuito',
    'Expiração do trial',
    'Seu teste gratuito de 7 dias terminou',
    'Expirou em {{data_fim_teste}}',
    'Olá, {{nome}}.\n\nSeu período de teste gratuito de {{dias_de_teste}} dias terminou em {{data_fim_teste}}. O acesso completo à plataforma foi encerrado até a contratação de um plano.',
    'Assinar um plano agora',
    40
  ),
  (
    'subscription-success',
    'Assinatura confirmada',
    'Pagamento aprovado',
    '[Evolução Clínica] Assinatura confirmada - {{plano}}',
    'Processada com {{forma_de_pagamento}}',
    'Olá, {{nome}}.\n\nSeu pedido foi processado com sucesso usando {{forma_de_pagamento}}. Boas-vindas ao {{plano}}.',
    NULL,
    50
  ),
  (
    'subscription-failure',
    'Falha no processamento da assinatura',
    'Pagamento não aprovado',
    '[Evolução Clínica] Falha ao processar sua assinatura - {{plano}}',
    'Tentativa via {{forma_de_pagamento}}',
    'Olá, {{nome}}.\n\nNão foi possível concluir a cobrança via {{forma_de_pagamento}}. {{motivo_da_falha}}',
    NULL,
    60
  ),
  (
    'report-delivery',
    'Envio de relatório ou PDI',
    'Relatórios do paciente',
    '{{assunto}}',
    'Paciente: {{paciente}}',
    '{{conteudo}}',
    'Visualizar PDF Assinado',
    70
  )
ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE public.email_templates IS 'Modelos de e-mails transacionais editáveis exclusivamente por administradores.';
