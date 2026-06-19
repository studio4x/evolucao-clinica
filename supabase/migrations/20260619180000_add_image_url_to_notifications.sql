-- Migration: Add image_url to notifications and setup Storage Bucket
-- Target: Supabase PostgreSQL Database

-- 1. Add image_url column to notifications
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Comment describing the column
COMMENT ON COLUMN public.notifications.image_url IS 'URL da imagem de capa associada a notificacao';

-- 2. Ensure storage schema and buckets table exist (standard in Supabase)
-- Insert the public bucket for notifications
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'notifications', 
    'notifications', 
    true, 
    10485760, -- 10MB limit
    ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

-- 3. Storage Policies for notifications bucket
-- Drop policies if they exist to avoid conflict on retry
DROP POLICY IF EXISTS "Public Access to notifications" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Upload to notifications" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Update to notifications" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Delete from notifications" ON storage.objects;

-- Create policies targeting the specific bucket_id
CREATE POLICY "Public Access to notifications"
ON storage.objects FOR SELECT
USING ( bucket_id = 'notifications' );

CREATE POLICY "Authenticated Upload to notifications"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK ( bucket_id = 'notifications' );

CREATE POLICY "Authenticated Update to notifications"
ON storage.objects FOR UPDATE
TO authenticated
USING ( bucket_id = 'notifications' )
WITH CHECK ( bucket_id = 'notifications' );

CREATE POLICY "Authenticated Delete from notifications"
ON storage.objects FOR DELETE
TO authenticated
USING ( bucket_id = 'notifications' );
