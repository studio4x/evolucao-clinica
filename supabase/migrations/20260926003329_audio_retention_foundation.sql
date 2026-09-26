-- Phase 1: persistent audio assets, strict three-day access authority and
-- idempotent physical cleanup. This migration does not touch temp-audio or
-- backfill legacy evolutions.

create extension if not exists pg_cron;
create extension if not exists pg_net;

create table public.evolution_audio_assets (
  id uuid primary key,
  evolution_id uuid not null references public.evolutions(id) on delete cascade,
  professional_id uuid not null references public.professionals(id) on delete cascade,
  position integer not null check (position between 0 and 99),
  bucket text not null default 'evolution-audio-assets'
    check (bucket = 'evolution-audio-assets'),
  storage_path text not null unique,
  client_upload_key text not null check (char_length(client_upload_key) between 1 and 128),
  mime_type text not null check (mime_type in (
    'audio/webm',
    'audio/ogg',
    'application/ogg',
    'audio/wav',
    'audio/x-wav',
    'audio/mpeg',
    'audio/mp4',
    'audio/x-m4a',
    'audio/aac'
  )),
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  duration_seconds numeric(12, 3) check (duration_seconds is null or duration_seconds >= 0),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default (clock_timestamp() + interval '3 days'),
  access_revoked_at timestamptz,
  deletion_requested_at timestamptz,
  deleted_at timestamptz,
  lifecycle_status text not null default 'uploading' check (lifecycle_status in (
    'uploading',
    'available',
    'deletion_pending',
    'deleted'
  )),
  deletion_attempts integer not null default 0 check (deletion_attempts >= 0),
  next_deletion_attempt_at timestamptz,
  last_error_category text,
  storage_verified_at timestamptz,
  cleanup_claim_token uuid,
  cleanup_claimed_at timestamptz,
  constraint evolution_audio_assets_upload_key_unique
    unique (professional_id, evolution_id, client_upload_key),
  constraint evolution_audio_assets_available_metadata_check
    check (
      lifecycle_status <> 'available'
      or (
        size_bytes is not null and size_bytes > 0
        and duration_seconds is not null and duration_seconds > 0
        and storage_verified_at is not null
        and access_revoked_at is null
        and deleted_at is null
      )
    ),
  constraint evolution_audio_assets_deleted_state_check
    check (lifecycle_status <> 'deleted' or deleted_at is not null),
  constraint evolution_audio_assets_storage_path_check
    check (
      storage_path = professional_id::text || '/' || evolution_id::text || '/' || id::text ||
        case mime_type
          when 'audio/webm' then '.webm'
          when 'audio/ogg' then '.ogg'
          when 'application/ogg' then '.ogg'
          when 'audio/wav' then '.wav'
          when 'audio/x-wav' then '.wav'
          when 'audio/mpeg' then '.mp3'
          when 'audio/mp4' then '.m4a'
          when 'audio/x-m4a' then '.m4a'
          when 'audio/aac' then '.aac'
        end
    )
);

create index evolution_audio_assets_owner_evolution_position_idx
  on public.evolution_audio_assets (professional_id, evolution_id, position, created_at);

create index evolution_audio_assets_cleanup_due_idx
  on public.evolution_audio_assets (
    next_deletion_attempt_at,
    expires_at
  )
  where deleted_at is null;

create table public.evolution_audio_asset_events (
  id bigint generated always as identity primary key,
  audio_id uuid not null references public.evolution_audio_assets(id) on delete cascade,
  event_type text not null check (char_length(event_type) between 1 and 64),
  request_id text check (request_id is null or char_length(request_id) <= 128),
  technical_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  constraint evolution_audio_asset_events_metadata_object_check
    check (jsonb_typeof(technical_metadata) = 'object')
);

create index evolution_audio_asset_events_audio_created_idx
  on public.evolution_audio_asset_events (audio_id, created_at desc);

comment on table public.evolution_audio_assets is
  'Metadata técnica para áudios persistentes. O conteúdo bruto expira individualmente após três dias.';
