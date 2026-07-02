-- Add onboarding_completed column to professionals table
ALTER TABLE public.professionals ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false;
