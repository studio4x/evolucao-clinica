create table if not exists public.patient_anamnesis_requests (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professionals(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  template_id uuid not null references public.anamnesis_templates(id) on delete restrict,
  template_version_id uuid not null references public.anamnesis_template_versions(id) on delete restrict,
  target_anamnesis_id uuid references public.patient_anamneses(id) on delete set null,
  respondent_type text not null check (respondent_type in ('patient', 'responsible')),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  public_token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  first_opened_at timestamptz,
  last_activity_at timestamptz,
  revoked_at timestamptz,
  submitted_at timestamptz,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object')
);

create table if not exists public.patient_anamnesis_request_responses (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.patient_anamnesis_requests(id) on delete cascade,
  draft_answers jsonb not null default '{}'::jsonb check (jsonb_typeof(draft_answers) = 'object'),
  submitted_answers jsonb check (submitted_answers is null or jsonb_typeof(submitted_answers) = 'object'),
  respondent_name text,
  respondent_relationship text,
  revision integer not null default 0 check (revision >= 0),
  last_saved_at timestamptz,
  submitted_at timestamptz,
  submit_idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (respondent_name is null or char_length(respondent_name) between 1 and 120),
  check (respondent_relationship is null or char_length(respondent_relationship) between 1 and 120),
  unique (request_id, submit_idempotency_key)
);

create table if not exists public.patient_anamnesis_request_incorporations (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.patient_anamnesis_requests(id) on delete cascade,
  target_anamnesis_id uuid not null references public.patient_anamneses(id) on delete restrict,
  section_id text not null,
  field_id text not null,
  response_revision integer not null check (response_revision >= 0),
  action text not null check (action in ('field', 'section', 'all')),
  incorporated_by uuid not null references public.professionals(id) on delete restrict,
  incorporated_at timestamptz not null default now(),
  unique (request_id, target_anamnesis_id, field_id, response_revision)
);

create table if not exists public.patient_anamnesis_link_rate_limits (
  bucket_key text primary key,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count >= 0),
  updated_at timestamptz not null default now()
);

create index if not exists patient_anamnesis_requests_professional_idx
  on public.patient_anamnesis_requests(professional_id, created_at desc);
create index if not exists patient_anamnesis_requests_patient_idx
  on public.patient_anamnesis_requests(patient_id, created_at desc);
create index if not exists patient_anamnesis_requests_expires_idx
  on public.patient_anamnesis_requests(expires_at);
create index if not exists patient_anamnesis_request_incorporations_request_idx
  on public.patient_anamnesis_request_incorporations(request_id, incorporated_at desc);

alter table public.patient_anamnesis_requests enable row level security;
alter table public.patient_anamnesis_request_responses enable row level security;
alter table public.patient_anamnesis_request_incorporations enable row level security;
alter table public.patient_anamnesis_link_rate_limits enable row level security;

revoke all on table public.patient_anamnesis_requests from public, anon, authenticated;
revoke all on table public.patient_anamnesis_request_responses from public, anon, authenticated;
revoke all on table public.patient_anamnesis_request_incorporations from public, anon, authenticated;
revoke all on table public.patient_anamnesis_link_rate_limits from public, anon, authenticated;
grant all on table public.patient_anamnesis_requests to service_role;
grant all on table public.patient_anamnesis_request_responses to service_role;
grant all on table public.patient_anamnesis_request_incorporations to service_role;
grant all on table public.patient_anamnesis_link_rate_limits to service_role;

drop policy if exists patient_anamnesis_requests_owner_select on public.patient_anamnesis_requests;
create policy patient_anamnesis_requests_owner_select
on public.patient_anamnesis_requests for select to authenticated
using (professional_id = (select auth.uid()));

drop policy if exists patient_anamnesis_request_responses_owner_select on public.patient_anamnesis_request_responses;
create policy patient_anamnesis_request_responses_owner_select
on public.patient_anamnesis_request_responses for select to authenticated
using (exists (
  select 1 from public.patient_anamnesis_requests r
  where r.id = patient_anamnesis_request_responses.request_id
    and r.professional_id = (select auth.uid())
));

drop policy if exists patient_anamnesis_request_incorporations_owner_select on public.patient_anamnesis_request_incorporations;
create policy patient_anamnesis_request_incorporations_owner_select
on public.patient_anamnesis_request_incorporations for select to authenticated
using (incorporated_by = (select auth.uid()));

