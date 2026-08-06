-- Fila backend-only para publicação da Jornada de 15 Dias.
CREATE TABLE IF NOT EXISTS public.journey_whatsapp_publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_content_id uuid NOT NULL REFERENCES public.journey_contents(id) ON DELETE CASCADE,
  destination_key text NOT NULL,
  destination_jid text,
  scheduled_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'claimed', 'sent', 'failed', 'cancelled')),
  provider text CHECK (provider IS NULL OR provider IN ('manual', 'evolution')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts integer NOT NULL DEFAULT 5 CHECK (max_attempts > 0),
  claimed_at timestamptz,
  claim_expires_at timestamptz,
  claimed_by text,
  published_at timestamptz,
  provider_message_id text,
  last_error_code text,
  last_error_message text,
  next_attempt_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT journey_whatsapp_publications_unique_destination UNIQUE (journey_content_id, destination_key)
);

CREATE INDEX IF NOT EXISTS journey_whatsapp_publications_status_idx ON public.journey_whatsapp_publications(status);
CREATE INDEX IF NOT EXISTS journey_whatsapp_publications_scheduled_at_idx ON public.journey_whatsapp_publications(scheduled_at);
CREATE INDEX IF NOT EXISTS journey_whatsapp_publications_next_attempt_at_idx ON public.journey_whatsapp_publications(next_attempt_at);
CREATE INDEX IF NOT EXISTS journey_whatsapp_publications_content_idx ON public.journey_whatsapp_publications(journey_content_id);
CREATE INDEX IF NOT EXISTS journey_whatsapp_publications_claim_idx
  ON public.journey_whatsapp_publications(destination_key, status, scheduled_at, next_attempt_at);

DROP TRIGGER IF EXISTS set_journey_whatsapp_publications_updated_at ON public.journey_whatsapp_publications;
CREATE TRIGGER set_journey_whatsapp_publications_updated_at
  BEFORE UPDATE ON public.journey_whatsapp_publications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.journey_whatsapp_publications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.journey_whatsapp_publications FROM anon, authenticated;
GRANT ALL ON TABLE public.journey_whatsapp_publications TO service_role;

CREATE OR REPLACE FUNCTION public.sync_journey_whatsapp_publications(p_destination_key text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count integer;
BEGIN
  INSERT INTO public.journey_whatsapp_publications (journey_content_id, destination_key, scheduled_at, status, destination_jid)
  SELECT c.id, p_destination_key,
    make_timestamptz(EXTRACT(YEAR FROM c.publication_date)::integer, EXTRACT(MONTH FROM c.publication_date)::integer,
      EXTRACT(DAY FROM c.publication_date)::integer, EXTRACT(HOUR FROM c.publication_time)::integer,
      EXTRACT(MINUTE FROM c.publication_time)::integer, EXTRACT(SECOND FROM c.publication_time)::double precision,
      COALESCE(NULLIF(j.timezone, ''), 'America/Sao_Paulo')),
    'pending', NULLIF(current_setting('app.journey_destination_jid', true), '')
  FROM public.journey_contents c
  JOIN public.journeys j ON j.id = c.journey_id
  WHERE j.status = 'active' AND c.publication_status <> 'archived'
    AND c.publication_date IS NOT NULL AND c.publication_time IS NOT NULL
    AND NULLIF(btrim(c.whatsapp_message), '') IS NOT NULL
  ON CONFLICT (journey_content_id, destination_key) DO UPDATE SET
    scheduled_at = EXCLUDED.scheduled_at,
    status = CASE WHEN journey_whatsapp_publications.status IN ('sent', 'claimed') THEN journey_whatsapp_publications.status ELSE 'pending' END,
    next_attempt_at = CASE WHEN journey_whatsapp_publications.status IN ('sent', 'claimed') THEN journey_whatsapp_publications.next_attempt_at ELSE NULL END,
    updated_at = now();

  UPDATE public.journey_whatsapp_publications p SET status = 'cancelled', updated_at = now()
  WHERE p.destination_key = p_destination_key AND p.status IN ('pending', 'failed')
    AND EXISTS (SELECT 1 FROM public.journey_contents c JOIN public.journeys j ON j.id = c.journey_id
      WHERE c.id = p.journey_content_id AND (j.status <> 'active' OR c.publication_status = 'archived'
        OR c.publication_date IS NULL OR c.publication_time IS NULL OR NULLIF(btrim(c.whatsapp_message), '') IS NULL));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END; $$;

CREATE OR REPLACE FUNCTION public.claim_journey_whatsapp_publication(
  p_destination_key text, p_worker_id text, p_provider text, p_claim_minutes integer DEFAULT 15)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.journey_whatsapp_publications%ROWTYPE;
BEGIN
  PERFORM public.sync_journey_whatsapp_publications(p_destination_key);
  UPDATE public.journey_whatsapp_publications SET status = 'pending', claimed_at = NULL, claim_expires_at = NULL, claimed_by = NULL,
    next_attempt_at = NULL, updated_at = now()
  WHERE destination_key = p_destination_key AND status = 'claimed' AND claim_expires_at < now();
  SELECT * INTO v_row FROM public.journey_whatsapp_publications
  WHERE destination_key = p_destination_key AND status IN ('pending', 'failed')
    AND scheduled_at <= now() AND (next_attempt_at IS NULL OR next_attempt_at <= now()) AND attempts < max_attempts
  ORDER BY scheduled_at, created_at FOR UPDATE SKIP LOCKED LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('claimed', false, 'publication', NULL); END IF;
  UPDATE public.journey_whatsapp_publications SET status = 'claimed', attempts = attempts + 1,
    claimed_at = now(), claim_expires_at = now() + make_interval(mins => p_claim_minutes), claimed_by = p_worker_id,
    provider = p_provider, updated_at = now() WHERE id = v_row.id RETURNING * INTO v_row;
  RETURN jsonb_build_object('claimed', true, 'publication', to_jsonb(v_row));
END; $$;

REVOKE ALL ON FUNCTION public.sync_journey_whatsapp_publications(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_journey_whatsapp_publication(text, text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_journey_whatsapp_publications(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_journey_whatsapp_publication(text, text, text, integer) TO service_role;
