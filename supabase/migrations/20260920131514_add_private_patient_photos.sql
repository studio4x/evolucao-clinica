alter table public.patients
  add column if not exists photo_path text;

comment on column public.patients.photo_path is
  'Caminho privado da foto do paciente no bucket patient-photos.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'patient-photos',
  'patient-photos',
  false,
  2097152,
  array['image/png']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "patient_photos_select_own" on storage.objects;
create policy "patient_photos_select_own"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'patient-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "patient_photos_insert_own" on storage.objects;
create policy "patient_photos_insert_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'patient-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "patient_photos_delete_own" on storage.objects;
create policy "patient_photos_delete_own"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'patient-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
