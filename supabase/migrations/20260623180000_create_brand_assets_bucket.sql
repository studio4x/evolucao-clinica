-- Migration: Create brand assets bucket and insert default settings
-- Target: Supabase PostgreSQL Database

-- 1. Ensure public bucket 'brand' exists in storage
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'brand', 
    'brand', 
    true, 
    10485760, -- 10MB limit
    ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

-- 2. Storage Policies for brand bucket
-- Drop policies if they exist to avoid conflict
DROP POLICY IF EXISTS "Public Access to brand" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Upload to brand" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Update to brand" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Delete from brand" ON storage.objects;

-- Create policies targeting the specific bucket_id
CREATE POLICY "Public Access to brand"
ON storage.objects FOR SELECT
USING ( bucket_id = 'brand' );

CREATE POLICY "Authenticated Upload to brand"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK ( bucket_id = 'brand' );

CREATE POLICY "Authenticated Update to brand"
ON storage.objects FOR UPDATE
TO authenticated
USING ( bucket_id = 'brand' )
WITH CHECK ( bucket_id = 'brand' );

CREATE POLICY "Authenticated Delete from brand"
ON storage.objects FOR DELETE
TO authenticated
USING ( bucket_id = 'brand' );

-- 3. Insert default empty settings for brand_settings if they don't exist
INSERT INTO public.settings (id, api_key, updated_at, updated_by)
VALUES (
    'brand_settings',
    '{"logo_light_url":"","logo_dark_url":"","favicon_url":"","version":"1.0"}',
    now(),
    'system'
)
ON CONFLICT (id) DO NOTHING;
