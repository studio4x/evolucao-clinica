-- Keep operational acquisition telemetry for 90 days only.
-- The job is intentionally isolated from acquisition attribution, users and
-- all business/clinical tables.
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
DECLARE
  existing_job record;
BEGIN
  FOR existing_job IN
    SELECT jobid
      FROM cron.job
     WHERE jobname = 'acquisition-telemetry-retention'
  LOOP
    PERFORM cron.unschedule(existing_job.jobid);
  END LOOP;
END
$$;

SELECT cron.schedule(
  'acquisition-telemetry-retention',
  '15 3 * * *',
  $job$
    DELETE FROM public.acquisition_telemetry_events
     WHERE created_at < now() - interval '90 days';
  $job$
);
