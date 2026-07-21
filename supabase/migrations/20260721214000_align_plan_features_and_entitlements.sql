-- Alinha a comunicação comercial dos planos às funcionalidades e permissões reais.

UPDATE public.plans
SET
  features = ARRAY[
    'Pacientes ilimitados',
    'Gravação e transcrição de áudio com uso justo de até 20 horas por mês',
    'Evoluções clínicas e prontuários com apoio de IA',
    'Integração com Google Docs',
    'Relatórios clínicos e PDI com IA',
    'Pesquisa inteligente no histórico do paciente',
    'Assinatura e fechamento imutável de evoluções e relatórios',
    'Compartilhamento de relatórios por WhatsApp e e-mail',
    'Impressão de prontuários em PDF com filtro por período',
    'Lembretes de aniversário via WhatsApp',
    'Suporte via ticket em até 24 horas úteis (12 horas para pagamentos)'
  ],
  updated_at = now()
WHERE id = 'monthly';

UPDATE public.plans
SET
  features = ARRAY[
    'Tudo do plano mensal',
    'Economia de 57% em relação a 12 mensalidades',
    'Suporte VIP via ticket com primeira resposta em até 2 horas úteis',
    'Migração assistida de prontuários (PDF, Word e Excel)',
    'Logotipo personalizado em relatórios e impressões',
    'Backup completo e restauração pelo Google Drive (manual ou automático)'
  ],
  discount_text = '57% OFF',
  updated_at = now()
WHERE id = 'yearly';

-- A migração de prontuários continua exclusiva do plano anual, mas agora
-- também exige que a assinatura esteja ativa e dentro do período contratado.
DROP POLICY IF EXISTS "migration_requests_insert_own" ON public.migration_requests;
CREATE POLICY "migration_requests_insert_own"
ON public.migration_requests
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.professionals
    WHERE id = auth.uid()
      AND (
        role = 'admin'
        OR subscription_plan = 'none'
        OR (
          subscription_plan = 'yearly'
          AND subscription_status IN ('active', 'trialing')
          AND (subscription_ends_at IS NULL OR subscription_ends_at >= now())
        )
      )
  )
);

-- O SLA comercial deve acompanhar a situação vigente da assinatura, não
-- apenas o último identificador de plano salvo no perfil.
CREATE OR REPLACE FUNCTION public.apply_support_ticket_sla_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  response_hours integer;
  user_plan text;
  user_status text;
  user_ends_at timestamptz;
  user_role text;
  has_current_entitlement boolean;
BEGIN
  SELECT
    COALESCE(subscription_plan, 'trial'),
    subscription_status,
    subscription_ends_at,
    COALESCE(role, 'therapist')
  INTO user_plan, user_status, user_ends_at, user_role
  FROM public.professionals
  WHERE id = new.user_id;

  has_current_entitlement :=
    user_role = 'admin'
    OR user_plan = 'none'
    OR (
      user_status IN ('active', 'trialing')
      AND (user_ends_at IS NULL OR user_ends_at >= now())
    );

  IF has_current_entitlement AND (user_plan = 'yearly' OR user_plan = 'none' OR user_role = 'admin') THEN
    response_hours := 2;
    new.priority := 'high';
  ELSIF has_current_entitlement AND user_plan = 'monthly' THEN
    IF new.category = 'payment' THEN
      response_hours := 12;
    ELSE
      response_hours := 24;
    END IF;
    new.priority := 'medium';
  ELSE
    response_hours := 48;
    new.priority := 'low';
  END IF;

  new.sla_policy_key := new.category;

  IF tg_op = 'INSERT'
    OR new.category IS DISTINCT FROM old.category
    OR new.created_at IS DISTINCT FROM old.created_at
    OR new.first_response_due_at IS NULL THEN
    new.first_response_due_at := public.add_support_business_minutes(coalesce(new.created_at, now()), response_hours * 60);
  END IF;

  new.sla_status := public.compute_support_sla_status(new.first_response_due_at, new.first_response_at);
  RETURN new;
END;
$$;

-- Remove a promessa de certificação externa: o recurso implementado registra
-- autoria, momento e hash de integridade e fecha o documento contra alterações.
UPDATE public.faq_questions
SET
  question = 'Como funciona a assinatura e o fechamento de documentos?',
  answer = 'Ao fechar uma evolução ou relatório, o sistema registra autoria, data, hora, IP e um hash de integridade. Depois disso, o documento não pode ser alterado nem excluído pela plataforma. Esse registro reforça a rastreabilidade do prontuário, mas não substitui um certificado digital ICP-Brasil quando ele for legalmente exigido.'
WHERE question = 'O que é a Assinatura Digital de Documentos com Proteção Legal?';
