-- Migration 015: Restore SELECT policy permanently
-- getPublicUrl() code is deployed but browsers cache JS modules aggressively.
-- Keeping this policy so both old (createSignedUrl) and new (getPublicUrl)
-- code paths work regardless of browser cache state.
-- The policy allows listing for authenticated users only — acceptable for
-- a single-user app. Can be revisited if multi-user is introduced.
CREATE POLICY "Allow authenticated users to view images"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (bucket_id = 'order-images');
