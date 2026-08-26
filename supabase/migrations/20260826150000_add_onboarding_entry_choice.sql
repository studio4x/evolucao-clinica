-- Persiste a escolha de entrada e o progresso operacional do onboarding.
-- O booleano onboarding_completed permanece compatível com os fluxos existentes,
-- mas "explorar" deixa de ser confundido com conclusão.

ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS onboarding_status text NOT NULL DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS onboarding_mode text,
  ADD COLUMN IF NOT EXISTS onboarding_current_step text NOT NULL DEFAULT 'intro',
  ADD COLUMN IF NOT EXISTS onboarding_choice_at timestamptz,
  ADD COLUMN IF NOT EXISTS onboarding_deferred_at timestamptz;

ALTER TABLE public.professionals
  DROP CONSTRAINT IF EXISTS professionals_onboarding_status_check,
  ADD CONSTRAINT professionals_onboarding_status_check
    CHECK (onboarding_status IN ('not_started', 'in_progress', 'deferred', 'completed')),
  DROP CONSTRAINT IF EXISTS professionals_onboarding_mode_check,
  ADD CONSTRAINT professionals_onboarding_mode_check
    CHECK (onboarding_mode IS NULL OR onboarding_mode IN ('guided', 'explore')),
  DROP CONSTRAINT IF EXISTS professionals_onboarding_current_step_check,
  ADD CONSTRAINT professionals_onboarding_current_step_check
    CHECK (onboarding_current_step IN ('intro', 'patient', 'evolution', 'agenda', 'complete'));

UPDATE public.professionals
SET onboarding_status = 'completed',
    onboarding_mode = COALESCE(onboarding_mode, 'guided'),
    onboarding_current_step = 'complete'
WHERE onboarding_completed IS TRUE;

CREATE OR REPLACE FUNCTION public.enforce_professional_onboarding_state()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.onboarding_completed IS TRUE OR NEW.onboarding_status = 'completed' THEN
    NEW.onboarding_completed := TRUE;
    NEW.onboarding_status := 'completed';
    NEW.onboarding_current_step := 'complete';
    NEW.onboarding_mode := COALESCE(NEW.onboarding_mode, 'guided');
  ELSIF TG_OP = 'UPDATE'
    AND OLD.onboarding_completed IS TRUE
    AND NEW.onboarding_completed IS FALSE THEN
    NEW.onboarding_status := 'not_started';
    NEW.onboarding_mode := NULL;
    NEW.onboarding_current_step := 'intro';
    NEW.onboarding_choice_at := NULL;
    NEW.onboarding_deferred_at := NULL;
  ELSE
    NEW.onboarding_completed := FALSE;
    IF NEW.onboarding_status = 'deferred' THEN
      NEW.onboarding_mode := 'explore';
      NEW.onboarding_deferred_at := COALESCE(NEW.onboarding_deferred_at, now());
    ELSIF NEW.onboarding_status = 'in_progress' THEN
      NEW.onboarding_mode := COALESCE(NEW.onboarding_mode, 'guided');
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_professional_onboarding_state_trigger ON public.professionals;
CREATE TRIGGER enforce_professional_onboarding_state_trigger
BEFORE INSERT OR UPDATE OF onboarding_completed, onboarding_status, onboarding_mode,
  onboarding_current_step, onboarding_choice_at, onboarding_deferred_at
ON public.professionals
FOR EACH ROW
EXECUTE FUNCTION public.enforce_professional_onboarding_state();

COMMENT ON COLUMN public.professionals.onboarding_status IS
  'Estado operacional: not_started, in_progress, deferred ou completed.';
COMMENT ON COLUMN public.professionals.onboarding_mode IS
  'Escolha inicial do profissional: guided ou explore.';
COMMENT ON COLUMN public.professionals.onboarding_current_step IS
  'Etapa operacional sem dados clínicos: intro, patient, evolution, agenda ou complete.';

REVOKE ALL ON FUNCTION public.enforce_professional_onboarding_state() FROM PUBLIC, anon, authenticated;
