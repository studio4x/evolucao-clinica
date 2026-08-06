-- Keep every recurring scheduler in Supabase.
-- The endpoint origin and CRON_SECRET are read only from Supabase Vault.
-- This migration intentionally contains no secret values.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
DECLARE
  configured_origin text;
  configured_secret text;
BEGIN
  SELECT decrypted_secret
    INTO configured_origin
    FROM vault.decrypted_secrets
   WHERE name = 'lifecycle_origin';

  SELECT decrypted_secret
    INTO configured_secret
    FROM vault.decrypted_secrets
   WHERE name = 'lifecycle_cron_secret';

  IF configured_origin IS NULL OR configured_origin !~ '^https://[^/?#]+/?$' THEN
    RAISE EXCEPTION 'Vault secret lifecycle_origin must contain a valid HTTPS origin';
  END IF;

  IF configured_secret IS NULL OR btrim(configured_secret) = '' THEN
    RAISE EXCEPTION 'Vault secret lifecycle_cron_secret is required';
  END IF;
END
$$;

DO $$
DECLARE
  job_record record;
BEGIN
  FOR job_record IN
    SELECT jobid
      FROM cron.job
     WHERE jobname IN (
       'send-evolution-reminders-job',
       'send-trial-expiration-notices-job',
       'publish-journey-contents-job',
       'send-daily-push-job',
       'lifecycle-process',
       'lifecycle-schedule',
       'lifecycle-recalculate'
     )
  LOOP
    PERFORM cron.unschedule(job_record.jobid);
  END LOOP;
END
$$;

SELECT cron.schedule(
  'send-evolution-reminders-job',
  '0 * * * *',
  $job$
    SELECT net.http_get(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'lifecycle_origin') || '/api/cron/send-evolution-reminders',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'lifecycle_cron_secret')
      ),
      timeout_milliseconds := 30000
    );
  $job$
);

SELECT cron.schedule(
  'send-trial-expiration-notices-job',
  '0 * * * *',
  $job$
    SELECT net.http_get(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'lifecycle_origin') || '/api/cron/send-trial-expiration-notices',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'lifecycle_cron_secret')
      ),
      timeout_milliseconds := 30000
    );
  $job$
);

SELECT cron.schedule(
  'publish-journey-contents-job',
  '*/5 * * * *',
  $job$
    SELECT net.http_get(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'lifecycle_origin') || '/api/cron/publish-journey-contents',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'lifecycle_cron_secret')
      ),
      timeout_milliseconds := 30000
    );
  $job$
);

SELECT cron.schedule(
  'send-daily-push-job',
  '*/5 * * * *',
  $job$
    SELECT net.http_get(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'lifecycle_origin') || '/api/cron/send-daily-push',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'lifecycle_cron_secret')
      ),
      timeout_milliseconds := 30000
    );
  $job$
);

SELECT cron.schedule(
  'lifecycle-process',
  '*/5 * * * *',
  $job$
    SELECT net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'lifecycle_origin') || '/api/cron/process-lifecycle',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'lifecycle_cron_secret'),
        'Content-Type', 'application/json'
      ),
      body := '{"batchSize":25}'::jsonb,
      timeout_milliseconds := 30000
    );
  $job$
);

SELECT cron.schedule(
  'lifecycle-schedule',
  '*/15 * * * *',
  $job$
    SELECT net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'lifecycle_origin') || '/api/cron/schedule-lifecycle',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'lifecycle_cron_secret'),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
  $job$
);

SELECT cron.schedule(
  'lifecycle-recalculate',
  '17 3 * * *',
  $job$
    SELECT net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'lifecycle_origin') || '/api/cron/recalculate-lifecycle',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'lifecycle_cron_secret'),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
  $job$
);
