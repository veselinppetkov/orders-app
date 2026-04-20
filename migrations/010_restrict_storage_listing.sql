-- Migration 010: Remove broad SELECT policy on order-images bucket
-- The bucket is public so images are accessible via direct URL without any
-- SELECT policy. The policy was allowing clients to LIST all files
-- (Supabase advisor: public_bucket_allows_listing WARN).
DROP POLICY IF EXISTS "Allow authenticated users to view images 1nu3jyv_0" ON storage.objects;
