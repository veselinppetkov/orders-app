-- ============================================================================
-- EUR CONVERSION VERIFICATION SCRIPT
-- ============================================================================
-- Purpose: Verify that all BGN values have been properly converted to EUR
-- Official Rate: 1 EUR = 1.95583 BGN
-- Tolerance: 2% (to account for rounding)
-- ============================================================================

\echo '==================================================='
\echo 'EUR CONVERSION VERIFICATION REPORT'
\echo 'Date: 2025-12-03'
\echo 'Official Rate: 1 EUR = 1.95583 BGN'
\echo '==================================================='
\echo ''

-- ============================================================================
-- 1. CHECK ORDERS TABLE
-- ============================================================================

\echo '1. ORDERS TABLE VERIFICATION'
\echo '---------------------------------------------------'

-- Check if EUR columns exist
\echo 'Checking EUR columns existence...'
SELECT
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'orders'
    AND column_name IN ('extras_eur', 'sell_eur', 'currency', 'migrated_to_eur')
ORDER BY column_name;

\echo ''
\echo 'Count of orders with EUR values:'
SELECT
    COUNT(*) AS total_orders,
    COUNT(extras_eur) AS orders_with_extras_eur,
    COUNT(sell_eur) AS orders_with_sell_eur,
    COUNT(CASE WHEN migrated_to_eur = TRUE THEN 1 END) AS migrated_orders
FROM orders;

\echo ''
\echo 'Checking for suspicious EUR values (EUR ≈ BGN, indicating no conversion):'
SELECT
    id,
    date,
    client,
    extras_bgn,
    extras_eur,
    ROUND(extras_bgn / 1.95583, 2) AS expected_extras_eur,
    ABS(extras_eur - extras_bgn) AS difference,
    sell_bgn,
    sell_eur,
    ROUND(sell_bgn / 1.95583, 2) AS expected_sell_eur,
    currency
FROM orders
WHERE
    -- EUR value is suspiciously close to BGN value
    (ABS(extras_eur - extras_bgn) < 1 AND extras_bgn > 100)
    OR (ABS(sell_eur - sell_bgn) < 1 AND sell_bgn > 100)
ORDER BY date DESC
LIMIT 10;

\echo ''
\echo 'Checking for missing EUR values:'
SELECT
    id,
    date,
    client,
    extras_bgn,
    extras_eur,
    sell_bgn,
    sell_eur
FROM orders
WHERE
    extras_eur IS NULL
    OR sell_eur IS NULL
ORDER BY date DESC
LIMIT 10;

\echo ''
\echo 'Verify conversion accuracy (sample 10 orders):'
SELECT
    id,
    date,
    client,
    extras_bgn,
    extras_eur,
    ROUND(extras_bgn / 1.95583, 2) AS expected_extras_eur,
    ROUND(ABS(extras_eur - (extras_bgn / 1.95583)) / (extras_bgn / 1.95583) * 100, 2) AS extras_deviation_pct,
    sell_bgn,
    sell_eur,
    ROUND(sell_bgn / 1.95583, 2) AS expected_sell_eur,
    ROUND(ABS(sell_eur - (sell_bgn / 1.95583)) / (sell_bgn / 1.95583) * 100, 2) AS sell_deviation_pct
FROM orders
WHERE extras_bgn > 0 OR sell_bgn > 0
ORDER BY date DESC
LIMIT 10;

-- ============================================================================
-- 2. CHECK EXPENSES TABLE
-- ============================================================================

\echo ''
\echo ''
\echo '2. EXPENSES TABLE VERIFICATION'
\echo '---------------------------------------------------'

\echo 'Checking EUR columns existence...'
SELECT
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'expenses'
    AND column_name IN ('amount_eur', 'currency', 'migrated_to_eur')
ORDER BY column_name;

\echo ''
\echo 'Count of expenses with EUR values:'
SELECT
    COUNT(*) AS total_expenses,
    COUNT(amount_eur) AS expenses_with_eur,
    COUNT(CASE WHEN migrated_to_eur = TRUE THEN 1 END) AS migrated_expenses
FROM expenses;

\echo ''
\echo 'Checking for suspicious EUR values in expenses:'
SELECT
    id,
    name,
    amount AS amount_bgn,
    amount_eur,
    ROUND(amount / 1.95583, 2) AS expected_amount_eur,
    ROUND(ABS(amount_eur - (amount / 1.95583)) / (amount / 1.95583) * 100, 2) AS deviation_pct
FROM expenses
WHERE
    amount_eur IS NOT NULL
    AND amount > 0
ORDER BY id DESC
LIMIT 10;

-- ============================================================================
-- 3. CHECK INVENTORY TABLE
-- ============================================================================

\echo ''
\echo ''
\echo '3. INVENTORY TABLE VERIFICATION'
\echo '---------------------------------------------------'

\echo 'Checking EUR columns existence...'
SELECT
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'inventory'
    AND column_name IN ('purchase_price_eur', 'sell_price_eur', 'currency', 'migrated_to_eur')
ORDER BY column_name;

