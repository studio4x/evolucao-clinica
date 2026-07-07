-- Adicionar coluna ai_analysis_result para salvar o rascunho da análise
ALTER TABLE public.migration_requests 
ADD COLUMN ai_analysis_result JSONB DEFAULT NULL;
