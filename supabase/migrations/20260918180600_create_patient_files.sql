create table if not exists public.patient_files (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  google_drive_file_id text not null,
  google_drive_web_view_link text not null,
  original_file_name text not null,
  mime_type text not null,
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  file_type_key text not null check (
    file_type_key in (
      'anamnesis',
      'assessment',
      'report',
      'opinion',
      'exam',
      'referral',
      'care_plan',
      'consent',
      'image',
      'administrative',
      'other'
    )
  ),
  file_type_label text not null check (
    char_length(btrim(file_type_label)) between 1 and 80
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (patient_id, google_drive_file_id)
);

create index if not exists patient_files_patient_created_idx
  on public.patient_files(patient_id, created_at desc);

alter table public.patient_files enable row level security;

revoke all on table public.patient_files from public, anon, authenticated;
grant select, insert, update, delete on table public.patient_files to authenticated;
grant all on table public.patient_files to service_role;

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
)
with check (
  exists (
    select 1
    from public.patients p
    where p.id = patient_files.patient_id
      and p.professional_id = (select auth.uid())
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
);

comment on table public.patient_files is
  'Catalogo de arquivos vinculados a pacientes. O conteudo permanece no Google Drive do profissional.';
