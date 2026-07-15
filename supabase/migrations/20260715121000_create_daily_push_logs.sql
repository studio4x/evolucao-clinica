-- Migration: Create daily push logs table for auditing and history
-- Target: Supabase PostgreSQL Database

CREATE TABLE IF NOT EXISTS public.daily_push_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    status TEXT NOT NULL, -- 'success', 'error', 'skipped'
    recipients_count INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    payload JSONB NOT NULL
);

-- RLS: Apenas admins podem ler/escrever nesta tabela
ALTER TABLE public.daily_push_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow select for admins only"
ON public.daily_push_logs FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.professionals
    WHERE id = auth.uid() AND role = 'admin'
  )
);
