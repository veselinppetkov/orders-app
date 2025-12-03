-- ============================================================================
-- FIX INVENTORY CURRENCY CONVERSION
-- ============================================================================
-- Purpose: Convert ALL inventory prices from BGN to EUR
-- Official Rate: 1 EUR = 1.95583 BGN
-- ============================================================================

\echo '========================================================================='
\echo 'FIXING INVENTORY CURRENCY CONVERSION'
\echo 'Date: 2025-12-03'
\echo 'Official Rate: 1 EUR = 1.95583 BGN'
\echo '========================================================================='
\echo ''

-- ============================================================================
-- STEP 1: ADD EUR COLUMNS IF MISSING
-- ============================================================================

\echo 'Step 1: Ensuring EUR price columns exist...'

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'inventory' AND column_name = 'purchase_price_eur'
    ) THEN
        ALTER TABLE inventory ADD COLUMN purchase_price_eur DECIMAL(10,2);
        RAISE NOTICE 'Added purchase_price_eur column';
    ELSE
        RAISE NOTICE 'purchase_price_eur column already exists';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'inventory' AND column_name = 'sell_price_eur'
    ) THEN
        ALTER TABLE inventory ADD COLUMN sell_price_eur DECIMAL(10,2);
        RAISE NOTICE 'Added sell_price_eur column';
    ELSE
        RAISE NOTICE 'sell_price_eur column already exists';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'inventory' AND column_name = 'currency'
    ) THEN
        ALTER TABLE inventory ADD COLUMN currency VARCHAR(3) DEFAULT 'BGN';
        RAISE NOTICE 'Added currency column';
    ELSE
        RAISE NOTICE 'currency column already exists';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'inventory' AND column_name = 'migrated_to_eur'
    ) THEN
        ALTER TABLE inventory ADD COLUMN migrated_to_eur BOOLEAN DEFAULT FALSE;
        RAISE NOTICE 'Added migrated_to_eur column';
    ELSE
        RAISE NOTICE 'migrated_to_eur column already exists';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'inventory' AND column_name = 'migration_date'
    ) THEN
        ALTER TABLE inventory ADD COLUMN migration_date TIMESTAMP;
        RAISE NOTICE 'Added migration_date column';
    ELSE
        RAISE NOTICE 'migration_date column already exists';
    END IF;
END $$;

-- ============================================================================
-- STEP 2: BACKUP CURRENT DATA
-- ============================================================================

\echo ''
\echo 'Step 2: Creating backup of current inventory data...'

CREATE TABLE IF NOT EXISTS inventory_backup_pre_eur_conversion AS
SELECT * FROM inventory;

SELECT COUNT(*) AS "Backed up inventory items" FROM inventory_backup_pre_eur_conversion;

-- ============================================================================
-- STEP 3: CONVERT ALL BGN PRICES TO EUR
-- ============================================================================

\echo ''
\echo 'Step 3: Converting all inventory prices from BGN to EUR...'
\echo 'Using formula: EUR = BGN / 1.95583'
\echo ''

-- Convert inventory items that haven't been converted yet
UPDATE inventory
SET
    purchase_price_eur = ROUND(purchase_price / 1.95583, 2),
    sell_price_eur = ROUND(sell_price / 1.95583, 2),
    currency = 'BGN',
    migrated_to_eur = TRUE,
    migration_date = NOW()
WHERE
    purchase_price_eur IS NULL
    OR sell_price_eur IS NULL
    OR migrated_to_eur = FALSE
    OR (ABS(purchase_price_eur - purchase_price) < 1 AND purchase_price > 10)  -- Fix unconverted values
    OR (ABS(sell_price_eur - sell_price) < 1 AND sell_price > 10);

\echo 'Conversion complete!'

-- ============================================================================
-- STEP 4: VERIFY CONVERSION
-- ============================================================================

\echo ''
\echo 'Step 4: Verifying conversion accuracy...'
\echo ''

\echo 'Sample converted inventory items:'
SELECT
    id,
    brand,
    type,
    purchase_price AS original_purchase_bgn,
    purchase_price_eur AS converted_purchase_eur,
    ROUND(purchase_price / 1.95583, 2) AS expected_purchase_eur,
    sell_price AS original_sell_bgn,
    sell_price_eur AS converted_sell_eur,
    ROUND(sell_price / 1.95583, 2) AS expected_sell_eur,
    stock,
    ROUND(stock * purchase_price_eur, 2) AS total_value_eur,
    CASE
        WHEN ABS(purchase_price_eur - (purchase_price / 1.95583)) / (purchase_price / 1.95583) < 0.02 THEN '✅ OK'
        ELSE '⚠️ CHECK'
    END AS status
