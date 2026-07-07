-- Migration: Create tracking settings row and RLS policies
-- Target: Supabase PostgreSQL Database

-- 1. Insert default empty settings for tracking_settings if they don't exist
INSERT INTO public.settings (id, api_key, updated_at, updated_by)
VALUES (
    'tracking_settings',
    '{"gtm_id":"","fb_pixel_id":"","head_scripts":"","body_scripts":"","footer_scripts":""}',
    now(),
    'system'
)
ON CONFLICT (id) DO NOTHING;

-- 2. Drop existing public read policy if it exists to avoid conflict
DROP POLICY IF EXISTS "Allow public select for tracking_settings" ON public.settings;

-- 3. Create public read policy for tracking_settings
CREATE POLICY "Allow public select for tracking_settings"
ON public.settings FOR SELECT
USING ( id = 'tracking_settings' );