create or replace function private.guard_patient_anamnesis_link_request_immutability()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public, private
as $$
begin
  if new.id is distinct from old.id
    or new.professional_id is distinct from old.professional_id
    or new.patient_id is distinct from old.patient_id
    or new.template_id is distinct from old.template_id
    or new.template_version_id is distinct from old.template_version_id
    or new.target_anamnesis_id is distinct from old.target_anamnesis_id
    or new.respondent_type is distinct from old.respondent_type
    or new.snapshot is distinct from old.snapshot
    or new.public_token_hash is distinct from old.public_token_hash
    or new.created_at is distinct from old.created_at
  then
    raise exception 'patient_anamnesis_link_request_immutable';
  end if;
  if old.revoked_at is not null and new.revoked_at is null then
    raise exception 'patient_anamnesis_link_request_revocation_immutable';
  end if;
  if old.submitted_at is not null and new.submitted_at is null then
    raise exception 'patient_anamnesis_link_request_submission_immutable';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_patient_anamnesis_link_request_immutability() from public, anon, authenticated;
drop trigger if exists patient_anamnesis_link_request_immutability on public.patient_anamnesis_requests;
create trigger patient_anamnesis_link_request_immutability
before update on public.patient_anamnesis_requests
for each row execute function private.guard_patient_anamnesis_link_request_immutability();

create or replace function private.guard_patient_anamnesis_link_response_immutability()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public, private
as $$
begin
  if old.submitted_at is not null then
    if new.submitted_answers is distinct from old.submitted_answers
      or new.submitted_at is distinct from old.submitted_at
      or new.submit_idempotency_key is distinct from old.submit_idempotency_key
    then
      raise exception 'patient_anamnesis_link_response_submitted_immutable';
    end if;
  elsif new.submitted_at is not null and new.submitted_answers is null then
    raise exception 'patient_anamnesis_link_response_missing_submission';
  end if;
  if new.revision < old.revision or new.revision > old.revision + 1 then
    raise exception 'patient_anamnesis_link_response_invalid_revision';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.guard_patient_anamnesis_link_response_immutability() from public, anon, authenticated;
drop trigger if exists patient_anamnesis_link_response_immutability on public.patient_anamnesis_request_responses;
create trigger patient_anamnesis_link_response_immutability
before update on public.patient_anamnesis_request_responses
for each row execute function private.guard_patient_anamnesis_link_response_immutability();

