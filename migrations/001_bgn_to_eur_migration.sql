-- ============================================================================
-- MIGRATION: BGN to EUR - Bulgaria Euro Adoption
-- Version: 001
-- Date: 2025-12-03
-- Official Conversion Rate: 1 EUR = 1.95583 BGN (EU Council approved)
-- Effective Date: January 1, 2026
-- ============================================================================

-- IMPORTANT NOTES:
-- 1. This migration adds EUR fields alongside existing BGN fields
-- 2. Historical BGN data is preserved for audit compliance
-- 3. All EUR values are automatically calculated from BGN using official rate
-- 4. New transactions after Jan 1, 2026 will use EUR as primary currency
-- 5. BACKUP YOUR DATABASE BEFORE RUNNING THIS MIGRATION

-- ============================================================================
-- STEP 1: ADD EUR COLUMNS TO ORDERS TABLE
-- ============================================================================

-- Add EUR equivalent fields for order financial data
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS extras_eur DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS sell_eur DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'BGN';

-- Add metadata for tracking migration
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS migrated_to_eur BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS migration_date TIMESTAMP;

COMMENT ON COLUMN orders.extras_eur IS 'Extra costs in EUR (converted from BGN or native EUR for new orders)';
COMMENT ON COLUMN orders.sell_eur IS 'Selling price in EUR (converted from BGN or native EUR for new orders)';
COMMENT ON COLUMN orders.currency IS 'Source currency of the transaction (BGN for historical, EUR for new)';
COMMENT ON COLUMN orders.migrated_to_eur IS 'Flag indicating if BGN values were converted to EUR';


-- ============================================================================
-- STEP 2: ADD EUR COLUMNS TO EXPENSES TABLE
-- ============================================================================

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS amount_eur DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'BGN';

-- Add metadata
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS migrated_to_eur BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS migration_date TIMESTAMP;

COMMENT ON COLUMN expenses.amount_eur IS 'Expense amount in EUR (converted from BGN or native EUR)';
COMMENT ON COLUMN expenses.currency IS 'Source currency (BGN for historical, EUR for new)';


-- ============================================================================
-- STEP 3: ADD EUR COLUMNS TO INVENTORY TABLE
-- ============================================================================

ALTER TABLE inventory
  ADD COLUMN IF NOT EXISTS purchase_price_eur DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS sell_price_eur DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'BGN';

-- Add metadata
ALTER TABLE inventory
  ADD COLUMN IF NOT EXISTS migrated_to_eur BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS migration_date TIMESTAMP;

COMMENT ON COLUMN inventory.purchase_price_eur IS 'Purchase price in EUR';
COMMENT ON COLUMN inventory.sell_price_eur IS 'Selling price in EUR';
COMMENT ON COLUMN inventory.currency IS 'Source currency (BGN for historical, EUR for new)';


-- ============================================================================
-- STEP 4: UPDATE SETTINGS TABLE FOR EUR SUPPORT
-- ============================================================================

-- The settings table uses JSONB, so we'll update the data structure
-- Add eurRate (USD to EUR) and keep usdRate for historical reference
-- This will be done via application code, but we can add a comment

COMMENT ON COLUMN settings.data IS 'Settings JSON including: usdRate (legacy USD→BGN), eurRate (USD→EUR), conversionRate (1.95583), baseCurrency (EUR)';


-- ============================================================================
-- STEP 5: CONVERT ALL HISTORICAL BGN DATA TO EUR
-- ============================================================================

-- Official EU conversion rate: 1 EUR = 1.95583 BGN
-- Therefore: EUR = BGN / 1.95583

-- Convert ORDERS table
UPDATE orders
SET
  extras_eur = ROUND(extras_bgn / 1.95583, 2),
  sell_eur = ROUND(sell_bgn / 1.95583, 2),
  currency = 'BGN',
  migrated_to_eur = TRUE,
  migration_date = NOW()
WHERE extras_eur IS NULL OR sell_eur IS NULL;

-- Convert EXPENSES table
UPDATE expenses
SET
  amount_eur = ROUND(amount / 1.95583, 2),
  currency = 'BGN',
  migrated_to_eur = TRUE,
  migration_date = NOW()
WHERE amount_eur IS NULL;

-- Convert INVENTORY table
UPDATE inventory
SET
  purchase_price_eur = ROUND(purchase_price / 1.95583, 2),
  sell_price_eur = ROUND(sell_price / 1.95583, 2),
  currency = 'BGN',
  migrated_to_eur = TRUE,
  migration_date = NOW()
WHERE purchase_price_eur IS NULL OR sell_price_eur IS NULL;


-- ============================================================================
-- STEP 6: CREATE INDEXES FOR PERFORMANCE
-- ============================================================================

-- Index on currency field for filtering
CREATE INDEX IF NOT EXISTS idx_orders_currency ON orders(currency);
CREATE INDEX IF NOT EXISTS idx_expenses_currency ON expenses(currency);
CREATE INDEX IF NOT EXISTS idx_inventory_currency ON inventory(currency);

-- Index on date for historical queries
CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(date);


