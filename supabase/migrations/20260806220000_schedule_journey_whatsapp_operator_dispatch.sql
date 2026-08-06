-- Aciona o workflow n8n após a publicação editorial da Jornada.
-- URL e token são lidos exclusivamente do Supabase Vault.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
DECLARE
  configured_url text;
  configured_token text;
BEGIN
  SELECT decrypted_secret INTO configured_url
  FROM vault.decrypted_secrets
  WHERE name = 'journey_n8n_webhook_url';

  SELECT decrypted_secret INTO configured_token
  FROM vault.decrypted_secrets
  WHERE name = 'journey_n8n_webhook_token';

  IF configured_url IS NULL OR configured_url !~ '^https://[^/?#]+/[^?#]+$' THEN
    RAISE EXCEPTION 'Vault secret journey_n8n_webhook_url must contain a valid HTTPS webhook URL';
  END IF;

  IF configured_token IS NULL OR btrim(configured_token) = '' THEN
    RAISE EXCEPTION 'Vault secret journey_n8n_webhook_token is required';
  END IF;
END
$$;

DO $$
DECLARE
  job_record record;
BEGIN
  FOR job_record IN SELECT jobid FROM cron.job WHERE jobname = 'journey-whatsapp-operator-dispatch'
  LOOP
    PERFORM cron.unschedule(job_record.jobid);
  END LOOP;
END
$$;

SELECT cron.schedule(
  'journey-whatsapp-operator-dispatch',
  '2-59/5 * * * *',
  $job$
    SELECT net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'journey_n8n_webhook_url'),
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'journey_n8n_webhook_token'),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
  $job$
);
