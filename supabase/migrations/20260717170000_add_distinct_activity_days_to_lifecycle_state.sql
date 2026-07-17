-- Corrige o contrato entre a tabela de estado lifecycle e a RPC de recálculo.
-- A função recalculate_lifecycle_user_state persiste as datas distintas de atividade.
ALTER TABLE public.lifecycle_user_state
  ADD COLUMN IF NOT EXISTS distinct_activity_days text[] NOT NULL DEFAULT '{}'::text[];
