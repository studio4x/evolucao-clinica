-- Schedule the global daily push in Supabase (pg_cron + pg_net).
-- The cron secret is generated inside the database and is never committed.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO public.settings (id, api_key, updated_at, updated_by)
VALUES (
  'daily_push_cron_secret',
  jsonb_build_object('secret', encode(gen_random_bytes(32), 'hex'))::text,
  now(),
  'system'
)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-daily-push-job') THEN
    PERFORM cron.unschedule('send-daily-push-job');
  END IF;
END $$;

SELECT cron.schedule(
  'send-daily-push-job',
  '*/5 * * * *',
  $$
  SELECT net.http_get(
    url := 'https://evolucaoclinica.app.br/api/cron/send-daily-push?secret=' ||
      COALESCE((SELECT api_key::jsonb ->> 'secret'
                FROM public.settings
                WHERE id = 'daily_push_cron_secret'), '')
  );
  $$
);