comment on column public.evolution_audio_assets.expires_at is
  'Autoridade de acesso calculada no banco. expires_at <= database_now significa expirado.';
comment on table public.evolution_audio_asset_events is
  'Eventos técnicos do lifecycle, sem áudio, transcrição, signed URL ou conteúdo clínico.';

create or replace function public.set_evolution_audio_asset_authority()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  new.created_at := clock_timestamp();
  new.expires_at := new.created_at + interval '3 days';
  return new;
end;
$$;

create trigger evolution_audio_assets_set_authority
before insert on public.evolution_audio_assets
for each row execute function public.set_evolution_audio_asset_authority();

create or replace function public.validate_evolution_audio_asset_ownership()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if not exists (
    select 1
      from public.evolutions e
     where e.id = new.evolution_id
       and e.professional_id = new.professional_id
  ) then
    raise exception 'evolution_audio_asset_owner_mismatch' using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger evolution_audio_assets_validate_ownership
before insert or update of evolution_id, professional_id
on public.evolution_audio_assets
for each row execute function public.validate_evolution_audio_asset_ownership();

create or replace function public.preserve_evolution_audio_asset_authority()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if new.created_at is distinct from old.created_at then
    raise exception 'evolution_audio_asset_created_at_is_immutable' using errcode = '23514';
  end if;

  if new.expires_at is distinct from old.expires_at then
    raise exception 'evolution_audio_asset_expires_at_is_immutable' using errcode = '23514';
  end if;

  if old.lifecycle_status = 'deleted' and new.lifecycle_status <> 'deleted' then
    raise exception 'evolution_audio_asset_tombstone_is_immutable' using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger evolution_audio_assets_preserve_authority
before update on public.evolution_audio_assets
for each row execute function public.preserve_evolution_audio_asset_authority();

alter table public.evolution_audio_assets enable row level security;
alter table public.evolution_audio_assets force row level security;
alter table public.evolution_audio_asset_events enable row level security;
alter table public.evolution_audio_asset_events force row level security;

revoke all on table public.evolution_audio_assets from public, anon, authenticated;
revoke all on table public.evolution_audio_asset_events from public, anon, authenticated;
revoke all on sequence public.evolution_audio_asset_events_id_seq from public, anon, authenticated;
grant select on table public.evolution_audio_assets to authenticated;
grant select, insert, update, delete on table public.evolution_audio_assets to service_role;
grant select, insert, update, delete on table public.evolution_audio_asset_events to service_role;
grant usage, select on sequence public.evolution_audio_asset_events_id_seq to service_role;

create policy evolution_audio_assets_select_own
on public.evolution_audio_assets
for select
to authenticated
using (professional_id = (select auth.uid()));

-- The browser receives only a one-object signed upload token created by the
-- backend. There are intentionally no authenticated policies on this bucket.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'evolution-audio-assets',
  'evolution-audio-assets',
  false,
  104857600,
  array[
    'audio/webm',
    'audio/ogg',
    'application/ogg',
    'audio/wav',
    'audio/x-wav',
    'audio/mpeg',
    'audio/mp4',
    'audio/x-m4a',
    'audio/aac'
  ]::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists evolution_audio_assets_storage_select on storage.objects;
drop policy if exists evolution_audio_assets_storage_insert on storage.objects;
drop policy if exists evolution_audio_assets_storage_update on storage.objects;
drop policy if exists evolution_audio_assets_storage_delete on storage.objects;