FROM inventory
ORDER BY brand
LIMIT 20;

\echo ''
\echo 'Total inventory value comparison:'
SELECT
    ROUND(SUM(purchase_price * stock), 2) AS total_value_bgn,
    ROUND(SUM(purchase_price_eur * stock), 2) AS total_value_eur,
    ROUND(SUM(purchase_price * stock) / 1.95583, 2) AS expected_total_value_eur,
    ROUND(ABS(SUM(purchase_price_eur * stock) - (SUM(purchase_price * stock) / 1.95583)) / (SUM(purchase_price * stock) / 1.95583) * 100, 4) AS deviation_pct
FROM inventory;

\echo ''
\echo 'Potential revenue comparison:'
SELECT
    ROUND(SUM(sell_price * stock), 2) AS potential_revenue_bgn,
    ROUND(SUM(sell_price_eur * stock), 2) AS potential_revenue_eur,
    ROUND(SUM(sell_price * stock) / 1.95583, 2) AS expected_revenue_eur
FROM inventory;

-- ============================================================================
-- STEP 5: CREATE INDEXES FOR PERFORMANCE
-- ============================================================================

\echo ''
\echo 'Step 5: Creating indexes for optimized queries...'

CREATE INDEX IF NOT EXISTS idx_inventory_currency ON inventory(currency);
CREATE INDEX IF NOT EXISTS idx_inventory_migrated ON inventory(migrated_to_eur);

\echo 'Indexes created!'

-- ============================================================================
-- STEP 6: CREATE VIEW FOR EUR-ONLY ACCESS
-- ============================================================================

\echo ''
\echo 'Step 6: Creating convenient EUR-only view...'

CREATE OR REPLACE VIEW inventory_eur AS
SELECT
    id,
    brand,
    type,
    purchase_price_eur AS purchase_price,  -- Expose EUR as default
    sell_price_eur AS sell_price,          -- Expose EUR as default
    purchase_price AS purchase_price_bgn,  -- Keep BGN for reference
    sell_price AS sell_price_bgn,          -- Keep BGN for reference
    stock,
    ordered,
    currency,
    created_at,
    updated_at,
    migrated_to_eur,
    migration_date,
    -- Calculated fields in EUR
    ROUND(stock * purchase_price_eur, 2) AS total_value,
    ROUND(stock * sell_price_eur, 2) AS potential_revenue,
    ROUND((sell_price_eur - purchase_price_eur) * stock, 2) AS potential_profit
FROM inventory;

\echo 'Created view: inventory_eur'
\echo 'You can now query: SELECT * FROM inventory_eur;'

-- ============================================================================
-- STEP 7: UPDATE APPLICATION RECOMMENDATIONS
-- ============================================================================

\echo ''
\echo 'Step 7: Next steps for application code...'
\echo ''
\echo '⚠️ IMPORTANT: Update your application code to:'
\echo '   1. Use purchase_price_eur and sell_price_eur for display'
\echo '   2. Store new items in EUR in _eur fields'
\echo '   3. Keep purchase_price and sell_price fields for historical reference'
\echo ''
\echo 'Example conversion (35 BGN box):'
SELECT
    'box_2' AS item_id,
    35 AS old_bgn_price,
    ROUND(35 / 1.95583, 2) AS correct_eur_price,
    '17.90 EUR is correct, NOT 35 EUR!' AS note;

-- ============================================================================
-- ROLLBACK INSTRUCTIONS
-- ============================================================================

\echo ''
\echo '========================================================================='
\echo 'CONVERSION COMPLETE!'
\echo '========================================================================='
\echo ''
\echo 'CRITICAL FIX EXAMPLES:'
\echo '  - 35 BGN box → 17.90 EUR ✅ (NOT 35 EUR ❌)'
\echo '  - 100 BGN watch → 51.14 EUR ✅ (NOT 100 EUR ❌)'
\echo ''
\echo 'If you need to rollback:'
\echo '1. DROP TABLE inventory;'
\echo '2. ALTER TABLE inventory_backup_pre_eur_conversion RENAME TO inventory;'
\echo ''
\echo 'Otherwise, keep the backup for your records.'
\echo '========================================================================='
