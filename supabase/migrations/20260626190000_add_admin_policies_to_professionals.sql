-- Garante que a área administrativa consiga listar e atualizar profissionais.
-- O acesso segue restrito à função is_admin(), que é SECURITY DEFINER.

ALTER TABLE public.professionals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can select all professionals" ON public.professionals;
CREATE POLICY "Admins can select all professionals"
    ON public.professionals
    FOR SELECT
    USING (is_admin());

DROP POLICY IF EXISTS "Admins can update all professionals" ON public.professionals;
CREATE POLICY "Admins can update all professionals"
    ON public.professionals
    FOR UPDATE
    USING (is_admin())
    WITH CHECK (is_admin());
