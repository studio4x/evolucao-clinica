
create table if not exists public.patient_session_packages (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  professional_id uuid not null references public.professionals(id) on delete cascade,
  label text not null default 'Pacote de sessões' check (char_length(btrim(label)) between 1 and 120),
  target_sessions integer not null check (target_sessions between 1 and 100),
  status text not null default 'active' check (status in ('active','completed','cancelled')),
  starts_on date not null default current_date,
  completed_at timestamptz null,
  cancelled_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.patient_sessions
  add column if not exists package_id uuid null references public.patient_session_packages(id) on delete set null;

create unique index if not exists patient_session_packages_one_active_idx
  on public.patient_session_packages(patient_id, professional_id)
  where status = 'active';

create index if not exists patient_session_packages_professional_idx
  on public.patient_session_packages(professional_id, created_at desc);

create index if not exists patient_session_packages_patient_idx
  on public.patient_session_packages(patient_id, created_at desc);

create index if not exists patient_sessions_package_idx
  on public.patient_sessions(package_id)
  where package_id is not null;

alter table public.patient_session_packages enable row level security;

drop policy if exists patient_session_packages_owner_select on public.patient_session_packages;
create policy patient_session_packages_owner_select
on public.patient_session_packages for select to authenticated
using (
  professional_id = (select auth.uid())
  and exists (
    select 1 from public.patients p
    where p.id = patient_session_packages.patient_id
      and p.professional_id = (select auth.uid())
  )
);

drop policy if exists patient_session_packages_owner_insert on public.patient_session_packages;
create policy patient_session_packages_owner_insert
on public.patient_session_packages for insert to authenticated
with check (
  professional_id = (select auth.uid())
  and exists (
    select 1 from public.patients p
    where p.id = patient_session_packages.patient_id
      and p.professional_id = (select auth.uid())
  )
);

drop policy if exists patient_session_packages_owner_update on public.patient_session_packages;
create policy patient_session_packages_owner_update
on public.patient_session_packages for update to authenticated
using (professional_id = (select auth.uid()))
with check (professional_id = (select auth.uid()));

grant select, insert, update on public.patient_session_packages to authenticated;

create or replace function public.touch_patient_session_packages_updated_at()
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

revoke all on function public.touch_patient_session_packages_updated_at() from public, anon, authenticated;

drop trigger if exists patient_session_packages_touch_updated_at on public.patient_session_packages;
create trigger patient_session_packages_touch_updated_at
before update on public.patient_session_packages
for each row execute function public.touch_patient_session_packages_updated_at();

create or replace function public.refresh_patient_session_package_status()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  target_id uuid;
  completed_count integer;
  required_count integer;
begin
  target_id := coalesce(new.package_id, old.package_id);
  if target_id is null then return coalesce(new, old); end if;

  select target_sessions into required_count
  from public.patient_session_packages
  where id = target_id and status = 'active';

  if required_count is null then return coalesce(new, old); end if;

  select count(*)::integer into completed_count
  from public.patient_sessions s
  where s.package_id = target_id
    and s.status = 'completed'
    and s.deleted_at is null;

  if completed_count >= required_count then
    update public.patient_session_packages
      set status = 'completed', completed_at = now()
    where id = target_id and status = 'active';
  end if;

  return coalesce(new, old);
end;
$$;

revoke all on function public.refresh_patient_session_package_status() from public, anon, authenticated;

drop trigger if exists patient_sessions_refresh_package_status on public.patient_sessions;
create trigger patient_sessions_refresh_package_status
after insert or update of status, deleted_at, package_id on public.patient_sessions
for each row execute function public.refresh_patient_session_package_status();

comment on table public.patient_session_packages is 'Pacotes opcionais para acompanhar quantidade de sessões, sem registrar cobrança ou valores.';
