-- Preserva a escolha inicial do onboarding separadamente do modo atual.
-- O modo atual pode mudar de explore para guided quando o profissional retoma
-- a configuração; a escolha inicial não deve ser reescrita por essa transição.

ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS onboarding_initial_mode text;

ALTER TABLE public.professionals
  DROP CONSTRAINT IF EXISTS professionals_onboarding_initial_mode_check,
  ADD CONSTRAINT professionals_onboarding_initial_mode_check
    CHECK (onboarding_initial_mode IS NULL OR onboarding_initial_mode IN ('guided', 'explore'));

WITH first_choices AS (
  SELECT DISTINCT ON (user_id)
    user_id,
    CASE event_name
      WHEN 'onboarding_choice_guided' THEN 'guided'
      WHEN 'onboarding_choice_explore' THEN 'explore'
    END AS initial_mode
  FROM public.lifecycle_events
  WHERE event_name IN ('onboarding_choice_guided', 'onboarding_choice_explore')
  ORDER BY user_id, occurred_at ASC, id ASC
)
UPDATE public.professionals AS professional
SET onboarding_initial_mode = first_choices.initial_mode
FROM first_choices
WHERE professional.id = first_choices.user_id
  AND professional.onboarding_initial_mode IS NULL;

-- Se a telemetria não foi entregue, o timestamp explícito da escolha ainda é
-- evidência suficiente. Registros legados sem timestamp permanecem desconhecidos.
UPDATE public.professionals
SET onboarding_initial_mode = onboarding_mode
WHERE onboarding_initial_mode IS NULL
  AND onboarding_choice_at IS NOT NULL
  AND onboarding_mode IN ('guided', 'explore');

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;

CREATE OR REPLACE FUNCTION private.preserve_professional_onboarding_initial_mode()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.onboarding_initial_mode := CASE
      WHEN NEW.onboarding_choice_at IS NOT NULL
        AND NEW.onboarding_mode IN ('guided', 'explore')
      THEN NEW.onboarding_mode
      ELSE NULL
    END;
    RETURN NEW;
  END IF;

  IF OLD.onboarding_initial_mode IS NOT NULL THEN
    NEW.onboarding_initial_mode := OLD.onboarding_initial_mode;
  ELSIF OLD.onboarding_choice_at IS NULL
    AND NEW.onboarding_choice_at IS NOT NULL
    AND NEW.onboarding_mode IN ('guided', 'explore') THEN
    NEW.onboarding_initial_mode := NEW.onboarding_mode;
  ELSE
    NEW.onboarding_initial_mode := OLD.onboarding_initial_mode;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.preserve_professional_onboarding_initial_mode()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS preserve_professional_onboarding_initial_mode
  ON public.professionals;
CREATE TRIGGER preserve_professional_onboarding_initial_mode
BEFORE INSERT OR UPDATE OF onboarding_initial_mode, onboarding_mode, onboarding_choice_at
ON public.professionals
FOR EACH ROW
EXECUTE FUNCTION private.preserve_professional_onboarding_initial_mode();

COMMENT ON COLUMN public.professionals.onboarding_initial_mode IS
  'Primeira escolha explícita no onboarding: guided ou explore. Imutável após o registro.';

NOTIFY pgrst, 'reload schema';
