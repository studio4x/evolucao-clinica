-- Migration to add digital signature columns to public.evolutions table
ALTER TABLE public.evolutions 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'completed',
ADD COLUMN IF NOT EXISTS signature_method TEXT,
ADD COLUMN IF NOT EXISTS signature_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS signature_ip TEXT,
ADD COLUMN IF NOT EXISTS signature_hash TEXT,
ADD COLUMN IF NOT EXISTS signed_by_name TEXT,
ADD COLUMN IF NOT EXISTS signed_by_register TEXT;

-- Index for searching signed evolutions easily
CREATE INDEX IF NOT EXISTS idx_evolutions_status ON public.evolutions(status);
