-- ============================================================================
-- ROLLBACK: Fix Currency Calculation Bugs
-- Version: 006
-- Date: 2025-12-28
-- Purpose: Undo changes from 006_fix_currency_calculations.sql
-- ============================================================================

-- STEP 1: Drop constraints
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_total_eur_required;
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_eur_rate_valid;

-- STEP 2: Drop trigger
DROP TRIGGER IF EXISTS orders_calculate_eur_totals ON orders;
DROP FUNCTION IF EXISTS calculate_order_eur_totals();

-- STEP 3: Remove added columns (optional - commented out for safety)
-- ⚠️ Only uncomment if you want to completely remove EUR total columns
-- ⚠️ This will DELETE the calculated EUR values!

/*
ALTER TABLE orders DROP COLUMN IF EXISTS total_eur;
ALTER TABLE orders DROP COLUMN IF EXISTS balance_eur;
*/

-- STEP 4: Verification
DO $$
BEGIN
    RAISE NOTICE '✅ Rollback completed';
    RAISE NOTICE '⚠️  Note: Columns total_eur and balance_eur were NOT dropped (safety)';
    RAISE NOTICE '    To fully rollback, uncomment the DROP COLUMN statements';
END $$;
