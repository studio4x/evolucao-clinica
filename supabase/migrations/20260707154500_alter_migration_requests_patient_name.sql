-- Migration: Alter Migration Requests swap estimated_patients for patient_name
-- Target: Supabase PostgreSQL Database

ALTER TABLE public.migration_requests DROP COLUMN IF EXISTS estimated_patients;
ALTER TABLE public.migration_requests ADD COLUMN IF NOT EXISTS patient_name TEXT;

-- Update existing rows (if any) to have a default value before making it NOT NULL
UPDATE public.migration_requests SET patient_name = 'Paciente' WHERE patient_name IS NULL;

ALTER TABLE public.migration_requests ALTER COLUMN patient_name SET NOT NULL;
