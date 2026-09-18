create index if not exists patient_anamnesis_revisions_professional_idx
  on public.patient_anamnesis_revisions(professional_id);

create index if not exists patient_anamnesis_revisions_changed_by_idx
  on public.patient_anamnesis_revisions(changed_by);

create or replace function private.guard_patient_anamnesis_write()
returns trigger
language plpgsql
set search_path = pg_catalog, public, private
as $$
declare
  v_template public.anamnesis_templates%rowtype;
begin
  if tg_op = 'INSERT' then
    if (select auth.uid()) is not null then
      if new.professional_id is distinct from (select auth.uid()) then
        raise exception 'anamnesis_professional_mismatch';
      end if;

      if not exists (
        select 1
        from public.patients p
        where p.id = new.patient_id
          and p.professional_id = (select auth.uid())
      ) then
        raise exception 'anamnesis_patient_forbidden';
      end if;

      select *
      into v_template
      from public.anamnesis_templates
      where id = new.template_id
        and is_active = true;

      if not found then
        raise exception 'anamnesis_template_not_found';
      end if;

      if new.template_key is distinct from v_template.template_key
        or new.template_name is distinct from v_template.name
        or new.template_version is distinct from v_template.version
        or new.template_snapshot is distinct from v_template.schema then
        raise exception 'anamnesis_template_metadata_mismatch';
      end if;

      if new.status is distinct from 'draft'
        or new.completed_at is not null
        or new.is_current is distinct from true then
        raise exception 'anamnesis_invalid_initial_state';
      end if;

      new.created_at := now();
      new.updated_at := now();
    end if;

    return new;
  end if;

  if new.id is distinct from old.id
    or new.patient_id is distinct from old.patient_id
    or new.professional_id is distinct from old.professional_id
    or new.template_id is distinct from old.template_id
    or new.template_key is distinct from old.template_key
    or new.template_name is distinct from old.template_name
    or new.template_version is distinct from old.template_version
    or new.template_snapshot is distinct from old.template_snapshot
    or new.created_at is distinct from old.created_at then
    raise exception 'anamnesis_immutable_metadata';
  end if;

  if new.is_current is distinct from old.is_current
    and coalesce(current_setting('app.anamnesis_manage_current', true), '') <> 'on' then
    raise exception 'anamnesis_current_state_managed_internally';
  end if;

  if old.status = 'completed'
    and new.answers is distinct from old.answers then
    raise exception 'anamnesis_reopen_required_before_edit';
  end if;

  if old.status = 'draft' and new.status = 'completed' then
    new.completed_at := now();
  elsif old.status = 'completed' and new.status = 'draft' then
    new.completed_at := null;
  elsif new.completed_at is distinct from old.completed_at then
    raise exception 'anamnesis_completed_at_managed_internally';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.guard_patient_anamnesis_write() from public, anon, authenticated;
