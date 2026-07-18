-- Adicionar política RLS de UPDATE para a tabela patient_reports
DROP POLICY IF EXISTS "Professionals can update their own patient reports" ON public.patient_reports;

CREATE POLICY "Professionals can update their own patient reports"
    ON public.patient_reports FOR UPDATE
    USING (auth.uid() = professional_id)
    WITH CHECK (auth.uid() = professional_id);
