-- Tracks whether the welcome email was already sent to the professional.

ALTER TABLE public.onboarding_notifications
ADD COLUMN IF NOT EXISTS welcome_notified_at timestamptz;

COMMENT ON COLUMN public.onboarding_notifications.welcome_notified_at IS
  'Marca o envio do e-mail de boas-vindas para evitar duplicidade.';
