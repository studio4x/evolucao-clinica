CREATE POLICY "Admins can perform all actions on notifications" ON public.notifications FOR ALL USING (is_admin());