create or replace function public.prepare_evolution_audio_asset(
  p_asset_id uuid,
  p_evolution_id uuid,
  p_professional_id uuid,
  p_position integer,
  p_storage_path text,
  p_client_upload_key text,
  p_mime_type text
)
returns setof public.evolution_audio_assets
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  existing_asset public.evolution_audio_assets%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(
    p_professional_id::text || ':' || p_evolution_id::text || ':' || p_client_upload_key,
    0
  ));

  select * into existing_asset
    from public.evolution_audio_assets
   where professional_id = p_professional_id
     and evolution_id = p_evolution_id
     and client_upload_key = p_client_upload_key;

  if found then
    return next existing_asset;
    return;
  end if;

  if not exists (
    select 1
      from public.evolutions e
     where e.id = p_evolution_id
       and e.professional_id = p_professional_id
  ) then
    return;
  end if;

  insert into public.evolution_audio_assets (
    id,
    evolution_id,
    professional_id,
    position,
    storage_path,
    client_upload_key,
    mime_type
  ) values (
    p_asset_id,
    p_evolution_id,
    p_professional_id,
    p_position,
    p_storage_path,
    p_client_upload_key,
    p_mime_type
  )
  returning * into existing_asset;

  return next existing_asset;
end;
$$;

create or replace function public.reject_evolution_audio_asset(
  p_asset_id uuid,
  p_professional_id uuid,
  p_error_category text
)
returns boolean
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  update public.evolution_audio_assets
     set access_revoked_at = coalesce(access_revoked_at, clock_timestamp()),
         deletion_requested_at = coalesce(deletion_requested_at, clock_timestamp()),
         lifecycle_status = case when deleted_at is null then 'deletion_pending' else 'deleted' end,
         next_deletion_attempt_at = case when deleted_at is null then clock_timestamp() else null end,
         last_error_category = left(coalesce(nullif(p_error_category, ''), 'validation_rejected'), 64)
   where id = p_asset_id
     and professional_id = p_professional_id
     and lifecycle_status <> 'deleted';

  return found;
end;
$$;

create or replace function public.finalize_evolution_audio_asset(
  p_asset_id uuid,
  p_professional_id uuid,
  p_mime_type text,
  p_size_bytes bigint,
  p_duration_seconds numeric,
  p_max_file_bytes bigint,
  p_max_evolution_duration_seconds numeric
)
returns text
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  target public.evolution_audio_assets%rowtype;
  current_duration numeric;
begin
  select * into target
    from public.evolution_audio_assets
   where id = p_asset_id
     and professional_id = p_professional_id
   for update;

  if not found then return 'not_found'; end if;
  if target.lifecycle_status = 'available' then return 'already_available'; end if;
  if target.lifecycle_status <> 'uploading' then return 'invalid_state'; end if;

  if target.expires_at <= clock_timestamp() then
    perform public.reject_evolution_audio_asset(p_asset_id, p_professional_id, 'expired_before_finalize');
    return 'expired';
  end if;

  if p_mime_type <> target.mime_type
     or p_size_bytes <= 0
     or p_size_bytes > p_max_file_bytes
     or p_duration_seconds <= 0
     or p_duration_seconds > p_max_evolution_duration_seconds then
    perform public.reject_evolution_audio_asset(p_asset_id, p_professional_id, 'upload_validation_failed');
    return 'rejected';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    target.professional_id::text || ':' || target.evolution_id::text,
    0
  ));

  select coalesce(sum(duration_seconds), 0)
    into current_duration
    from public.evolution_audio_assets
   where professional_id = target.professional_id
     and evolution_id = target.evolution_id
     and lifecycle_status = 'available'
     and deleted_at is null
     and id <> target.id;

  if current_duration + p_duration_seconds > p_max_evolution_duration_seconds then
    perform public.reject_evolution_audio_asset(p_asset_id, p_professional_id, 'evolution_duration_limit');
    return 'evolution_limit_exceeded';
  end if;

  update public.evolution_audio_assets
     set size_bytes = p_size_bytes,
         duration_seconds = p_duration_seconds,
         storage_verified_at = clock_timestamp(),
         lifecycle_status = 'available',
         last_error_category = null,
         next_deletion_attempt_at = null
   where id = target.id;

  return 'available';
end;
$$;

