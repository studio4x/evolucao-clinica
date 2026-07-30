-- Migration: Add acquisition_info JSONB column to public.professionals
-- Target: Supabase PostgreSQL Database

ALTER TABLE public.professionals 
ADD COLUMN IF NOT EXISTS acquisition_info JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.professionals.acquisition_info IS 
'Informações de rastreamento de origem e aquisição do usuário (UTMs, Referrer, Landing Page, Canal)';
