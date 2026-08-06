-- Read-only operational helpers for the backend. They expose no secret values.

CREATE OR REPLACE FUNCTION public.get_journey_publication_cron_status()
RETURNS TABLE (
  job_name text,
  schedule text,
  active boolean,
  last_status text,
  last_start_time timestamptz,
  last_end_time timestamptz,
  last_return_message text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    job.jobname::text,
    job.schedule::text,
    job.active,
    latest_run.status::text,
    latest_run.start_time,
    latest_run.end_time,
    left(latest_run.return_message, 160)
  FROM cron.job AS job
  LEFT JOIN LATERAL (
    SELECT status, start_time, end_time, return_message
    FROM cron.job_run_details
    WHERE jobid = job.jobid
    ORDER BY start_time DESC
    LIMIT 1
  ) AS latest_run ON true
  WHERE job.jobname = 'publish-journey-contents-job'
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.verify_supabase_cron_secret(p_secret text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM vault.decrypted_secrets
    WHERE name = 'lifecycle_cron_secret'
      AND decrypted_secret IS NOT NULL
      AND decrypted_secret = p_secret
  );
$$;

REVOKE ALL ON FUNCTION public.get_journey_publication_cron_status() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.verify_supabase_cron_secret(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_journey_publication_cron_status() TO service_role;
GRANT EXECUTE ON FUNCTION public.verify_supabase_cron_secret(text) TO service_role;
