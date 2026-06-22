-- Migration: Add session reminder configuration to patients table
-- Target: Supabase PostgreSQL Database

-- Add columns to patients table
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS evolution_reminder_active BOOLEAN DEFAULT false;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS session_days INTEGER[] DEFAULT '{}';
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS session_time TIME;

-- Add comment explaining columns
COMMENT ON COLUMN public.patients.evolution_reminder_active IS 'Indica se os lembretes de evolucao por e-mail, push e in-app estao ativos para o paciente';
COMMENT ON COLUMN public.patients.session_days IS 'Dias da semana em que ocorrem as sessoes de atendimento (0=Domingo, 1=Segunda, etc)';
COMMENT ON COLUMN public.patients.session_time IS 'Horario em que o atendimento e realizado';
