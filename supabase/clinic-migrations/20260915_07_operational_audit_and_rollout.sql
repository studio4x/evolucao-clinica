-- Fase 1B3: rollout administrativo, lineage de flag e auditoria das RPCs base.
-- Aplicar exclusivamente no Supabase staging hwkdwinfckmjoriqxbjk via Management API.
-- Não executar com supabase db push e não aplicar em produção.

BEGIN;

ALTER TABLE public.organization_feature_flags
  ADD COLUMN IF NOT EXISTS created_by_type text NOT NULL DEFAULT 'professional';
ALTER TABLE public.organization_feature_flags
  ALTER COLUMN created_by DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_constraint
     WHERE conname = 'organization_feature_flags_creator_lineage'
       AND conrelid = 'public.organization_feature_flags'::regclass
  ) THEN
    ALTER TABLE public.organization_feature_flags
      ADD CONSTRAINT organization_feature_flags_creator_lineage CHECK (
        (created_by_type = 'professional' AND created_by IS NOT NULL)
        OR (created_by_type = 'service_role' AND created_by IS NULL)
      );
  END IF;
END;
$$;

COMMENT ON COLUMN public.organization_feature_flags.created_by IS
  'Professional lineage for application-created flags; NULL for service_role rollout operations.';
COMMENT ON COLUMN public.organization_feature_flags.created_by_type IS
  'Creator lineage: professional or service_role. Administrative actor is recorded in audit events.';

REVOKE SELECT ON TABLE public.organization_feature_flags FROM authenticated;
GRANT SELECT (
  id,
  organization_id,
  feature_key,
  enabled,
  created_by,
  created_by_type,
  reason,
  created_at,
  updated_at
) ON TABLE public.organization_feature_flags TO authenticated;

CREATE OR REPLACE FUNCTION public.set_organization_clinic_rollout_state(
  p_organization_id uuid,
  p_enabled boolean,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
DECLARE
  v_organization public.organizations;
  v_flag public.organization_feature_flags;
  v_owner_count integer;
  v_status_changed boolean := false;
  v_old_enabled boolean;
  v_reason text := nullif(left(btrim(coalesce(p_reason, '')), 500), '');
BEGIN
  IF coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'),
    auth.role(),
    ''
  ) <> 'service_role' THEN
    RAISE EXCEPTION 'service role authorization required' USING ERRCODE = '42501';
  END IF;
  IF p_organization_id IS NULL OR p_enabled IS NULL OR v_reason IS NULL THEN
    RAISE EXCEPTION 'organization, enabled state and reason are required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_organization
    FROM public.organizations
   WHERE id = p_organization_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'organization not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT f.* INTO v_flag
    FROM public.organization_feature_flags AS f
   WHERE f.organization_id = p_organization_id
     AND f.feature_key = 'clinic'
   FOR UPDATE;
  v_old_enabled := CASE WHEN FOUND THEN v_flag.enabled ELSE false END;

  IF p_enabled IS TRUE THEN
    IF NOT (SELECT private.is_clinic_global_enabled()) THEN
      RAISE EXCEPTION 'clinic global gate is disabled or environment is mismatched' USING ERRCODE = '42501';
    END IF;
    IF v_organization.operational_status IN ('restricted', 'archived') THEN
      RAISE EXCEPTION 'organization status cannot be enabled' USING ERRCODE = '42501';
    END IF;
    SELECT count(*)::integer INTO v_owner_count
      FROM public.organization_memberships AS m
     WHERE m.organization_id = p_organization_id
       AND m.membership_role = 'owner'
       AND m.status = 'active';
    IF v_owner_count <> 1 THEN
      RAISE EXCEPTION 'organization must have exactly one active owner' USING ERRCODE = '23514';
    END IF;
    IF v_organization.operational_status = 'pending_setup' THEN
      UPDATE public.organizations
         SET operational_status = 'active',
             updated_at = clock_timestamp()
       WHERE id = p_organization_id;
      v_status_changed := true;
    END IF;
    IF v_old_enabled IS TRUE AND v_status_changed IS FALSE THEN
      RETURN jsonb_build_object(
        'organization_id', p_organization_id,
        'enabled', true,
        'operational_status', v_organization.operational_status,
        'status', 'unchanged'
      );
    END IF;
    INSERT INTO public.organization_feature_flags (
      organization_id,
      feature_key,
      enabled,
      created_by,
      created_by_type,
      reason
    )
    VALUES (p_organization_id, 'clinic', true, NULL, 'service_role', v_reason)
    ON CONFLICT (organization_id, feature_key) DO UPDATE
      SET enabled = true,
          created_by = NULL,
          created_by_type = 'service_role',
          reason = excluded.reason,
          updated_at = clock_timestamp()
    RETURNING * INTO v_flag;
    PERFORM private.record_organization_admin_event(
      p_event_type => 'organization_rollout_enabled',
      p_organization_id => p_organization_id,
      p_actor_type => 'service_role',
      p_reason => v_reason
    );
    RETURN jsonb_build_object(
      'organization_id', p_organization_id,
      'enabled', true,
      'operational_status', 'active',
      'status', 'enabled'
    );
  END IF;

  IF v_old_enabled IS FALSE AND FOUND IS TRUE THEN
    RETURN jsonb_build_object(
      'organization_id', p_organization_id,
      'enabled', false,
      'operational_status', v_organization.operational_status,
      'status', 'unchanged'
    );
  END IF;
  INSERT INTO public.organization_feature_flags (
    organization_id,
    feature_key,
    enabled,
    created_by,
    created_by_type,
    reason
  )
  VALUES (p_organization_id, 'clinic', false, NULL, 'service_role', v_reason)
  ON CONFLICT (organization_id, feature_key) DO UPDATE
    SET enabled = false,
        created_by = NULL,
        created_by_type = 'service_role',
        reason = excluded.reason,
        updated_at = clock_timestamp()
  RETURNING * INTO v_flag;
  PERFORM private.record_organization_admin_event(
    p_event_type => 'organization_rollout_disabled',
    p_organization_id => p_organization_id,
    p_actor_type => 'service_role',
    p_reason => v_reason
  );
  RETURN jsonb_build_object(
    'organization_id', p_organization_id,
    'enabled', false,
    'operational_status', v_organization.operational_status,
    'status', 'disabled'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_organization_with_owner(
  p_name text,
  p_legal_name text DEFAULT NULL,
  p_trade_name text DEFAULT NULL,
  p_document_number text DEFAULT NULL,
  p_contact_email text DEFAULT NULL,
  p_contact_phone text DEFAULT NULL,
  p_locale text DEFAULT 'pt-BR',
  p_timezone text DEFAULT 'America/Sao_Paulo'
)
RETURNS public.organizations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_organization public.organizations;
  v_membership public.organization_memberships;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authenticated user required' USING ERRCODE = '28000';
  END IF;
  IF NOT (SELECT private.is_clinic_global_enabled()) THEN
    RAISE EXCEPTION 'clinic feature is globally disabled' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.professionals WHERE id = v_actor) THEN
    RAISE EXCEPTION 'professional profile required' USING ERRCODE = '23503';
  END IF;
  IF nullif(btrim(coalesce(p_name, '')), '') IS NULL THEN
    RAISE EXCEPTION 'organization name is required' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.organizations (
    name, trade_name, legal_name, document_number, contact_email,
    contact_phone, locale, timezone, created_by
  )
  VALUES (
    btrim(p_name), nullif(btrim(p_trade_name), ''), nullif(btrim(p_legal_name), ''),
    nullif(btrim(p_document_number), ''), nullif(btrim(p_contact_email), ''),
    nullif(btrim(p_contact_phone), ''), btrim(coalesce(p_locale, 'pt-BR')),
    btrim(coalesce(p_timezone, 'America/Sao_Paulo')), v_actor
  )
  RETURNING * INTO v_organization;

  INSERT INTO public.organization_memberships (
    organization_id, professional_id, membership_role, status,
    clinical_access_enabled, created_by
  )
  VALUES (v_organization.id, v_actor, 'owner', 'active', false, v_actor)
  RETURNING * INTO v_membership;

  PERFORM private.record_organization_admin_event(
    p_event_type => 'organization_created',
    p_organization_id => v_organization.id,
    p_actor_professional_id => v_actor,
    p_subject_professional_id => v_actor,
    p_membership_id => v_membership.id,
    p_new_status => 'pending_setup'
  );
  RETURN v_organization;
