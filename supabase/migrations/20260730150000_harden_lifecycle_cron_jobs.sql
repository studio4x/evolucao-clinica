CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'lifecycle-process') THEN
    PERFORM cron.unschedule('lifecycle-process');
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'lifecycle-schedule') THEN
    PERFORM cron.unschedule('lifecycle-schedule');
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'lifecycle-recalculate') THEN
    PERFORM cron.unschedule('lifecycle-recalculate');
  END IF;
END
$$;

SELECT cron.schedule(
  'lifecycle-process',
  '*/5 * * * *',
  $$
    SELECT net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'lifecycle_origin') || '/api/cron/process-lifecycle',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'lifecycle_cron_secret'),
        'Content-Type', 'application/json'
      ),
      body := '{"batchSize":25}'::jsonb,
      timeout_milliseconds := 30000
    );
  $$
);

SELECT cron.schedule(
  'lifecycle-schedule',
  '*/15 * * * *',
  $$
    SELECT net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'lifecycle_origin') || '/api/cron/schedule-lifecycle',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'lifecycle_cron_secret'),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
  $$
);

SELECT cron.schedule(
  'lifecycle-recalculate',
  '17 3 * * *',
  $$
    SELECT net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'lifecycle_origin') || '/api/cron/recalculate-lifecycle',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'lifecycle_cron_secret'),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
  $$
);
