
create table if not exists public.patient_sessions (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  professional_id uuid not null references public.professionals(id) on delete cascade,
  evolution_id uuid null references public.evolutions(id) on delete set null,
  session_date date not null,
  session_time time null,
  status text not null default 'completed' check (status in ('scheduled','completed','cancelled','missed')),
  notes text null check (notes is null or char_length(notes) <= 2000),
  deleted_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists patient_sessions_patient_month_idx
  on public.patient_sessions(patient_id, session_date desc)
  where deleted_at is null;

create index if not exists patient_sessions_professional_date_idx
  on public.patient_sessions(professional_id, session_date desc)
  where deleted_at is null;

create table if not exists public.patient_session_signatures (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.patient_sessions(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  professional_id uuid not null references public.professionals(id) on delete cascade,
  signer_type text not null default 'patient' check (signer_type in ('patient','responsible')),
  signer_name text null check (signer_name is null or char_length(signer_name) <= 160),
  signature_path text not null,
  signature_sha256 text not null check (signature_sha256 ~ '^[a-f0-9]{64}$'),
  signed_at timestamptz not null default now(),
  revoked_at timestamptz null,
  revoked_reason text null check (revoked_reason is null or char_length(revoked_reason) <= 500),
  created_at timestamptz not null default now()
);

create unique index if not exists patient_session_signatures_one_active_idx
  on public.patient_session_signatures(session_id)
  where revoked_at is null;

create index if not exists patient_session_signatures_session_idx
  on public.patient_session_signatures(session_id, signed_at desc);

create table if not exists public.patient_session_audit (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.patient_sessions(id) on delete cascade,
  professional_id uuid not null references public.professionals(id) on delete cascade,
  action text not null check (action in ('created','updated','signature_added','signature_revoked','deleted','restored')),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists patient_session_audit_session_idx
  on public.patient_session_audit(session_id, created_at desc);

alter table public.patient_sessions enable row level security;
alter table public.patient_session_signatures enable row level security;
alter table public.patient_session_audit enable row level security;

drop policy if exists patient_sessions_owner_select on public.patient_sessions;
create policy patient_sessions_owner_select
on public.patient_sessions for select to authenticated
using (
  professional_id = (select auth.uid())
  and exists (
    select 1 from public.patients p
    where p.id = patient_sessions.patient_id
      and p.professional_id = (select auth.uid())
  )
);

drop policy if exists patient_sessions_owner_insert on public.patient_sessions;
create policy patient_sessions_owner_insert
on public.patient_sessions for insert to authenticated
with check (
  professional_id = (select auth.uid())
  and exists (
    select 1 from public.patients p
    where p.id = patient_sessions.patient_id
      and p.professional_id = (select auth.uid())
  )
);

drop policy if exists patient_sessions_owner_update on public.patient_sessions;
create policy patient_sessions_owner_update
on public.patient_sessions for update to authenticated
using (professional_id = (select auth.uid()))
with check (
  professional_id = (select auth.uid())
  and exists (
    select 1 from public.patients p
    where p.id = patient_sessions.patient_id
      and p.professional_id = (select auth.uid())
  )
);

drop policy if exists patient_session_signatures_owner_select on public.patient_session_signatures;
create policy patient_session_signatures_owner_select
on public.patient_session_signatures for select to authenticated
using (
  professional_id = (select auth.uid())
  and exists (
    select 1 from public.patient_sessions s
    where s.id = patient_session_signatures.session_id
      and s.professional_id = (select auth.uid())
  )
);

drop policy if exists patient_session_signatures_owner_insert on public.patient_session_signatures;
create policy patient_session_signatures_owner_insert
on public.patient_session_signatures for insert to authenticated
with check (
  professional_id = (select auth.uid())
  and exists (
    select 1 from public.patient_sessions s
    where s.id = patient_session_signatures.session_id
      and s.patient_id = patient_session_signatures.patient_id
      and s.professional_id = (select auth.uid())
      and s.deleted_at is null
  )
);

drop policy if exists patient_session_signatures_owner_update on public.patient_session_signatures;
create policy patient_session_signatures_owner_update
on public.patient_session_signatures for update to authenticated
using (professional_id = (select auth.uid()))
with check (professional_id = (select auth.uid()));

drop policy if exists patient_session_audit_owner_select on public.patient_session_audit;
create policy patient_session_audit_owner_select
on public.patient_session_audit for select to authenticated
using (professional_id = (select auth.uid()));

drop policy if exists patient_session_audit_owner_insert on public.patient_session_audit;
create policy patient_session_audit_owner_insert
on public.patient_session_audit for insert to authenticated
with check (
  professional_id = (select auth.uid())
  and exists (
    select 1 from public.patient_sessions s
    where s.id = patient_session_audit.session_id
      and s.professional_id = (select auth.uid())
  )
);

grant select, insert, update on public.patient_sessions to authenticated;
grant select, insert, update on public.patient_session_signatures to authenticated;
grant select, insert on public.patient_session_audit to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('session-signatures', 'session-signatures', false, 1048576, array['image/png','image/webp'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists session_signatures_storage_select on storage.objects;
create policy session_signatures_storage_select
on storage.objects for select to authenticated
using (
  bucket_id = 'session-signatures'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists session_signatures_storage_insert on storage.objects;
create policy session_signatures_storage_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'session-signatures'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1
    from public.patient_sessions s
    where s.id::text = (storage.foldername(name))[3]
      and s.patient_id::text = (storage.foldername(name))[2]
      and s.professional_id = (select auth.uid())
      and s.deleted_at is null
  )
);

drop policy if exists session_signatures_storage_delete on storage.objects;
create policy session_signatures_storage_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'session-signatures'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create or replace function public.touch_patient_sessions_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.touch_patient_sessions_updated_at() from public, anon, authenticated;

drop trigger if exists patient_sessions_touch_updated_at on public.patient_sessions;
create trigger patient_sessions_touch_updated_at
before update on public.patient_sessions
for each row execute function public.touch_patient_sessions_updated_at();

comment on table public.patient_sessions is 'Controle mensal de sessões realizadas/agendadas por paciente.';
comment on table public.patient_session_signatures is 'Assinaturas de presença vinculadas a sessões, com histórico de revogação.';
comment on table public.patient_session_audit is 'Trilha de auditoria das alterações no controle de sessões.';
