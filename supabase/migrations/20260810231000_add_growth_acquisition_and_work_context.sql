-- Growth foundation: signup attribution + professional work context.
-- Safe for existing users: no backfill is performed.

ALTER TABLE public.professionals
ADD COLUMN IF NOT EXISTS signup_acquisition_info JSONB DEFAULT '{}'::jsonb;

ALTER TABLE public.professionals
ADD COLUMN IF NOT EXISTS work_context TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'professionals_work_context_check'
      AND conrelid = 'public.professionals'::regclass
  ) THEN
    ALTER TABLE public.professionals
      ADD CONSTRAINT professionals_work_context_check
      CHECK (
        work_context IS NULL OR
        work_context IN ('independent', 'clinic_professional', 'clinic_owner_manager', 'other')
      );
  END IF;
END $$;

COMMENT ON COLUMN public.professionals.signup_acquisition_info IS
'Origem da sessão associada ao cadastro inicial do usuário. Não deve sobrescrever um valor já válido.';

COMMENT ON COLUMN public.professionals.work_context IS
'Contexto de atuação declarado pelo usuário para segmentação: independent, clinic_professional, clinic_owner_manager ou other.';
