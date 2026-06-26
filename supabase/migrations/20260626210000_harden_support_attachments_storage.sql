-- Harden support attachments storage: private bucket + scoped read access.

UPDATE storage.buckets
SET public = false
WHERE id = 'support_attachments';

DROP POLICY IF EXISTS "storage_support_public_read" ON storage.objects;
DROP POLICY IF EXISTS "storage_support_select" ON storage.objects;

CREATE POLICY "storage_support_select"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'support_attachments'
  AND (storage.foldername(name))[1] = 'support'
  AND (
    EXISTS (
      SELECT 1
      FROM public.professionals
      WHERE id = auth.uid()
        AND role = 'admin'
    )
    OR (storage.foldername(name))[2] = auth.uid()::text
  )
);

DROP POLICY IF EXISTS "storage_support_insert" ON storage.objects;
CREATE POLICY "storage_support_insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'support_attachments'
  AND (storage.foldername(name))[1] = 'support'
  AND (
    EXISTS (
      SELECT 1
      FROM public.professionals
      WHERE id = auth.uid()
        AND role = 'admin'
    )
    OR (storage.foldername(name))[2] = auth.uid()::text
  )
);

DROP POLICY IF EXISTS "storage_support_update" ON storage.objects;
CREATE POLICY "storage_support_update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'support_attachments'
  AND (storage.foldername(name))[1] = 'support'
  AND (
    EXISTS (
      SELECT 1
      FROM public.professionals
      WHERE id = auth.uid()
        AND role = 'admin'
    )
    OR (storage.foldername(name))[2] = auth.uid()::text
  )
)
WITH CHECK (
  bucket_id = 'support_attachments'
  AND (storage.foldername(name))[1] = 'support'
  AND (
    EXISTS (
      SELECT 1
      FROM public.professionals
      WHERE id = auth.uid()
        AND role = 'admin'
    )
    OR (storage.foldername(name))[2] = auth.uid()::text
  )
);

DROP POLICY IF EXISTS "storage_support_delete" ON storage.objects;
CREATE POLICY "storage_support_delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'support_attachments'
  AND (storage.foldername(name))[1] = 'support'
  AND (
    EXISTS (
      SELECT 1
      FROM public.professionals
      WHERE id = auth.uid()
        AND role = 'admin'
    )
    OR (storage.foldername(name))[2] = auth.uid()::text
  )
);
