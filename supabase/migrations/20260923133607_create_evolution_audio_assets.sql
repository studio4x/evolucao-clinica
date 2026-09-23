-- Phase A/B: identidade persistente e upload server-side de audio assets.
-- O fluxo atual de /api/ai/transcribe permanece inalterado nesta migration.

CREATE TABLE IF NOT EXISTS public.audio_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evolution_id uuid NOT NULL
    REFERENCES public.evolutions(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  duration_seconds integer NOT NULL,
  content_hash text NOT NULL,
  mime_type text NOT NULL,
  transcription_status text NOT NULL DEFAULT 'pending',
  transcription_text text,
  error_message text,
  creation_request_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT audio_assets_duration_positive
    CHECK (duration_seconds > 0),
  CONSTRAINT audio_assets_status_check
    CHECK (transcription_status IN ('pending', 'processing', 'completed', 'failed')),
  CONSTRAINT audio_assets_hash_check
    CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT audio_assets_mime_type_check
    CHECK (mime_type IN ('audio/webm', 'audio/ogg', 'audio/wav', 'audio/mpeg', 'audio/mp4', 'audio/aac')),
  CONSTRAINT audio_assets_creation_request_check
    CHECK (length(btrim(creation_request_id)) BETWEEN 1 AND 200),
  CONSTRAINT audio_assets_storage_path_key UNIQUE (storage_path),
  CONSTRAINT audio_assets_evolution_hash_key UNIQUE (evolution_id, content_hash),
  CONSTRAINT audio_assets_evolution_request_key UNIQUE (evolution_id, creation_request_id)
);

CREATE INDEX IF NOT EXISTS audio_assets_evolution_status_idx
  ON public.audio_assets (evolution_id, transcription_status);

CREATE OR REPLACE FUNCTION private.set_audio_assets_updated_at()
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

REVOKE ALL ON FUNCTION private.set_audio_assets_updated_at() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.set_audio_assets_updated_at() TO service_role;

DROP TRIGGER IF EXISTS audio_assets_touch_updated_at ON public.audio_assets;
CREATE TRIGGER audio_assets_touch_updated_at
  BEFORE UPDATE ON public.audio_assets
  FOR EACH ROW
  EXECUTE FUNCTION private.set_audio_assets_updated_at();

ALTER TABLE public.audio_assets ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.audio_assets FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.audio_assets TO service_role;

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'evolution-audio',
  'evolution-audio',
  false,
  62914560,
  ARRAY['audio/webm', 'audio/ogg', 'audio/wav', 'audio/mpeg', 'audio/mp4', 'audio/aac']::text[]
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;
