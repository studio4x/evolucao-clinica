
create index if not exists patient_sessions_evolution_idx
  on public.patient_sessions(evolution_id)
  where evolution_id is not null;

create index if not exists patient_session_signatures_patient_idx
  on public.patient_session_signatures(patient_id);

create index if not exists patient_session_signatures_professional_idx
  on public.patient_session_signatures(professional_id);

create index if not exists patient_session_audit_professional_idx
  on public.patient_session_audit(professional_id);
