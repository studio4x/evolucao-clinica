create or replace function private.validate_anamnesis_builder_schema(p_schema jsonb)
returns void
language plpgsql
immutable
set search_path = pg_catalog, public, private
as $$
declare
  v_section jsonb;
  v_field jsonb;
  v_basic_count integer := 0;
  v_section_ids text[] := '{}';
  v_field_ids text[] := '{}';
  v_types text[] := array['text', 'textarea', 'date', 'number', 'select', 'multiselect', 'yes_no', 'scale'];
  v_patient_references text[] := array['full_name', 'birth_date', 'cpf', 'phone', 'postal_code', 'street', 'address_number', 'address_complement', 'neighborhood', 'city', 'state'];
  v_id text;
begin
  if jsonb_typeof(p_schema) <> 'object' or jsonb_typeof(p_schema->'sections') <> 'array' then
    raise exception 'anamnesis_schema_sections_required';
  end if;

  for v_section in select value from jsonb_array_elements(p_schema->'sections') loop
    v_id := nullif(trim(v_section->>'id'), '');
    if v_id is null then raise exception 'anamnesis_section_id_required'; end if;
    if array_position(v_section_ids, v_id) is not null then raise exception 'anamnesis_section_id_duplicate'; end if;
    v_section_ids := array_append(v_section_ids, v_id);
    if nullif(trim(v_section->>'key'), '') is null or nullif(trim(v_section->>'title'), '') is null then
      raise exception 'anamnesis_section_identity_required';
    end if;
    if v_section->>'kind' = 'basic_information' then
      v_basic_count := v_basic_count + 1;
      if v_basic_count > 1 then raise exception 'anamnesis_basic_information_duplicate'; end if;
    end if;
    if jsonb_typeof(v_section->'fields') <> 'array' then raise exception 'anamnesis_section_fields_required'; end if;

    for v_field in select value from jsonb_array_elements(v_section->'fields') loop
      v_id := nullif(trim(v_field->>'id'), '');
      if v_id is null then raise exception 'anamnesis_field_id_required'; end if;
      if array_position(v_field_ids, v_id) is not null then raise exception 'anamnesis_field_id_duplicate'; end if;
      v_field_ids := array_append(v_field_ids, v_id);
      if nullif(trim(v_field->>'key'), '') is null or nullif(trim(v_field->>'label'), '') is null then
        raise exception 'anamnesis_field_identity_required';
      end if;
      if not (v_field->>'type' = any(v_types)) then raise exception 'anamnesis_field_type_invalid'; end if;
      if v_field ? 'patientReference' and not (v_field->>'patientReference' = any(v_patient_references)) then
        raise exception 'anamnesis_patient_reference_invalid';
      end if;
      if v_field ? 'patientReference' and v_section->>'kind' <> 'basic_information' then
        raise exception 'anamnesis_patient_reference_requires_basic_information';
      end if;
      if v_field->>'type' in ('select', 'multiselect') and (jsonb_typeof(v_field->'options') <> 'array' or jsonb_array_length(v_field->'options') = 0) then
        raise exception 'anamnesis_field_options_required';
      end if;
    end loop;
  end loop;
end;
$$;

revoke all on function private.validate_anamnesis_builder_schema(jsonb) from public, anon, authenticated;

create or replace function private.guard_anamnesis_template_version_immutability()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public, private
as $$
begin
  raise exception 'anamnesis_template_version_immutable';
end;
$$;

revoke all on function private.guard_anamnesis_template_version_immutability() from public, anon, authenticated;
drop trigger if exists anamnesis_template_versions_immutable on public.anamnesis_template_versions;
create trigger anamnesis_template_versions_immutable
before update or delete on public.anamnesis_template_versions
for each row execute function private.guard_anamnesis_template_version_immutability();

revoke insert, update on table public.anamnesis_templates from authenticated;
revoke insert on table public.anamnesis_template_versions from authenticated;

drop policy if exists anamnesis_templates_active_select on public.anamnesis_templates;
create policy anamnesis_templates_active_select
on public.anamnesis_templates for select to authenticated
using (
  (
    owner_professional_id = (select auth.uid())
    and kind in ('custom', 'derived')
  )
  or (
    owner_professional_id is null
    and is_active = true
    and status = 'active'
  )
);

