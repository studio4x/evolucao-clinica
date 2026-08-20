-- A restrição legada de professionals ainda rejeitava o identificador
-- administrativo `courtesy`, apesar de o plano já estar implementado.

ALTER TABLE public.professionals
  DROP CONSTRAINT IF EXISTS professionals_subscription_plan_check;

ALTER TABLE public.professionals
  ADD CONSTRAINT professionals_subscription_plan_check
  CHECK (
    subscription_plan IS NULL
    OR subscription_plan IN ('trial', 'monthly', 'yearly', 'courtesy', 'none')
  );

COMMENT ON CONSTRAINT professionals_subscription_plan_check ON public.professionals IS
  'Planos permitidos: teste, mensal, anual, cortesia administrativa e vitalício.';
