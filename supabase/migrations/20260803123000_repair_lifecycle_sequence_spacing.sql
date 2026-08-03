-- Impede que uma jornada atrasada tente recuperar várias etapas de uma vez.
-- wait_minutes representa o deslocamento acumulado da etapa; depois de cada
-- envio, somente a diferença para a próxima etapa deve ser aguardada.

WITH ranked_pending AS (
  SELECT
    d.id,
    e.current_position,
    s.position,
    row_number() OVER (
      PARTITION BY d.enrollment_id, s.position
      ORDER BY d.scheduled_for, d.created_at, d.id
    ) AS position_rank
  FROM public.lifecycle_dispatches d
  JOIN public.lifecycle_enrollments e ON e.id = d.enrollment_id
  JOIN public.lifecycle_campaigns c ON c.id = e.campaign_id
  JOIN public.lifecycle_steps s ON s.id = d.step_id
  WHERE c.key = 'new_user_activation_15d'
    AND d.dispatch_type = 'sequence'
    AND d.status IN ('queued', 'retry', 'processing')
)
UPDATE public.lifecycle_dispatches d
SET
  status = 'cancelled',
  skip_reason = 'sequence_spacing_repaired',
  skipped_at = now(),
  updated_at = now()
FROM ranked_pending pending
WHERE d.id = pending.id
  AND (
    pending.position <> pending.current_position + 1
    OR pending.position_rank > 1
  );

WITH sequence_anchor AS (
  SELECT
    e.id AS enrollment_id,
    max(COALESCE(done.sent_at, done.skipped_at, done.updated_at, done.created_at)) AS completed_at,
    current_step.wait_minutes AS current_wait_minutes,
    next_step.wait_minutes AS next_wait_minutes,
    e.current_position + 1 AS next_position
  FROM public.lifecycle_enrollments e
  JOIN public.lifecycle_campaigns c
    ON c.id = e.campaign_id
   AND c.key = 'new_user_activation_15d'
  JOIN public.lifecycle_steps current_step
    ON current_step.campaign_id = e.campaign_id
   AND current_step.position = e.current_position
  JOIN public.lifecycle_steps next_step
    ON next_step.campaign_id = e.campaign_id
   AND next_step.position = e.current_position + 1
   AND next_step.status = 'active'
   AND next_step.enabled = true
  JOIN public.lifecycle_dispatches done
    ON done.enrollment_id = e.id
   AND done.step_id = current_step.id
   AND done.dispatch_type = 'sequence'
   AND done.status IN ('sent', 'skipped')
  WHERE e.status = 'active'
  GROUP BY e.id, current_step.wait_minutes, next_step.wait_minutes, e.current_position
), repaired_pending AS (
  SELECT
    d.id,
    anchor.completed_at
      + make_interval(mins => greatest(0, anchor.next_wait_minutes - anchor.current_wait_minutes)) AS not_before
  FROM public.lifecycle_dispatches d
  JOIN sequence_anchor anchor ON anchor.enrollment_id = d.enrollment_id
  JOIN public.lifecycle_steps s
    ON s.id = d.step_id
   AND s.position = anchor.next_position
  WHERE d.dispatch_type = 'sequence'
    AND d.status IN ('queued', 'retry')
)
UPDATE public.lifecycle_dispatches d
SET
  scheduled_for = greatest(d.scheduled_for, repaired.not_before),
  next_attempt_at = CASE
    WHEN d.next_attempt_at IS NULL THEN NULL
    ELSE greatest(d.next_attempt_at, repaired.not_before)
  END,
  updated_at = now()
FROM repaired_pending repaired
WHERE d.id = repaired.id;

WITH sequence_anchor AS (
  SELECT
    e.id AS enrollment_id,
    max(COALESCE(done.sent_at, done.skipped_at, done.updated_at, done.created_at))
      + make_interval(mins => greatest(0, next_step.wait_minutes - current_step.wait_minutes)) AS not_before,
    e.current_position + 1 AS next_position
  FROM public.lifecycle_enrollments e
  JOIN public.lifecycle_campaigns c
    ON c.id = e.campaign_id
   AND c.key = 'new_user_activation_15d'
  JOIN public.lifecycle_steps current_step
    ON current_step.campaign_id = e.campaign_id
   AND current_step.position = e.current_position
  JOIN public.lifecycle_steps next_step
    ON next_step.campaign_id = e.campaign_id
   AND next_step.position = e.current_position + 1
   AND next_step.status = 'active'
   AND next_step.enabled = true
  JOIN public.lifecycle_dispatches done
    ON done.enrollment_id = e.id
   AND done.step_id = current_step.id
   AND done.dispatch_type = 'sequence'
   AND done.status IN ('sent', 'skipped')
  WHERE e.status = 'active'
  GROUP BY e.id, current_step.wait_minutes, next_step.wait_minutes, e.current_position
), pending_schedule AS (
  SELECT
    anchor.enrollment_id,
    anchor.not_before,
    min(d.scheduled_for) AS scheduled_for
  FROM sequence_anchor anchor
  LEFT JOIN public.lifecycle_dispatches d
    ON d.enrollment_id = anchor.enrollment_id
   AND d.dispatch_type = 'sequence'
   AND d.status IN ('queued', 'retry', 'processing')
  LEFT JOIN public.lifecycle_steps s
    ON s.id = d.step_id
   AND s.position = anchor.next_position
  WHERE d.id IS NULL OR s.id IS NOT NULL
  GROUP BY anchor.enrollment_id, anchor.not_before
)
UPDATE public.lifecycle_enrollments e
SET
  next_step_at = greatest(anchor.not_before, COALESCE(anchor.scheduled_for, anchor.not_before)),
  updated_at = now()
FROM pending_schedule anchor
WHERE e.id = anchor.enrollment_id;

CREATE UNIQUE INDEX IF NOT EXISTS lifecycle_one_pending_sequence_per_enrollment_idx
  ON public.lifecycle_dispatches (enrollment_id)
  WHERE dispatch_type = 'sequence'
    AND status IN ('queued', 'retry', 'processing');