create or replace function public.create_personal_anamnesis_template(
  p_name text,
  p_schema jsonb,
  p_source_template_id uuid default null,
  p_source_template_version_id uuid default null
)
returns public.anamnesis_templates
language plpgsql
security definer
set search_path = public, pg_catalog, private
as $$
declare
  v_user uuid := auth.uid();
  v_template public.anamnesis_templates%rowtype;
  v_version public.anamnesis_template_versions%rowtype;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if nullif(trim(p_name), '') is null then raise exception 'anamnesis_template_name_required'; end if;
  perform private.validate_anamnesis_builder_schema(p_schema);

  if p_source_template_id is not null then
    if not exists (
      select 1 from public.anamnesis_templates t
      where t.id = p_source_template_id and t.kind = 'system' and t.status = 'active'
    ) then raise exception 'anamnesis_source_template_invalid'; end if;
    if p_source_template_version_id is null or not exists (
      select 1 from public.anamnesis_template_versions v
      where v.id = p_source_template_version_id and v.template_id = p_source_template_id and v.status = 'published'
    ) then raise exception 'anamnesis_source_version_invalid'; end if;
  end if;

  insert into public.anamnesis_templates (
    template_key, name, professional_group, professional_titles, version, schema,
    is_active, owner_professional_id, source_template_id, source_template_version_id, kind, status
  ) values (
    'personal_' || replace(gen_random_uuid()::text, '-', ''), trim(p_name), 'Personalizado', '{}'::text[], 1, p_schema,
    true, v_user, p_source_template_id, p_source_template_version_id,
    case when p_source_template_id is null then 'custom' else 'derived' end, 'active'
  ) returning * into v_template;

  insert into public.anamnesis_template_versions (
    template_id, version_number, definition, status, created_by, published_at
  ) values (v_template.id, 1, p_schema, 'published', v_user, now()) returning * into v_version;

  update public.anamnesis_templates
  set current_version_id = v_version.id
  where id = v_template.id;

  select * into v_template from public.anamnesis_templates where id = v_template.id;
  return v_template;
end;
$$;

revoke all on function public.create_personal_anamnesis_template(text, jsonb, uuid, uuid) from public, anon;
grant execute on function public.create_personal_anamnesis_template(text, jsonb, uuid, uuid) to authenticated;

create or replace function public.publish_personal_anamnesis_template(
  p_template_id uuid,
  p_name text,
  p_schema jsonb
)
returns public.anamnesis_templates
language plpgsql
security definer
set search_path = public, pg_catalog, private
as $$
declare
  v_user uuid := auth.uid();
  v_template public.anamnesis_templates%rowtype;
  v_version public.anamnesis_template_versions%rowtype;
  v_next integer;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if nullif(trim(p_name), '') is null then raise exception 'anamnesis_template_name_required'; end if;
  perform private.validate_anamnesis_builder_schema(p_schema);
  select * into v_template from public.anamnesis_templates where id = p_template_id and owner_professional_id = v_user for update;
  if not found then raise exception 'anamnesis_template_not_found_or_forbidden'; end if;

  select coalesce(max(version_number), 0) + 1 into v_next from public.anamnesis_template_versions where template_id = v_template.id;
  insert into public.anamnesis_template_versions (
    template_id, version_number, definition, status, created_by, published_at
  ) values (v_template.id, v_next, p_schema, 'published', v_user, now()) returning * into v_version;

  update public.anamnesis_templates
  set name = trim(p_name), version = v_next, schema = p_schema, current_version_id = v_version.id, status = 'active', archived_at = null, updated_at = now()
  where id = v_template.id;

  select * into v_template from public.anamnesis_templates where id = p_template_id;
  return v_template;
end;
$$;

revoke all on function public.publish_personal_anamnesis_template(uuid, text, jsonb) from public, anon;
grant execute on function public.publish_personal_anamnesis_template(uuid, text, jsonb) to authenticated;

create or replace function public.set_personal_anamnesis_template_status(p_template_id uuid, p_status text)
returns public.anamnesis_templates
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare v_template public.anamnesis_templates%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if p_status not in ('active', 'archived') then raise exception 'anamnesis_template_status_invalid'; end if;
  update public.anamnesis_templates
  set status = p_status, is_active = (p_status = 'active'), archived_at = case when p_status = 'archived' then now() else null end, updated_at = now()
  where id = p_template_id and owner_professional_id = auth.uid()
  returning * into v_template;
  if not found then raise exception 'anamnesis_template_not_found_or_forbidden'; end if;
  return v_template;
end;
$$;

revoke all on function public.set_personal_anamnesis_template_status(uuid, text) from public, anon;
grant execute on function public.set_personal_anamnesis_template_status(uuid, text) to authenticated;
