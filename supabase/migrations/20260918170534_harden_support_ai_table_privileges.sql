REVOKE ALL ON TABLE
  public.support_ai_settings,
  public.support_ai_drafts,
  public.support_ai_runs
FROM anon, authenticated;

GRANT SELECT, UPDATE ON public.support_ai_settings TO authenticated;
GRANT SELECT, UPDATE ON public.support_ai_drafts TO authenticated;
GRANT SELECT ON public.support_ai_runs TO authenticated;

GRANT ALL ON TABLE
  public.support_ai_settings,
  public.support_ai_drafts,
  public.support_ai_runs
TO service_role;

DROP POLICY IF EXISTS "support_ai_settings_admin_insert"
ON public.support_ai_settings;