\echo ''
\echo 'Count of inventory items with EUR values:'
SELECT
    COUNT(*) AS total_items,
    COUNT(purchase_price_eur) AS items_with_purchase_eur,
    COUNT(sell_price_eur) AS items_with_sell_eur,
    COUNT(CASE WHEN migrated_to_eur = TRUE THEN 1 END) AS migrated_items
FROM inventory;

\echo ''
\echo 'Sample inventory EUR conversions:'
SELECT
    id,
    brand,
    type,
    purchase_price AS purchase_bgn,
    purchase_price_eur,
    ROUND(purchase_price / 1.95583, 2) AS expected_purchase_eur,
    sell_price AS sell_bgn,
    sell_price_eur,
    ROUND(sell_price / 1.95583, 2) AS expected_sell_eur
FROM inventory
LIMIT 10;

-- ============================================================================
-- 4. SUMMARY STATISTICS
-- ============================================================================

\echo ''
\echo ''
\echo '4. SUMMARY STATISTICS'
\echo '---------------------------------------------------'

\echo 'Total revenue comparison (BGN vs EUR converted):'
SELECT
    ROUND(SUM(sell_bgn), 2) AS total_revenue_bgn,
    ROUND(SUM(sell_eur), 2) AS total_revenue_eur,
    ROUND(SUM(sell_bgn) / 1.95583, 2) AS expected_revenue_eur,
    ROUND(ABS(SUM(sell_eur) - (SUM(sell_bgn) / 1.95583)) / (SUM(sell_bgn) / 1.95583) * 100, 4) AS deviation_pct
FROM orders;

\echo ''
\echo 'Total expenses comparison (BGN vs EUR converted):'
SELECT
    ROUND(SUM(amount), 2) AS total_expenses_bgn,
    ROUND(SUM(amount_eur), 2) AS total_expenses_eur,
    ROUND(SUM(amount) / 1.95583, 2) AS expected_expenses_eur,
    ROUND(ABS(SUM(amount_eur) - (SUM(amount) / 1.95583)) / (SUM(amount) / 1.95583) * 100, 4) AS deviation_pct
FROM expenses;

-- ============================================================================
-- 5. IDENTIFY PROBLEMATIC RECORDS
-- ============================================================================

\echo ''
\echo ''
\echo '5. PROBLEMATIC RECORDS (require manual review)'
\echo '---------------------------------------------------'

\echo 'Orders with > 5% deviation from expected EUR value:'
SELECT
    id,
    date,
    client,
    sell_bgn,
    sell_eur,
    ROUND(sell_bgn / 1.95583, 2) AS expected_sell_eur,
    ROUND(ABS(sell_eur - (sell_bgn / 1.95583)) / (sell_bgn / 1.95583) * 100, 2) AS deviation_pct,
    '⚠️ NEEDS REVIEW' AS status
FROM orders
WHERE
    sell_bgn > 0
    AND ABS(sell_eur - (sell_bgn / 1.95583)) / (sell_bgn / 1.95583) > 0.05
ORDER BY deviation_pct DESC;

-- ============================================================================
-- 6. RECOMMENDED FIXES
-- ============================================================================

\echo ''
\echo ''
\echo '6. RECOMMENDED FIX QUERIES'
\echo '---------------------------------------------------'
\echo 'If any records show incorrect EUR values, run these UPDATE queries:'
\echo ''
\echo '-- Fix orders with missing or incorrect EUR values:'
\echo 'UPDATE orders'
\echo 'SET'
\echo '  extras_eur = ROUND(extras_bgn / 1.95583, 2),'
\echo '  sell_eur = ROUND(sell_bgn / 1.95583, 2),'
\echo '  migrated_to_eur = TRUE,'
\echo '  migration_date = NOW()'
\echo 'WHERE '
\echo '  extras_eur IS NULL '
\echo '  OR sell_eur IS NULL'
\echo '  OR ABS(extras_eur - extras_bgn) < 1 '
\echo '  OR ABS(sell_eur - sell_bgn) < 1;'
\echo ''
\echo '-- Fix expenses with missing or incorrect EUR values:'
\echo 'UPDATE expenses'
\echo 'SET'
\echo '  amount_eur = ROUND(amount / 1.95583, 2),'
\echo '  migrated_to_eur = TRUE,'
\echo '  migration_date = NOW()'
\echo 'WHERE amount_eur IS NULL;'
\echo ''
\echo '-- Fix inventory with missing or incorrect EUR values:'
\echo 'UPDATE inventory'
\echo 'SET'
\echo '  purchase_price_eur = ROUND(purchase_price / 1.95583, 2),'
\echo '  sell_price_eur = ROUND(sell_price / 1.95583, 2),'
\echo '  migrated_to_eur = TRUE,'
\echo '  migration_date = NOW()'
\echo 'WHERE purchase_price_eur IS NULL OR sell_price_eur IS NULL;'

\echo ''
\echo '==================================================='
\echo 'END OF VERIFICATION REPORT'
\echo '==================================================='
\echo ''
\echo 'NEXT STEPS:'
\echo '1. Review the problematic records above'
\echo '2. If needed, run the recommended fix queries'
\echo '3. Re-run this script to verify all issues are resolved'
\echo '4. Test the application to ensure correct EUR display'
\echo ''
