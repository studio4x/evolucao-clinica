-- Migration: Add whatsapp_number column to communication_preferences
-- Target: Supabase PostgreSQL Database

ALTER TABLE public.communication_preferences
ADD COLUMN IF NOT EXISTS whatsapp_number text;
