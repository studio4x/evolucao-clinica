ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS custom_logo_settings jsonb NOT NULL DEFAULT '{"scale": 100}'::jsonb;

COMMENT ON COLUMN public.professionals.custom_logo_settings IS
  'Ajustes de exibição do logotipo personalizado nos cabeçalhos de documentos.';