END;
$$;

CREATE OR REPLACE FUNCTION public.transfer_organization_owner(
  p_organization_id uuid,
  p_target_professional_id uuid
)
RETURNS public.organization_memberships
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_organization public.organizations;
  v_current_owner public.organization_memberships;
  v_target public.organization_memberships;
  v_old_target_role text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authenticated user required' USING ERRCODE = '28000';
  END IF;
  IF NOT (SELECT private.is_clinic_feature_enabled(p_organization_id)) THEN
    RAISE EXCEPTION 'clinic feature is disabled for this organization' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_organization FROM public.organizations WHERE id = p_organization_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'organization not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_organization.operational_status = 'archived' THEN
    RAISE EXCEPTION 'archived organization cannot transfer ownership' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_current_owner
    FROM public.organization_memberships
   WHERE organization_id = p_organization_id
     AND professional_id = v_actor
     AND membership_role = 'owner'
     AND status = 'active'
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'current active owner authorization required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_target
    FROM public.organization_memberships
   WHERE organization_id = p_organization_id
     AND professional_id = p_target_professional_id
     AND status = 'active'
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'target must be an active membership in the same organization' USING ERRCODE = '42501';
  END IF;
  IF v_target.id = v_current_owner.id THEN RETURN v_target; END IF;
  v_old_target_role := v_target.membership_role;
  UPDATE public.organization_memberships
     SET membership_role = 'manager', updated_at = clock_timestamp()
   WHERE id = v_current_owner.id;
  UPDATE public.organization_memberships
     SET membership_role = 'owner', updated_at = clock_timestamp()
   WHERE id = v_target.id
  RETURNING * INTO v_target;
  PERFORM private.record_organization_admin_event(
    p_event_type => 'owner_transferred',
    p_organization_id => p_organization_id,
    p_actor_professional_id => v_actor,
    p_subject_professional_id => v_target.professional_id,
    p_membership_id => v_target.id,
    p_old_role => v_old_target_role,
    p_new_role => 'owner'
  );
  RETURN v_target;
END;
$$;

REVOKE ALL ON FUNCTION public.set_organization_clinic_rollout_state(uuid, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_organization_clinic_rollout_state(uuid, boolean, text) TO service_role;
REVOKE ALL ON FUNCTION public.create_organization_with_owner(text, text, text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_organization_with_owner(text, text, text, text, text, text, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.transfer_organization_owner(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_organization_owner(uuid, uuid) TO authenticated;

COMMIT;
