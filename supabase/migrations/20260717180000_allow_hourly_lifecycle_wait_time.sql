-- Permite configurar tempos de espera fracionários (horas) na jornada de usuários.
-- Altera a coluna day_offset de integer para numeric.

ALTER TABLE public.lifecycle_steps DROP CONSTRAINT IF EXISTS lifecycle_steps_day_offset_check;
ALTER TABLE public.lifecycle_steps ALTER COLUMN day_offset TYPE numeric;
ALTER TABLE public.lifecycle_steps ADD CONSTRAINT lifecycle_steps_day_offset_check CHECK (day_offset >= 0);