create or replace function public.authorize_evolution_audio_asset(
  p_asset_id uuid,
  p_professional_id uuid
)
returns table (
  audio_id uuid,
  evolution_id uuid,
  bucket text,
  storage_path text,
  mime_type text,
  expires_at timestamptz,
  remaining_seconds integer,
  authorization_status text
)
language sql
volatile
security invoker
set search_path = pg_catalog, public
as $$
  select
    asset.id,
    asset.evolution_id,
    asset.bucket,
    asset.storage_path,
    asset.mime_type,
    asset.expires_at,
    greatest(0, floor(extract(epoch from (asset.expires_at - clock_timestamp())))::integer),
    case
      when asset.deleted_at is not null or asset.lifecycle_status = 'deleted' then 'deleted'
      when asset.access_revoked_at is not null or asset.lifecycle_status = 'deletion_pending' then 'revoked'
      when asset.expires_at <= clock_timestamp() then 'expired'
      when asset.lifecycle_status <> 'available' then 'not_available'
      else 'available'
    end
  from public.evolution_audio_assets asset
  where asset.id = p_asset_id
    and asset.professional_id = p_professional_id
  limit 1;
$$;

create or replace function public.request_evolution_audio_asset_deletion(
  p_asset_id uuid,
  p_professional_id uuid
)
returns table (
  audio_id uuid,
  bucket text,
  storage_path text,
  lifecycle_status text
)
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  return query
  update public.evolution_audio_assets asset
     set access_revoked_at = coalesce(asset.access_revoked_at, clock_timestamp()),
         deletion_requested_at = coalesce(asset.deletion_requested_at, clock_timestamp()),
         lifecycle_status = case when asset.deleted_at is null then 'deletion_pending' else 'deleted' end,
         next_deletion_attempt_at = case when asset.deleted_at is null then clock_timestamp() else null end,
         cleanup_claim_token = null,
         cleanup_claimed_at = null
   where asset.id = p_asset_id
     and asset.professional_id = p_professional_id
  returning asset.id, asset.bucket, asset.storage_path, asset.lifecycle_status;
end;
$$;

create or replace function public.evolution_audio_deletion_retry_delay(p_attempt integer)
returns interval
language sql
immutable
security invoker
set search_path = pg_catalog
as $$
  select make_interval(secs => least(
    86400,
    (300 * power(2::numeric, greatest(0, least(coalesce(p_attempt, 1) - 1, 8))))::integer
  ));
$$;

create or replace function public.claim_evolution_audio_asset_cleanup(
  p_batch_size integer,
  p_claim_token uuid
)
returns table (
  audio_id uuid,
  bucket text,
  storage_path text,
  deletion_attempts integer,
  claim_token uuid
)
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  return query
  with due as (
    select asset.id
      from public.evolution_audio_assets asset
     where asset.deleted_at is null
       and (asset.expires_at <= clock_timestamp() or asset.lifecycle_status = 'deletion_pending')
       and coalesce(asset.next_deletion_attempt_at, '-infinity'::timestamptz) <= clock_timestamp()
     order by coalesce(asset.next_deletion_attempt_at, asset.expires_at), asset.id
     limit greatest(1, least(coalesce(p_batch_size, 25), 100))
     for update skip locked
  )
  update public.evolution_audio_assets asset
     set access_revoked_at = coalesce(asset.access_revoked_at, clock_timestamp()),
         deletion_requested_at = coalesce(asset.deletion_requested_at, clock_timestamp()),
         lifecycle_status = 'deletion_pending',
         deletion_attempts = asset.deletion_attempts + 1,
         next_deletion_attempt_at = clock_timestamp()
           + public.evolution_audio_deletion_retry_delay(asset.deletion_attempts + 1),
         cleanup_claim_token = p_claim_token,
         cleanup_claimed_at = clock_timestamp()
    from due
   where asset.id = due.id
  returning asset.id, asset.bucket, asset.storage_path, asset.deletion_attempts, asset.cleanup_claim_token;
end;
$$;

