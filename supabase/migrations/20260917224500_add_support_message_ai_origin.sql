ALTER TABLE public.support_messages
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'human',
  ADD COLUMN IF NOT EXISTS sender_label text,
  ADD COLUMN IF NOT EXISTS ai_run_id uuid REFERENCES public.support_ai_runs(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'support_messages_origin_check'
  ) THEN
    ALTER TABLE public.support_messages
      ADD CONSTRAINT support_messages_origin_check CHECK (origin IN ('human', 'support_ai'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_support_messages_ai_run
  ON public.support_messages (ai_run_id)
  WHERE ai_run_id IS NOT NULL;
