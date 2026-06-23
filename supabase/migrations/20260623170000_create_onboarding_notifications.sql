-- Tracks onboarding notification delivery so pending/approval emails are sent once per user.

CREATE TABLE IF NOT EXISTS public.onboarding_notifications (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  pending_notified_at timestamptz,
  approved_notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.onboarding_notifications ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.set_onboarding_notifications_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_onboarding_notifications_updated_at ON public.onboarding_notifications;
CREATE TRIGGER set_onboarding_notifications_updated_at
BEFORE UPDATE ON public.onboarding_notifications
FOR EACH ROW
EXECUTE FUNCTION public.set_onboarding_notifications_updated_at();
