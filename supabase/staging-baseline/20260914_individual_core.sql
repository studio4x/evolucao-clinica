-- Fase 1B0 - baseline sanitizado do fluxo individual.
-- Alvo exclusivo: Supabase staging hwkdwinfckmjoriqxbjk.
-- Sem dados, secrets, Vault, cron, HTTP, Storage, billing ou integrações.
-- Este arquivo não cria objetos empresariais.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;

CREATE TABLE IF NOT EXISTS public.professionals (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  google_email text NOT NULL,
  full_name text NOT NULL,
  photo_url text,
  role text NOT NULL DEFAULT 'therapist',
  status text NOT NULL DEFAULT 'pending',
  subscription_plan text NOT NULL DEFAULT 'trial',
  subscription_status text NOT NULL DEFAULT 'trialing',
  subscription_ends_at timestamptz,
  trial_ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  professional_title text DEFAULT 'Terapeuta',
  professional_register text,
  force_google_disconnect boolean DEFAULT false,
  trial_expiration_email_sent_at timestamptz,
  onboarding_completed boolean DEFAULT false,
  custom_logo_url text,
  auto_backup_enabled boolean DEFAULT false,
  last_backup_at timestamptz,
  backup_frequency text DEFAULT 'monthly',
  billing_provider text,
  stripe_customer_id text,
  acquisition_info jsonb DEFAULT '{}'::jsonb,
  custom_logo_settings jsonb NOT NULL DEFAULT '{"scale": 100}'::jsonb,
  signup_acquisition_info jsonb DEFAULT '{}'::jsonb,
  work_context text,
  onboarding_status text NOT NULL DEFAULT 'not_started',
  onboarding_mode text,
  onboarding_current_step text NOT NULL DEFAULT 'intro',
  onboarding_choice_at timestamptz,
  onboarding_deferred_at timestamptz,
  trial_activation_deadline_at timestamptz,
  trial_activated_at timestamptz,
  onboarding_initial_mode text,
  CONSTRAINT professionals_role_check CHECK (role = ANY (ARRAY['admin'::text, 'therapist'::text])),
  CONSTRAINT professionals_status_check CHECK (status = ANY (ARRAY['active'::text, 'pending'::text, 'inactive'::text])),
  CONSTRAINT professionals_subscription_plan_check CHECK (subscription_plan IS NULL OR subscription_plan = ANY (ARRAY['trial'::text, 'monthly'::text, 'yearly'::text, 'courtesy'::text, 'none'::text])),
  CONSTRAINT professionals_subscription_status_check CHECK (subscription_status = ANY (ARRAY['trialing'::text, 'active'::text, 'past_due'::text, 'canceled'::text, 'unpaid'::text])),
  CONSTRAINT professionals_billing_provider_check CHECK (billing_provider IS NULL OR billing_provider = ANY (ARRAY['stripe'::text, 'google_play'::text])),
  CONSTRAINT professionals_work_context_check CHECK (work_context IS NULL OR work_context = ANY (ARRAY['independent'::text, 'clinic_professional'::text, 'clinic_owner_manager'::text, 'other'::text])),
  CONSTRAINT professionals_onboarding_status_check CHECK (onboarding_status = ANY (ARRAY['not_started'::text, 'in_progress'::text, 'deferred'::text, 'completed'::text])),
  CONSTRAINT professionals_onboarding_mode_check CHECK (onboarding_mode IS NULL OR onboarding_mode = ANY (ARRAY['guided'::text, 'explore'::text])),
  CONSTRAINT professionals_onboarding_initial_mode_check CHECK (onboarding_initial_mode IS NULL OR onboarding_initial_mode = ANY (ARRAY['guided'::text, 'explore'::text])),
  CONSTRAINT professionals_onboarding_current_step_check CHECK (onboarding_current_step = ANY (ARRAY['intro'::text, 'patient'::text, 'evolution'::text, 'agenda'::text, 'complete'::text]))
);

CREATE TABLE IF NOT EXISTS public.evolution_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL,
  system_prompt_instruction text NOT NULL,
  professional_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  notes text,
  status text NOT NULL DEFAULT 'active',
  google_doc_id text,
  google_doc_name text,
  google_doc_url text,
  target_folder_id text,
  target_folder_name text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  evolution_reminder_active boolean DEFAULT false,
  session_days integer[] DEFAULT '{}',
  session_time time,
  quick_notes text DEFAULT '',
  birth_date date,
  phone text,
  default_template_id uuid REFERENCES public.evolution_templates(id) ON DELETE SET NULL,
  CONSTRAINT patients_status_check CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text]))
);

CREATE TABLE IF NOT EXISTS public.evolutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  session_date text NOT NULL,
  audio_storage_path text,
  audio_url text,
  transcription_status text NOT NULL DEFAULT 'pending',
  transcription_text text,
  google_doc_append_status text NOT NULL DEFAULT 'pending',
  google_doc_append_at timestamptz,
  audio_duration_seconds numeric,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  template_id uuid REFERENCES public.evolution_templates(id) ON DELETE SET NULL,
  status text DEFAULT 'completed',
  signature_method text,
  signature_date timestamptz,
  signature_ip text,
  signature_hash text,
  signed_by_name text,
  signed_by_register text,
  embedding vector(768),
  session_time text,
  original_transcription_text text
);

