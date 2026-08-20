-- Adiciona o plano administrativo Cortesia com acesso equivalente ao anual,
-- sem cobrança, sem vencimento e fora das assinaturas pagas.

CREATE OR REPLACE FUNCTION public.enforce_courtesy_subscription_invariants()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF new.subscription_plan = 'courtesy' THEN
    new.subscription_status := 'active';
    new.subscription_ends_at := NULL;
    new.status := 'active';
  END IF;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS enforce_courtesy_subscription_invariants_trigger ON public.professionals;
CREATE TRIGGER enforce_courtesy_subscription_invariants_trigger
BEFORE INSERT OR UPDATE ON public.professionals
FOR EACH ROW
EXECUTE FUNCTION public.enforce_courtesy_subscription_invariants();

REVOKE EXECUTE ON FUNCTION public.enforce_courtesy_subscription_invariants() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_courtesy_subscription_invariants() TO service_role;

-- Normaliza eventuais registros criados antes da instalação do gatilho.
UPDATE public.professionals
SET
  subscription_status = 'active',
  subscription_ends_at = NULL,
  status = 'active',
  updated_at = now()
WHERE subscription_plan = 'courtesy';

-- O pedido de migração é um benefício anual e também fica disponível na cortesia.
DROP POLICY IF EXISTS "migration_requests_insert_own" ON public.migration_requests;
CREATE POLICY "migration_requests_insert_own"
ON public.migration_requests
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.professionals
    WHERE id = auth.uid()
      AND (
        role = 'admin'
        OR subscription_plan = 'none'
        OR (
          subscription_plan IN ('yearly', 'courtesy')
          AND subscription_status IN ('active', 'trialing')
          AND (subscription_ends_at IS NULL OR subscription_ends_at >= now())
        )
      )
  )
);

-- Cortesia recebe o mesmo SLA VIP do plano anual.
CREATE OR REPLACE FUNCTION public.apply_support_ticket_sla_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  response_hours integer;
  user_plan text;
  user_status text;
  user_ends_at timestamptz;
  user_role text;
  has_current_entitlement boolean;
BEGIN
  SELECT
    COALESCE(subscription_plan, 'trial'),
    subscription_status,
    subscription_ends_at,
    COALESCE(role, 'therapist')
  INTO user_plan, user_status, user_ends_at, user_role
  FROM public.professionals
  WHERE id = new.user_id;

  has_current_entitlement :=
    user_role = 'admin'
    OR user_plan = 'none'
    OR (
      user_status IN ('active', 'trialing')
      AND (user_ends_at IS NULL OR user_ends_at >= now())
    );

  IF has_current_entitlement AND (user_plan IN ('yearly', 'courtesy', 'none') OR user_role = 'admin') THEN
    response_hours := 2;
    new.priority := 'high';
  ELSIF has_current_entitlement AND user_plan = 'monthly' THEN
    IF new.category = 'payment' THEN
      response_hours := 12;
    ELSE
      response_hours := 24;
    END IF;
    new.priority := 'medium';
  ELSE
    response_hours := 48;
    new.priority := 'low';
  END IF;

  new.sla_policy_key := new.category;

  IF tg_op = 'INSERT'
    OR new.category IS DISTINCT FROM old.category
    OR new.created_at IS DISTINCT FROM old.created_at
    OR new.first_response_due_at IS NULL THEN
    new.first_response_due_at := public.add_support_business_minutes(coalesce(new.created_at, now()), response_hours * 60);
  END IF;

  new.sla_status := public.compute_support_sla_status(new.first_response_due_at, new.first_response_at);
  RETURN new;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_support_ticket_sla_fields() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_support_ticket_sla_fields() TO service_role;

COMMENT ON FUNCTION public.enforce_courtesy_subscription_invariants() IS
  'Força o plano Cortesia a permanecer ativo, regular e sem vencimento.';
