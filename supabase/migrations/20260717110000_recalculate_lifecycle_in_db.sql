-- Migration: Database-level User Lifecycle Recalculation
-- Target: Supabase PostgreSQL Database

-- 1. Helper Function: Normalize Profession Segment
CREATE OR REPLACE FUNCTION public.normalize_profession_segment(value text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  normalized text;
BEGIN
  -- Lowercase and strip accents/diacritics
  normalized := translate(lower(coalesce(value, '')), 
    'áàâãäéèêëíìîïóòôõöúùûüçñýÿ', 
    'aaaaaeeeeiiiiooooouuuucnyy');
  
  IF normalized LIKE '%terapeuta ocupacional%' THEN
    RETURN 'occupational_therapy';
  ELSIF normalized LIKE '%psicolog%' THEN
    RETURN 'psychology';
  ELSIF normalized LIKE '%fisioter%' THEN
    RETURN 'physiotherapy';
  ELSIF normalized LIKE '%fonoaudi%' THEN
    RETURN 'speech_therapy';
  ELSIF normalized LIKE '%psicopedagog%' THEN
    RETURN 'psychopedagogy';
  ELSIF normalized LIKE '%nutri%' THEN
    RETURN 'nutrition';
  ELSIF normalized LIKE '%enferm%' THEN
    RETURN 'nursing';
  ELSIF normalized LIKE '%medic%' OR normalized LIKE '%doutor%' OR normalized LIKE '%cirurg%' THEN
    RETURN 'medical';
  ELSIF normalized LIKE '%clinica%' THEN
    RETURN 'clinic';
  ELSE
    RETURN 'other';
  END IF;
END;
$$;

-- 2. Helper Function: Calculate Activation Level
CREATE OR REPLACE FUNCTION public.calculate_activation_level(
  logged_in boolean,
  patients_count integer,
  linked_records_count integer,
  evolutions_count integer,
  usage_days_count integer,
  resources_count integer
)
RETURNS integer LANGUAGE plpgsql AS $$
BEGIN
  IF resources_count > 1 OR (evolutions_count >= 3 AND usage_days_count >= 2 AND resources_count > 0) THEN
    RETURN 6;
  ELSIF evolutions_count >= 3 AND usage_days_count >= 2 THEN
    RETURN 5;
  ELSIF evolutions_count > 0 THEN
    RETURN 4;
  ELSIF linked_records_count > 0 THEN
    RETURN 3;
  ELSIF patients_count > 0 THEN
    RETURN 2;
  ELSIF logged_in THEN
    RETURN 1;
  ELSE
    RETURN 0;
  END IF;
END;
$$;

-- 3. Helper Function: Activation Status for Level
CREATE OR REPLACE FUNCTION public.activation_status_for_level(level integer, subscription_status text)
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  IF subscription_status = 'canceled' THEN
    RETURN 'churned';
  ELSIF level >= 6 THEN
    RETURN 'advanced';
  ELSIF level >= 5 THEN
    RETURN 'recurring';
  ELSIF level >= 4 THEN
    RETURN 'activated';
  ELSIF level = 3 THEN
    RETURN 'record_linked';
  ELSIF level = 2 THEN
    RETURN 'patient_created';
  ELSIF level = 1 THEN
    RETURN 'profile_started';
  ELSE
    RETURN 'registered';
  END IF;
END;
$$;

-- 4. Main Function: Recalculate Lifecycle User State in DB
CREATE OR REPLACE FUNCTION public.recalculate_lifecycle_user_state(target_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  prof RECORD;
  var_patients_count integer;
  var_linked_records_count integer;
  var_evolutions_count integer;
  var_processing_evolutions_count integer;
  var_failed_evolutions_count integer;
  var_audio_evolutions_count integer;
  var_reports_count integer;
  var_migrations_count integer;
  var_resources_count integer;
  var_usage_days_count integer;
  
  var_first_login_at timestamptz;
  var_last_login_at timestamptz;
  var_first_patient_at timestamptz;
  var_latest_patient_at timestamptz;
  var_first_record_linked_at timestamptz;
  var_first_evolution_completed_at timestamptz;
  var_latest_evolution_at timestamptz;
  var_onboarding_completed_at timestamptz;
  var_subscription_started_at timestamptz;
  var_subscription_cancelled_at timestamptz;
  
  var_latest_activity timestamptz;
  var_distinct_activity_days text[];
  var_level integer;
  var_status text;
  
  var_last_relationship_email_at timestamptz;
  var_next_relationship_email_eligible_at timestamptz;
  
  result_row RECORD;
BEGIN
  -- Get professional details
  SELECT * INTO prof FROM public.professionals WHERE id = target_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profissional nao encontrado.';
  END IF;

  -- 1. Counts
  SELECT count(*)::integer INTO var_patients_count FROM public.patients WHERE professional_id = target_user_id;
  SELECT count(*)::integer INTO var_linked_records_count FROM public.patients WHERE professional_id = target_user_id AND google_doc_id IS NOT NULL AND trim(google_doc_id) <> '';
  
  SELECT count(*)::integer INTO var_evolutions_count FROM public.evolutions 
  WHERE professional_id = target_user_id AND transcription_status = 'completed' AND google_doc_append_status = 'completed';
  
  SELECT count(*)::integer INTO var_processing_evolutions_count FROM public.evolutions 
  WHERE professional_id = target_user_id AND (transcription_status = 'processing' OR google_doc_append_status = 'pending') 
    AND created_at < now() - interval '30 minutes';
    
  SELECT count(*)::integer INTO var_failed_evolutions_count FROM public.evolutions 
  WHERE professional_id = target_user_id AND (transcription_status = 'failed' OR google_doc_append_status = 'failed');
  
  SELECT count(*)::integer INTO var_audio_evolutions_count FROM public.evolutions 
  WHERE professional_id = target_user_id AND transcription_status = 'completed' AND google_doc_append_status = 'completed' 
    AND coalesce(audio_duration_seconds, 0) > 0;
    
  SELECT count(*)::integer INTO var_reports_count FROM public.patient_reports WHERE professional_id = target_user_id;
  
  SELECT count(*)::integer INTO var_migrations_count FROM public.migration_requests WHERE user_id = target_user_id AND status <> 'cancelled';
  
  SELECT count(distinct event_name)::integer INTO var_resources_count FROM public.lifecycle_events 
  WHERE user_id = target_user_id AND event_name IN ('report_generated', 'migration_completed', 'backup_configured', 'custom_logo_added', 'digital_signature_used', 'feature_discovered');

  -- 2. Activity dates & days
  SELECT count(distinct d)::integer, array_agg(d::text ORDER BY d ASC) INTO var_usage_days_count, var_distinct_activity_days FROM (
    SELECT DISTINCT (occurred_at AT TIME ZONE 'America/Sao_Paulo')::date as d FROM public.lifecycle_events WHERE user_id = target_user_id
    UNION
    SELECT DISTINCT (created_at AT TIME ZONE 'America/Sao_Paulo')::date as d FROM public.patients WHERE professional_id = target_user_id
    UNION
    SELECT DISTINCT (created_at AT TIME ZONE 'America/Sao_Paulo')::date as d FROM public.evolutions WHERE professional_id = target_user_id
    UNION
    SELECT DISTINCT (created_at AT TIME ZONE 'America/Sao_Paulo')::date as d FROM public.patient_reports WHERE professional_id = target_user_id
  ) sub;

  -- 3. Latest Activity
  SELECT max(dt) INTO var_latest_activity FROM (
    SELECT updated_at as dt FROM public.professionals WHERE id = target_user_id
    UNION ALL
    SELECT occurred_at as dt FROM public.lifecycle_events WHERE user_id = target_user_id
    UNION ALL
    SELECT coalesce(updated_at, created_at) as dt FROM public.patients WHERE professional_id = target_user_id
    UNION ALL
    SELECT coalesce(updated_at, created_at) as dt FROM public.evolutions WHERE professional_id = target_user_id
  ) sub;

  -- 4. Timestamps
  SELECT occurred_at INTO var_first_login_at FROM public.lifecycle_events WHERE user_id = target_user_id AND event_name = 'user_logged_in' ORDER BY occurred_at ASC LIMIT 1;
  SELECT occurred_at INTO var_last_login_at FROM public.lifecycle_events WHERE user_id = target_user_id AND event_name = 'user_logged_in' ORDER BY occurred_at DESC LIMIT 1;
  
  SELECT min(created_at), max(created_at) INTO var_first_patient_at, var_latest_patient_at FROM public.patients WHERE professional_id = target_user_id;
  
  SELECT occurred_at INTO var_first_record_linked_at FROM public.lifecycle_events WHERE user_id = target_user_id AND event_name = 'patient_record_linked' ORDER BY occurred_at ASC LIMIT 1;
  
  SELECT occurred_at INTO var_first_evolution_completed_at FROM public.lifecycle_events WHERE user_id = target_user_id AND event_name = 'evolution_completed' ORDER BY occurred_at ASC LIMIT 1;
  SELECT max(occurred_at) INTO var_latest_evolution_at FROM public.lifecycle_events WHERE user_id = target_user_id AND event_name = 'evolution_completed';
  
  SELECT occurred_at INTO var_onboarding_completed_at FROM public.lifecycle_events WHERE user_id = target_user_id AND event_name = 'onboarding_completed' ORDER BY occurred_at ASC LIMIT 1;
  IF var_onboarding_completed_at IS NULL AND prof.onboarding_completed IS TRUE THEN
    var_onboarding_completed_at := prof.updated_at;
  END IF;

  SELECT occurred_at INTO var_subscription_started_at FROM public.lifecycle_events WHERE user_id = target_user_id AND event_name = 'subscription_started' ORDER BY occurred_at DESC LIMIT 1;
  SELECT occurred_at INTO var_subscription_cancelled_at FROM public.lifecycle_events WHERE user_id = target_user_id AND event_name = 'subscription_cancelled' ORDER BY occurred_at DESC LIMIT 1;

  -- Get last relationship values
  SELECT last_relationship_email_at, next_relationship_email_eligible_at INTO var_last_relationship_email_at, var_next_relationship_email_eligible_at 
  FROM public.lifecycle_user_state WHERE user_id = target_user_id;

  -- 5. Calculate level & status
  var_level := public.calculate_activation_level(
    (var_last_login_at IS NOT NULL),
    var_patients_count,
    var_linked_records_count,
    var_evolutions_count,
    coalesce(var_usage_days_count, 0),
    var_resources_count
  );
  var_status := public.activation_status_for_level(var_level, prof.subscription_status);

  -- 6. Upsert state
  INSERT INTO public.lifecycle_user_state (
    user_id,
    activation_level,
    activation_status,
    first_login_at,
    last_login_at,
    last_activity_at,
    usage_days_count,
    patients_count,
    first_patient_at,
    latest_patient_at,
    linked_records_count,
    first_record_linked_at,
    evolutions_count,
    processing_evolutions_count,
    failed_evolutions_count,
    first_evolution_completed_at,
    latest_evolution_at,
    audio_evolutions_count,
    reports_count,
    migrations_count,
    resources_count,
    onboarding_completed_at,
    subscription_plan,
    subscription_status,
    trial_ends_at,
    subscription_started_at,
    subscription_cancelled_at,
    last_relationship_email_at,
    next_relationship_email_eligible_at,
    profession,
    profession_segment,
    distinct_activity_days,
    recalculated_at,
    updated_at
  ) VALUES (
    target_user_id,
    var_level,
    var_status,
    var_first_login_at,
    var_last_login_at,
    var_latest_activity,
    coalesce(var_usage_days_count, 0),
    var_patients_count,
    var_first_patient_at,
    var_latest_patient_at,
    var_linked_records_count,
    var_first_record_linked_at,
    var_evolutions_count,
    var_processing_evolutions_count,
    var_failed_evolutions_count,
    var_first_evolution_completed_at,
    var_latest_evolution_at,
    var_audio_evolutions_count,
    var_reports_count,
    var_migrations_count,
    var_resources_count,
    var_onboarding_completed_at,
    prof.subscription_plan,
    prof.subscription_status,
    prof.trial_ends_at,
    var_subscription_started_at,
    var_subscription_cancelled_at,
    var_last_relationship_email_at,
    var_next_relationship_email_eligible_at,
    prof.professional_title,
    public.normalize_profession_segment(prof.professional_title),
    coalesce(var_distinct_activity_days, '{}'::text[]),
    now(),
    now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    activation_level = EXCLUDED.activation_level,
    activation_status = EXCLUDED.activation_status,
    first_login_at = EXCLUDED.first_login_at,
    last_login_at = EXCLUDED.last_login_at,
    last_activity_at = EXCLUDED.last_activity_at,
    usage_days_count = EXCLUDED.usage_days_count,
    patients_count = EXCLUDED.patients_count,
    first_patient_at = EXCLUDED.first_patient_at,
    latest_patient_at = EXCLUDED.latest_patient_at,
    linked_records_count = EXCLUDED.linked_records_count,
    first_record_linked_at = EXCLUDED.first_record_linked_at,
    evolutions_count = EXCLUDED.evolutions_count,
    processing_evolutions_count = EXCLUDED.processing_evolutions_count,
    failed_evolutions_count = EXCLUDED.failed_evolutions_count,
    first_evolution_completed_at = EXCLUDED.first_evolution_completed_at,
    latest_evolution_at = EXCLUDED.latest_evolution_at,
    audio_evolutions_count = EXCLUDED.audio_evolutions_count,
    reports_count = EXCLUDED.reports_count,
    migrations_count = EXCLUDED.migrations_count,
    resources_count = EXCLUDED.resources_count,
    onboarding_completed_at = EXCLUDED.onboarding_completed_at,
    subscription_plan = EXCLUDED.subscription_plan,
    subscription_status = EXCLUDED.subscription_status,
    trial_ends_at = EXCLUDED.trial_ends_at,
    subscription_started_at = EXCLUDED.subscription_started_at,
    subscription_cancelled_at = EXCLUDED.subscription_cancelled_at,
    profession = EXCLUDED.profession,
    profession_segment = EXCLUDED.profession_segment,
    distinct_activity_days = EXCLUDED.distinct_activity_days,
    recalculated_at = EXCLUDED.recalculated_at,
    updated_at = EXCLUDED.updated_at
  RETURNING * INTO result_row;

  RETURN row_to_json(result_row)::jsonb;
END;
$$;
