-- Migration: Add public SELECT policy for brand_settings
-- Target: Supabase PostgreSQL Database

-- Allow anyone (including anonymous/unauthenticated users) to read the brand settings row.
-- This is necessary to render the logo and favicon on public pages like Landing Page and Login.
DROP POLICY IF EXISTS "Allow public select for brand_settings" ON public.settings;

CREATE POLICY "Allow public select for brand_settings"
ON public.settings FOR SELECT
TO public
USING ( id = 'brand_settings' );
