-- Adiciona campos para exibir preço original riscado e copy de lançamento nos cards de planos.
ALTER TABLE public.plans
ADD COLUMN IF NOT EXISTS original_price NUMERIC(10, 2),
ADD COLUMN IF NOT EXISTS launch_offer_text TEXT;

COMMENT ON COLUMN public.plans.original_price IS 'Preço original de ancoragem exibido riscado nos cards de planos.';
COMMENT ON COLUMN public.plans.launch_offer_text IS 'Texto curto de apoio para condições promocionais ou de lançamento.';

UPDATE public.plans
SET
  original_price = 59.00,
  launch_offer_text = 'Condição especial de lançamento por tempo limitado.'
WHERE id = 'monthly';

UPDATE public.plans
SET
  original_price = 399.00
WHERE id = 'yearly';
