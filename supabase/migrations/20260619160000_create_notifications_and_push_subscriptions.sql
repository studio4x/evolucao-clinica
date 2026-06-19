-- Migration: Adjust Notifications and Create Push Subscriptions Tables
-- Target: Supabase PostgreSQL Database

-- 1. Ensure notifications table has the 'link' column
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS link TEXT;

-- Create index on read_at for fast queries of unread notifications
CREATE INDEX IF NOT EXISTS idx_notifications_read_at ON public.notifications(user_id, read_at);

-- 2. Create push_subscriptions table
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    endpoint TEXT NOT NULL UNIQUE,
    keys JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for user subscriptions
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON public.push_subscriptions(user_id);

-- Enable RLS for push_subscriptions
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Policies for push_subscriptions
CREATE POLICY "Users can view their own push subscriptions"
    ON public.push_subscriptions FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own push subscriptions"
    ON public.push_subscriptions FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own push subscriptions"
    ON public.push_subscriptions FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own push subscriptions"
    ON public.push_subscriptions FOR DELETE
    USING (auth.uid() = user_id);

-- Add comments explaining tables
COMMENT ON COLUMN public.notifications.read_at IS 'Data/hora em que a notificacao foi lida pelo profissional. NULL indica nao lida.';
COMMENT ON COLUMN public.notifications.link IS 'Link interno da plataforma para redirecionamento ao clicar na notificacao';
COMMENT ON TABLE public.push_subscriptions IS 'Guarda as inscricoes do navegador para Web Push de cada profissional';
