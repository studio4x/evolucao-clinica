create table if not exists public.anamnesis_template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.anamnesis_templates(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  definition jsonb not null check (jsonb_typeof(definition) = 'object'),
  status text not null default 'published' check (status in ('draft', 'published', 'archived')),
  created_by uuid references public.professionals(id) on delete set null,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique (template_id, version_number)
);

alter table public.anamnesis_templates
  add column if not exists owner_professional_id uuid references public.professionals(id) on delete cascade,
  add column if not exists source_template_id uuid references public.anamnesis_templates(id) on delete set null,
  add column if not exists source_template_version_id uuid references public.anamnesis_template_versions(id) on delete set null,
  add column if not exists kind text not null default 'system',
  add column if not exists status text not null default 'active',
  add column if not exists current_version_id uuid references public.anamnesis_template_versions(id) on delete restrict,
  add column if not exists archived_at timestamptz;

alter table public.anamnesis_templates
  drop constraint if exists anamnesis_templates_kind_check;
alter table public.anamnesis_templates
  add constraint anamnesis_templates_kind_check check (kind in ('system', 'custom', 'derived'));
alter table public.anamnesis_templates
  drop constraint if exists anamnesis_templates_status_check;
alter table public.anamnesis_templates
  add constraint anamnesis_templates_status_check check (status in ('active', 'archived'));

create index if not exists anamnesis_template_versions_template_idx
  on public.anamnesis_template_versions(template_id, version_number desc);
create index if not exists anamnesis_templates_owner_status_idx
  on public.anamnesis_templates(owner_professional_id, status, updated_at desc);

alter table public.patient_anamneses
  add column if not exists template_version_id uuid references public.anamnesis_template_versions(id) on delete restrict,
  add column if not exists patient_context_snapshot jsonb check (patient_context_snapshot is null or jsonb_typeof(patient_context_snapshot) = 'object');

