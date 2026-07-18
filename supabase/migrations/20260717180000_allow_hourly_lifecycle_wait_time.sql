-- Permite configurar tempos de espera arbitrários em minutos no onboarding dos usuários.
-- Renomeia a coluna day_offset para wait_minutes e converte os dados multiplicando por 1440.

ALTER TABLE public.lifecycle_steps RENAME COLUMN day_offset TO wait_minutes;

-- Converte dias para minutos (1 dia = 1440 minutos)
UPDATE public.lifecycle_steps SET wait_minutes = wait_minutes * 1440;

-- Corrige a check constraint de validação
ALTER TABLE public.lifecycle_steps DROP CONSTRAINT IF EXISTS lifecycle_steps_day_offset_check;
ALTER TABLE public.lifecycle_steps ADD CONSTRAINT lifecycle_steps_wait_minutes_check CHECK (wait_minutes >= 0);

-- Recarrega o cache de schema do PostgREST (Supabase)
NOTIFY pgrst, 'reload schema';
