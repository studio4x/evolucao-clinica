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
    select 1
    from public.patient_session_packages psp
    where psp.id = new.package_id
      and psp.patient_id = new.patient_id
      and psp.professional_id = new.professional_id
      and (
        psp.status = 'active'
        or (
          tg_op = 'UPDATE'
          and old.package_id is not distinct from new.package_id
        )
      )
  ) then
    raise exception 'O pacote selecionado não está ativo para este paciente.';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_patient_session_relationships() from public, anon, authenticated;
