-- Migration 013: Restore SELECT policy on order-images (broken by 010)
-- Migration 010 removed the SELECT policy to stop bucket listing, but the app
-- was using createSignedUrl() which requires SELECT on storage.objects.
-- This restores read access while the code is migrated to getPublicUrl().
-- Once getPublicUrl() is in production this policy can be removed again.
CREATE POLICY "Allow authenticated users to view images"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (bucket_id = 'order-images');
