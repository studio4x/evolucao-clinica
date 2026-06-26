-- Remove legacy redundant policy after notifications RLS hardening.

DROP POLICY IF EXISTS "notifications_owner_policy" ON public.notifications;
