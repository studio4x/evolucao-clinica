-- Phase D: atomic lifecycle for processing one persistent audio asset.
-- The legacy /api/ai/transcribe flow and Phase C budget RPC remain unchanged.

CREATE OR REPLACE FUNCTION public.claim_audio_asset_processing(
  p_audio_asset_id uuid,
  p_professional_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_asset_status text;
  v_evolution_professional_id uuid;
  v_evolution_status text;
BEGIN
  SELECT
    asset.transcription_status,
    evolution.professional_id,
    evolution.status
    INTO
      v_asset_status,
      v_evolution_professional_id,
      v_evolution_status
  FROM public.audio_assets AS asset
  JOIN public.evolutions AS evolution ON evolution.id = asset.evolution_id
  WHERE asset.id = p_audio_asset_id
  FOR UPDATE OF asset, evolution;

  IF NOT FOUND THEN
    RETURN 'asset_not_found';
  END IF;

  IF v_evolution_professional_id IS DISTINCT FROM p_professional_id THEN
    RETURN 'not_authorized';
  END IF;

  IF v_evolution_status = 'signed' THEN
    RETURN 'signed';
  END IF;

  IF v_asset_status = 'completed' THEN
    RETURN 'already_completed';
  END IF;

  IF v_asset_status = 'processing' THEN
    RETURN 'already_processing';
  END IF;

  IF v_asset_status NOT IN ('pending', 'failed') THEN
    RETURN 'asset_invalid';
  END IF;

  UPDATE public.audio_assets
     SET transcription_status = 'processing',
         error_message = NULL
   WHERE id = p_audio_asset_id;

  RETURN 'claimed';
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_audio_asset_processing(
  p_audio_asset_id uuid,
  p_reservation_id uuid,
  p_professional_id uuid,
  p_transcription_text text
)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_evolution_professional_id uuid;
  v_reservation_asset_id uuid;
  v_reservation_professional_id uuid;
  v_reservation_status text;
BEGIN
  IF p_transcription_text IS NULL OR btrim(p_transcription_text) = '' THEN
    RETURN 'transcription_empty';
  END IF;

  SELECT evolution.professional_id
    INTO v_evolution_professional_id
  FROM public.audio_assets AS asset
  JOIN public.evolutions AS evolution ON evolution.id = asset.evolution_id
  WHERE asset.id = p_audio_asset_id
  FOR UPDATE OF asset, evolution;

  IF NOT FOUND THEN
    RETURN 'asset_not_found';
  END IF;

  IF v_evolution_professional_id IS DISTINCT FROM p_professional_id THEN
    RETURN 'not_authorized';
  END IF;

  SELECT reservation.audio_asset_id, reservation.professional_id, reservation.status
    INTO v_reservation_asset_id, v_reservation_professional_id, v_reservation_status
  FROM public.evolution_audio_budget_reservations AS reservation
  WHERE reservation.reservation_id = p_reservation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'reservation_not_found';
  END IF;

  IF v_reservation_asset_id IS DISTINCT FROM p_audio_asset_id
     OR v_reservation_professional_id IS DISTINCT FROM p_professional_id THEN
    RETURN 'reservation_mismatch';
  END IF;

  IF v_reservation_status NOT IN ('pending', 'completed') THEN
    RETURN 'reservation_invalid';
  END IF;

  UPDATE public.audio_assets
     SET transcription_status = 'completed',
         transcription_text = p_transcription_text,
         error_message = NULL
   WHERE id = p_audio_asset_id;

  IF v_reservation_status = 'pending' THEN
    UPDATE public.evolution_audio_budget_reservations
       SET status = 'completed'
     WHERE reservation_id = p_reservation_id;
  END IF;

  RETURN 'completed';
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_audio_asset_processing(
  p_audio_asset_id uuid,
  p_professional_id uuid,
  p_reservation_id uuid,
  p_error_message text
)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_evolution_professional_id uuid;
  v_safe_error_message text;
BEGIN
  SELECT evolution.professional_id
    INTO v_evolution_professional_id
  FROM public.audio_assets AS asset
  JOIN public.evolutions AS evolution ON evolution.id = asset.evolution_id
  WHERE asset.id = p_audio_asset_id
  FOR UPDATE OF asset, evolution;

  IF NOT FOUND THEN
    RETURN 'asset_not_found';
  END IF;

  IF v_evolution_professional_id IS DISTINCT FROM p_professional_id THEN
    RETURN 'not_authorized';
  END IF;

  v_safe_error_message := left(
    regexp_replace(coalesce(p_error_message, 'Falha ao processar o asset de áudio.'), '[\r\n]+', ' ', 'g'),
    240
  );

  UPDATE public.audio_assets
     SET transcription_status = 'failed',
         error_message = v_safe_error_message
   WHERE id = p_audio_asset_id;

  DELETE FROM public.evolution_audio_budget_reservations
   WHERE professional_id = p_professional_id
     AND audio_asset_id = p_audio_asset_id
     AND status = 'pending'
     AND (p_reservation_id IS NULL OR reservation_id = p_reservation_id);

  RETURN 'failed';
END;
$$;

COMMENT ON FUNCTION public.claim_audio_asset_processing(uuid, uuid)
  IS 'Phase D atomic claim: pending or failed audio asset to processing.';
COMMENT ON FUNCTION public.complete_audio_asset_processing(uuid, uuid, uuid, text)
  IS 'Phase D atomic success: persist audio asset transcription and complete its asset reservation.';
COMMENT ON FUNCTION public.fail_audio_asset_processing(uuid, uuid, uuid, text)
  IS 'Phase D failure: persist a sanitized error and release only the pending asset reservation for this attempt.';

REVOKE ALL ON FUNCTION public.claim_audio_asset_processing(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_audio_asset_processing(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_audio_asset_processing(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_audio_asset_processing(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_audio_asset_processing(uuid, uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_audio_asset_processing(uuid, uuid, uuid, text) TO service_role;
