-- Lifecycle Automation: núcleo de dados, auditoria e preferências.
-- Esta migration não altera a jornada pública (journeys/journey_contents).

CREATE TABLE IF NOT EXISTS public.lifecycle_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  campaign_type text NOT NULL CHECK (campaign_type IN ('sequence', 'conditional', 'reactivation', 'customer')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'archived')),
  enrollment_mode text NOT NULL DEFAULT 'new_users_only' CHECK (enrollment_mode IN ('new_users_only', 'selected_users', 'all_eligible_users')),
  eligible_from timestamptz NOT NULL DEFAULT now(),
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  default_send_time time NOT NULL DEFAULT '08:30',
  max_messages_per_24h integer NOT NULL DEFAULT 1 CHECK (max_messages_per_24h > 0),
  enrollment_window_days integer,
  completion_window_days integer NOT NULL DEFAULT 25 CHECK (completion_window_days > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.professionals(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.professionals(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.lifecycle_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.lifecycle_campaigns(id) ON DELETE CASCADE,
  step_key text NOT NULL,
  position integer NOT NULL CHECK (position > 0),
  day_offset integer NOT NULL DEFAULT 0 CHECK (day_offset >= 0),
  send_time time,
  category text NOT NULL DEFAULT 'education',
  priority integer NOT NULL DEFAULT 50,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'archived')),
  subject_template text NOT NULL,
  preheader_template text,
  body_markdown text NOT NULL,
  cta_label_template text,
  cta_route_template text,
  fallback_cta_route text,
  audience_filter jsonb NOT NULL DEFAULT '{}'::jsonb,
  eligibility_rule_key text,
  skip_rule_key text,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, step_key),
  UNIQUE (campaign_id, position)
);

CREATE TABLE IF NOT EXISTS public.lifecycle_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.lifecycle_campaigns(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'cancelled', 'suppressed', 'expired')),
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  paused_at timestamptz,
  cancelled_at timestamptz,
  current_position integer NOT NULL DEFAULT 0 CHECK (current_position >= 0),
  next_step_at timestamptz,
  completion_deadline_at timestamptz,
  pause_reason text,
  cancellation_reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, campaign_id)
);

