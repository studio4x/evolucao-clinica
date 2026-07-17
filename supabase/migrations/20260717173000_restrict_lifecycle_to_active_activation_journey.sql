-- A fila lifecycle da plataforma deve acompanhar somente a Jornada de Ativação.
-- Matrículas criadas pela campanha interna de templates condicionais não devem
-- gerar envios enquanto o usuário não estiver ativo na jornada principal.

UPDATE public.lifecycle_dispatches AS d
SET
  status = 'suppressed',
  skip_reason = 'activation_enrollment_inactive',
  skipped_at = now(),
  updated_at = now()
WHERE d.status IN ('queued', 'retry', 'processing')
  AND NOT EXISTS (
    SELECT 1
    FROM public.lifecycle_enrollments AS e
    JOIN public.lifecycle_campaigns AS c ON c.id = e.campaign_id
    WHERE e.id = d.enrollment_id
      AND e.status = 'active'
      AND c.key = 'new_user_activation_15d'
  );

UPDATE public.lifecycle_enrollments AS e
SET
  status = 'suppressed',
  cancellation_reason = 'activation_journey_required',
  updated_at = now()
FROM public.lifecycle_campaigns AS c
WHERE c.id = e.campaign_id
  AND c.key = 'conditional_lifecycle_messages'
  AND e.status = 'active';
