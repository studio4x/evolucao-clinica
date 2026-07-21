-- Unifica assinaturas Stripe e Google Play sem remover os campos legados.
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS google_play_product_id text,
  ADD COLUMN IF NOT EXISTS google_play_base_plan_id text;

UPDATE public.plans
SET google_play_product_id = 'evolucao_monthly',
    google_play_base_plan_id = 'monthly-auto'
WHERE id = 'monthly';

UPDATE public.plans
SET google_play_product_id = 'evolucao_yearly',
    google_play_base_plan_id = 'yearly-auto'
WHERE id = 'yearly';

ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS billing_provider text,
  ADD COLUMN IF NOT EXISTS stripe_customer_id text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'professionals_billing_provider_check'
  ) THEN
    ALTER TABLE public.professionals
      ADD CONSTRAINT professionals_billing_provider_check
      CHECK (billing_provider IS NULL OR billing_provider IN ('stripe', 'google_play'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.billing_subscriptions (
  professional_id uuid PRIMARY KEY REFERENCES public.professionals(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('stripe', 'google_play')),
  plan_id text NOT NULL REFERENCES public.plans(id),
  provider_subscription_id text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  current_period_end timestamptz,
  stripe_customer_id text,
  play_purchase_token text,
  play_product_id text,
  initial_external_transaction_id text,
  external_transaction_token text,
  external_reporting_status text NOT NULL DEFAULT 'not_required'
    CHECK (external_reporting_status IN ('not_required', 'pending', 'reported', 'failed')),
  external_reporting_error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (provider, provider_subscription_id)
);

ALTER TABLE public.billing_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own billing subscription" ON public.billing_subscriptions;
CREATE POLICY "Users can view their own billing subscription"
  ON public.billing_subscriptions FOR SELECT
  USING (auth.uid() = professional_id);

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS payment_provider text,
  ADD COLUMN IF NOT EXISTS provider_transaction_id text,
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS external_transaction_id text,
  ADD COLUMN IF NOT EXISTS initial_external_transaction_id text,
  ADD COLUMN IF NOT EXISTS play_order_id text,
  ADD COLUMN IF NOT EXISTS play_purchase_token text;

UPDATE public.transactions
SET payment_provider = 'stripe',
    -- Uma assinatura pode ter várias transações; somente a fatura é única por cobrança.
    provider_transaction_id = stripe_invoice_id,
    payment_method = COALESCE(payment_method, 'card')
WHERE payment_provider IS NULL
  AND (stripe_invoice_id IS NOT NULL OR stripe_subscription_id IS NOT NULL);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'transactions_payment_provider_check'
  ) THEN
    ALTER TABLE public.transactions
      ADD CONSTRAINT transactions_payment_provider_check
      CHECK (payment_provider IS NULL OR payment_provider IN ('stripe', 'google_play', 'simulation'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS transactions_provider_transaction_unique
  ON public.transactions(payment_provider, provider_transaction_id);

CREATE UNIQUE INDEX IF NOT EXISTS transactions_stripe_invoice_unique
  ON public.transactions(stripe_invoice_id);

CREATE UNIQUE INDEX IF NOT EXISTS transactions_external_transaction_unique
  ON public.transactions(external_transaction_id)
  WHERE external_transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS transactions_play_purchase_token_idx
  ON public.transactions(play_purchase_token);

UPDATE public.professionals p
SET billing_provider = 'stripe'
WHERE billing_provider IS NULL
  AND EXISTS (
    SELECT 1 FROM public.transactions t
    WHERE t.professional_id = p.id
      AND (t.stripe_subscription_id IS NOT NULL OR t.stripe_invoice_id IS NOT NULL)
  );

INSERT INTO public.billing_subscriptions (
  professional_id,
  provider,
  plan_id,
  provider_subscription_id,
  status,
  current_period_end,
  external_reporting_status,
  metadata
)
SELECT DISTINCT ON (p.id)
  p.id,
  'stripe',
  p.subscription_plan,
  t.stripe_subscription_id,
  COALESCE(p.subscription_status, 'active'),
  p.subscription_ends_at,
  'not_required',
  jsonb_build_object('migratedFromLegacyTransactions', true)
FROM public.professionals p
JOIN public.transactions t ON t.professional_id = p.id
WHERE p.subscription_plan IN ('monthly', 'yearly')
  AND p.subscription_status IN ('active', 'trialing', 'past_due', 'unpaid')
  AND t.stripe_subscription_id IS NOT NULL
ORDER BY p.id, t.created_at DESC
ON CONFLICT (professional_id) DO NOTHING;

COMMENT ON TABLE public.billing_subscriptions IS
  'Fonte unificada de assinaturas confirmadas pelos webhooks Stripe ou Google Play.';
COMMENT ON COLUMN public.billing_subscriptions.external_transaction_token IS
  'Token emitido pela tela oficial de escolha da Play para a compra Stripe inicial.';
COMMENT ON COLUMN public.billing_subscriptions.initial_external_transaction_id IS
  'ID não pessoal usado para relacionar a compra Stripe inicial e suas renovações na Google Play Developer API.';
