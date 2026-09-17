-- Expõe no plano anual o limite comercial de áudio por evolução.
-- A atualização é idempotente e preserva os demais benefícios e campos comerciais.

UPDATE public.plans
SET features = CASE
  WHEN features IS NULL THEN ARRAY['Até 60 minutos de áudio por evolução']::text[]
  WHEN array_position(features, 'Tudo do plano mensal') IS NULL THEN
    array_append(features, 'Até 60 minutos de áudio por evolução')
  ELSE
    features[1:array_position(features, 'Tudo do plano mensal')]
    || ARRAY['Até 60 minutos de áudio por evolução']::text[]
    || features[array_position(features, 'Tudo do plano mensal') + 1:array_length(features, 1)]
END
WHERE id = 'yearly'
  AND NOT ('Até 60 minutos de áudio por evolução' = ANY(COALESCE(features, ARRAY[]::text[])));
