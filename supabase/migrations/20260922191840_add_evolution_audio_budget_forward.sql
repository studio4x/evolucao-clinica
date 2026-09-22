-- Reserva transacional do orçamento de áudio por evolução.
-- Cada request de transcrição mantém uma reserva após sucesso e a libera em erro.
CREATE TABLE IF NOT EXISTS public.evolution_audio_budget_reservations (
  reservation_id uuid PRIMARY KEY,
  evolution_id uuid NOT NULL,
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  audio_key text NOT NULL,
  duration_seconds integer NOT NULL CHECK (duration_seconds > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
  expires_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()) + interval '15 minutes',
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS evolution_audio_budget_evolution_idx
  ON public.evolution_audio_budget_reservations (professional_id, evolution_id);
CREATE UNIQUE INDEX IF NOT EXISTS evolution_audio_budget_audio_key_idx
  ON public.evolution_audio_budget_reservations (professional_id, evolution_id, audio_key);

ALTER TABLE public.evolution_audio_budget_reservations ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.reserve_evolution_audio_seconds(
  p_evolution_id uuid,
  p_professional_id uuid,
  p_duration_seconds integer,
  p_limit_seconds integer,
  p_reservation_id uuid,
  p_audio_key text
)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  current_seconds integer;
  existing_status text;
  processed_seconds integer := 0;
  evolution_status text;
  existing_reservations integer := 0;
BEGIN
  IF p_duration_seconds <= 0 OR p_limit_seconds <= 0 THEN
    RETURN 'rejected';
  END IF;

  -- Serializa somente requests concorrentes da mesma evolução/profissional.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_professional_id::text || ':' || p_evolution_id::text, 0));

  DELETE FROM public.evolution_audio_budget_reservations
   WHERE professional_id = p_professional_id
     AND evolution_id = p_evolution_id
     AND status = 'pending'
     AND expires_at < timezone('utc'::text, now());

  SELECT status INTO existing_status
    FROM public.evolution_audio_budget_reservations
   WHERE professional_id = p_professional_id
     AND evolution_id = p_evolution_id
     AND audio_key = p_audio_key;

  IF existing_status IS NOT NULL THEN
    RETURN 'existing_' || existing_status;
  END IF;

  INSERT INTO public.evolution_audio_budget_reservations (
    reservation_id, evolution_id, professional_id, audio_key, duration_seconds
  ) VALUES (
    p_reservation_id, p_evolution_id, p_professional_id, p_audio_key, p_duration_seconds
  );

  SELECT count(*)::integer
    INTO existing_reservations
    FROM public.evolution_audio_budget_reservations
   WHERE evolution_id = p_evolution_id
     AND professional_id = p_professional_id;

  SELECT COALESCE(audio_duration_seconds, 0), transcription_status
    INTO processed_seconds, evolution_status
    FROM public.evolutions
   WHERE id = p_evolution_id
     AND professional_id = p_professional_id;

  IF existing_reservations > 0 OR evolution_status IS DISTINCT FROM 'completed' THEN
    processed_seconds := 0;
  END IF;

  SELECT processed_seconds + COALESCE(sum(duration_seconds), 0)
    INTO current_seconds
    FROM public.evolution_audio_budget_reservations
   WHERE evolution_id = p_evolution_id
     AND professional_id = p_professional_id
     AND (status = 'completed' OR expires_at >= timezone('utc'::text, now()));

  IF current_seconds > p_limit_seconds THEN
    DELETE FROM public.evolution_audio_budget_reservations
     WHERE reservation_id = p_reservation_id;
    RETURN 'rejected';
  END IF;

  RETURN 'reserved';
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_evolution_audio_reservation(
  p_reservation_id uuid,
  p_professional_id uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  UPDATE public.evolution_audio_budget_reservations
     SET status = 'completed', expires_at = timezone('utc'::text, now()) + interval '1 year'
   WHERE reservation_id = p_reservation_id
     AND professional_id = p_professional_id
     AND status = 'pending'
  RETURNING true;
$$;

CREATE OR REPLACE FUNCTION public.release_evolution_audio_seconds(
  p_reservation_id uuid,
  p_professional_id uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  DELETE FROM public.evolution_audio_budget_reservations
   WHERE reservation_id = p_reservation_id
     AND professional_id = p_professional_id
  RETURNING true;
$$;

REVOKE ALL ON FUNCTION public.reserve_evolution_audio_seconds(uuid, uuid, integer, integer, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_evolution_audio_seconds(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_evolution_audio_reservation(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_evolution_audio_seconds(uuid, uuid, integer, integer, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_evolution_audio_seconds(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_evolution_audio_reservation(uuid, uuid) TO service_role;
