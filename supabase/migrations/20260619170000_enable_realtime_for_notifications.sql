-- Migration: Enable Supabase Realtime for Notifications Table
-- Target: Supabase PostgreSQL Database

DO $$
BEGIN
  -- Verifica se a publicação padrão do Supabase Realtime existe
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    -- Adiciona a tabela public.notifications à publicação se ela já não estiver lá
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'notifications'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
    END IF;
  END IF;
END $$;
