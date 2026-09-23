-- Phase C: canonical budget admission by persistent audio_asset_id.
-- The existing audio_key-based function and ledger rows remain unchanged.

ALTER TABLE public.evolution_audio_budget_reservations
  ADD COLUMN audio_asset_id uuid NULL
    REFERENCES public.audio_assets(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX evolution_audio_budget_asset_key_idx
  ON public.evolution_audio_budget_reservations (professional_id, evolution_id, audio_asset_id)
  WHERE audio_asset_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.reserve_evolution_audio_asset(
  p_audio_asset_id uuid,
  p_professional_id uuid,
  p_limit_seconds integer,
  p_reservation_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_evolution_id uuid;
  v_evolution_professional_id uuid;
  v_duration_seconds integer;
  v_legacy_duration_seconds numeric;
  v_evolution_status text;
  v_existing_status text;
  v_current_seconds integer;
BEGIN
  IF p_audio_asset_id IS NULL
     OR p_professional_id IS NULL
     OR p_reservation_id IS NULL
     OR p_limit_seconds IS NULL
     OR p_limit_seconds <= 0 THEN
    RETURN 'rejected';
  END IF;

  SELECT
    asset.evolution_id,
    asset.duration_seconds,
    evolution.professional_id,
    evolution.status,
    COALESCE(evolution.audio_duration_seconds, 0)
    INTO
      v_evolution_id,
      v_duration_seconds,
      v_evolution_professional_id,
      v_evolution_status,
      v_legacy_duration_seconds
  FROM public.audio_assets AS asset
  JOIN public.evolutions AS evolution ON evolution.id = asset.evolution_id
  WHERE asset.id = p_audio_asset_id;

  IF NOT FOUND THEN
    RETURN 'asset_not_found';
  END IF;

  IF v_evolution_professional_id IS DISTINCT FROM p_professional_id THEN
    RETURN 'not_authorized';
  END IF;

  IF v_duration_seconds IS NULL OR v_duration_seconds <= 0 THEN
    RETURN 'asset_invalid';
  END IF;

  -- Serialize every asset admission for the same professional/evolution pair.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_professional_id::text || ':' || v_evolution_id::text, 0)
  );

  DELETE FROM public.evolution_audio_budget_reservations
   WHERE professional_id = p_professional_id
     AND evolution_id = v_evolution_id
     AND status = 'pending'
     AND expires_at < timezone('utc'::text, now());

  -- Positive legacy duration means this evolution has not been assetized yet.
  IF v_legacy_duration_seconds > 0 THEN
    RETURN 'legacy_unsupported';
  END IF;

  -- A NULL asset id identifies any pre-Phase-C ledger row. Never mix ledgers.
  IF EXISTS (
    SELECT 1
      FROM public.evolution_audio_budget_reservations AS legacy_reservation
     WHERE legacy_reservation.professional_id = p_professional_id
       AND legacy_reservation.evolution_id = v_evolution_id
       AND legacy_reservation.audio_asset_id IS NULL
  ) THEN
    RETURN 'legacy_unsupported';
  END IF;

  SELECT reservation.status
    INTO v_existing_status
    FROM public.evolution_audio_budget_reservations AS reservation
   WHERE reservation.professional_id = p_professional_id
     AND reservation.evolution_id = v_evolution_id
     AND reservation.audio_asset_id = p_audio_asset_id;

  IF FOUND THEN
    RETURN 'existing_' || v_existing_status;
  END IF;

  IF v_evolution_status = 'signed' THEN
    RETURN 'signed';
  END IF;

  INSERT INTO public.evolution_audio_budget_reservations (
    reservation_id,
    evolution_id,
    professional_id,
    audio_asset_id,
    audio_key,
    duration_seconds,
    status
  ) VALUES (
    p_reservation_id,
    v_evolution_id,
    p_professional_id,
    p_audio_asset_id,
    'asset:' || p_audio_asset_id::text,
    v_duration_seconds,
    'pending'
  );

  SELECT COALESCE(SUM(reservation.duration_seconds), 0)::integer
    INTO v_current_seconds
    FROM public.evolution_audio_budget_reservations AS reservation
   WHERE reservation.professional_id = p_professional_id
     AND reservation.evolution_id = v_evolution_id
     AND reservation.audio_asset_id IS NOT NULL
     AND (
       reservation.status = 'completed'
       OR reservation.expires_at >= timezone('utc'::text, now())
     );

  IF v_current_seconds > p_limit_seconds THEN
    DELETE FROM public.evolution_audio_budget_reservations
     WHERE reservation_id = p_reservation_id
       AND professional_id = p_professional_id;
    RETURN 'rejected';
  END IF;

  RETURN 'reserved';
END;
$$;

COMMENT ON FUNCTION public.reserve_evolution_audio_asset(uuid, uuid, integer, uuid)
  IS 'Phase C asset-based budget admission. Returns reserved, rejected, existing_pending, existing_completed, legacy_unsupported, signed, asset_not_found, not_authorized, or asset_invalid.';

REVOKE ALL ON FUNCTION public.reserve_evolution_audio_asset(uuid, uuid, integer, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_evolution_audio_asset(uuid, uuid, integer, uuid) TO service_role;
