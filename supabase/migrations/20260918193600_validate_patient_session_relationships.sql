
create or replace function public.validate_patient_session_relationships()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.patients p
    where p.id = new.patient_id and p.professional_id = new.professional_id
  ) then
    raise exception 'Paciente e profissional não correspondem.';
  end if;

  if new.evolution_id is not null and not exists (
    select 1 from public.evolutions e
    where e.id = new.evolution_id
      and e.patient_id = new.patient_id
      and e.professional_id = new.professional_id
  ) then
    raise exception 'A evolução selecionada não pertence a este paciente e profissional.';
  end if;

  if new.package_id is not null and not exists (
    select 1 from public.patient_session_packages psp
    where psp.id = new.package_id
      and psp.patient_id = new.patient_id
      and psp.professional_id = new.professional_id
      and psp.status = 'active'
  ) then
    raise exception 'O pacote selecionado não está ativo para este paciente.';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_patient_session_relationships() from public, anon, authenticated;

drop trigger if exists patient_sessions_validate_relationships on public.patient_sessions;
create trigger patient_sessions_validate_relationships
before insert or update of patient_id, professional_id, evolution_id, package_id
on public.patient_sessions
for each row execute function public.validate_patient_session_relationships();

create or replace function public.refresh_patient_session_package_status()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  target_id uuid;
  completed_count integer;
  required_count integer;
begin
  if tg_op = 'INSERT' then
    target_id := new.package_id;
  else
    target_id := coalesce(new.package_id, old.package_id);
  end if;

  if target_id is null then
    return new;
  end if;

  select target_sessions into required_count
  from public.patient_session_packages
  where id = target_id and status = 'active';

  if required_count is null then
    return new;
  end if;

  select count(*)::integer into completed_count
  from public.patient_sessions s
  where s.package_id = target_id
    and s.status = 'completed'
    and s.deleted_at is null;

  if completed_count >= required_count then
    update public.patient_session_packages
      set status = 'completed', completed_at = now()
    where id = target_id and status = 'active';
  end if;

  return new;
end;
$$;

revoke all on function public.refresh_patient_session_package_status() from public, anon, authenticated;
