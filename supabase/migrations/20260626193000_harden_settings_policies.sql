-- Remove leitura ampla de settings que vazava segredos para usuários ativos.
-- Mantém apenas o acesso público ao brand_settings e libera o restante somente para admins.

DROP POLICY IF EXISTS "settings_read_active" ON public.settings;

DROP POLICY IF EXISTS "settings_read_admin" ON public.settings;
CREATE POLICY "settings_read_admin"
  ON public.settings
  FOR SELECT
  USING (is_admin());
