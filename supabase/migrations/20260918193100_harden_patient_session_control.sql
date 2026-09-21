
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
    or new.patient_id is distinct from old.patient_id
    or new.professional_id is distinct from old.professional_id
    or new.deleted_at is distinct from old.deleted_at
  ) then
    raise exception 'A sessão possui assinatura ativa. Revogue a assinatura antes de alterar dados essenciais ou excluir a sessão.';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_signed_patient_session_changes() from public, anon, authenticated;

drop trigger if exists patient_sessions_guard_signed_changes on public.patient_sessions;
create trigger patient_sessions_guard_signed_changes
before update on public.patient_sessions
for each row execute function public.guard_signed_patient_session_changes();

create or replace function public.validate_patient_session_signature()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_patient uuid;
  current_professional uuid;
begin
  select patient_id, professional_id
    into current_patient, current_professional
  from public.patient_sessions
  where id = new.session_id and deleted_at is null;

  if current_patient is null then
    raise exception 'Sessão não encontrada ou excluída.';
  end if;

  if new.patient_id <> current_patient or new.professional_id <> current_professional then
    raise exception 'Assinatura não corresponde à sessão informada.';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_patient_session_signature() from public, anon, authenticated;

drop trigger if exists patient_session_signature_validate on public.patient_session_signatures;
create trigger patient_session_signature_validate
before insert on public.patient_session_signatures
for each row execute function public.validate_patient_session_signature();
