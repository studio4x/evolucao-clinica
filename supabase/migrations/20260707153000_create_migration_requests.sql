-- Migration: Create Migration Requests Table and RLS policies
-- Target: Supabase PostgreSQL Database

CREATE TABLE IF NOT EXISTS public.migration_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  previous_platform text NOT NULL,
  other_platform_name text,
  estimated_patients integer NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attachment_url text,
  attachment_name text,
  notes text,
  admin_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT migration_requests_status_check CHECK (status in ('pending', 'in_progress', 'completed', 'cancelled'))
);

-- 1. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_migration_requests_user ON public.migration_requests (user_id);
CREATE INDEX IF NOT EXISTS idx_migration_requests_status ON public.migration_requests (status);

-- 2. Enable RLS
ALTER TABLE public.migration_requests ENABLE ROW LEVEL SECURITY;

-- 3. Trigger to set updated_at automatically
CREATE TRIGGER set_migration_requests_updated_at
BEFORE UPDATE ON public.migration_requests
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- 4. Policies
DROP POLICY IF EXISTS "migration_requests_select_own_or_admin" ON public.migration_requests;
CREATE POLICY "migration_requests_select_own_or_admin"
ON public.migration_requests
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid() 
  OR EXISTS (
    SELECT 1 FROM public.professionals 
    WHERE id = auth.uid() AND role = 'admin'
  )
);

DROP POLICY IF EXISTS "migration_requests_insert_own" ON public.migration_requests;
CREATE POLICY "migration_requests_insert_own"
ON public.migration_requests
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.professionals
    WHERE id = auth.uid() AND (subscription_plan = 'yearly' OR subscription_plan = 'none' OR role = 'admin')
  )
);

DROP POLICY IF EXISTS "migration_requests_admin_update" ON public.migration_requests;
CREATE POLICY "migration_requests_admin_update"
ON public.migration_requests
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.professionals 
    WHERE id = auth.uid() AND role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.professionals 
    WHERE id = auth.uid() AND role = 'admin'
  )
);
