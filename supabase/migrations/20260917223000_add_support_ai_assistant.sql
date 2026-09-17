-- Support AI assistant for support tickets.
-- Safe production default: AI drafts answers for human review.

CREATE TABLE IF NOT EXISTS public.support_ai_settings (
  id text PRIMARY KEY DEFAULT 'default',
  enabled boolean NOT NULL DEFAULT true,
  mode text NOT NULL DEFAULT 'draft',
  intro_message text NOT NULL DEFAULT 'Olá! Recebemos sua mensagem e seu chamado já foi escalado para um atendente da nossa equipe. Ele dará continuidade ao atendimento por aqui assim que possível.',
  system_prompt text NOT NULL DEFAULT 'Você é o assistente de suporte do Evolução Clínica. Responda em português do Brasil, com tom profissional, humano, objetivo e acolhedor. Use somente as informações presentes no chamado e no histórico da conversa. Não invente funcionalidades, preços, políticas, prazos, ações executadas ou informações técnicas que não estejam no contexto. Se faltar informação para responder com segurança, diga claramente que o atendente precisa confirmar. Nunca forneça diagnóstico, conduta clínica ou orientação clínica individualizada. A IA apoia a equipe de suporte e não substitui revisão humana quando o modo exigir aprovação. Responda apenas com o texto que deve ser enviado ao profissional, sem comentários internos, cabeçalhos ou explicações sobre o seu raciocínio.',
  model_override text,
  updated_by uuid REFERENCES public.professionals(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_ai_settings_singleton_check CHECK (id = 'default'),
  CONSTRAINT support_ai_settings_mode_check CHECK (mode IN ('auto_reply', 'triage', 'draft'))
);

INSERT INTO public.support_ai_settings (id, enabled, mode)
VALUES ('default', true, 'draft')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.support_ai_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL UNIQUE REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  source_event_key text NOT NULL,
  content text NOT NULL,
  model text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_ai_drafts_status_check CHECK (status IN ('pending', 'used', 'dismissed'))
);

CREATE TABLE IF NOT EXISTS public.support_ai_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  source_message_id uuid REFERENCES public.support_messages(id) ON DELETE SET NULL,
  event_key text NOT NULL,
  mode text NOT NULL,
  status text NOT NULL DEFAULT 'processing',
  result_type text,
  response_content text,
  model text,
  error_message text,
  requested_by uuid REFERENCES public.professionals(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT support_ai_runs_mode_check CHECK (mode IN ('auto_reply', 'triage', 'draft')),
  CONSTRAINT support_ai_runs_status_check CHECK (status IN ('processing', 'completed', 'skipped', 'error')),
  CONSTRAINT support_ai_runs_result_type_check CHECK (result_type IS NULL OR result_type IN ('auto_reply', 'intro', 'draft')),
  CONSTRAINT support_ai_runs_event_mode_unique UNIQUE (event_key, mode)
);

CREATE INDEX IF NOT EXISTS idx_support_ai_runs_ticket_created
  ON public.support_ai_runs (ticket_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_ai_runs_status
  ON public.support_ai_runs (status, created_at DESC);

CREATE OR REPLACE FUNCTION public.set_support_ai_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  new.updated_at = now();
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS set_support_ai_settings_updated_at ON public.support_ai_settings;
CREATE TRIGGER set_support_ai_settings_updated_at
BEFORE UPDATE ON public.support_ai_settings
FOR EACH ROW EXECUTE FUNCTION public.set_support_ai_updated_at();

DROP TRIGGER IF EXISTS set_support_ai_drafts_updated_at ON public.support_ai_drafts;
CREATE TRIGGER set_support_ai_drafts_updated_at
BEFORE UPDATE ON public.support_ai_drafts
FOR EACH ROW EXECUTE FUNCTION public.set_support_ai_updated_at();

ALTER TABLE public.support_ai_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_ai_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_ai_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "support_ai_settings_admin_select" ON public.support_ai_settings;
CREATE POLICY "support_ai_settings_admin_select"
ON public.support_ai_settings FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS "support_ai_settings_admin_insert" ON public.support_ai_settings;
CREATE POLICY "support_ai_settings_admin_insert"
ON public.support_ai_settings FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS "support_ai_settings_admin_update" ON public.support_ai_settings;
CREATE POLICY "support_ai_settings_admin_update"
ON public.support_ai_settings FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = auth.uid() AND p.role = 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS "support_ai_drafts_admin_select" ON public.support_ai_drafts;
CREATE POLICY "support_ai_drafts_admin_select"
ON public.support_ai_drafts FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS "support_ai_drafts_admin_update" ON public.support_ai_drafts;
CREATE POLICY "support_ai_drafts_admin_update"
ON public.support_ai_drafts FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = auth.uid() AND p.role = 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS "support_ai_runs_admin_select" ON public.support_ai_runs;
CREATE POLICY "support_ai_runs_admin_select"
ON public.support_ai_runs FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = auth.uid() AND p.role = 'admin'));

GRANT SELECT, INSERT, UPDATE ON public.support_ai_settings TO authenticated;
GRANT SELECT, UPDATE ON public.support_ai_drafts TO authenticated;
GRANT SELECT ON public.support_ai_runs TO authenticated;
