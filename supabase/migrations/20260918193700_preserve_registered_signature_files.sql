
drop policy if exists session_signatures_storage_delete on storage.objects;
create policy session_signatures_storage_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'session-signatures'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and not exists (
    select 1
    from public.patient_session_signatures sig
    where sig.signature_path = storage.objects.name
  )
);
