-- Lifecycle Automation: eventos persistentes derivados das tabelas de domínio.
-- Triggers não enviam e-mail; apenas registram eventos técnicos e idempotentes.

CREATE OR REPLACE FUNCTION public.record_lifecycle_event(
  p_user_id uuid,
  p_event_name text,
  p_source text,
  p_entity_type text DEFAULT NULL,
  p_entity_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_idempotency_key text DEFAULT NULL,
  p_occurred_at timestamptz DEFAULT now()
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inserted_id uuid;
BEGIN
  IF p_user_id IS NULL THEN RETURN NULL; END IF;
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO inserted_id FROM public.lifecycle_events WHERE idempotency_key = p_idempotency_key LIMIT 1;
    IF inserted_id IS NOT NULL THEN RETURN inserted_id; END IF;
  END IF;
  INSERT INTO public.lifecycle_events (user_id, event_name, source, entity_type, entity_id, occurred_at, idempotency_key, metadata)
  VALUES (p_user_id, p_event_name, p_source, p_entity_type, p_entity_id, p_occurred_at, p_idempotency_key, COALESCE(p_metadata, '{}'::jsonb))
  RETURNING id INTO inserted_id;
  RETURN inserted_id;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[lifecycle] evento não registrado: %', SQLERRM;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.lifecycle_professionals_event_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.record_lifecycle_event(NEW.id, 'user_registered', 'database_trigger', 'professional', NEW.id, '{}'::jsonb, 'user_registered:' || NEW.id);
    IF NEW.status = 'active' THEN
      PERFORM public.record_lifecycle_event(NEW.id, 'user_activated', 'database_trigger', 'professional', NEW.id, '{}'::jsonb, 'user_activated:' || NEW.id);
    END IF;
    IF NEW.subscription_status = 'trialing' THEN
      PERFORM public.record_lifecycle_event(NEW.id, 'trial_started', 'database_trigger', 'professional', NEW.id, jsonb_build_object('trial_ends_at', NEW.trial_ends_at), 'trial_started:' || NEW.id);
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'active' THEN
    PERFORM public.record_lifecycle_event(NEW.id, 'user_activated', 'database_trigger', 'professional', NEW.id, '{}'::jsonb, 'user_activated:' || NEW.id);
  END IF;
  IF OLD.updated_at IS DISTINCT FROM NEW.updated_at THEN
    PERFORM public.record_lifecycle_event(NEW.id, 'profile_updated', 'database_trigger', 'professional', NEW.id, '{}'::jsonb, 'profile_updated:' || NEW.id || ':' || NEW.updated_at::text);
  END IF;
  IF OLD.professional_title IS DISTINCT FROM NEW.professional_title THEN
    PERFORM public.record_lifecycle_event(NEW.id, 'profession_selected', 'database_trigger', 'professional', NEW.id, jsonb_build_object('profession', NEW.professional_title), 'profession_selected:' || NEW.id || ':' || COALESCE(NEW.professional_title, ''));
  END IF;
  IF OLD.onboarding_completed IS DISTINCT FROM NEW.onboarding_completed AND NEW.onboarding_completed = true THEN
    PERFORM public.record_lifecycle_event(NEW.id, 'onboarding_completed', 'database_trigger', 'professional', NEW.id, '{}'::jsonb, 'onboarding_completed:' || NEW.id);
  END IF;
  IF OLD.last_backup_at IS DISTINCT FROM NEW.last_backup_at AND NEW.last_backup_at IS NOT NULL THEN
    PERFORM public.record_lifecycle_event(NEW.id, 'backup_configured', 'database_trigger', 'professional', NEW.id, '{}'::jsonb, 'backup_configured:' || NEW.id || ':' || NEW.last_backup_at::text);
  END IF;
  IF OLD.custom_logo_url IS DISTINCT FROM NEW.custom_logo_url AND NULLIF(NEW.custom_logo_url, '') IS NOT NULL THEN
    PERFORM public.record_lifecycle_event(NEW.id, 'custom_logo_added', 'database_trigger', 'professional', NEW.id, '{}'::jsonb, 'custom_logo_added:' || NEW.id || ':' || NEW.updated_at::text);
  END IF;

  IF OLD.subscription_status IS DISTINCT FROM NEW.subscription_status THEN
    PERFORM public.record_lifecycle_event(NEW.id, 'subscription_status_changed', 'database_trigger', 'professional', NEW.id, jsonb_build_object('status', NEW.subscription_status), 'subscription_status_changed:' || NEW.id || ':' || NEW.updated_at::text);
    IF NEW.subscription_status = 'active' AND OLD.subscription_status IS DISTINCT FROM 'active' THEN
      PERFORM public.record_lifecycle_event(NEW.id, 'subscription_started', 'database_trigger', 'professional', NEW.id, '{}'::jsonb, 'subscription_started:' || NEW.id || ':' || NEW.updated_at::text);
      UPDATE public.lifecycle_dispatches
      SET status = 'cancelled', skip_reason = 'subscription_started', skipped_at = now(), updated_at = now()
      WHERE user_id = NEW.id AND (metadata ->> 'commercial') = 'true' AND status IN ('queued', 'retry', 'processing');
    ELSIF NEW.subscription_status = 'canceled' THEN
      PERFORM public.record_lifecycle_event(NEW.id, 'subscription_cancelled', 'database_trigger', 'professional', NEW.id, '{}'::jsonb, 'subscription_cancelled:' || NEW.id || ':' || NEW.updated_at::text);
    END IF;
  ELSIF NEW.subscription_status = 'active' AND OLD.subscription_ends_at IS DISTINCT FROM NEW.subscription_ends_at THEN
    PERFORM public.record_lifecycle_event(NEW.id, 'subscription_renewed', 'database_trigger', 'professional', NEW.id, '{}'::jsonb, 'subscription_renewed:' || NEW.id || ':' || NEW.updated_at::text);
  END IF;
  IF OLD.subscription_status IS DISTINCT FROM NEW.subscription_status AND NEW.subscription_status = 'trialing' THEN
    PERFORM public.record_lifecycle_event(NEW.id, 'trial_started', 'database_trigger', 'professional', NEW.id, jsonb_build_object('trial_ends_at', NEW.trial_ends_at), 'trial_started:' || NEW.id || ':' || NEW.updated_at::text);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lifecycle_professionals_events ON public.professionals;
CREATE TRIGGER lifecycle_professionals_events AFTER INSERT OR UPDATE ON public.professionals
FOR EACH ROW EXECUTE FUNCTION public.lifecycle_professionals_event_trigger();

CREATE OR REPLACE FUNCTION public.lifecycle_patients_event_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.record_lifecycle_event(NEW.professional_id, 'patient_created', 'database_trigger', 'patient', NEW.id, jsonb_build_object('has_google_doc', NULLIF(NEW.google_doc_id, '') IS NOT NULL), 'patient_created:' || NEW.id);
    IF NULLIF(NEW.google_doc_id, '') IS NOT NULL THEN
      PERFORM public.record_lifecycle_event(NEW.professional_id, 'patient_record_linked', 'database_trigger', 'patient', NEW.id, '{}'::jsonb, 'patient_record_linked:' || NEW.id);
    END IF;
  ELSIF OLD.google_doc_id IS DISTINCT FROM NEW.google_doc_id AND NULLIF(NEW.google_doc_id, '') IS NOT NULL THEN
    PERFORM public.record_lifecycle_event(NEW.professional_id, 'patient_record_linked', 'database_trigger', 'patient', NEW.id, '{}'::jsonb, 'patient_record_linked:' || NEW.id || ':' || NEW.updated_at::text);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lifecycle_patients_events ON public.patients;
CREATE TRIGGER lifecycle_patients_events AFTER INSERT OR UPDATE ON public.patients
FOR EACH ROW EXECUTE FUNCTION public.lifecycle_patients_event_trigger();

CREATE OR REPLACE FUNCTION public.lifecycle_evolutions_event_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.transcription_status = 'processing' THEN
    PERFORM public.record_lifecycle_event(NEW.professional_id, 'evolution_started', 'database_trigger', 'evolution', NEW.id, jsonb_build_object('status', NEW.transcription_status), 'evolution_started:' || NEW.id);
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.transcription_status IS DISTINCT FROM NEW.transcription_status AND NEW.transcription_status = 'processing' THEN
    PERFORM public.record_lifecycle_event(NEW.professional_id, 'evolution_started', 'database_trigger', 'evolution', NEW.id, jsonb_build_object('status', NEW.transcription_status), 'evolution_started:' || NEW.id || ':' || NEW.updated_at::text);
  END IF;
  IF (TG_OP = 'INSERT' OR OLD.transcription_status IS DISTINCT FROM NEW.transcription_status OR OLD.google_doc_append_status IS DISTINCT FROM NEW.google_doc_append_status)
     AND NEW.transcription_status = 'completed' AND NEW.google_doc_append_status = 'completed' THEN
    PERFORM public.record_lifecycle_event(NEW.professional_id, 'evolution_completed', 'database_trigger', 'evolution', NEW.id, '{}'::jsonb, 'evolution_completed:' || NEW.id);
    IF COALESCE(NEW.audio_duration_seconds, 0) > 0 THEN
      PERFORM public.record_lifecycle_event(NEW.professional_id, 'audio_evolution_completed', 'database_trigger', 'evolution', NEW.id, jsonb_build_object('audio_duration_seconds', NEW.audio_duration_seconds), 'audio_evolution_completed:' || NEW.id);
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND (OLD.transcription_status IS DISTINCT FROM NEW.transcription_status OR OLD.google_doc_append_status IS DISTINCT FROM NEW.google_doc_append_status)
     AND (NEW.transcription_status = 'failed' OR NEW.google_doc_append_status = 'failed') THEN
    PERFORM public.record_lifecycle_event(NEW.professional_id, 'evolution_failed', 'database_trigger', 'evolution', NEW.id, jsonb_build_object('transcription_status', NEW.transcription_status, 'google_doc_append_status', NEW.google_doc_append_status), 'evolution_failed:' || NEW.id || ':' || NEW.updated_at::text);
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'signed' THEN
    PERFORM public.record_lifecycle_event(NEW.professional_id, 'digital_signature_used', 'database_trigger', 'evolution', NEW.id, '{}'::jsonb, 'digital_signature_used:evolution:' || NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lifecycle_evolutions_events ON public.evolutions;
CREATE TRIGGER lifecycle_evolutions_events AFTER INSERT OR UPDATE ON public.evolutions
FOR EACH ROW EXECUTE FUNCTION public.lifecycle_evolutions_event_trigger();

CREATE OR REPLACE FUNCTION public.lifecycle_patient_reports_event_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.record_lifecycle_event(NEW.professional_id, 'report_generated', 'database_trigger', 'patient_report', NEW.id, '{}'::jsonb, 'report_generated:' || NEW.id);
  ELSIF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'signed' THEN
    PERFORM public.record_lifecycle_event(NEW.professional_id, 'digital_signature_used', 'database_trigger', 'patient_report', NEW.id, '{}'::jsonb, 'digital_signature_used:report:' || NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lifecycle_patient_reports_events ON public.patient_reports;
CREATE TRIGGER lifecycle_patient_reports_events AFTER INSERT OR UPDATE ON public.patient_reports
FOR EACH ROW EXECUTE FUNCTION public.lifecycle_patient_reports_event_trigger();

CREATE OR REPLACE FUNCTION public.lifecycle_migration_requests_event_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.record_lifecycle_event(NEW.user_id, 'migration_requested', 'database_trigger', 'migration_request', NEW.id, jsonb_build_object('status', NEW.status), 'migration_requested:' || NEW.id);
  ELSIF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'completed' THEN
    PERFORM public.record_lifecycle_event(NEW.user_id, 'migration_completed', 'database_trigger', 'migration_request', NEW.id, '{}'::jsonb, 'migration_completed:' || NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lifecycle_migration_requests_events ON public.migration_requests;
CREATE TRIGGER lifecycle_migration_requests_events AFTER INSERT OR UPDATE ON public.migration_requests
FOR EACH ROW EXECUTE FUNCTION public.lifecycle_migration_requests_event_trigger();
