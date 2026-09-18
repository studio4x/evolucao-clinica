ALTER TABLE public.support_messages
  ADD COLUMN IF NOT EXISTS edited_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES public.professionals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_support_messages_active_ticket_created
  ON public.support_messages (ticket_id, created_at ASC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.support_message_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.support_messages(id) ON DELETE CASCADE,
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  changed_by uuid REFERENCES public.professionals(id) ON DELETE SET NULL,
  change_type text NOT NULL,
  previous_message text NOT NULL,
  previous_attachment_url text,
  previous_attachment_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_message_revisions_change_type_check
    CHECK (change_type IN ('edit', 'delete'))
);

CREATE INDEX IF NOT EXISTS idx_support_message_revisions_message_created
  ON public.support_message_revisions (message_id, created_at DESC);

ALTER TABLE public.support_message_revisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "support_message_revisions_admin_select"
ON public.support_message_revisions;
CREATE POLICY "support_message_revisions_admin_select"
ON public.support_message_revisions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.professionals
    WHERE id = auth.uid() AND role = 'admin'
  )
);

DROP POLICY IF EXISTS "support_message_revisions_admin_insert"
ON public.support_message_revisions;
CREATE POLICY "support_message_revisions_admin_insert"
ON public.support_message_revisions
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.professionals
    WHERE id = auth.uid() AND role = 'admin'
  )
);

REVOKE ALL ON TABLE public.support_message_revisions FROM anon, authenticated;
GRANT SELECT, INSERT ON public.support_message_revisions TO authenticated;
GRANT ALL ON TABLE public.support_message_revisions TO service_role;

CREATE OR REPLACE FUNCTION public.guard_support_message_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF old.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Deleted support messages cannot be modified';
  END IF;

  IF new.id IS DISTINCT FROM old.id
    OR new.ticket_id IS DISTINCT FROM old.ticket_id
    OR new.sender_id IS DISTINCT FROM old.sender_id
    OR new.created_at IS DISTINCT FROM old.created_at
    OR new.origin IS DISTINCT FROM old.origin
    OR new.sender_label IS DISTINCT FROM old.sender_label
    OR new.ai_run_id IS DISTINCT FROM old.ai_run_id
    OR new.attachment_url IS DISTINCT FROM old.attachment_url
    OR new.attachment_name IS DISTINCT FROM old.attachment_name THEN
    RAISE EXCEPTION 'Only support message text or deletion state can be changed';
  END IF;

  IF new.deleted_at IS DISTINCT FROM old.deleted_at THEN
    IF new.deleted_at IS NULL THEN
      RAISE EXCEPTION 'Deleted support messages cannot be restored';
    END IF;
    new.deleted_at := now();
    new.deleted_by := auth.uid();
  ELSIF new.deleted_by IS DISTINCT FROM old.deleted_by THEN
    RAISE EXCEPTION 'deleted_by can only be set during deletion';
  END IF;

  IF new.message IS DISTINCT FROM old.message THEN
    new.message := btrim(new.message);
    IF new.message = '' AND new.attachment_url IS NULL THEN
      RAISE EXCEPTION 'Support message cannot be empty';
    END IF;
    new.edited_at := now();
  ELSIF new.edited_at IS DISTINCT FROM old.edited_at THEN
    RAISE EXCEPTION 'edited_at is managed automatically';
  END IF;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_support_message_mutation
ON public.support_messages;
CREATE TRIGGER trg_guard_support_message_mutation
BEFORE UPDATE ON public.support_messages
FOR EACH ROW
EXECUTE FUNCTION public.guard_support_message_mutation();

CREATE OR REPLACE FUNCTION public.record_support_message_revision()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  revision_type text;
BEGIN
  IF new.deleted_at IS DISTINCT FROM old.deleted_at AND new.deleted_at IS NOT NULL THEN
    revision_type := 'delete';
  ELSIF new.message IS DISTINCT FROM old.message THEN
    revision_type := 'edit';
  ELSE
    RETURN new;
  END IF;

  INSERT INTO public.support_message_revisions (
    message_id,
    ticket_id,
    changed_by,
    change_type,
    previous_message,
    previous_attachment_url,
    previous_attachment_name
  )
  VALUES (
    old.id,
    old.ticket_id,
    coalesce(new.deleted_by, auth.uid()),
    revision_type,
    old.message,
    old.attachment_url,
    old.attachment_name
  );

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_record_support_message_revision
ON public.support_messages;
CREATE TRIGGER trg_record_support_message_revision
AFTER UPDATE ON public.support_messages
FOR EACH ROW
EXECUTE FUNCTION public.record_support_message_revision();

DROP POLICY IF EXISTS "support_messages_select_own_ticket_or_admin"
ON public.support_messages;
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
        (
          t.user_id = auth.uid()
          AND deleted_at IS NULL
        )
        OR EXISTS (
          SELECT 1 FROM public.professionals
          WHERE id = auth.uid() AND role = 'admin'
        )
      )
  )
);

DROP POLICY IF EXISTS "support_messages_admin_update_team_messages"
ON public.support_messages;
CREATE POLICY "support_messages_admin_update_team_messages"
ON public.support_messages
FOR UPDATE
TO authenticated
USING (
  deleted_at IS NULL
  AND EXISTS (
    SELECT 1 FROM public.professionals current_user_profile
    WHERE current_user_profile.id = auth.uid()
      AND current_user_profile.role = 'admin'
  )
  AND EXISTS (
    SELECT 1 FROM public.professionals sender_profile
    WHERE sender_profile.id = sender_id
      AND sender_profile.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.professionals current_user_profile
    WHERE current_user_profile.id = auth.uid()
      AND current_user_profile.role = 'admin'
  )
  AND EXISTS (
    SELECT 1 FROM public.professionals sender_profile
    WHERE sender_profile.id = sender_id
      AND sender_profile.role = 'admin'
  )
);

GRANT UPDATE ON public.support_messages TO authenticated;
