-- Migration 014: Drop SELECT policy on order-images (temporary — reverted by 015)
-- Dropped because app moved to getPublicUrl() which needs no policy.
-- Reverted by 015 because browser-cached sessions still used createSignedUrl().
DROP POLICY IF EXISTS "Allow authenticated users to view images" ON storage.objects;
