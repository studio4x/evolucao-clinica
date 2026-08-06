-- Auditoria administrativa genérica e reset atômico de uma publicação sent.
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  actor_id uuid REFERENCES public.professionals(id) ON DELETE SET NULL,
  target_type text NOT NULL,
  target_id uuid,
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_audit_logs_event_created_idx ON public.admin_audit_logs(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_logs_target_idx ON public.admin_audit_logs(target_type, target_id);
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_audit_logs FROM anon, authenticated;
GRANT ALL ON public.admin_audit_logs TO service_role;

CREATE OR REPLACE FUNCTION public.reset_journey_whatsapp_sent_publication(p_publication_id uuid, p_actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_publication public.journey_whatsapp_publications%ROWTYPE; v_content public.journey_contents%ROWTYPE; v_journey public.journeys%ROWTYPE;
BEGIN
  SELECT * INTO v_publication FROM public.journey_whatsapp_publications WHERE id = p_publication_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('code', 'not_found'); END IF;
  IF v_publication.status <> 'sent' THEN RETURN jsonb_build_object('code', 'invalid_status'); END IF;
  IF v_publication.destination_key <> 'jornada-15-dias-operador-evolucao-clinica' THEN RETURN jsonb_build_object('code', 'invalid_destination'); END IF;
  IF v_publication.provider IS NULL OR v_publication.provider NOT IN ('evolution', 'manual') THEN RETURN jsonb_build_object('code', 'invalid_provider'); END IF;
  IF v_publication.claimed_at IS NOT NULL OR v_publication.claim_expires_at IS NOT NULL OR v_publication.claimed_by IS NOT NULL THEN RETURN jsonb_build_object('code', 'active_claim'); END IF;
  SELECT * INTO v_content FROM public.journey_contents WHERE id = v_publication.journey_content_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('code', 'invalid_content'); END IF;
  SELECT * INTO v_journey FROM public.journeys WHERE id = v_content.journey_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('code', 'invalid_journey'); END IF;
  INSERT INTO public.admin_audit_logs (event_type, actor_id, target_type, target_id, reason, metadata)
  VALUES ('journey_whatsapp_sent_reset', p_actor_id, 'journey_whatsapp_publication', v_publication.id, 'manual_admin_test_reset', jsonb_build_object(
    'publication_id', v_publication.id, 'journey_content_id', v_publication.journey_content_id, 'journey_id', v_journey.id,
    'destination_key', v_publication.destination_key, 'previous_status', v_publication.status, 'previous_attempts', v_publication.attempts,
    'provider', v_publication.provider, 'provider_message_id', v_publication.provider_message_id, 'published_at', v_publication.published_at,
    'editorial_status', v_content.publication_status));
  DELETE FROM public.journey_whatsapp_publications WHERE id = v_publication.id;
  RETURN jsonb_build_object('code', 'reset', 'publication_id', v_publication.id, 'journey_content_id', v_content.id,
    'journey_id', v_journey.id, 'editorial_status', v_content.publication_status, 'day_number', v_content.day_number);
END; $$;
REVOKE ALL ON FUNCTION public.reset_journey_whatsapp_sent_publication(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_journey_whatsapp_sent_publication(uuid, uuid) TO service_role;
