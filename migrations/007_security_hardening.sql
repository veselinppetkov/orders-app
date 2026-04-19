-- Migration 007: Security hardening (QW-1)
-- Date: 2026-04-19
-- Purpose: Close Supabase advisor ERRORs/WARNs identified in senior audit.
--   1) Enable RLS on pre-EUR backup tables (advisor: rls_disabled_in_public)
--   2) Pin search_path on SQL functions (advisor: function_search_path_mutable)
--
-- Applied via Supabase MCP as migration `security_hardening_qw1`.
-- This file is committed for audit trail / re-application in other envs.

ALTER TABLE public.inventory_backup_pre_eur_conversion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses_backup_pre_eur_conversion  ENABLE ROW LEVEL SECURITY;

ALTER FUNCTION public.bgn_to_eur(amount_bgn numeric)          SET search_path = public, pg_temp;
ALTER FUNCTION public.eur_to_bgn(amount_eur numeric)          SET search_path = public, pg_temp;
ALTER FUNCTION public.get_currency_for_date(record_date date) SET search_path = public, pg_temp;
ALTER FUNCTION public.orders_auto_convert_currency()          SET search_path = public, pg_temp;
ALTER FUNCTION public.update_updated_at_column()              SET search_path = public, pg_temp;
