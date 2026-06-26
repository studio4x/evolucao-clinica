-- Reinforce notification isolation now that the app reads notifications through the client.
-- The service role still bypasses RLS for server-side inserts/updates, but end users
-- should only see and mutate their own notification records.

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
CREATE POLICY "Users can view their own notifications"
    ON public.notifications
    FOR SELECT
    USING (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
CREATE POLICY "Users can update their own notifications"
    ON public.notifications
    FOR UPDATE
    USING (auth.uid() = user_id OR is_admin())
    WITH CHECK (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "Users can delete their own notifications" ON public.notifications;
CREATE POLICY "Users can delete their own notifications"
    ON public.notifications
    FOR DELETE
    USING (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "Admins can perform all actions on notifications" ON public.notifications;
CREATE POLICY "Admins can perform all actions on notifications"
    ON public.notifications
    FOR ALL
    USING (is_admin())
    WITH CHECK (is_admin());
