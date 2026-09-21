-- Publicação dos novos benefícios do Plano Anual.
-- Mantém os demais campos comerciais e evita duplicação em reexecuções locais.
update public.plans
set features = array_append(
  array_append(
    array_remove(
      array_remove(coalesce(features, array[]::text[]), 'Arquivos do paciente no Google Drive'),
      'Geração de anamnese estruturada'
    ),
    'Arquivos do paciente no Google Drive'
  ),
  'Geração de anamnese estruturada'
)
where id = 'yearly';

-- Arquivos do paciente: leitura e mutações somente para assinaturas anuais ativas,
-- mantendo o acesso administrativo e de cortesia já adotado pela plataforma.
drop policy if exists patient_files_owner_select on public.patient_files;
create policy patient_files_owner_select
on public.patient_files
for select
to authenticated
using (
  exists (
    select 1
    from public.patients p
    where p.id = patient_files.patient_id
      and p.professional_id = (select auth.uid())
  )
  and exists (
    select 1
    from public.professionals prof
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

drop policy if exists patient_files_owner_insert on public.patient_files;
create policy patient_files_owner_insert
on public.patient_files
for insert
to authenticated
with check (
  exists (
    select 1
    from public.patients p
    where p.id = patient_files.patient_id
      and p.professional_id = (select auth.uid())
  )
  and exists (
    select 1
    from public.professionals prof
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

drop policy if exists patient_files_owner_update on public.patient_files;
create policy patient_files_owner_update
on public.patient_files
for update
to authenticated
using (
  exists (
    select 1
    from public.patients p
    where p.id = patient_files.patient_id
      and p.professional_id = (select auth.uid())
  )
  and exists (
    select 1
    from public.professionals prof
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
)
with check (
  exists (
    select 1
    from public.patients p
    where p.id = patient_files.patient_id
      and p.professional_id = (select auth.uid())
  )
  and exists (
    select 1
    from public.professionals prof
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

drop policy if exists patient_files_owner_delete on public.patient_files;
create policy patient_files_owner_delete
on public.patient_files
for delete
to authenticated
using (
  exists (
    select 1
    from public.patients p
    where p.id = patient_files.patient_id
      and p.professional_id = (select auth.uid())
  )
  and exists (
    select 1
    from public.professionals prof
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

-- Anamnese estruturada: templates, registros e histórico não ficam disponíveis
-- para planos mensais, mesmo que o cliente tente chamar a API diretamente.
drop policy if exists anamnesis_templates_active_select on public.anamnesis_templates;
create policy anamnesis_templates_active_select
on public.anamnesis_templates
for select
to authenticated
using (
  is_active = true
  and exists (
    select 1
    from public.professionals prof
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

drop policy if exists patient_anamneses_owner_select on public.patient_anamneses;
create policy patient_anamneses_owner_select
on public.patient_anamneses
for select
to authenticated
using (
  professional_id = (select auth.uid())
  and exists (
    select 1 from public.patients p
    where p.id = patient_anamneses.patient_id
      and p.professional_id = (select auth.uid())
  )
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
    select 1 from public.patients p
    where p.id = patient_anamneses.patient_id
      and p.professional_id = (select auth.uid())
  )
  and exists (
    select 1 from public.anamnesis_templates t
    where t.id = patient_anamneses.template_id
      and t.is_active = true
      and t.template_key = patient_anamneses.template_key
      and t.name = patient_anamneses.template_name
      and t.version = patient_anamneses.template_version
      and t.schema = patient_anamneses.template_snapshot
  )
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

drop policy if exists patient_anamneses_owner_update on public.patient_anamneses;
create policy patient_anamneses_owner_update
on public.patient_anamneses
for update
to authenticated
using (
  professional_id = (select auth.uid())
  and exists (
    select 1 from public.patients p
    where p.id = patient_anamneses.patient_id
      and p.professional_id = (select auth.uid())
  )
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
)
with check (
  professional_id = (select auth.uid())
  and exists (
    select 1 from public.patients p
    where p.id = patient_anamneses.patient_id
      and p.professional_id = (select auth.uid())
  )
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

drop policy if exists patient_anamnesis_revisions_owner_select on public.patient_anamnesis_revisions;
create policy patient_anamnesis_revisions_owner_select
on public.patient_anamnesis_revisions
for select
to authenticated
using (
  professional_id = (select auth.uid())
  and exists (
    select 1 from public.patients p
    where p.id = patient_anamnesis_revisions.patient_id
      and p.professional_id = (select auth.uid())
  )
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
    from public.professionals prof
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
  ) then
    raise exception 'annual_plan_required';
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
