-- Fase 2B.3: preparação server-side de cancelamento no fim do período.
-- Aplicar exclusivamente no Supabase staging hwkdwinfckmjoriqxbjk via Management API.
-- Não executar com supabase db push e não aplicar em produção.

BEGIN;

CREATE OR REPLACE FUNCTION public.prepare_clinic_cancellation(
  p_organization_id uuid,
  p_actor_professional_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
DECLARE v_subscription private.organization_subscriptions; v_role text;
BEGIN
  IF COALESCE(nullif(current_setting('request.jwt.claim.role', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'), auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service role authorization required' USING ERRCODE = '42501';
  END IF;
  SELECT membership_role INTO v_role FROM public.organization_memberships
   WHERE organization_id = p_organization_id AND professional_id = p_actor_professional_id AND status = 'active';
  SELECT * INTO v_subscription FROM private.organization_subscriptions WHERE organization_id = p_organization_id FOR UPDATE;
  IF v_role <> 'owner' OR v_subscription.id IS NULL OR v_subscription.billing_provider <> 'stripe' OR v_subscription.stripe_subscription_id IS NULL THEN
    RAISE EXCEPTION 'clinic cancellation is not authorized' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object('organization_id', p_organization_id, 'subscription_id', v_subscription.stripe_subscription_id, 'cancel_at_period_end', v_subscription.cancel_at_period_end);
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_clinic_cancellation(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_clinic_cancellation(uuid, uuid) TO service_role;

COMMIT;
