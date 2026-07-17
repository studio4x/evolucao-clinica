-- Repara instalações em que a migration de minutos foi registrada, mas não
-- alterou a tabela (ou em que o cache do PostgREST ficou desatualizado).
DO $$
DECLARE
  has_day_offset boolean;
  has_wait_minutes boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'lifecycle_steps'
      AND column_name = 'day_offset'
  ) INTO has_day_offset;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'lifecycle_steps'
      AND column_name = 'wait_minutes'
  ) INTO has_wait_minutes;

  IF has_day_offset AND NOT has_wait_minutes THEN
    ALTER TABLE public.lifecycle_steps RENAME COLUMN day_offset TO wait_minutes;
    UPDATE public.lifecycle_steps SET wait_minutes = wait_minutes * 1440;
  ELSIF NOT has_day_offset AND NOT has_wait_minutes THEN
    ALTER TABLE public.lifecycle_steps
      ADD COLUMN wait_minutes integer NOT NULL DEFAULT 0;
  END IF;
END $$;

ALTER TABLE public.lifecycle_steps
  DROP CONSTRAINT IF EXISTS lifecycle_steps_day_offset_check;
ALTER TABLE public.lifecycle_steps
  DROP CONSTRAINT IF EXISTS lifecycle_steps_wait_minutes_check;
ALTER TABLE public.lifecycle_steps
  ADD CONSTRAINT lifecycle_steps_wait_minutes_check CHECK (wait_minutes >= 0);

-- O rename de coluna precisa ser refletido imediatamente pelo PostgREST.
NOTIFY pgrst, 'reload schema';
