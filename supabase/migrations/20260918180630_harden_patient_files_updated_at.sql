create or replace function public.touch_patient_files_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.touch_patient_files_updated_at() from public, anon, authenticated;

drop trigger if exists patient_files_set_updated_at on public.patient_files;
create trigger patient_files_set_updated_at
before update on public.patient_files
for each row execute function public.touch_patient_files_updated_at();
