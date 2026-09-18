
create or replace function public.guard_patient_session_signature_updates()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.session_id is distinct from old.session_id
    or new.patient_id is distinct from old.patient_id
    or new.professional_id is distinct from old.professional_id
    or new.signer_type is distinct from old.signer_type
    or new.signer_name is distinct from old.signer_name
    or new.signature_path is distinct from old.signature_path
    or new.signature_sha256 is distinct from old.signature_sha256
    or new.signed_at is distinct from old.signed_at
    or new.created_at is distinct from old.created_at
  then
    raise exception 'Os dados originais da assinatura são imutáveis.';
  end if;

  if old.revoked_at is not null and (
    new.revoked_at is distinct from old.revoked_at
    or new.revoked_reason is distinct from old.revoked_reason
  ) then
    raise exception 'Uma assinatura revogada não pode ser reativada ou alterada.';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_patient_session_signature_updates() from public, anon, authenticated;

drop trigger if exists patient_session_signatures_guard_update on public.patient_session_signatures;
create trigger patient_session_signatures_guard_update
before update on public.patient_session_signatures
for each row execute function public.guard_patient_session_signature_updates();

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
