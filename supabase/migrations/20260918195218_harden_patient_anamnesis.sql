create schema if not exists private;

create index if not exists patient_anamneses_template_idx
  on public.patient_anamneses(template_id);

update public.patient_anamneses
set completed_at = coalesce(completed_at, updated_at)
where status = 'completed' and completed_at is null;

update public.patient_anamneses
set completed_at = null
where status = 'draft' and completed_at is not null;

alter table public.patient_anamneses
  drop constraint if exists patient_anamneses_status_completed_at_check;

alter table public.patient_anamneses
  add constraint patient_anamneses_status_completed_at_check
  check (
    (status = 'draft' and completed_at is null)
    or
    (status = 'completed' and completed_at is not null)
  );

create table if not exists public.patient_anamnesis_revisions (
  id uuid primary key default gen_random_uuid(),
  anamnesis_id uuid not null references public.patient_anamneses(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  professional_id uuid not null references public.professionals(id) on delete cascade,
  changed_by uuid references public.professionals(id) on delete set null,
  event_type text not null check (event_type in ('answers_updated','completed','reopened','archived')),
  previous_answers jsonb not null default '{}'::jsonb check (jsonb_typeof(previous_answers) = 'object'),
  new_answers jsonb not null default '{}'::jsonb check (jsonb_typeof(new_answers) = 'object'),
  previous_status text not null check (previous_status in ('draft','completed')),
  new_status text not null check (new_status in ('draft','completed')),
  changed_at timestamptz not null default now()
);

create index if not exists patient_anamnesis_revisions_anamnesis_idx
  on public.patient_anamnesis_revisions(anamnesis_id, changed_at desc);
create index if not exists patient_anamnesis_revisions_patient_idx
  on public.patient_anamnesis_revisions(patient_id, changed_at desc);

alter table public.patient_anamnesis_revisions enable row level security;

revoke all on table public.patient_anamnesis_revisions from public, anon, authenticated;
grant select on table public.patient_anamnesis_revisions to authenticated;
grant all on table public.patient_anamnesis_revisions to service_role;

drop policy if exists patient_anamnesis_revisions_owner_select on public.patient_anamnesis_revisions;
create policy patient_anamnesis_revisions_owner_select
on public.patient_anamnesis_revisions
for select
to authenticated
using (
  professional_id = (select auth.uid())
  and exists (
    select 1
    from public.patients p
    where p.id = patient_anamnesis_revisions.patient_id
      and p.professional_id = (select auth.uid())
  )
);

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

  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.guard_patient_anamnesis_write() from public, anon, authenticated;

drop trigger if exists patient_anamneses_touch_updated_at on public.patient_anamneses;
drop trigger if exists patient_anamneses_guard_write on public.patient_anamneses;
create trigger patient_anamneses_guard_write
before insert or update on public.patient_anamneses
for each row execute function private.guard_patient_anamnesis_write();

create or replace function private.log_patient_anamnesis_revision()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_event_type text;
begin
  if old.is_current = true and new.is_current = false then
    v_event_type := 'archived';
  elsif old.status = 'draft' and new.status = 'completed' then
    v_event_type := 'completed';
  elsif old.status = 'completed' and new.status = 'draft' then
    v_event_type := 'reopened';
  elsif old.answers is distinct from new.answers then
    v_event_type := 'answers_updated';
  else
    return new;
  end if;

  insert into public.patient_anamnesis_revisions (
    anamnesis_id,
    patient_id,
    professional_id,
    changed_by,
    event_type,
    previous_answers,
    new_answers,
    previous_status,
    new_status
  )
  values (
    old.id,
    old.patient_id,
    old.professional_id,
    coalesce((select auth.uid()), old.professional_id),
    v_event_type,
    old.answers,
    new.answers,
    old.status,
    new.status
  );

  return new;
end;
$$;

revoke all on function private.log_patient_anamnesis_revision() from public, anon, authenticated;

drop trigger if exists patient_anamneses_revision_log on public.patient_anamneses;
create trigger patient_anamneses_revision_log
after update on public.patient_anamneses
for each row execute function private.log_patient_anamnesis_revision();

drop policy if exists patient_anamneses_owner_insert on public.patient_anamneses;
create policy patient_anamneses_owner_insert
on public.patient_anamneses
for insert
to authenticated
with check (
  professional_id = (select auth.uid())
  and status = 'draft'
  and completed_at is null
  and is_current = true
  and exists (
    select 1
    from public.patients p
    where p.id = patient_anamneses.patient_id
      and p.professional_id = (select auth.uid())
  )
  and exists (
    select 1
    from public.anamnesis_templates t
    where t.id = patient_anamneses.template_id
      and t.is_active = true
      and t.template_key = patient_anamneses.template_key
      and t.name = patient_anamneses.template_name
      and t.version = patient_anamneses.template_version
      and t.schema = patient_anamneses.template_snapshot
  )
);

create or replace function public.start_patient_anamnesis(
  p_patient_id uuid,
  p_template_id uuid,
  p_archive_current boolean default false
)
returns public.patient_anamneses
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_template public.anamnesis_templates%rowtype;
  v_existing public.patient_anamneses%rowtype;
  v_created public.patient_anamneses%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'authentication_required';
  end if;

  if not exists (
    select 1
    from public.patients p
    where p.id = p_patient_id
      and p.professional_id = (select auth.uid())
  ) then
    raise exception 'patient_not_found_or_forbidden';
  end if;

  select *
  into v_template
  from public.anamnesis_templates
  where id = p_template_id
    and is_active = true;

  if not found then
    raise exception 'anamnesis_template_not_found';
  end if;

  select *
  into v_existing
  from public.patient_anamneses
  where patient_id = p_patient_id
    and is_current = true
  limit 1
  for update;

  if found then
    if v_existing.template_id = p_template_id and not p_archive_current then
      return v_existing;
    end if;

    if not p_archive_current then
      raise exception 'current_anamnesis_exists';
    end if;

    perform set_config('app.anamnesis_manage_current', 'on', true);
    update public.patient_anamneses
    set is_current = false
    where id = v_existing.id;
    perform set_config('app.anamnesis_manage_current', 'off', true);
  end if;

  insert into public.patient_anamneses (
    patient_id,
    professional_id,
    template_id,
    template_key,
    template_name,
    template_version,
    template_snapshot,
    answers,
    status,
    is_current
  )
  values (
    p_patient_id,
    (select auth.uid()),
    v_template.id,
    v_template.template_key,
    v_template.name,
    v_template.version,
    v_template.schema,
    '{}'::jsonb,
    'draft',
    true
  )
  returning * into v_created;

  return v_created;
end;
$$;

revoke all on function public.start_patient_anamnesis(uuid,uuid,boolean) from public, anon;
grant execute on function public.start_patient_anamnesis(uuid,uuid,boolean) to authenticated, service_role;

update public.anamnesis_templates
set professional_titles = array['Terapeuta']::text[]
where template_key = 'general' and is_active = true;

update public.anamnesis_templates
set professional_titles = array[
  'Enfermeiro(a)',
  'Técnico de enfermagem',
  'Auxiliar de enfermagem'
]::text[]
where template_key = 'nursing' and is_active = true;

insert into public.anamnesis_templates (
  template_key,
  name,
  professional_group,
  professional_titles,
  version,
  schema,
  is_active
)
values (
  'veterinary',
  'Medicina Veterinária',
  'Medicina Veterinária',
  array['Veterinário(a)']::text[],
  1,
  '{
    "sections": [
      {
        "key": "context",
        "title": "Contexto inicial",
        "description": "Informações gerais relatadas pelo responsável pelo animal.",
        "fields": [
          {"key":"informant","label":"Quem forneceu as informações?","type":"text","placeholder":"Ex.: tutor ou responsável"},
          {"key":"main_complaint","label":"Motivo principal do atendimento","type":"textarea"},
          {"key":"referral_context","label":"Encaminhamento ou contexto de chegada","type":"textarea"},
          {"key":"current_follow_up","label":"Acompanhamentos atuais","type":"textarea"}
        ]
      },
      {
        "key": "history",
        "title": "Histórico e rotina",
        "fields": [
          {"key":"relevant_history","label":"Histórico relevante informado","type":"textarea"},
          {"key":"medications","label":"Medicamentos informados","type":"textarea"},
          {"key":"allergies_restrictions","label":"Alergias, restrições ou cuidados informados","type":"textarea"},
          {"key":"daily_routine","label":"Rotina, ambiente e manejo","type":"textarea"}
        ]
      },
      {
        "key": "veterinary_specific",
        "title": "Informações do animal",
        "fields": [
          {"key":"species_breed","label":"Espécie e raça","type":"text"},
          {"key":"age_sex","label":"Idade e sexo","type":"text"},
          {"key":"feeding","label":"Alimentação relatada","type":"textarea"},
          {"key":"vaccination_prevention","label":"Vacinação e cuidados preventivos informados","type":"textarea"},
          {"key":"behavior_environment","label":"Comportamento e ambiente","type":"textarea"},
          {"key":"previous_conditions_vet","label":"Condições, procedimentos ou internações anteriores informados","type":"textarea"}
        ]
      },
      {
        "key": "goals",
        "title": "Objetivos e observações",
        "fields": [
          {"key":"patient_goals","label":"Objetivos e expectativas do responsável","type":"textarea"},
          {"key":"professional_notes","label":"Observações do profissional","type":"textarea"}
        ]
      }
    ]
  }'::jsonb,
  true
)
on conflict (template_key, version)
do update set
  name = excluded.name,
  professional_group = excluded.professional_group,
  professional_titles = excluded.professional_titles,
  schema = excluded.schema,
  is_active = true,
  updated_at = now();

comment on table public.patient_anamnesis_revisions is
  'Trilha de auditoria das alterações de anamneses. Armazena estados anterior e posterior sem permitir escrita direta pelo profissional.';
