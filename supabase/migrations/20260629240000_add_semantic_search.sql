-- 1. Habilitar a extensão vector para busca semântica
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Adicionar coluna de embedding (768 dimensões para text-embedding-004 do Gemini)
ALTER TABLE public.evolutions ADD COLUMN IF NOT EXISTS embedding vector(768);

-- 3. Criar índice HNSW para otimização das buscas por similaridade de cosseno
CREATE INDEX IF NOT EXISTS idx_evolutions_embedding ON public.evolutions USING hnsw (embedding vector_cosine_ops);

-- 4. Função para limpar o embedding caso o texto da evolução mude
CREATE OR REPLACE FUNCTION public.handle_evolution_text_change()
RETURNS trigger AS $$
BEGIN
  -- Se o texto da transcrição mudou, limpamos o embedding para forçar a re-indexação
  IF OLD.transcription_text IS DISTINCT FROM NEW.transcription_text THEN
    NEW.embedding := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Criar trigger na tabela evolutions para invalidar o embedding se alterado
DROP TRIGGER IF EXISTS trigger_evolution_text_change ON public.evolutions;
CREATE TRIGGER trigger_evolution_text_change
  BEFORE UPDATE ON public.evolutions
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_evolution_text_change();

-- 6. Função para buscar evoluções correspondentes baseada em similaridade vetorial
CREATE OR REPLACE FUNCTION public.match_evolutions (
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  p_patient_id uuid,
  p_professional_id uuid
)
RETURNS TABLE (
  id uuid,
  patient_id uuid,
  professional_id uuid,
  transcription_text text,
  session_date text,
  created_at timestamptz,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    e.patient_id,
    e.professional_id,
    e.transcription_text,
    e.session_date,
    e.created_at,
    (1 - (e.embedding <=> query_embedding))::float AS similarity
  FROM public.evolutions e
  WHERE e.patient_id = p_patient_id
    AND e.professional_id = p_professional_id
    AND e.transcription_text IS NOT NULL
    AND e.embedding IS NOT NULL
    AND (1 - (e.embedding <=> query_embedding)) > match_threshold
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
