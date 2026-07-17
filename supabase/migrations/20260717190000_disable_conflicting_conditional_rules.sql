-- Desativa as regras condicionais que conflitam com as ações operacionais nativas da plataforma.
UPDATE public.lifecycle_rules
SET enabled = false,
    updated_at = now()
WHERE rule_key IN (
  'logged_in_without_patient',
  'patient_without_linked_record',
  'linked_record_without_evolution',
  'first_evolution_completed'
);

-- Remove os passos da campanha de Mensagens Condicionais correspondentes.
DELETE FROM public.lifecycle_steps
WHERE eligibility_rule_key IN (
  'logged_in_without_patient',
  'patient_without_linked_record',
  'linked_record_without_evolution',
  'first_evolution_completed'
) AND campaign_id IN (
  SELECT id FROM public.lifecycle_campaigns WHERE key = 'conditional_lifecycle_messages'
);

-- Recarrega o cache de schema do PostgREST (Supabase)
NOTIFY pgrst, 'reload schema';
