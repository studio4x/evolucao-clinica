-- Fase 1B1: fundação de organizações e memberships.
-- Aplicar exclusivamente no projeto Supabase staging hwkdwinfckmjoriqxbjk.
-- Este artefato não deve ser incluído no fluxo histórico de migrations.

BEGIN;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  legal_name text,
  trade_name text,
  document_number text,
  contact_email text,
  contact_phone text,
  operational_status text NOT NULL DEFAULT 'pending_setup'
    CHECK (operational_status IN ('pending_setup', 'active', 'restricted', 'archived')),
  locale text NOT NULL DEFAULT 'pt-BR',
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  created_by uuid NOT NULL
    REFERENCES public.professionals(id) ON DELETE NO ACTION,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organizations_name_length CHECK (char_length(btrim(name)) BETWEEN 2 AND 200),
  CONSTRAINT organizations_legal_name_length CHECK (
    legal_name IS NULL OR char_length(btrim(legal_name)) BETWEEN 2 AND 200
  ),
  CONSTRAINT organizations_trade_name_length CHECK (
    trade_name IS NULL OR char_length(btrim(trade_name)) BETWEEN 2 AND 200
  ),
  CONSTRAINT organizations_document_length CHECK (
    document_number IS NULL OR char_length(btrim(document_number)) BETWEEN 3 AND 64
  ),
  CONSTRAINT organizations_contact_email_length CHECK (
    contact_email IS NULL OR char_length(btrim(contact_email)) <= 320
  ),
  CONSTRAINT organizations_contact_phone_length CHECK (
    contact_phone IS NULL OR char_length(btrim(contact_phone)) <= 32
  ),
  CONSTRAINT organizations_locale_length CHECK (char_length(btrim(locale)) BETWEEN 2 AND 32),
  CONSTRAINT organizations_timezone_length CHECK (char_length(btrim(timezone)) BETWEEN 2 AND 64)
);

CREATE TABLE public.organization_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL
    REFERENCES public.organizations(id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  professional_id uuid NOT NULL
    REFERENCES public.professionals(id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  membership_role text NOT NULL
    CHECK (membership_role IN ('owner', 'manager', 'professional')),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'removed')),
  clinical_access_enabled boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL
    REFERENCES public.professionals(id) ON DELETE NO ACTION,
  joined_at timestamptz NOT NULL DEFAULT now(),
  suspended_at timestamptz,
  removed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_memberships_removed_timestamps CHECK (
    (status = 'removed' AND removed_at IS NOT NULL)
    OR (status <> 'removed')
  ),
  CONSTRAINT organization_memberships_suspended_timestamp CHECK (
    (status = 'suspended' AND suspended_at IS NOT NULL)
    OR (status <> 'suspended')
  )
);

CREATE UNIQUE INDEX organization_memberships_one_non_removed
  ON public.organization_memberships (organization_id, professional_id)
  WHERE status <> 'removed';

CREATE UNIQUE INDEX organization_memberships_one_active_owner
  ON public.organization_memberships (organization_id)
  WHERE membership_role = 'owner' AND status = 'active';

CREATE INDEX organization_memberships_by_organization
  ON public.organization_memberships (organization_id);

CREATE INDEX organization_memberships_by_professional
  ON public.organization_memberships (professional_id);

CREATE INDEX organizations_by_created_by
  ON public.organizations (created_by);

CREATE INDEX organization_memberships_by_created_by
  ON public.organization_memberships (created_by);

CREATE INDEX organization_memberships_active_lookup
  ON public.organization_memberships (professional_id, organization_id)
  WHERE status = 'active';

CREATE OR REPLACE FUNCTION private.assert_one_active_owner_for_org(p_organization_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
DECLARE
  v_owner_count integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.organizations WHERE id = p_organization_id
  ) THEN
    RETURN;
  END IF;

  SELECT count(*)::integer
    INTO v_owner_count
    FROM public.organization_memberships
   WHERE organization_id = p_organization_id
     AND membership_role = 'owner'
     AND status = 'active';

  IF v_owner_count <> 1 THEN
    RAISE EXCEPTION 'organization must have exactly one active owner'
      USING ERRCODE = '23514',
            DETAIL = 'Use create_organization_with_owner or transfer_organization_owner.';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION private.assert_one_active_owner_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
BEGIN
  IF TG_TABLE_NAME = 'organizations' THEN
    IF TG_OP <> 'DELETE' THEN
      PERFORM private.assert_one_active_owner_for_org(NEW.id);
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM private.assert_one_active_owner_for_org(OLD.organization_id);
  ELSE
    IF TG_OP = 'UPDATE'
       AND OLD.organization_id IS DISTINCT FROM NEW.organization_id THEN
      PERFORM private.assert_one_active_owner_for_org(OLD.organization_id);
    END IF;
    PERFORM private.assert_one_active_owner_for_org(NEW.organization_id);
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER organizations_one_active_owner
AFTER INSERT OR UPDATE ON public.organizations
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION private.assert_one_active_owner_trigger();

