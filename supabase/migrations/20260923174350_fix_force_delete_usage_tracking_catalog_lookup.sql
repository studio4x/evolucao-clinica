-- Resolve the optional historical usage table only from the live catalog.
CREATE OR REPLACE FUNCTION public.force_delete_professional(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  v_usage_tracking_relation text;
BEGIN
  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'ID do usuário ausente.';
  END IF;

  BEGIN
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

    DELETE FROM public.usage_logs
    WHERE professional_id = target_user_id;

    SELECT format('%I.%I', ns.nspname, cls.relname)
    INTO v_usage_tracking_relation
    FROM pg_class AS cls
    JOIN pg_namespace AS ns ON ns.oid = cls.relnamespace
    WHERE ns.nspname = 'public'
      AND cls.relname = 'usage_tracking'
      AND cls.relkind IN ('r', 'p')
    LIMIT 1;

    IF v_usage_tracking_relation IS NOT NULL THEN
      EXECUTE format(
        'DELETE FROM %s WHERE professional_id = $1',
        v_usage_tracking_relation
      ) USING target_user_id;
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
