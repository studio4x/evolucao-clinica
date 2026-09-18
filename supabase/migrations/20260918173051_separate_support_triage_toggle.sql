ALTER TABLE public.support_ai_settings
  ADD COLUMN IF NOT EXISTS triage_enabled boolean NOT NULL DEFAULT false;

-- Preserve the legacy triage state during rolling deployments: the old API
-- continues to read enabled + mode, while the new API reads triage_enabled.
UPDATE public.support_ai_settings
SET
  triage_enabled = CASE
    WHEN mode = 'triage' THEN enabled
    ELSE triage_enabled
  END,
  intro_message = CASE
    WHEN mode = 'triage' THEN 'Olá! Recebemos sua solicitação e ela já está com nossa equipe. Vamos analisar o que você enviou e responder por aqui dentro do prazo de atendimento previsto para o seu plano.'
    ELSE intro_message
  END,
  updated_at = now()
WHERE id = 'default';