CREATE CONSTRAINT TRIGGER memberships_one_active_owner
AFTER INSERT OR UPDATE OR DELETE ON public.organization_memberships
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION private.assert_one_active_owner_trigger();

CREATE OR REPLACE FUNCTION private.is_organization_member(p_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL
     AND EXISTS (
       SELECT 1
         FROM public.organization_memberships AS m
         JOIN public.organizations AS o ON o.id = m.organization_id
        WHERE m.organization_id = p_organization_id
          AND m.professional_id = (SELECT auth.uid())
          AND m.status = 'active'
          AND o.operational_status <> 'archived'
     );
$$;

CREATE OR REPLACE FUNCTION private.has_organization_role(
  p_organization_id uuid,
  p_roles text[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
  SELECT (SELECT private.is_organization_member(p_organization_id))
     AND EXISTS (
       SELECT 1
         FROM public.organization_memberships AS m
        WHERE m.organization_id = p_organization_id
          AND m.professional_id = (SELECT auth.uid())
          AND m.status = 'active'
          AND m.membership_role = ANY (p_roles)
     );
$$;

CREATE OR REPLACE FUNCTION private.has_clinical_access(p_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
  SELECT (SELECT private.is_organization_member(p_organization_id))
     AND EXISTS (
       SELECT 1
         FROM public.organization_memberships AS m
        WHERE m.organization_id = p_organization_id
          AND m.professional_id = (SELECT auth.uid())
          AND m.status = 'active'
          AND m.clinical_access_enabled IS TRUE
     );
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
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authenticated user required' USING ERRCODE = '28000';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.professionals WHERE id = v_actor) THEN
    RAISE EXCEPTION 'professional profile required' USING ERRCODE = '23503';
  END IF;

  IF nullif(btrim(coalesce(p_name, '')), '') IS NULL THEN
    RAISE EXCEPTION 'organization name is required' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.organizations (
    name,
    trade_name,
    legal_name,
    document_number,
    contact_email,
    contact_phone,
    locale,
    timezone,
    created_by
  )
  VALUES (
    btrim(p_name),
    nullif(btrim(p_trade_name), ''),
    nullif(btrim(p_legal_name), ''),
    nullif(btrim(p_document_number), ''),
    nullif(btrim(p_contact_email), ''),
    nullif(btrim(p_contact_phone), ''),
    btrim(coalesce(p_locale, 'pt-BR')),
    btrim(coalesce(p_timezone, 'America/Sao_Paulo')),
    v_actor
  )
  RETURNING * INTO v_organization;

  INSERT INTO public.organization_memberships (
    organization_id,
    professional_id,
    membership_role,
    status,
    clinical_access_enabled,
    created_by
  )
  VALUES (
    v_organization.id,
    v_actor,
    'owner',
    'active',
    false,
    v_actor
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
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authenticated user required' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_organization
    FROM public.organizations
   WHERE id = p_organization_id
   FOR UPDATE;
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
   FOR UPDATE;
  IF NOT FOUND OR v_target.status <> 'active' THEN
    RAISE EXCEPTION 'target must be an active membership in the same organization'
      USING ERRCODE = '42501';
  END IF;

  IF v_target.id = v_current_owner.id THEN
    RETURN v_target;
  END IF;

  -- Safe policy for the unspecified previous role: retain the former owner as manager.
  UPDATE public.organization_memberships
     SET membership_role = 'manager',
         updated_at = clock_timestamp()
   WHERE id = v_current_owner.id;

  UPDATE public.organization_memberships
     SET membership_role = 'owner',
         updated_at = clock_timestamp()
   WHERE id = v_target.id
  RETURNING * INTO v_target;

  RETURN v_target;
END;
$$;

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY organizations_select_active_member
  ON public.organizations
  FOR SELECT
  TO authenticated
  USING ((SELECT private.is_organization_member(id)));

CREATE POLICY memberships_select_active_member
  ON public.organization_memberships
  FOR SELECT
  TO authenticated
  USING ((SELECT private.is_organization_member(organization_id)));

REVOKE ALL ON TABLE public.organizations FROM anon, authenticated;
REVOKE ALL ON TABLE public.organization_memberships FROM anon, authenticated;
GRANT SELECT ON TABLE public.organizations TO authenticated;
GRANT SELECT ON TABLE public.organization_memberships TO authenticated;
GRANT ALL ON TABLE public.organizations TO service_role;
GRANT ALL ON TABLE public.organization_memberships TO service_role;

REVOKE EXECUTE ON FUNCTION private.assert_one_active_owner_for_org(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.assert_one_active_owner_trigger() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.is_organization_member(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.has_organization_role(uuid, text[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.has_clinical_access(uuid) FROM PUBLIC, anon, authenticated;

-- RLS evaluates this helper as authenticated; the schema is not exposed by PostgREST.
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_organization_member(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.create_organization_with_owner(
  text, text, text, text, text, text, text, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.transfer_organization_owner(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_organization_with_owner(
  text, text, text, text, text, text, text, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_organization_owner(uuid, uuid) TO authenticated;

COMMIT;
