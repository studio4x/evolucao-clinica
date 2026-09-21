-- Diretório administrativo de clínicas. Exclusivamente staging; não expõe
-- pacientes, evoluções ou qualquer conteúdo clínico.
BEGIN;

DO $$
BEGIN
  IF (SELECT environment_name FROM private.runtime_environment WHERE id = true) IS DISTINCT FROM 'staging' THEN
    RAISE EXCEPTION 'Admin clinic directory requires staging';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.list_admin_clinic_directory()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'), auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service role authorization required' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(jsonb_agg(row_to_json(directory)::jsonb ORDER BY directory."createdAt" DESC, directory.id), '[]'::jsonb)
    INTO result
    FROM (
      SELECT o.id, o.name, o.trade_name AS "tradeName", o.operational_status AS "operationalStatus", o.created_at AS "createdAt",
        EXISTS (SELECT 1 FROM public.organization_feature_flags f WHERE f.organization_id = o.id AND f.feature_key = 'clinic' AND f.enabled IS TRUE) AS "featureEnabled",
        jsonb_build_object(
          'planCode', s.plan_code, 'billingCycle', s.billing_interval, 'financialStatus', s.financial_status,
          'entitlementMode', private.organization_entitlement_mode(o.id), 'currentPeriodEnd', s.current_period_end,
          'cancelAtPeriodEnd', coalesce(s.cancel_at_period_end, false), 'contractedSeats', coalesce(s.contracted_seats, 0)
        ) AS subscription,
        jsonb_build_object(
          'activeSeats', coalesce(seats.active_seats, 0), 'reservedSeats', coalesce(seats.reserved_seats, 0),
          'availableSeats', coalesce(seats.available_seats, 0), 'minimumSeats', coalesce(s.minimum_contracted_seats, 3)
        ) AS "seatUsage",
        jsonb_build_object(
          'total', coalesce(members.total, 0), 'clinical', coalesce(members.clinical, 0), 'administrative', coalesce(members.administrative, 0)
        ) AS members,
        coalesce((SELECT jsonb_agg(jsonb_build_object(
          'id', m.id, 'name', p.full_name, 'email', p.google_email, 'role', m.membership_role,
          'clinicalAccessEnabled', m.clinical_access_enabled, 'status', m.status
        ) ORDER BY CASE m.membership_role WHEN 'owner' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END, lower(coalesce(p.full_name, '')), m.id)
          FROM public.organization_memberships m
          LEFT JOIN public.professionals p ON p.id = m.professional_id
          WHERE m.organization_id = o.id AND m.status = 'active'), '[]'::jsonb) AS "memberList",
        jsonb_build_object(
          'total', coalesce(invites.total, 0), 'clinicalReserved', coalesce(invites.clinical_reserved, 0)
        ) AS "pendingInvitations",
        jsonb_build_object(
          'professionalId', owner.professional_id, 'name', owner.full_name, 'email', owner.google_email
        ) AS owner,
        CASE coalesce(owner_count.owner_count, 0) WHEN 1 THEN 'OK' WHEN 0 THEN 'MISSING' ELSE 'MULTIPLE' END AS "ownerIntegrity"
      FROM public.organizations o
      LEFT JOIN private.organization_subscriptions s ON s.organization_id = o.id
      LEFT JOIN LATERAL (
        SELECT
          (SELECT count(*) FROM public.organization_memberships m WHERE m.organization_id = o.id AND m.status = 'active' AND m.clinical_access_enabled IS TRUE) AS active_seats,
          (SELECT count(*) FROM public.organization_invitations i WHERE i.organization_id = o.id AND i.status = 'pending' AND i.expires_at > clock_timestamp() AND i.intended_clinical_access IS TRUE) AS reserved_seats,
          coalesce(s.contracted_seats, 0)::bigint
            - (SELECT count(*) FROM public.organization_memberships m WHERE m.organization_id = o.id AND m.status = 'active' AND m.clinical_access_enabled IS TRUE)
            - (SELECT count(*) FROM public.organization_invitations i WHERE i.organization_id = o.id AND i.status = 'pending' AND i.expires_at > clock_timestamp() AND i.intended_clinical_access IS TRUE) AS available_seats
      ) seats ON true
      LEFT JOIN LATERAL (
        SELECT count(*) FILTER (WHERE m.status = 'active') AS total,
               count(*) FILTER (WHERE m.status = 'active' AND m.clinical_access_enabled IS TRUE) AS clinical,
               count(*) FILTER (WHERE m.status = 'active' AND m.clinical_access_enabled IS FALSE) AS administrative
        FROM public.organization_memberships m WHERE m.organization_id = o.id
      ) members ON true
      LEFT JOIN LATERAL (
        SELECT count(*) FILTER (WHERE i.status = 'pending' AND i.expires_at > clock_timestamp()) AS total,
               count(*) FILTER (WHERE i.status = 'pending' AND i.expires_at > clock_timestamp() AND i.intended_clinical_access IS TRUE) AS clinical_reserved
        FROM public.organization_invitations i WHERE i.organization_id = o.id
      ) invites ON true
      LEFT JOIN LATERAL (
        SELECT count(*) AS owner_count
        FROM public.organization_memberships m
        WHERE m.organization_id = o.id
          AND m.membership_role = 'owner'
          AND m.status = 'active'
      ) owner_count ON true
      LEFT JOIN LATERAL (
        SELECT m.professional_id, p.full_name, p.google_email
        FROM public.organization_memberships m
        LEFT JOIN public.professionals p ON p.id = m.professional_id
        WHERE m.organization_id = o.id
          AND m.membership_role = 'owner'
          AND m.status = 'active'
        ORDER BY m.id
        LIMIT 1
      ) owner ON true
    ) directory;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.list_admin_clinic_directory() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_admin_clinic_directory() TO service_role;

COMMIT;