-- ============================================================================
-- STEP 7: CREATE HELPER FUNCTIONS
-- ============================================================================

-- Function to convert BGN to EUR
CREATE OR REPLACE FUNCTION bgn_to_eur(amount_bgn DECIMAL)
RETURNS DECIMAL AS $$
BEGIN
  RETURN ROUND(amount_bgn / 1.95583, 2);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to convert EUR to BGN
CREATE OR REPLACE FUNCTION eur_to_bgn(amount_eur DECIMAL)
RETURNS DECIMAL AS $$
BEGIN
  RETURN ROUND(amount_eur * 1.95583, 2);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to get display currency based on date
CREATE OR REPLACE FUNCTION get_currency_for_date(record_date DATE)
RETURNS VARCHAR(3) AS $$
BEGIN
  IF record_date >= '2026-01-01' THEN
    RETURN 'EUR';
  ELSE
    RETURN 'BGN';
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;


-- ============================================================================
-- STEP 8: CREATE TRIGGERS FOR AUTO-CONVERSION (OPTIONAL)
-- ============================================================================

-- Trigger to automatically populate EUR fields when inserting new orders
CREATE OR REPLACE FUNCTION orders_auto_convert_currency()
RETURNS TRIGGER AS $$
BEGIN
  -- If EUR values are not provided, calculate from BGN
  IF NEW.extras_eur IS NULL AND NEW.extras_bgn IS NOT NULL THEN
    NEW.extras_eur := bgn_to_eur(NEW.extras_bgn);
  END IF;

  IF NEW.sell_eur IS NULL AND NEW.sell_bgn IS NOT NULL THEN
    NEW.sell_eur := bgn_to_eur(NEW.sell_bgn);
  END IF;

  -- If BGN values are not provided, calculate from EUR
  IF NEW.extras_bgn IS NULL AND NEW.extras_eur IS NOT NULL THEN
    NEW.extras_bgn := eur_to_bgn(NEW.extras_eur);
  END IF;

  IF NEW.sell_bgn IS NULL AND NEW.sell_eur IS NOT NULL THEN
    NEW.sell_bgn := eur_to_bgn(NEW.sell_eur);
  END IF;

  -- Set currency if not provided
  IF NEW.currency IS NULL THEN
    NEW.currency := get_currency_for_date(NEW.date);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger (optional - can be enabled if you want automatic conversion)
-- DROP TRIGGER IF EXISTS orders_currency_conversion ON orders;
-- CREATE TRIGGER orders_currency_conversion
--   BEFORE INSERT OR UPDATE ON orders
--   FOR EACH ROW
--   EXECUTE FUNCTION orders_auto_convert_currency();


-- ============================================================================
-- STEP 9: VERIFICATION QUERIES
-- ============================================================================

-- Verify conversion for orders
-- SELECT
--   id,
--   client,
--   extras_bgn,
--   extras_eur,
--   sell_bgn,
--   sell_eur,
--   currency,
--   ROUND(extras_bgn / 1.95583, 2) AS calculated_eur_extras,
--   ROUND(sell_bgn / 1.95583, 2) AS calculated_eur_sell
-- FROM orders
-- LIMIT 10;

-- Count migrated records
-- SELECT
--   'orders' AS table_name,
--   COUNT(*) AS total_records,
--   COUNT(*) FILTER (WHERE migrated_to_eur = TRUE) AS migrated_records
-- FROM orders
-- UNION ALL
-- SELECT
--   'expenses',
--   COUNT(*),
--   COUNT(*) FILTER (WHERE migrated_to_eur = TRUE)
-- FROM expenses
-- UNION ALL
-- SELECT
--   'inventory',
--   COUNT(*),
--   COUNT(*) FILTER (WHERE migrated_to_eur = TRUE)
-- FROM inventory;


-- ============================================================================
-- STEP 10: GRANT PERMISSIONS (adjust as needed for your security model)
-- ============================================================================

-- Grant necessary permissions to your application role
-- GRANT SELECT, INSERT, UPDATE ON orders TO your_app_role;
-- GRANT SELECT, INSERT, UPDATE ON expenses TO your_app_role;
-- GRANT SELECT, INSERT, UPDATE ON inventory TO your_app_role;
-- GRANT SELECT, UPDATE ON settings TO your_app_role;


-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- Add migration tracking record (if you have a migrations table)
-- INSERT INTO schema_migrations (version, name, executed_at)
-- VALUES ('001', 'bgn_to_eur_migration', NOW());

-- Log successful migration
DO $$
BEGIN
  RAISE NOTICE '✅ BGN to EUR migration completed successfully!';
  RAISE NOTICE 'Total orders migrated: %', (SELECT COUNT(*) FROM orders WHERE migrated_to_eur = TRUE);
  RAISE NOTICE 'Total expenses migrated: %', (SELECT COUNT(*) FROM expenses WHERE migrated_to_eur = TRUE);
  RAISE NOTICE 'Total inventory items migrated: %', (SELECT COUNT(*) FROM inventory WHERE migrated_to_eur = TRUE);
  RAISE NOTICE 'Official conversion rate: 1 EUR = 1.95583 BGN';
END $$;