create or replace function public.consume_patient_anamnesis_link_rate_limit(
  p_bucket_key text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_row public.patient_anamnesis_link_rate_limits%rowtype;
  v_now timestamptz := now();
begin
  if p_bucket_key is null or char_length(p_bucket_key) < 3 or char_length(p_bucket_key) > 220
    or p_limit < 1 or p_window_seconds < 1 then
    return false;
  end if;
  insert into public.patient_anamnesis_link_rate_limits(bucket_key, window_started_at, request_count, updated_at)
  values (p_bucket_key, v_now, 1, v_now)
  on conflict (bucket_key) do update set
    window_started_at = case
      when public.patient_anamnesis_link_rate_limits.window_started_at + make_interval(secs => p_window_seconds) <= v_now
      then v_now else public.patient_anamnesis_link_rate_limits.window_started_at end,
    request_count = case
      when public.patient_anamnesis_link_rate_limits.window_started_at + make_interval(secs => p_window_seconds) <= v_now
      then 1 else public.patient_anamnesis_link_rate_limits.request_count + 1 end,
    updated_at = v_now
  returning * into v_row;
  return v_row.request_count <= p_limit;
end;
$$;

revoke all on function public.consume_patient_anamnesis_link_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_patient_anamnesis_link_rate_limit(text, integer, integer) to service_role;

create or replace function public.incorporate_patient_anamnesis_link_answers(
  p_request_id uuid,
  p_actor_id uuid,
  p_field_ids jsonb,
  p_action text default 'field'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_request public.patient_anamnesis_requests%rowtype;
  v_response public.patient_anamnesis_request_responses%rowtype;
  v_target public.patient_anamneses%rowtype;
  v_section jsonb;
  v_field jsonb;
  v_id text;
  v_found boolean;
  v_value jsonb;
  v_new_answers jsonb;
  v_incorporated integer := 0;
begin
  if p_actor_id is null or jsonb_typeof(p_field_ids) <> 'array' then
    raise exception 'invalid_incorporation_payload';
  end if;
  if p_action not in ('field', 'section', 'all') then
    raise exception 'invalid_incorporation_action';
  end if;
  select * into v_request from public.patient_anamnesis_requests
  where id = p_request_id and professional_id = p_actor_id
  for update;
  if not found then raise exception 'request_not_found_or_forbidden'; end if;
  select * into v_response from public.patient_anamnesis_request_responses
  where request_id = p_request_id for update;
  if not found or v_response.submitted_at is null or v_response.submitted_answers is null then
    raise exception 'request_not_submitted';
  end if;
  if v_request.target_anamnesis_id is null then raise exception 'target_anamnesis_missing'; end if;
  select * into v_target from public.patient_anamneses
  where id = v_request.target_anamnesis_id and patient_id = v_request.patient_id and professional_id = p_actor_id
  for update;
  if not found then raise exception 'target_anamnesis_forbidden'; end if;
  if v_target.status <> 'draft' then raise exception 'target_anamnesis_must_be_draft'; end if;
  v_new_answers := coalesce(v_target.answers, '{}'::jsonb);

  for v_id in select distinct value from jsonb_array_elements_text(p_field_ids) loop
    v_found := false;
    for v_section in select value from jsonb_array_elements(coalesce(v_request.snapshot->'sections', '[]'::jsonb)) loop
      for v_field in select value from jsonb_array_elements(coalesce(v_section->'fields', '[]'::jsonb)) loop
        if v_field->>'id' = v_id then
          v_found := true;
          v_value := v_response.submitted_answers -> v_id;
          if v_value is not null and v_value <> 'null'::jsonb
            and not (jsonb_typeof(v_value) = 'string' and btrim(v_value #>> '{}') = '')
            and not (jsonb_typeof(v_value) = 'array' and jsonb_array_length(v_value) = 0)
          then
            v_new_answers := v_new_answers || jsonb_build_object(v_id, v_value);
            insert into public.patient_anamnesis_request_incorporations (
              request_id, target_anamnesis_id, section_id, field_id, response_revision, action, incorporated_by
            ) values (
              p_request_id, v_target.id, coalesce(v_section->>'id', v_section->>'key', 'unknown'), v_id,
              v_response.revision, p_action, p_actor_id
            ) on conflict do nothing;
            v_incorporated := v_incorporated + 1;
          end if;
        end if;
      end loop;
    end loop;
    if not v_found then raise exception 'field_not_in_snapshot'; end if;
  end loop;

  if v_incorporated > 0 then
    update public.patient_anamneses set answers = v_new_answers where id = v_target.id;
  end if;
  return jsonb_build_object('incorporated', v_incorporated, 'responseRevision', v_response.revision);
end;
$$;

revoke all on function public.incorporate_patient_anamnesis_link_answers(uuid, uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.incorporate_patient_anamnesis_link_answers(uuid, uuid, jsonb, text) to service_role;

create or replace function public.submit_patient_anamnesis_link_response(
  p_request_id uuid,
  p_answers jsonb,
  p_base_revision integer,
  p_respondent_name text,
  p_respondent_relationship text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_request public.patient_anamnesis_requests%rowtype;
  v_response public.patient_anamnesis_request_responses%rowtype;
  v_now timestamptz := now();
begin
  if p_answers is null or jsonb_typeof(p_answers) <> 'object'
    or p_base_revision is null or p_base_revision < 0
    or p_idempotency_key is null or char_length(p_idempotency_key) < 16 or char_length(p_idempotency_key) > 120 then
    raise exception 'invalid_submission_payload';
  end if;
  select * into v_request from public.patient_anamnesis_requests where id = p_request_id for update;
  if not found or v_request.revoked_at is not null or v_request.expires_at <= v_now then
    raise exception 'request_unavailable';
  end if;
  select * into v_response from public.patient_anamnesis_request_responses where request_id = p_request_id for update;
  if not found then raise exception 'response_not_found'; end if;
  if v_response.submitted_at is not null then
    return jsonb_build_object('submitted', true, 'revision', v_response.revision, 'submittedAt', v_response.submitted_at);
  end if;
  if v_response.revision <> p_base_revision then raise exception 'revision_conflict'; end if;

  update public.patient_anamnesis_request_responses
  set draft_answers = p_answers,
      submitted_answers = p_answers,
      respondent_name = nullif(btrim(p_respondent_name), ''),
      respondent_relationship = nullif(btrim(p_respondent_relationship), ''),
      revision = revision + 1,
      last_saved_at = v_now,
      submitted_at = v_now,
      submit_idempotency_key = p_idempotency_key,
      updated_at = v_now
  where id = v_response.id;

  update public.patient_anamnesis_requests
  set submitted_at = v_now, last_activity_at = v_now
  where id = p_request_id;

  return jsonb_build_object('submitted', true, 'revision', v_response.revision + 1, 'submittedAt', v_now);
end;
$$;

revoke all on function public.submit_patient_anamnesis_link_response(uuid, jsonb, integer, text, text, text) from public, anon, authenticated;
grant execute on function public.submit_patient_anamnesis_link_response(uuid, jsonb, integer, text, text, text) to service_role;
