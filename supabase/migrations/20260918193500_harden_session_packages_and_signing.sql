
create or replace function public.guard_signed_patient_session_changes()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if exists (
    select 1 from public.patient_session_signatures sig
    where sig.session_id = old.id and sig.revoked_at is null
  ) and (
    new.session_date is distinct from old.session_date
    or new.session_time is distinct from old.session_time
    or new.status is distinct from old.status
    or new.notes is distinct from old.notes
    or new.evolution_id is distinct from old.evolution_id
    or new.package_id is distinct from old.package_id
    or new.patient_id is distinct from old.patient_id
    or new.professional_id is distinct from old.professional_id
    or new.deleted_at is distinct from old.deleted_at
  ) then
    raise exception 'A sessão possui assinatura ativa. Revogue a assinatura antes de alterar ou excluir a sessão.';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_signed_patient_session_changes() from public, anon, authenticated;

create or replace function public.validate_patient_session_signature()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_patient uuid;
  current_professional uuid;
  current_status text;
begin
  select patient_id, professional_id, status
    into current_patient, current_professional, current_status
  from public.patient_sessions
  where id = new.session_id and deleted_at is null;

  if current_patient is null then
    raise exception 'Sessão não encontrada ou excluída.';
  end if;

  if new.patient_id <> current_patient or new.professional_id <> current_professional then
    raise exception 'Assinatura não corresponde à sessão informada.';
  end if;

  if current_status <> 'completed' then
    raise exception 'Somente sessões realizadas podem receber assinatura.';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_patient_session_signature() from public, anon, authenticated;
