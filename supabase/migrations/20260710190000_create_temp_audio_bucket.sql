-- Create the private bucket used for temporary transcription audio uploads.
-- This bucket is written by the authenticated browser client and consumed/deleted
-- by the backend service role during transcription.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'temp-audio',
  'temp-audio',
  false,
  104857600,
  ARRAY[
    'audio/webm',
    'audio/ogg',
    'audio/wav',
    'audio/mpeg',
    'audio/mp4',
    'audio/x-m4a',
    'audio/aac',
    'application/ogg',
    'application/octet-stream'
  ]
)
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "storage_temp_audio_insert" ON storage.objects;
CREATE POLICY "storage_temp_audio_insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'temp-audio'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
