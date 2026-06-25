-- Migration: Create Supabase Cron Job for patient session evolution reminders
-- Target: Supabase PostgreSQL Database

-- 1. Enable pg_cron and pg_net extensions (in the extensions schema or public)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Safely remove the job if it already exists to prevent duplicate schedules
-- Note: cron.unschedule returns boolean, so we wrap it or handle if it doesn't exist
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-evolution-reminders-job') THEN
        PERFORM cron.unschedule('send-evolution-reminders-job');
    END IF;
END $$;

-- 3. Schedule the cron job to run every hour (0 * * * *)
-- Supabase allows hourly schedules on free tiers without any restrictions.
-- It triggers our REST API endpoint using pg_net's asynchronous HTTP GET.
SELECT cron.schedule(
  'send-evolution-reminders-job',
  '0 * * * *',
  $$
  SELECT net.http_get(
    url := 'https://evolucaoclinica.app.br/api/cron/send-evolution-reminders'
  );
  $$
);
