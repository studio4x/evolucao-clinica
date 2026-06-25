-- Add trial expiration tracking and a cron job to notify expired trials

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS trial_expiration_email_sent_at timestamptz;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-trial-expiration-notices-job') THEN
        PERFORM cron.unschedule('send-trial-expiration-notices-job');
    END IF;
END $$;

SELECT cron.schedule(
  'send-trial-expiration-notices-job',
  '0 * * * *',
  $$
  SELECT net.http_get(
    url := 'https://evolucao.conexaoseres.com.br/api/cron/send-trial-expiration-notices'
  );
  $$
);