CREATE TABLE IF NOT EXISTS public.patient_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  professional_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  period_label text NOT NULL,
  content text NOT NULL,
  google_doc_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  status text DEFAULT 'draft',
  signature_method text,
  signature_date timestamptz,
  signature_ip text,
  signature_hash text,
  signed_by_name text,
  signed_by_register text
);

CREATE TABLE IF NOT EXISTS public.plans (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text,
  price numeric NOT NULL,
  equivalent_monthly_price numeric,
  features text[] NOT NULL,
  button_text_simulate text NOT NULL,
  tag_text text,
  discount_text text,
  created_at timestamptz DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz DEFAULT timezone('utc'::text, now()),
  stripe_sandbox_price_id text,
  stripe_prod_price_id text,
  original_price numeric,
  launch_offer_text text,
  google_play_product_id text,
  google_play_base_plan_id text
);

CREATE INDEX IF NOT EXISTS patients_professional_id_idx ON public.patients (professional_id);
CREATE INDEX IF NOT EXISTS evolutions_patient_id_idx ON public.evolutions (patient_id);
CREATE INDEX IF NOT EXISTS evolutions_professional_id_idx ON public.evolutions (professional_id);
CREATE INDEX IF NOT EXISTS evolutions_status_idx ON public.evolutions (status);
CREATE INDEX IF NOT EXISTS patient_reports_patient_id_idx ON public.patient_reports (patient_id);
CREATE INDEX IF NOT EXISTS patient_reports_professional_id_idx ON public.patient_reports (professional_id);

ALTER TABLE public.professionals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evolution_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evolutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staging_professionals_owner_read ON public.professionals;
CREATE POLICY staging_professionals_owner_read ON public.professionals FOR SELECT TO authenticated USING ((select auth.uid()) = id);
DROP POLICY IF EXISTS staging_professionals_owner_update ON public.professionals;
CREATE POLICY staging_professionals_owner_update ON public.professionals FOR UPDATE TO authenticated USING ((select auth.uid()) = id) WITH CHECK ((select auth.uid()) = id);

DROP POLICY IF EXISTS staging_templates_select ON public.evolution_templates;
CREATE POLICY staging_templates_select ON public.evolution_templates FOR SELECT TO authenticated USING (professional_id IS NULL OR professional_id = (select auth.uid()));
DROP POLICY IF EXISTS staging_templates_insert ON public.evolution_templates;
CREATE POLICY staging_templates_insert ON public.evolution_templates FOR INSERT TO authenticated WITH CHECK (professional_id = (select auth.uid()));
DROP POLICY IF EXISTS staging_templates_update ON public.evolution_templates;
CREATE POLICY staging_templates_update ON public.evolution_templates FOR UPDATE TO authenticated USING (professional_id = (select auth.uid())) WITH CHECK (professional_id = (select auth.uid()));
DROP POLICY IF EXISTS staging_templates_delete ON public.evolution_templates;
CREATE POLICY staging_templates_delete ON public.evolution_templates FOR DELETE TO authenticated USING (professional_id = (select auth.uid()));

DROP POLICY IF EXISTS staging_patients_owner_all ON public.patients;
CREATE POLICY staging_patients_owner_all ON public.patients FOR ALL TO authenticated USING (professional_id = (select auth.uid())) WITH CHECK (professional_id = (select auth.uid()));
DROP POLICY IF EXISTS staging_evolutions_owner_all ON public.evolutions;
CREATE POLICY staging_evolutions_owner_all ON public.evolutions FOR ALL TO authenticated USING (professional_id = (select auth.uid())) WITH CHECK (professional_id = (select auth.uid()));
DROP POLICY IF EXISTS staging_reports_owner_all ON public.patient_reports;
CREATE POLICY staging_reports_owner_all ON public.patient_reports FOR ALL TO authenticated USING (professional_id = (select auth.uid())) WITH CHECK (professional_id = (select auth.uid()));
DROP POLICY IF EXISTS staging_plans_read ON public.plans;
CREATE POLICY staging_plans_read ON public.plans FOR SELECT TO anon, authenticated USING (true);

REVOKE ALL ON TABLE public.professionals, public.evolution_templates, public.patients, public.evolutions, public.patient_reports FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.professionals, public.evolution_templates, public.patients, public.evolutions, public.patient_reports TO authenticated;
REVOKE ALL ON TABLE public.plans FROM anon, authenticated;
GRANT SELECT ON TABLE public.plans TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  INSERT INTO public.professionals (id, google_email, full_name, photo_url, role, status, subscription_plan, subscription_status, trial_ends_at)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', 'Profissional'), NEW.raw_user_meta_data->>'avatar_url', 'therapist', 'pending', 'trial', 'trialing', now() + interval '7 days')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

COMMIT;
