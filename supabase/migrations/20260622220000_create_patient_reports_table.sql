-- Migration: Create patient_reports table for storing AI reports and PDI drafts
-- Target: Supabase PostgreSQL Database

CREATE TABLE IF NOT EXISTS public.patient_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID REFERENCES public.patients(id) ON DELETE CASCADE NOT NULL,
    professional_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    type TEXT NOT NULL, -- 'evolution_report' ou 'pdi_draft'
    period_label TEXT NOT NULL, -- e.g. 'Últimos 3 meses', 'Período Personalizado'
    content TEXT NOT NULL, -- O texto completo do relatório gerado
    google_doc_url TEXT, -- URL opcional do documento exportado no Google Docs
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.patient_reports ENABLE ROW LEVEL SECURITY;

-- Policies for patient_reports
CREATE POLICY "Professionals can select their own patient reports"
    ON public.patient_reports FOR SELECT
    USING (auth.uid() = professional_id);

CREATE POLICY "Professionals can insert their own patient reports"
    ON public.patient_reports FOR INSERT
    WITH CHECK (auth.uid() = professional_id);

CREATE POLICY "Professionals can delete their own patient reports"
    ON public.patient_reports FOR DELETE
    USING (auth.uid() = professional_id);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_patient_reports_patient_id ON public.patient_reports(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_reports_professional_id ON public.patient_reports(professional_id);

-- Comments explaining columns
COMMENT ON TABLE public.patient_reports IS 'Armazena os relatórios de evolução e rascunhos de PDI gerados por IA para cada paciente';
COMMENT ON COLUMN public.patient_reports.type IS 'Tipo do relatório: evolution_report (Relatório de Evolução) ou pdi_draft (Rascunho de PDI)';
COMMENT ON COLUMN public.patient_reports.period_label IS 'Descrição amigável do período analisado, ex: Últimos 3 meses';
COMMENT ON COLUMN public.patient_reports.content IS 'Conteúdo do relatório em texto ou markdown gerado pela IA';
COMMENT ON COLUMN public.patient_reports.google_doc_url IS 'Link para o documento exportado para o Google Docs se houver';
