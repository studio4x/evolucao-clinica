ALTER TABLE public.support_ai_settings
  ADD COLUMN IF NOT EXISTS triage_enabled boolean NOT NULL DEFAULT false;

UPDATE public.support_ai_settings
SET
  triage_enabled = CASE
    WHEN mode = 'triage' THEN enabled
    ELSE triage_enabled
  END,
  enabled = CASE
    WHEN mode = 'triage' THEN false
    ELSE enabled
  END,
  mode = CASE
    WHEN mode = 'triage' THEN 'draft'
    ELSE mode
  END,
  intro_message = CASE
    WHEN mode = 'triage' THEN 'Olá! Recebemos sua solicitação e ela já está com nossa equipe.'
    ELSE intro_message
  END,
  updated_at = now()
WHERE id = 'default';
