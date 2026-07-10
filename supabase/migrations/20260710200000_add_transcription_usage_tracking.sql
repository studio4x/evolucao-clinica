-- Controle mensal de uso para transcricoes de audio e atualizacao da copy publica dos planos.

CREATE TABLE IF NOT EXISTS public.usage_tracking (
  id bigserial PRIMARY KEY,
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  resource_type text NOT NULL,
  usage_month date NOT NULL,
  used_seconds integer NOT NULL DEFAULT 0 CHECK (used_seconds >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (professional_id, resource_type, usage_month)
);

CREATE INDEX IF NOT EXISTS idx_usage_tracking_professional_resource_month
  ON public.usage_tracking (professional_id, resource_type, usage_month DESC);

ALTER TABLE public.usage_tracking ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Professionals can view own usage tracking" ON public.usage_tracking;
CREATE POLICY "Professionals can view own usage tracking"
  ON public.usage_tracking
  FOR SELECT
  USING (auth.uid() = professional_id);

DROP POLICY IF EXISTS "Admins can view all usage tracking" ON public.usage_tracking;
CREATE POLICY "Admins can view all usage tracking"
  ON public.usage_tracking
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.professionals
      WHERE professionals.id = auth.uid()
        AND professionals.role = 'admin'
    )
  );

UPDATE public.plans
SET features = ARRAY[
  'Pacientes ilimitados',
  'Transcrições de áudio com uso justo de até 20 horas por mês',
  'Integração com Google Docs em tempo real',
  'Gravação e transcrição de áudio nativa',
  'Geração de Relatórios & PDI por IA',
  'Pesquisa Inteligente por IA (Pergunte ao Prontuário)',
  'Assinatura Digital de Documentos com Proteção Legal',
  'Compartilhamento Seguro de Relatórios (WhatsApp/E-mail)',
  'Filtro de Período na Impressão do Prontuário',
  'Lembrete e envio de WhatsApp para aniversariantes',
  'Impressão de prontuários do Google Docs'
]
WHERE id = 'monthly';

UPDATE public.plans
SET features = ARRAY[
  'Tudo do plano mensal',
  'Economia de 57% em relação ao plano mensal',
  'Suporte prioritário via ticket',
  'Garantia de novos recursos exclusivos em primeira mão',
  'Migração assistida de prontuários por IA (PDF/Word/Excel)',
  'Logotipo personalizado nos relatórios e evoluções (PDF/Impresso)',
  'Backup e Restauração completa de dados no Google Drive (Diário/Semanal/Mensal)'
]
WHERE id = 'yearly';
