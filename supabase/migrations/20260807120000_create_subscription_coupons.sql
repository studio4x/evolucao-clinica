CREATE TABLE IF NOT EXISTS public.subscription_coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  discount_type text NOT NULL CHECK (discount_type IN ('percentage', 'fixed_amount')),
  discount_value numeric(10,2) NOT NULL CHECK (discount_value > 0),
  duration text NOT NULL DEFAULT 'once' CHECK (duration IN ('once', 'forever', 'repeating')),
  duration_in_months integer CHECK (duration <> 'repeating' OR duration_in_months BETWEEN 1 AND 36),
  applicable_plans text[] NOT NULL DEFAULT ARRAY['monthly', 'yearly']::text[] CHECK (applicable_plans <@ ARRAY['monthly', 'yearly']::text[]),
  active boolean NOT NULL DEFAULT true,
  starts_at timestamptz,
  expires_at timestamptz,
  stripe_sandbox_coupon_id text,
  stripe_prod_coupon_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subscription_coupons_code_uppercase CHECK (code = upper(code)),
  CONSTRAINT subscription_coupons_percentage_range CHECK (discount_type <> 'percentage' OR discount_value <= 100),
  CONSTRAINT subscription_coupons_dates CHECK (expires_at IS NULL OR starts_at IS NULL OR expires_at > starts_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS subscription_coupons_code_unique ON public.subscription_coupons (code);
ALTER TABLE public.subscription_coupons ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.subscription_coupons FROM anon;

DROP POLICY IF EXISTS "Admins manage subscription coupons" ON public.subscription_coupons;
CREATE POLICY "Admins manage subscription coupons" ON public.subscription_coupons
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

COMMENT ON TABLE public.subscription_coupons IS 'Cupons administrados internamente. A aplicação no checkout é validada exclusivamente no backend.';
