-- Reordena a Jornada de 15 Dias sem alterar o conteúdo editorial.
-- Datas e horários acompanham os respectivos dias para manter a fila do WhatsApp alinhada.
WITH affected_contents AS (
  SELECT
    c.id,
    c.journey_id,
    c.day_number AS current_day,
    CASE c.slug
      WHEN 'ia-organiza-profissional-revisa' THEN 6
      WHEN 'evolucao-clinica-estruturada' THEN 7
      WHEN 'menos-tempo-digitando' THEN 8
      WHEN 'gestao-pacientes-historico' THEN 9
      WHEN 'documentos-acompanhamento' THEN 10
      WHEN 'rotina-uso-pratica' THEN 11
      WHEN 'duvidas-frequentes' THEN 12
    END AS target_day
  FROM public.journey_contents c
  JOIN public.journeys j ON j.id = c.journey_id
  WHERE j.slug = 'jornada-15-dias'
    AND c.slug IN (
      'ia-organiza-profissional-revisa',
      'evolucao-clinica-estruturada',
      'menos-tempo-digitando',
      'gestao-pacientes-historico',
      'documentos-acompanhamento',
      'rotina-uso-pratica',
      'duvidas-frequentes'
    )
), day_schedule AS (
  SELECT c.journey_id, c.day_number, c.publication_date, c.publication_time
  FROM public.journey_contents c
  JOIN public.journeys j ON j.id = c.journey_id
  WHERE j.slug = 'jornada-15-dias'
    AND c.day_number BETWEEN 6 AND 12
)
UPDATE public.journey_contents c
SET
  day_number = 1000 + affected.current_day,
  sort_order = 1000 + affected.current_day,
  publication_date = schedule.publication_date,
  publication_time = schedule.publication_time
FROM affected_contents affected
JOIN day_schedule schedule
  ON schedule.journey_id = affected.journey_id
 AND schedule.day_number = affected.target_day
WHERE c.id = affected.id;

UPDATE public.journey_contents c
SET
  day_number = CASE c.slug
    WHEN 'ia-organiza-profissional-revisa' THEN 6
    WHEN 'evolucao-clinica-estruturada' THEN 7
    WHEN 'menos-tempo-digitando' THEN 8
    WHEN 'gestao-pacientes-historico' THEN 9
    WHEN 'documentos-acompanhamento' THEN 10
    WHEN 'rotina-uso-pratica' THEN 11
    WHEN 'duvidas-frequentes' THEN 12
  END,
  sort_order = CASE c.slug
    WHEN 'ia-organiza-profissional-revisa' THEN 6
    WHEN 'evolucao-clinica-estruturada' THEN 7
    WHEN 'menos-tempo-digitando' THEN 8
    WHEN 'gestao-pacientes-historico' THEN 9
    WHEN 'documentos-acompanhamento' THEN 10
    WHEN 'rotina-uso-pratica' THEN 11
    WHEN 'duvidas-frequentes' THEN 12
  END
FROM public.journeys j
WHERE j.id = c.journey_id
  AND j.slug = 'jornada-15-dias'
  AND c.slug IN (
    'ia-organiza-profissional-revisa',
    'evolucao-clinica-estruturada',
    'menos-tempo-digitando',
    'gestao-pacientes-historico',
    'documentos-acompanhamento',
    'rotina-uso-pratica',
    'duvidas-frequentes'
  );

-- Atualiza itens ainda pendentes na fila usando as datas/horários recém-reordenados.
SELECT public.sync_journey_whatsapp_publications(
  COALESCE(NULLIF(current_setting('app.journey_destination_key', true), ''), 'jornada-15-dias-operador-evolucao-clinica')
);
