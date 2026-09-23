-- Phase B.1: persistent prepare/direct-upload/finalize coordination.
-- Upload sessions are not definitive audio_assets until server-side finalize.

CREATE TABLE IF NOT EXISTS public.audio_asset_upload_sessions (
  audio_asset_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL
    REFERENCES public.professionals(id) ON DELETE CASCADE,
  evolution_id uuid NOT NULL
    REFERENCES public.evolutions(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  creation_request_id text NOT NULL,
  file_name text NOT NULL,
  declared_mime_type text NOT NULL,
  declared_file_size bigint NOT NULL,
  status text NOT NULL DEFAULT 'prepared',
  resolved_asset_id uuid
    REFERENCES public.audio_assets(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT audio_asset_upload_sessions_path_key UNIQUE (storage_path),
  CONSTRAINT audio_asset_upload_sessions_request_key UNIQUE (evolution_id, creation_request_id),
  CONSTRAINT audio_asset_upload_sessions_status_check
    CHECK (status IN ('prepared', 'finalized', 'reused')),
  CONSTRAINT audio_asset_upload_sessions_request_check
    CHECK (length(btrim(creation_request_id)) BETWEEN 1 AND 200),
  CONSTRAINT audio_asset_upload_sessions_file_name_check
    CHECK (length(btrim(file_name)) BETWEEN 1 AND 255),
  CONSTRAINT audio_asset_upload_sessions_mime_check
    CHECK (declared_mime_type IN ('audio/webm', 'audio/ogg', 'audio/wav', 'audio/mpeg', 'audio/mp4', 'audio/aac')),
  CONSTRAINT audio_asset_upload_sessions_size_check
    CHECK (declared_file_size > 0 AND declared_file_size <= 62914560)
);

CREATE INDEX IF NOT EXISTS audio_asset_upload_sessions_expiry_idx
  ON public.audio_asset_upload_sessions (status, expires_at);

CREATE OR REPLACE FUNCTION private.set_audio_asset_upload_sessions_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.set_audio_asset_upload_sessions_updated_at() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.set_audio_asset_upload_sessions_updated_at() TO service_role;

DROP TRIGGER IF EXISTS audio_asset_upload_sessions_touch_updated_at ON public.audio_asset_upload_sessions;
CREATE TRIGGER audio_asset_upload_sessions_touch_updated_at
  BEFORE UPDATE ON public.audio_asset_upload_sessions
  FOR EACH ROW
  EXECUTE FUNCTION private.set_audio_asset_upload_sessions_updated_at();

ALTER TABLE public.audio_asset_upload_sessions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.audio_asset_upload_sessions FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.audio_asset_upload_sessions TO service_role;