create or replace function public.complete_evolution_audio_asset_deletion(
  p_asset_id uuid,
  p_claim_token uuid default null
)
returns boolean
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  update public.evolution_audio_assets
     set lifecycle_status = 'deleted',
         access_revoked_at = coalesce(access_revoked_at, clock_timestamp()),
         deletion_requested_at = coalesce(deletion_requested_at, clock_timestamp()),
         deleted_at = coalesce(deleted_at, clock_timestamp()),
         next_deletion_attempt_at = null,
         last_error_category = null,
         cleanup_claim_token = null,
         cleanup_claimed_at = null
   where id = p_asset_id
     and deleted_at is null
     and (p_claim_token is null or cleanup_claim_token = p_claim_token);

  if found then return true; end if;
  return exists (
    select 1 from public.evolution_audio_assets
     where id = p_asset_id and deleted_at is not null
  );
end;
$$;

create or replace function public.fail_evolution_audio_asset_deletion(
  p_asset_id uuid,
  p_claim_token uuid,
  p_error_category text,
  p_increment_attempt boolean default false
)
returns boolean
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  update public.evolution_audio_assets
     set lifecycle_status = 'deletion_pending',
         access_revoked_at = coalesce(access_revoked_at, clock_timestamp()),
         deletion_requested_at = coalesce(deletion_requested_at, clock_timestamp()),
         deletion_attempts = deletion_attempts + case when p_increment_attempt then 1 else 0 end,
         next_deletion_attempt_at = clock_timestamp()
           + public.evolution_audio_deletion_retry_delay(
               deletion_attempts + case when p_increment_attempt then 1 else 0 end
             ),
         last_error_category = left(coalesce(nullif(p_error_category, ''), 'storage_unknown'), 64),
         cleanup_claim_token = null,
         cleanup_claimed_at = null
   where id = p_asset_id
     and deleted_at is null
     and (p_claim_token is null or cleanup_claim_token = p_claim_token);

  return found;
end;
$$;

create or replace function public.get_evolution_audio_cleanup_status()
returns table (
  job_name text,
  schedule text,
  active boolean,
  last_status text,
  last_start_time timestamptz,
  last_end_time timestamptz,
  last_return_message text
)
language sql
security definer
set search_path = pg_catalog, public
as $$
  select
    job.jobname::text,
    job.schedule::text,
    job.active,
    latest.status::text,
    latest.start_time,
    latest.end_time,
    left(latest.return_message, 160)
  from cron.job job
  left join lateral (
    select run.status, run.start_time, run.end_time, run.return_message
      from cron.job_run_details run
     where run.jobid = job.jobid
     order by run.start_time desc
     limit 1
  ) latest on true
  where job.jobname = 'cleanup-evolution-audio-assets-hourly'
  limit 1;
$$;

