create or replace function private.guard_patient_anamnesis_completion_path()
returns trigger
language plpgsql
set search_path = pg_catalog, public, private
as $$
begin
  if old.status = 'draft' and new.status = 'completed'
    and coalesce(current_setting('app.anamnesis_manage_completion', true), '') <> 'on' then
    raise exception 'anamnesis_completion_managed_internally';
  end if;

  if old.status = 'completed' and new.status = 'draft'
    and coalesce(current_setting('app.anamnesis_manage_reopen', true), '') <> 'on' then
    raise exception 'anamnesis_reopen_managed_internally';
  end if;

  return new;
end;
$$;

revoke all on function private.guard_patient_anamnesis_completion_path() from public, anon, authenticated;
drop trigger if exists patient_anamneses_completion_path_guard on public.patient_anamneses;
create trigger patient_anamneses_completion_path_guard
before update on public.patient_anamneses
for each row execute function private.guard_patient_anamnesis_completion_path();

create or replace function private.guard_patient_anamnesis_version_insert()
returns trigger
language plpgsql
set search_path = pg_catalog, public, private
as $$
begin
  if coalesce(current_setting('app.anamnesis_manage_version', true), '') <> 'on' then
    raise exception 'patient_anamnesis_version_creation_managed_internally';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_patient_anamnesis_version_insert() from public, anon, authenticated;
drop trigger if exists patient_anamnesis_versions_internal_insert on public.patient_anamnesis_versions;
create trigger patient_anamnesis_versions_internal_insert
before insert on public.patient_anamnesis_versions
for each row execute function private.guard_patient_anamnesis_version_insert();

create or replace function public.complete_patient_anamnesis(p_anamnesis_id uuid)
returns public.patient_anamneses
language plpgsql security invoker
set search_path = public, pg_catalog
as $$
declare
  v_record public.patient_anamneses%rowtype;
  v_snapshot jsonb;
  v_completed_at timestamptz := now();
  v_next_version integer;
begin
  select * into v_record from public.patient_anamneses where id = p_anamnesis_id and professional_id = (select auth.uid()) for update;
  if not found then raise exception 'anamnesis_not_found_or_forbidden'; end if;
  if v_record.status <> 'draft' then raise exception 'anamnesis_already_completed'; end if;
  v_snapshot := jsonb_build_object(
    'full_name', (select full_name from public.patients where id = v_record.patient_id),
    'birth_date', (select birth_date from public.patients where id = v_record.patient_id),
    'cpf', (select cpf from public.patients where id = v_record.patient_id),
    'phone', (select phone from public.patients where id = v_record.patient_id),
    'postal_code', (select postal_code from public.patients where id = v_record.patient_id),
    'street', (select street from public.patients where id = v_record.patient_id),
    'address_number', (select address_number from public.patients where id = v_record.patient_id),
    'address_complement', (select address_complement from public.patients where id = v_record.patient_id),
    'neighborhood', (select neighborhood from public.patients where id = v_record.patient_id),
    'city', (select city from public.patients where id = v_record.patient_id),
    'state', (select state from public.patients where id = v_record.patient_id)
  );
  select coalesce(max(version_number), 0) + 1 into v_next_version from public.patient_anamnesis_versions where patient_anamnesis_id = v_record.id;
  perform set_config('app.anamnesis_manage_completion', 'on', true);
  perform set_config('app.anamnesis_manage_snapshot', 'on', true);
  update public.patient_anamneses set status = 'completed', completed_at = v_completed_at, patient_context_snapshot = v_snapshot where id = v_record.id returning * into v_record;
  perform set_config('app.anamnesis_manage_completion', 'off', true);
  perform set_config('app.anamnesis_manage_snapshot', 'off', true);
  perform set_config('app.anamnesis_manage_version', 'on', true);
  insert into public.patient_anamnesis_versions (patient_anamnesis_id, professional_id, patient_id, version_number, template_version_id, template_key, template_name, template_version, template_snapshot, answers_snapshot, patient_context_snapshot, created_by, completed_at)
  values (v_record.id, v_record.professional_id, v_record.patient_id, v_next_version, v_record.template_version_id, v_record.template_key, v_record.template_name, v_record.template_version, v_record.template_snapshot, v_record.answers, v_snapshot, (select auth.uid()), v_completed_at);
  perform set_config('app.anamnesis_manage_version', 'off', true);
  return v_record;
end;
$$;

create or replace function public.reopen_patient_anamnesis(p_anamnesis_id uuid)
returns public.patient_anamneses
language plpgsql security invoker
set search_path = public, pg_catalog
as $$
declare
  v_record public.patient_anamneses%rowtype;
begin
  perform set_config('app.anamnesis_manage_reopen', 'on', true);
  update public.patient_anamneses set status = 'draft', completed_at = null where id = p_anamnesis_id and professional_id = (select auth.uid()) and status = 'completed' returning * into v_record;
  perform set_config('app.anamnesis_manage_reopen', 'off', true);
  if not found then raise exception 'anamnesis_not_found_or_not_completed'; end if;
  return v_record;
end;
$$;

revoke all on function public.complete_patient_anamnesis(uuid) from public, anon;
revoke all on function public.reopen_patient_anamnesis(uuid) from public, anon;
