-- Adiciona coluna de numero de registro de classe profissional
ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS professional_register TEXT DEFAULT NULL;

COMMENT ON COLUMN public.professionals.professional_register IS
  'Numero de registro no conselho de classe (ex: CREFITO-3 123456-F, CRP 06/123456, CREF 012345-G/SP)';