create table if not exists public.patient_anamnesis_versions (
  id uuid primary key default gen_random_uuid(),
  patient_anamnesis_id uuid not null references public.patient_anamneses(id) on delete cascade,
  professional_id uuid not null references public.professionals(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  template_version_id uuid references public.anamnesis_template_versions(id) on delete restrict,
  template_key text not null,
  template_name text not null,
  template_version integer not null check (template_version > 0),
  template_snapshot jsonb not null check (jsonb_typeof(template_snapshot) = 'object'),
  answers_snapshot jsonb not null check (jsonb_typeof(answers_snapshot) = 'object'),
  patient_context_snapshot jsonb not null check (jsonb_typeof(patient_context_snapshot) = 'object'),
  status text not null default 'completed' check (status = 'completed'),
  created_by uuid references public.professionals(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz not null,
  unique (patient_anamnesis_id, version_number)
);

create index if not exists patient_anamnesis_versions_patient_idx
  on public.patient_anamnesis_versions(patient_id, created_at desc);
create index if not exists patient_anamnesis_versions_anamnesis_idx
  on public.patient_anamnesis_versions(patient_anamnesis_id, version_number desc);
create index if not exists patient_anamnesis_versions_professional_idx
  on public.patient_anamnesis_versions(professional_id);

update public.anamnesis_templates
set kind = 'system', status = 'active'
where owner_professional_id is null;

create or replace function private.build_anamnesis_v2_definition(
  p_template_key text,
  p_schema jsonb
)
returns jsonb
language plpgsql
immutable
set search_path = pg_catalog, public, private
as $$
declare
  v_section jsonb;
  v_field jsonb;
  v_sections jsonb := jsonb_build_array(
    jsonb_build_object(
      'id', md5(p_template_key || ':section:basic_information')::uuid,
      'key', 'basic_information',
      'title', 'Informações básicas',
      'description', 'Dados integrados ao cadastro do paciente e informações complementares desta Anamnese.',
      'order', 0,
      'kind', 'basic_information',
      'fields', jsonb_build_array(
        jsonb_build_object('id', md5(p_template_key || ':field:basic_information:full_name')::uuid, 'key', 'patient_full_name', 'label', 'Nome', 'type', 'text', 'required', false, 'order', 0, 'native', true, 'patientReference', 'full_name'),
        jsonb_build_object('id', md5(p_template_key || ':field:basic_information:birth_date')::uuid, 'key', 'patient_birth_date', 'label', 'Data de nascimento', 'type', 'date', 'required', false, 'order', 1, 'native', true, 'patientReference', 'birth_date'),
        jsonb_build_object('id', md5(p_template_key || ':field:basic_information:cpf')::uuid, 'key', 'patient_cpf', 'label', 'CPF', 'type', 'text', 'required', false, 'order', 2, 'native', true, 'patientReference', 'cpf'),
        jsonb_build_object('id', md5(p_template_key || ':field:basic_information:phone')::uuid, 'key', 'patient_phone', 'label', 'Telefone', 'type', 'text', 'required', false, 'order', 3, 'native', true, 'patientReference', 'phone'),
        jsonb_build_object('id', md5(p_template_key || ':field:basic_information:postal_code')::uuid, 'key', 'patient_postal_code', 'label', 'CEP', 'type', 'text', 'required', false, 'order', 4, 'native', true, 'patientReference', 'postal_code'),
        jsonb_build_object('id', md5(p_template_key || ':field:basic_information:street')::uuid, 'key', 'patient_street', 'label', 'Logradouro', 'type', 'text', 'required', false, 'order', 5, 'native', true, 'patientReference', 'street'),
        jsonb_build_object('id', md5(p_template_key || ':field:basic_information:address_number')::uuid, 'key', 'patient_address_number', 'label', 'Número', 'type', 'text', 'required', false, 'order', 6, 'native', true, 'patientReference', 'address_number'),
        jsonb_build_object('id', md5(p_template_key || ':field:basic_information:address_complement')::uuid, 'key', 'patient_address_complement', 'label', 'Complemento', 'type', 'text', 'required', false, 'order', 7, 'native', true, 'patientReference', 'address_complement'),
        jsonb_build_object('id', md5(p_template_key || ':field:basic_information:neighborhood')::uuid, 'key', 'patient_neighborhood', 'label', 'Bairro', 'type', 'text', 'required', false, 'order', 8, 'native', true, 'patientReference', 'neighborhood'),
        jsonb_build_object('id', md5(p_template_key || ':field:basic_information:city')::uuid, 'key', 'patient_city', 'label', 'Cidade', 'type', 'text', 'required', false, 'order', 9, 'native', true, 'patientReference', 'city'),
        jsonb_build_object('id', md5(p_template_key || ':field:basic_information:state')::uuid, 'key', 'patient_state', 'label', 'UF', 'type', 'text', 'required', false, 'order', 10, 'native', true, 'patientReference', 'state'),
        jsonb_build_object('id', md5(p_template_key || ':field:basic_information:occupation')::uuid, 'key', 'occupation', 'label', 'Profissão/Ocupação', 'type', 'text', 'required', false, 'order', 11, 'native', false)
      )
    )
  );
  v_index integer := 1;
  v_field_index integer;
  v_fields jsonb;
begin
  for v_section in select value from jsonb_array_elements(coalesce(p_schema->'sections', '[]'::jsonb)) loop
    v_fields := '[]'::jsonb;
    v_field_index := 0;
    for v_field in select value from jsonb_array_elements(coalesce(v_section->'fields', '[]'::jsonb)) loop
      v_fields := v_fields || jsonb_build_array(
        v_field || jsonb_build_object(
          'id', md5(p_template_key || ':field:' || coalesce(v_section->>'key', v_index::text) || ':' || coalesce(v_field->>'key', v_field_index::text))::uuid,
          'order', v_field_index,
          'required', coalesce((v_field->>'required')::boolean, false)
        )
      );
      v_field_index := v_field_index + 1;
    end loop;
    v_sections := v_sections || jsonb_build_array(
      (v_section - 'fields') || jsonb_build_object(
        'id', md5(p_template_key || ':section:' || coalesce(v_section->>'key', v_index::text))::uuid,
        'order', v_index,
        'kind', coalesce(v_section->>'kind', 'standard'),
        'fields', v_fields
      )
    );
    v_index := v_index + 1;
  end loop;
  return jsonb_build_object('schemaVersion', 1, 'sections', v_sections);
end;
$$;

revoke all on function private.build_anamnesis_v2_definition(text, jsonb) from public, anon, authenticated;

insert into public.anamnesis_template_versions (template_id, version_number, definition, status, published_at)
select id, version, schema, 'published', coalesce(updated_at, now())
from public.anamnesis_templates
on conflict (template_id, version_number) do nothing;

insert into public.anamnesis_template_versions (template_id, version_number, definition, status, published_at)
select id, 2, private.build_anamnesis_v2_definition(template_key, schema), 'published', now()
from public.anamnesis_templates
where kind = 'system'
on conflict (template_id, version_number) do nothing;

update public.anamnesis_templates t
set version = 2,
    schema = v.definition,
    current_version_id = v.id,
    updated_at = now()
from public.anamnesis_template_versions v
where v.template_id = t.id
  and v.version_number = 2
  and t.kind = 'system';

update public.anamnesis_templates t
set current_version_id = v.id
from public.anamnesis_template_versions v
where v.template_id = t.id
  and v.version_number = t.version
  and t.current_version_id is null;

drop function if exists private.build_anamnesis_v2_definition(text, jsonb);

drop policy if exists anamnesis_templates_active_select on public.anamnesis_templates;
create policy anamnesis_templates_active_select
on public.anamnesis_templates for select to authenticated
using (
  is_active = true
  and status = 'active'
  and (owner_professional_id is null or owner_professional_id = (select auth.uid()))
  and exists (
    select 1 from public.professionals prof
    where prof.id = (select auth.uid())
      and (
        prof.role = 'admin'
        or prof.subscription_plan = 'none'
        or (
          prof.subscription_plan in ('yearly', 'courtesy')
          and prof.subscription_status in ('active', 'trialing')
          and (prof.subscription_ends_at is null or prof.subscription_ends_at >= now())
        )
      )
  )
);

grant insert, update on table public.anamnesis_templates to authenticated;
drop policy if exists anamnesis_templates_owner_insert on public.anamnesis_templates;
drop policy if exists anamnesis_templates_owner_update on public.anamnesis_templates;
create policy anamnesis_templates_owner_insert
on public.anamnesis_templates for insert to authenticated
with check (owner_professional_id = (select auth.uid()) and kind in ('custom', 'derived'));
create policy anamnesis_templates_owner_update
on public.anamnesis_templates for update to authenticated
using (owner_professional_id = (select auth.uid()) and kind in ('custom', 'derived'))
with check (owner_professional_id = (select auth.uid()) and kind in ('custom', 'derived'));

alter table public.anamnesis_template_versions enable row level security;
alter table public.patient_anamnesis_versions enable row level security;
revoke all on table public.anamnesis_template_versions from public, anon, authenticated;
revoke all on table public.patient_anamnesis_versions from public, anon, authenticated;
grant select on table public.anamnesis_template_versions to authenticated;
grant insert on table public.anamnesis_template_versions to authenticated;
grant select, insert on table public.patient_anamnesis_versions to authenticated;
grant all on table public.anamnesis_template_versions to service_role;
grant all on table public.patient_anamnesis_versions to service_role;

drop policy if exists anamnesis_template_versions_owner_select on public.anamnesis_template_versions;
drop policy if exists anamnesis_template_versions_owner_insert on public.anamnesis_template_versions;
create policy anamnesis_template_versions_owner_select
on public.anamnesis_template_versions for select to authenticated
using (exists (
  select 1 from public.anamnesis_templates t
  where t.id = anamnesis_template_versions.template_id
    and (t.owner_professional_id is null or t.owner_professional_id = (select auth.uid()))
));

create policy anamnesis_template_versions_owner_insert
on public.anamnesis_template_versions for insert to authenticated
with check (created_by = (select auth.uid()) and exists (
  select 1 from public.anamnesis_templates t
  where t.id = anamnesis_template_versions.template_id
    and t.owner_professional_id = (select auth.uid())
    and t.kind in ('custom', 'derived')
));

drop policy if exists patient_anamnesis_versions_owner_select on public.patient_anamnesis_versions;
drop policy if exists patient_anamnesis_versions_owner_insert on public.patient_anamnesis_versions;
create policy patient_anamnesis_versions_owner_select
on public.patient_anamnesis_versions for select to authenticated
using (professional_id = (select auth.uid()) and exists (
  select 1 from public.patients p where p.id = patient_id and p.professional_id = (select auth.uid())
));

create policy patient_anamnesis_versions_owner_insert
on public.patient_anamnesis_versions for insert to authenticated
with check (professional_id = (select auth.uid()) and exists (
  select 1 from public.patient_anamneses a
  where a.id = patient_anamnesis_id
    and a.patient_id = patient_anamnesis_versions.patient_id
    and a.professional_id = (select auth.uid())
));

create or replace function private.guard_patient_anamnesis_version_immutability()
returns trigger language plpgsql security invoker
set search_path = pg_catalog, public, private
as $$
begin
  raise exception 'patient_anamnesis_version_immutable';
end;
$$;
revoke all on function private.guard_patient_anamnesis_version_immutability() from public, anon, authenticated;
drop trigger if exists patient_anamnesis_versions_immutable on public.patient_anamnesis_versions;
create trigger patient_anamnesis_versions_immutable
before update or delete on public.patient_anamnesis_versions
for each row execute function private.guard_patient_anamnesis_version_immutability();

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
      if not exists (select 1 from public.patients p where p.id = new.patient_id and p.professional_id = (select auth.uid())) then
        raise exception 'anamnesis_patient_forbidden';
      end if;
      select * into v_template from public.anamnesis_templates where id = new.template_id and is_active = true;
      if not found then raise exception 'anamnesis_template_not_found'; end if;
      if new.template_key is distinct from v_template.template_key
        or new.template_name is distinct from v_template.name
        or new.template_version is distinct from v_template.version
        or new.template_snapshot is distinct from v_template.schema then
        raise exception 'anamnesis_template_metadata_mismatch';
      end if;
      if new.template_version_id is not null and not exists (
        select 1 from public.anamnesis_template_versions tv
        where tv.id = new.template_version_id
          and tv.template_id = new.template_id
          and tv.version_number = new.template_version
          and tv.definition = new.template_snapshot
      ) then
        raise exception 'anamnesis_template_version_mismatch';
      end if;
      if new.status is distinct from 'draft' or new.completed_at is not null or new.is_current is distinct from true then
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
    or new.template_version_id is distinct from old.template_version_id
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

  if new.patient_context_snapshot is distinct from old.patient_context_snapshot
    and coalesce(current_setting('app.anamnesis_manage_snapshot', true), '') <> 'on' then
    raise exception 'anamnesis_patient_snapshot_managed_internally';
  end if;

  if old.status = 'completed' and new.answers is distinct from old.answers then
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

create or replace function public.start_patient_anamnesis(
  p_patient_id uuid,
  p_template_id uuid,
  p_archive_current boolean default false
)
returns public.patient_anamneses
language plpgsql security invoker
set search_path = public, pg_catalog
as $$
declare
  v_template public.anamnesis_templates%rowtype;
  v_template_version public.anamnesis_template_versions%rowtype;
  v_existing public.patient_anamneses%rowtype;
  v_created public.patient_anamneses%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'authentication_required'; end if;
  if not exists (select 1 from public.patients p where p.id = p_patient_id and p.professional_id = (select auth.uid())) then raise exception 'patient_not_found_or_forbidden'; end if;
  select * into v_template from public.anamnesis_templates where id = p_template_id and is_active = true and status = 'active';
  if not found then raise exception 'anamnesis_template_not_found'; end if;
  select * into v_template_version from public.anamnesis_template_versions where id = v_template.current_version_id and status = 'published';
  if not found then raise exception 'anamnesis_template_version_not_found'; end if;
  select * into v_existing from public.patient_anamneses where patient_id = p_patient_id and is_current = true limit 1 for update;
  if found then
    if v_existing.template_id = p_template_id and not p_archive_current then return v_existing; end if;
    if not p_archive_current then raise exception 'current_anamnesis_exists'; end if;
    perform set_config('app.anamnesis_manage_current', 'on', true);
    update public.patient_anamneses set is_current = false where id = v_existing.id;
    perform set_config('app.anamnesis_manage_current', 'off', true);
  end if;
  insert into public.patient_anamneses (patient_id, professional_id, template_id, template_version_id, template_key, template_name, template_version, template_snapshot, answers, status, is_current)
  values (p_patient_id, (select auth.uid()), v_template.id, v_template_version.id, v_template.template_key, v_template.name, v_template_version.version_number, v_template_version.definition, '{}'::jsonb, 'draft', true)
  returning * into v_created;
  return v_created;
end;
$$;

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
  perform set_config('app.anamnesis_manage_snapshot', 'on', true);
  update public.patient_anamneses set status = 'completed', completed_at = v_completed_at, patient_context_snapshot = v_snapshot where id = v_record.id returning * into v_record;
  perform set_config('app.anamnesis_manage_snapshot', 'off', true);
  insert into public.patient_anamnesis_versions (patient_anamnesis_id, professional_id, patient_id, version_number, template_version_id, template_key, template_name, template_version, template_snapshot, answers_snapshot, patient_context_snapshot, created_by, completed_at)
  values (v_record.id, v_record.professional_id, v_record.patient_id, v_next_version, v_record.template_version_id, v_record.template_key, v_record.template_name, v_record.template_version, v_record.template_snapshot, v_record.answers, v_snapshot, (select auth.uid()), v_completed_at);
  return v_record;
end;
$$;

create or replace function public.reopen_patient_anamnesis(p_anamnesis_id uuid)
returns public.patient_anamneses
language plpgsql security invoker
set search_path = public, pg_catalog
as $$
declare v_record public.patient_anamneses%rowtype;
begin
  update public.patient_anamneses set status = 'draft', completed_at = null where id = p_anamnesis_id and professional_id = (select auth.uid()) and status = 'completed' returning * into v_record;
  if not found then raise exception 'anamnesis_not_found_or_not_completed'; end if;
  return v_record;
end;
$$;

revoke all on function public.complete_patient_anamnesis(uuid) from public, anon;
revoke all on function public.reopen_patient_anamnesis(uuid) from public, anon;
grant execute on function public.complete_patient_anamnesis(uuid) to authenticated;
grant execute on function public.reopen_patient_anamnesis(uuid) to authenticated;