create or replace function public.configure_evolution_audio_cleanup(
  p_function_url text,
  p_internal_secret text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, vault
as $$
declare
  existing_id uuid;
begin
  if p_function_url !~ '^https://[a-z0-9]{20}\.supabase\.co/functions/v1/cleanup-evolution-audio-assets$' then
    raise exception 'invalid_audio_cleanup_function_url' using errcode = '22023';
  end if;
  if char_length(coalesce(p_internal_secret, '')) < 32 then
    raise exception 'invalid_audio_cleanup_internal_secret' using errcode = '22023';
  end if;

  select id into existing_id from vault.secrets where name = 'audio_retention_cleanup_url';
  if existing_id is null then
    perform vault.create_secret(p_function_url, 'audio_retention_cleanup_url', 'Audio retention Edge Function URL');
  else
    perform vault.update_secret(existing_id, p_function_url, 'audio_retention_cleanup_url', 'Audio retention Edge Function URL');
  end if;

  select id into existing_id from vault.secrets where name = 'audio_retention_cleanup_secret';
  if existing_id is null then
    perform vault.create_secret(p_internal_secret, 'audio_retention_cleanup_secret', 'Audio retention internal cleanup secret');
  else
    perform vault.update_secret(existing_id, p_internal_secret, 'audio_retention_cleanup_secret', 'Audio retention internal cleanup secret');
  end if;

  return true;
end;
$$;

create or replace function public.get_evolution_audio_cleanup_config_status()
returns table (
  url_configured boolean,
  secret_configured boolean
)
language sql
security definer
set search_path = pg_catalog, public, vault
as $$
  select
    exists (
      select 1 from vault.decrypted_secrets
       where name = 'audio_retention_cleanup_url'
         and decrypted_secret ~ '^https://[a-z0-9]{20}\.supabase\.co/functions/v1/cleanup-evolution-audio-assets$'
    ),
    exists (
      select 1 from vault.decrypted_secrets
       where name = 'audio_retention_cleanup_secret'
         and char_length(decrypted_secret) >= 32
    );
$$;

revoke all on function public.validate_evolution_audio_asset_ownership() from public, anon, authenticated;
revoke all on function public.set_evolution_audio_asset_authority() from public, anon, authenticated;
revoke all on function public.preserve_evolution_audio_asset_authority() from public, anon, authenticated;
revoke all on function public.prepare_evolution_audio_asset(uuid, uuid, uuid, integer, text, text, text) from public, anon, authenticated;
revoke all on function public.reject_evolution_audio_asset(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.finalize_evolution_audio_asset(uuid, uuid, text, bigint, numeric, bigint, numeric) from public, anon, authenticated;
revoke all on function public.authorize_evolution_audio_asset(uuid, uuid) from public, anon, authenticated;
revoke all on function public.request_evolution_audio_asset_deletion(uuid, uuid) from public, anon, authenticated;
revoke all on function public.evolution_audio_deletion_retry_delay(integer) from public, anon, authenticated;
revoke all on function public.claim_evolution_audio_asset_cleanup(integer, uuid) from public, anon, authenticated;
revoke all on function public.complete_evolution_audio_asset_deletion(uuid, uuid) from public, anon, authenticated;
revoke all on function public.fail_evolution_audio_asset_deletion(uuid, uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.get_evolution_audio_cleanup_status() from public, anon, authenticated;
revoke all on function public.configure_evolution_audio_cleanup(text, text) from public, anon, authenticated;
revoke all on function public.get_evolution_audio_cleanup_config_status() from public, anon, authenticated;

grant execute on function public.prepare_evolution_audio_asset(uuid, uuid, uuid, integer, text, text, text) to service_role;
grant execute on function public.reject_evolution_audio_asset(uuid, uuid, text) to service_role;
grant execute on function public.finalize_evolution_audio_asset(uuid, uuid, text, bigint, numeric, bigint, numeric) to service_role;
grant execute on function public.authorize_evolution_audio_asset(uuid, uuid) to service_role;
grant execute on function public.request_evolution_audio_asset_deletion(uuid, uuid) to service_role;
grant execute on function public.claim_evolution_audio_asset_cleanup(integer, uuid) to service_role;
grant execute on function public.complete_evolution_audio_asset_deletion(uuid, uuid) to service_role;
grant execute on function public.fail_evolution_audio_asset_deletion(uuid, uuid, text, boolean) to service_role;
grant execute on function public.get_evolution_audio_cleanup_status() to service_role;
grant execute on function public.configure_evolution_audio_cleanup(text, text) to service_role;
grant execute on function public.get_evolution_audio_cleanup_config_status() to service_role;

-- The job is installed now but performs no request until both Vault values are
-- configured. This keeps secrets out of migrations and source control.
do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job
    from cron.job
   where jobname = 'cleanup-evolution-audio-assets-hourly';
  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;
end
$$;

select cron.schedule(
  'cleanup-evolution-audio-assets-hourly',
  '17 * * * *',
  $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'audio_retention_cleanup_url'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-audio-cleanup-secret',
        (select decrypted_secret from vault.decrypted_secrets where name = 'audio_retention_cleanup_secret')
      ),
      body := '{"batchSize":25}'::jsonb,
      timeout_milliseconds := 50000
    )
    where exists (
      select 1 from vault.decrypted_secrets
       where name = 'audio_retention_cleanup_url'
         and decrypted_secret ~ '^https://[^/?#]+/functions/v1/cleanup-evolution-audio-assets$'
    )
      and exists (
        select 1 from vault.decrypted_secrets
         where name = 'audio_retention_cleanup_secret'
           and char_length(decrypted_secret) >= 32
      );
  $job$
);
