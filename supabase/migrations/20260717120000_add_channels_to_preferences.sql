-- Migration: Add channel preference columns to communication_preferences
-- Target: Supabase PostgreSQL Database

ALTER TABLE public.communication_preferences
ADD COLUMN IF NOT EXISTS email_enabled boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS push_enabled boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS whatsapp_enabled boolean NOT NULL DEFAULT true;