CREATE TABLE IF NOT EXISTS public.lifecycle_user_state (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  activation_level integer NOT NULL DEFAULT 0 CHECK (activation_level BETWEEN 0 AND 6),
  activation_status text NOT NULL DEFAULT 'registered',
  first_login_at timestamptz,
  last_login_at timestamptz,
  last_activity_at timestamptz,
  usage_days_count integer NOT NULL DEFAULT 0,
  patients_count integer NOT NULL DEFAULT 0,
  first_patient_at timestamptz,
  latest_patient_at timestamptz,
  linked_records_count integer NOT NULL DEFAULT 0,
  first_record_linked_at timestamptz,
  evolutions_count integer NOT NULL DEFAULT 0,
  processing_evolutions_count integer NOT NULL DEFAULT 0,
  failed_evolutions_count integer NOT NULL DEFAULT 0,
  first_evolution_started_at timestamptz,
  first_evolution_completed_at timestamptz,
  latest_evolution_at timestamptz,
  audio_evolutions_count integer NOT NULL DEFAULT 0,
  reports_count integer NOT NULL DEFAULT 0,
  migrations_count integer NOT NULL DEFAULT 0,
  resources_count integer NOT NULL DEFAULT 0,
  onboarding_completed_at timestamptz,
  subscription_plan text,
  subscription_status text,
  trial_ends_at timestamptz,
  subscription_started_at timestamptz,
  subscription_cancelled_at timestamptz,
  profession text,
  profession_segment text,
  account_type text,
  last_relationship_email_at timestamptz,
  next_relationship_email_eligible_at timestamptz,
  state_version integer NOT NULL DEFAULT 1,
  recalculated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lifecycle_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_name text NOT NULL,
  event_version integer NOT NULL DEFAULT 1,
  source text NOT NULL CHECK (source IN ('database_trigger', 'backend', 'frontend', 'webhook', 'admin')),
  entity_type text,
  entity_id uuid,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  idempotency_key text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS lifecycle_events_idempotency_unique ON public.lifecycle_events(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS lifecycle_events_user_time_idx ON public.lifecycle_events(user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS lifecycle_events_name_time_idx ON public.lifecycle_events(event_name, occurred_at DESC);

CREATE TABLE IF NOT EXISTS public.lifecycle_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_key text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  trigger_event text,
  rule_type text NOT NULL CHECK (rule_type IN ('event', 'inactivity', 'deadline', 'state')),
  priority integer NOT NULL DEFAULT 50,
  cooldown_hours integer NOT NULL DEFAULT 24 CHECK (cooldown_hours >= 0),
  delay_minutes integer NOT NULL DEFAULT 0 CHECK (delay_minutes >= 0),
  condition_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  message_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lifecycle_dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  enrollment_id uuid REFERENCES public.lifecycle_enrollments(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.lifecycle_campaigns(id) ON DELETE SET NULL,
  step_id uuid REFERENCES public.lifecycle_steps(id) ON DELETE SET NULL,
  rule_id uuid REFERENCES public.lifecycle_rules(id) ON DELETE SET NULL,
  message_key text NOT NULL,
  dispatch_type text NOT NULL CHECK (dispatch_type IN ('sequence', 'conditional', 'transactional_bridge')),
  priority integer NOT NULL DEFAULT 50,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'sent', 'failed', 'retry', 'skipped', 'cancelled', 'suppressed', 'replaced')),
  scheduled_for timestamptz NOT NULL,
  claimed_at timestamptz,
  claimed_by text,
  sent_at timestamptz,
  failed_at timestamptz,
  skipped_at timestamptz,
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
  next_attempt_at timestamptz,
  dedupe_key text NOT NULL UNIQUE,
  replacement_dispatch_id uuid REFERENCES public.lifecycle_dispatches(id) ON DELETE SET NULL,
  replaced_dispatch_id uuid REFERENCES public.lifecycle_dispatches(id) ON DELETE SET NULL,
  email_delivery_id uuid REFERENCES public.email_deliveries(id) ON DELETE SET NULL,
  rendered_subject text,
  rendered_preheader text,
  rendered_text text,
  skip_reason text,
  failure_reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lifecycle_dispatches_due_idx ON public.lifecycle_dispatches(status, scheduled_for, next_attempt_at);
CREATE INDEX IF NOT EXISTS lifecycle_dispatches_user_idx ON public.lifecycle_dispatches(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.lifecycle_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  enrollment_id uuid REFERENCES public.lifecycle_enrollments(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.lifecycle_campaigns(id) ON DELETE SET NULL,
  step_id uuid REFERENCES public.lifecycle_steps(id) ON DELETE SET NULL,
  rule_id uuid REFERENCES public.lifecycle_rules(id) ON DELETE SET NULL,
  decision_key text NOT NULL UNIQUE,
  selected_message_key text,
  selected_priority integer,
  outcome text NOT NULL CHECK (outcome IN ('scheduled', 'deferred', 'skipped', 'suppressed', 'dry_run', 'completed')),
  reason text,
  evaluated_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.communication_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  product_education_enabled boolean NOT NULL DEFAULT true,
  lifecycle_enabled boolean NOT NULL DEFAULT true,
  commercial_enabled boolean NOT NULL DEFAULT true,
  preferred_send_time time,
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  unsubscribed_at timestamptz,
  unsubscribe_reason text,
  unsubscribe_token_hash text,
  token_created_at timestamptz,
  bounce_status text,
  complaint_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lifecycle_provider_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_delivery_id uuid REFERENCES public.email_deliveries(id) ON DELETE SET NULL,
  provider text NOT NULL,
  provider_message_id text,
  event_type text NOT NULL,
  occurred_at timestamptz NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lifecycle_provider_events_delivery_idx ON public.lifecycle_provider_events(email_delivery_id, occurred_at DESC);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['lifecycle_campaigns', 'lifecycle_steps', 'lifecycle_enrollments', 'lifecycle_user_state', 'lifecycle_rules', 'lifecycle_dispatches', 'lifecycle_decisions', 'communication_preferences'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_%s_updated_at ON public.%I', table_name, table_name);
    EXECUTE format('CREATE TRIGGER set_%s_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', table_name, table_name);
  END LOOP;
END $$;

ALTER TABLE public.lifecycle_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lifecycle_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lifecycle_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lifecycle_user_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lifecycle_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lifecycle_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lifecycle_dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lifecycle_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communication_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lifecycle_provider_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lifecycle_campaigns_admin ON public.lifecycle_campaigns;
CREATE POLICY lifecycle_campaigns_admin ON public.lifecycle_campaigns FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS lifecycle_steps_admin ON public.lifecycle_steps;
CREATE POLICY lifecycle_steps_admin ON public.lifecycle_steps FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS lifecycle_rules_admin ON public.lifecycle_rules;
CREATE POLICY lifecycle_rules_admin ON public.lifecycle_rules FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS lifecycle_dispatches_admin ON public.lifecycle_dispatches;
CREATE POLICY lifecycle_dispatches_admin ON public.lifecycle_dispatches FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS lifecycle_decisions_admin ON public.lifecycle_decisions;
CREATE POLICY lifecycle_decisions_admin ON public.lifecycle_decisions FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS lifecycle_provider_events_admin ON public.lifecycle_provider_events;
CREATE POLICY lifecycle_provider_events_admin ON public.lifecycle_provider_events FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS lifecycle_enrollments_owner_read ON public.lifecycle_enrollments;
CREATE POLICY lifecycle_enrollments_owner_read ON public.lifecycle_enrollments FOR SELECT TO authenticated USING (auth.uid() = user_id OR is_admin());
DROP POLICY IF EXISTS lifecycle_state_owner_read ON public.lifecycle_user_state;
CREATE POLICY lifecycle_state_owner_read ON public.lifecycle_user_state FOR SELECT TO authenticated USING (auth.uid() = user_id OR is_admin());
DROP POLICY IF EXISTS lifecycle_events_owner_read ON public.lifecycle_events;
CREATE POLICY lifecycle_events_owner_read ON public.lifecycle_events FOR SELECT TO authenticated USING (auth.uid() = user_id OR is_admin());
DROP POLICY IF EXISTS communication_preferences_owner_manage ON public.communication_preferences;
CREATE POLICY communication_preferences_owner_manage ON public.communication_preferences FOR ALL TO authenticated USING (auth.uid() = user_id OR is_admin()) WITH CHECK (auth.uid() = user_id OR is_admin());

COMMENT ON TABLE public.lifecycle_events IS 'Auditoria append-only do lifecycle sem conteúdo clínico.';
COMMENT ON TABLE public.lifecycle_dispatches IS 'Fila e auditoria de mensagens individuais do lifecycle.';
COMMENT ON TABLE public.lifecycle_decisions IS 'Decisões do scheduler, inclusive dry-run, para inspeção administrativa.';
COMMENT ON TABLE public.communication_preferences IS 'Preferências e supressão de comunicações educativas/comerciais.';
