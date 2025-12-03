-- ============================================================================
-- ROLLBACK MIGRATION: BGN to EUR
-- Version: 001
-- Date: 2025-12-03
-- ============================================================================

-- WARNING: This rollback script will remove all EUR columns and data
-- Only use if you need to completely reverse the migration
-- BACKUP YOUR DATABASE BEFORE RUNNING THIS ROLLBACK

BEGIN;

-- ============================================================================
-- STEP 1: DROP TRIGGERS
-- ============================================================================

DROP TRIGGER IF EXISTS orders_currency_conversion ON orders;


-- ============================================================================
-- STEP 2: DROP HELPER FUNCTIONS
-- ============================================================================

DROP FUNCTION IF EXISTS orders_auto_convert_currency();
DROP FUNCTION IF EXISTS get_currency_for_date(DATE);
DROP FUNCTION IF EXISTS eur_to_bgn(DECIMAL);
DROP FUNCTION IF EXISTS bgn_to_eur(DECIMAL);


-- ============================================================================
-- STEP 3: DROP INDEXES
-- ============================================================================

DROP INDEX IF EXISTS idx_orders_currency;
DROP INDEX IF EXISTS idx_expenses_currency;
DROP INDEX IF EXISTS idx_inventory_currency;
DROP INDEX IF EXISTS idx_orders_date;


-- ============================================================================
-- STEP 4: REMOVE EUR COLUMNS FROM ORDERS
-- ============================================================================

ALTER TABLE orders
  DROP COLUMN IF EXISTS extras_eur,
  DROP COLUMN IF EXISTS sell_eur,
  DROP COLUMN IF EXISTS currency,
  DROP COLUMN IF EXISTS migrated_to_eur,
  DROP COLUMN IF EXISTS migration_date;


-- ============================================================================
-- STEP 5: REMOVE EUR COLUMNS FROM EXPENSES
-- ============================================================================

ALTER TABLE expenses
  DROP COLUMN IF EXISTS amount_eur,
  DROP COLUMN IF EXISTS currency,
  DROP COLUMN IF EXISTS migrated_to_eur,
  DROP COLUMN IF EXISTS migration_date;


-- ============================================================================
-- STEP 6: REMOVE EUR COLUMNS FROM INVENTORY
-- ============================================================================

ALTER TABLE inventory
  DROP COLUMN IF EXISTS purchase_price_eur,
  DROP COLUMN IF EXISTS sell_price_eur,
  DROP COLUMN IF EXISTS currency,
  DROP COLUMN IF EXISTS migrated_to_eur,
  DROP COLUMN IF EXISTS migration_date;


-- ============================================================================
-- STEP 7: RESTORE SETTINGS (via application)
-- ============================================================================

-- Settings restoration should be done via application code
-- to restore usdRate to default 1.71 and remove eurRate


-- ============================================================================
-- ROLLBACK COMPLETE
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ BGN to EUR migration has been rolled back successfully!';
  RAISE NOTICE '⚠️ All EUR data has been removed.';
  RAISE NOTICE '⚠️ System is now back to BGN-only mode.';
  RAISE NOTICE '📝 Please update application settings via UI.';
END $$;

COMMIT;
