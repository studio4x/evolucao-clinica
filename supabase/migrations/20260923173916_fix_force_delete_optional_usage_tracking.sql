-- Make account destruction compatible with deployments where the historical
-- usage_tracking table is not present.
CREATE OR REPLACE FUNCTION public.force_delete_professional(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
BEGIN
  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'ID do usuário ausente.';
  END IF;

  BEGIN
    -- USER leaves PostgreSQL's internal FK constraint triggers enabled while
    -- bypassing signed/closed-month and other application-level protections.
    ALTER TABLE public.evolutions DISABLE TRIGGER USER;
    ALTER TABLE public.patient_reports DISABLE TRIGGER USER;
    ALTER TABLE public.patients DISABLE TRIGGER USER;
    ALTER TABLE public.patient_files DISABLE TRIGGER USER;
    ALTER TABLE public.patient_anamneses DISABLE TRIGGER USER;
    ALTER TABLE public.patient_anamnesis_revisions DISABLE TRIGGER USER;
    ALTER TABLE public.patient_sessions DISABLE TRIGGER USER;
    ALTER TABLE public.patient_session_signatures DISABLE TRIGGER USER;
    ALTER TABLE public.patient_session_audit DISABLE TRIGGER USER;
    ALTER TABLE public.patient_session_month_closures DISABLE TRIGGER USER;
    ALTER TABLE public.patient_session_packages DISABLE TRIGGER USER;

    -- Remove children first. This explicitly covers signatures, audit history,
    -- closed months and packages instead of relying on cascades to reach them.
    DELETE FROM public.patient_session_signatures
    WHERE professional_id = target_user_id;

    DELETE FROM public.patient_session_audit
    WHERE professional_id = target_user_id;

    DELETE FROM public.patient_session_month_closures
    WHERE professional_id = target_user_id;

    DELETE FROM public.patient_sessions
    WHERE professional_id = target_user_id;

    DELETE FROM public.patient_session_packages
    WHERE professional_id = target_user_id;

    DELETE FROM public.patient_anamnesis_revisions
    WHERE professional_id = target_user_id;

    DELETE FROM public.patient_anamneses
    WHERE professional_id = target_user_id;

    DELETE FROM public.patient_files
    WHERE patient_id IN (
      SELECT id FROM public.patients WHERE professional_id = target_user_id
    );

    DELETE FROM public.evolutions
    WHERE professional_id = target_user_id;

    DELETE FROM public.patient_reports
    WHERE professional_id = target_user_id;

    DELETE FROM public.patients
    WHERE professional_id = target_user_id;

    -- Remove direct professional-owned records before deleting the profile.
    DELETE FROM public.usage_logs
    WHERE professional_id = target_user_id;

    IF to_regclass('public.usage_tracking') IS NOT NULL THEN
      EXECUTE 'DELETE FROM public.usage_tracking WHERE professional_id = $1'
      USING target_user_id;
    END IF;

    DELETE FROM public.evolution_audio_budget_reservations
    WHERE professional_id = target_user_id;

    DELETE FROM public.billing_subscriptions
    WHERE professional_id = target_user_id;

    DELETE FROM public.transactions
    WHERE professional_id = target_user_id;

    DELETE FROM public.support_messages
    WHERE sender_id = target_user_id;

    DELETE FROM public.support_tickets
    WHERE user_id = target_user_id;

    DELETE FROM public.notifications
    WHERE user_id = target_user_id;

    DELETE FROM public.push_subscriptions
    WHERE user_id = target_user_id;

    DELETE FROM public.evolution_templates
    WHERE professional_id = target_user_id;

    DELETE FROM public.migration_requests
    WHERE user_id = target_user_id;

    DELETE FROM public.onboarding_notifications
    WHERE user_id = target_user_id;

    DELETE FROM public.app_feedback
    WHERE user_id = target_user_id;

    DELETE FROM public.admin_audit_logs
    WHERE actor_id = target_user_id;

    DELETE FROM public.professionals
    WHERE id = target_user_id;

    -- Restore every application trigger before the transaction can commit.
    ALTER TABLE public.evolutions ENABLE TRIGGER USER;
    ALTER TABLE public.patient_reports ENABLE TRIGGER USER;
    ALTER TABLE public.patients ENABLE TRIGGER USER;
    ALTER TABLE public.patient_files ENABLE TRIGGER USER;
    ALTER TABLE public.patient_anamneses ENABLE TRIGGER USER;
    ALTER TABLE public.patient_anamnesis_revisions ENABLE TRIGGER USER;
    ALTER TABLE public.patient_sessions ENABLE TRIGGER USER;
    ALTER TABLE public.patient_session_signatures ENABLE TRIGGER USER;
    ALTER TABLE public.patient_session_audit ENABLE TRIGGER USER;
    ALTER TABLE public.patient_session_month_closures ENABLE TRIGGER USER;
    ALTER TABLE public.patient_session_packages ENABLE TRIGGER USER;
  EXCEPTION
    WHEN OTHERS THEN
      -- The exception is re-raised so the whole RPC remains transactional.
      ALTER TABLE public.evolutions ENABLE TRIGGER USER;
      ALTER TABLE public.patient_reports ENABLE TRIGGER USER;
      ALTER TABLE public.patients ENABLE TRIGGER USER;
      ALTER TABLE public.patient_files ENABLE TRIGGER USER;
      ALTER TABLE public.patient_anamneses ENABLE TRIGGER USER;
      ALTER TABLE public.patient_anamnesis_revisions ENABLE TRIGGER USER;
      ALTER TABLE public.patient_sessions ENABLE TRIGGER USER;
      ALTER TABLE public.patient_session_signatures ENABLE TRIGGER USER;
      ALTER TABLE public.patient_session_audit ENABLE TRIGGER USER;
      ALTER TABLE public.patient_session_month_closures ENABLE TRIGGER USER;
      ALTER TABLE public.patient_session_packages ENABLE TRIGGER USER;
      RAISE;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.force_delete_professional(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.force_delete_professional(uuid) TO service_role;

COMMENT ON FUNCTION public.force_delete_professional(uuid) IS
  'Privileged, transactional account destruction. Application protections remain active outside this service-role-only RPC.';
