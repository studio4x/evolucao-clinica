-- Migration: Create Support Tickets System with Dynamic SLA
-- Target: Supabase PostgreSQL Database

-- 1. Helper functions for Business Hours and SLA Calculations
CREATE OR REPLACE FUNCTION public.get_support_business_hours_config()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'timezone', 'America/Sao_Paulo',
    'days_of_week', jsonb_build_array(1, 2, 3, 4, 5),
    'start_hour', 8,
    'end_hour', 18
  );
$$;

CREATE OR REPLACE FUNCTION public.is_support_business_minute(input_ts timestamptz)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cfg jsonb;
  timezone_name text;
  local_ts timestamp;
  local_dow integer;
  start_hour integer;
  end_hour integer;
  allowed_days integer[];
BEGIN
  cfg := public.get_support_business_hours_config();
  timezone_name := coalesce(cfg ->> 'timezone', 'America/Sao_Paulo');
  start_hour := coalesce((cfg ->> 'start_hour')::integer, 8);
  end_hour := coalesce((cfg ->> 'end_hour')::integer, 18);
  allowed_days := array(
    SELECT jsonb_array_elements_text(coalesce(cfg -> 'days_of_week', '[1,2,3,4,5]'::jsonb))::integer
  );

  local_ts := input_ts AT TIME ZONE timezone_name;
  local_dow := extract(isodow FROM local_ts);

  IF NOT (local_dow = any(allowed_days)) THEN
    RETURN false;
  END IF;

  RETURN local_ts::time >= make_time(start_hour, 0, 0)
    AND local_ts::time < make_time(end_hour, 0, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.align_support_business_start(input_ts timestamptz)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cursor_ts timestamptz := date_trunc('minute', input_ts);
BEGIN
  IF public.is_support_business_minute(cursor_ts) THEN
    RETURN cursor_ts;
  END IF;

  FOR i in 1..20000 LOOP
    cursor_ts := cursor_ts + interval '1 minute';
    IF public.is_support_business_minute(cursor_ts) THEN
      RETURN cursor_ts;
    END IF;
  END LOOP;

  RETURN cursor_ts;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_support_business_minutes(start_ts timestamptz, minutes_to_add integer)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cursor_ts timestamptz := public.align_support_business_start(start_ts);
  added_minutes integer := 0;
BEGIN
  IF minutes_to_add <= 0 THEN
    RETURN cursor_ts;
  END IF;

  WHILE added_minutes < minutes_to_add LOOP
    cursor_ts := cursor_ts + interval '1 minute';
    IF public.is_support_business_minute(cursor_ts) THEN
      added_minutes := added_minutes + 1;
    END IF;
  END LOOP;

  RETURN cursor_ts;
END;
$$;

CREATE OR REPLACE FUNCTION public.compute_support_sla_status(due_at timestamptz, first_response_at timestamptz)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF first_response_at IS NOT NULL THEN
    RETURN 'answered';
  END IF;

  IF due_at IS NULL THEN
    RETURN 'on_time';
  END IF;

  IF now() > due_at THEN
    RETURN 'overdue';
  END IF;

  IF now() + interval '30 minutes' >= due_at THEN
    RETURN 'at_risk';
  END IF;

  RETURN 'on_time';
END;
$$;

-- 2. Create support_tickets table
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  subject text NOT NULL,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  priority text NOT NULL DEFAULT 'medium',
  category text NOT NULL DEFAULT 'general',
  attachment_url text,
  attachment_name text,
  first_response_due_at timestamptz,
  first_response_at timestamptz,
  sla_policy_key text NOT NULL DEFAULT 'general',
  sla_status text NOT NULL DEFAULT 'on_time',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_tickets_status_check CHECK (status in ('open', 'in_progress', 'closed')),
  CONSTRAINT support_tickets_priority_check CHECK (priority in ('low', 'medium', 'high', 'urgent')),
  CONSTRAINT support_tickets_category_check CHECK (category in ('payment', 'technical', 'account', 'general')),
  CONSTRAINT support_tickets_sla_status_check CHECK (sla_status in ('on_time', 'at_risk', 'overdue', 'answered'))
);

