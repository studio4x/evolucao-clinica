-- Migration: Add quick_notes column to patients table for sticky notes / scratchpad
-- Target: Supabase PostgreSQL Database

ALTER TABLE public.patients 
ADD COLUMN IF NOT EXISTS quick_notes TEXT DEFAULT '';

COMMENT ON COLUMN public.patients.quick_notes IS 'Notas rápidas temporárias / bloco de notas editável no detalhe do paciente';
