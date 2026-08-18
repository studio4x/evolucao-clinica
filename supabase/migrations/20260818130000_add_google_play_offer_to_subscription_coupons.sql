ALTER TABLE public.subscription_coupons
  ADD COLUMN IF NOT EXISTS google_play_offer_id text;

COMMENT ON COLUMN public.subscription_coupons.google_play_offer_id IS
  'ID da oferta de assinatura configurada no Google Play Console. O código do cupom só é válido no Play Billing quando este campo está preenchido e a oferta é selecionada pelo cliente nativo.';