-- 3. Create support_messages table
CREATE TABLE IF NOT EXISTS public.support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  message text NOT NULL,
  attachment_url text,
  attachment_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Create performance indexes
CREATE INDEX IF NOT EXISTS idx_support_tickets_user_created ON public.support_tickets (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_category ON public.support_tickets (category);
CREATE INDEX IF NOT EXISTS idx_support_tickets_due_status ON public.support_tickets (status, sla_status, first_response_due_at ASC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_first_response_due ON public.support_tickets (first_response_due_at ASC);
CREATE INDEX IF NOT EXISTS idx_support_messages_ticket_created ON public.support_messages (ticket_id, created_at ASC);

-- 5. SLA Fields Trigger for dynamic SLA based on Professional Plan
CREATE OR REPLACE FUNCTION public.apply_support_ticket_sla_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  response_hours integer;
  user_plan text;
BEGIN
  -- Fetch professional subscription plan
  SELECT COALESCE(subscription_plan, 'trial') INTO user_plan
  FROM public.professionals
  WHERE id = new.user_id;

  -- SLA Business Hours allocation based on Plan
  IF user_plan = 'yearly' THEN
    response_hours := 2; -- 2 business hours for Yearly
    new.priority := 'high';
  ELSIF user_plan = 'monthly' THEN
    IF new.category = 'payment' THEN
      response_hours := 12; -- 12 business hours for Monthly payment issues
    ELSE
      response_hours := 24; -- 24 business hours for Monthly other issues
    END IF;
    new.priority := 'medium';
  ELSE
    response_hours := 48; -- 48 business hours for Trial/None
    new.priority := 'low';
  END IF;

  new.sla_policy_key := new.category;

  IF tg_op = 'INSERT'
    OR new.category IS DISTINCT FROM old.category
    OR new.created_at IS DISTINCT FROM old.created_at
    OR new.first_response_due_at IS NULL THEN
    new.first_response_due_at := public.add_support_business_minutes(coalesce(new.created_at, now()), response_hours * 60);
  END IF;

  new.sla_status := public.compute_support_sla_status(new.first_response_due_at, new.first_response_at);
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_support_ticket_sla_fields ON public.support_tickets;
CREATE TRIGGER trg_support_ticket_sla_fields
BEFORE INSERT OR UPDATE ON public.support_tickets
FOR EACH ROW
EXECUTE FUNCTION public.apply_support_ticket_sla_fields();

-- 6. Trigger to handle admin replies side effects
CREATE OR REPLACE FUNCTION public.handle_support_message_side_effects()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sender_role text;
BEGIN
  SELECT role INTO sender_role
  FROM public.professionals
  WHERE id = new.sender_id;

  UPDATE public.support_tickets
  SET
    first_response_at = CASE
      WHEN sender_role = 'admin' AND first_response_at IS NULL THEN new.created_at
      ELSE first_response_at
    END,
    status = CASE
      WHEN sender_role = 'admin' AND status = 'open' THEN 'in_progress'
      ELSE status
    END,
    updated_at = now()
  WHERE id = new.ticket_id;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_support_first_admin_response ON public.support_messages;
CREATE TRIGGER trg_support_first_admin_response
AFTER INSERT ON public.support_messages
FOR EACH ROW
EXECUTE FUNCTION public.handle_support_message_side_effects();

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  new.updated_at = now();
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS set_support_tickets_updated_at ON public.support_tickets;
CREATE TRIGGER set_support_tickets_updated_at
BEFORE UPDATE ON public.support_tickets
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- 7. Enable RLS
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

-- 8. Policies for support_tickets
DROP POLICY IF EXISTS "support_tickets_select_own_or_admin" ON public.support_tickets;
CREATE POLICY "support_tickets_select_own_or_admin"
ON public.support_tickets
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid() 
  OR EXISTS (
    SELECT 1 FROM public.professionals 
    WHERE id = auth.uid() AND role = 'admin'
  )
);

DROP POLICY IF EXISTS "support_tickets_insert_own" ON public.support_tickets;
CREATE POLICY "support_tickets_insert_own"
ON public.support_tickets
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "support_tickets_admin_update" ON public.support_tickets;
CREATE POLICY "support_tickets_admin_update"
ON public.support_tickets
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.professionals 
    WHERE id = auth.uid() AND role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.professionals 
    WHERE id = auth.uid() AND role = 'admin'
  )
);

DROP POLICY IF EXISTS "support_tickets_admin_delete" ON public.support_tickets;
CREATE POLICY "support_tickets_admin_delete"
ON public.support_tickets
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.professionals 
    WHERE id = auth.uid() AND role = 'admin'
  )
);

-- 9. Policies for support_messages
DROP POLICY IF EXISTS "support_messages_select_own_ticket_or_admin" ON public.support_messages;
CREATE POLICY "support_messages_select_own_ticket_or_admin"
ON public.support_messages
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.support_tickets t
    WHERE t.id = ticket_id
      AND (
        t.user_id = auth.uid() 
        OR EXISTS (
          SELECT 1 FROM public.professionals 
          WHERE id = auth.uid() AND role = 'admin'
        )
      )
  )
);

DROP POLICY IF EXISTS "support_messages_insert_accessible_ticket" ON public.support_messages;
CREATE POLICY "support_messages_insert_accessible_ticket"
ON public.support_messages
FOR INSERT
TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.support_tickets t
    WHERE t.id = ticket_id
      AND (
        t.user_id = auth.uid() 
        OR EXISTS (
          SELECT 1 FROM public.professionals 
          WHERE id = auth.uid() AND role = 'admin'
        )
      )
  )
);

-- 10. Support Attachments Bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('support_attachments', 'support_attachments', true, 10485760) -- 10MB limit
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "storage_support_public_read" ON storage.objects;
CREATE POLICY "storage_support_public_read"
ON storage.objects
FOR SELECT
USING (bucket_id = 'support_attachments');

DROP POLICY IF EXISTS "storage_support_insert" ON storage.objects;
CREATE POLICY "storage_support_insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'support_attachments'
  AND (storage.foldername(name))[1] = 'support'
  AND (
    EXISTS (
      SELECT 1 FROM public.professionals 
      WHERE id = auth.uid() AND role = 'admin'
    )
    OR (storage.foldername(name))[2] = auth.uid()::text
  )
);

DROP POLICY IF EXISTS "storage_support_update" ON storage.objects;
CREATE POLICY "storage_support_update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'support_attachments'
  AND (storage.foldername(name))[1] = 'support'
  AND (
    EXISTS (
      SELECT 1 FROM public.professionals 
      WHERE id = auth.uid() AND role = 'admin'
    )
    OR (storage.foldername(name))[2] = auth.uid()::text
  )
)
WITH CHECK (
  bucket_id = 'support_attachments'
  AND (storage.foldername(name))[1] = 'support'
  AND (
    EXISTS (
      SELECT 1 FROM public.professionals 
      WHERE id = auth.uid() AND role = 'admin'
    )
    OR (storage.foldername(name))[2] = auth.uid()::text
  )
);

DROP POLICY IF EXISTS "storage_support_delete" ON storage.objects;
CREATE POLICY "storage_support_delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'support_attachments'
  AND (storage.foldername(name))[1] = 'support'
  AND (
    EXISTS (
      SELECT 1 FROM public.professionals 
      WHERE id = auth.uid() AND role = 'admin'
    )
    OR (storage.foldername(name))[2] = auth.uid()::text
  )
);
