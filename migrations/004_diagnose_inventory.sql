-- ============================================================================
-- INVENTORY DIAGNOSTIC SCRIPT
-- ============================================================================
-- Purpose: Identify what went wrong after migration
-- Run this to understand the current database state
-- ============================================================================

\echo '========================================================================='
\echo 'INVENTORY MIGRATION DIAGNOSTIC REPORT'
\echo 'Date: 2025-12-03'
\echo '========================================================================='
\echo ''

-- ============================================================================
-- 1. CHECK ALL TABLES AND VIEWS RELATED TO INVENTORY
-- ============================================================================

\echo '1. TABLES AND VIEWS'
\echo '-------------------------------------------------------------------------'

\echo 'All tables/views with "inventory" in name:'
SELECT
    schemaname,
    tablename AS name,
    'TABLE' AS type
FROM pg_tables
WHERE tablename LIKE '%inventory%'
UNION
SELECT
    schemaname,
    viewname AS name,
    'VIEW' AS type
FROM pg_views
WHERE viewname LIKE '%inventory%'
ORDER BY type, name;

-- ============================================================================
-- 2. CHECK COLUMN STRUCTURE OF MAIN INVENTORY TABLE
-- ============================================================================

\echo ''
\echo '2. INVENTORY TABLE STRUCTURE'
\echo '-------------------------------------------------------------------------'

\echo 'Columns in inventory table:'
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'inventory'
ORDER BY ordinal_position;

\echo ''
\echo 'Check for EUR columns:'
SELECT
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory' AND column_name = 'purchase_price_eur')
        THEN '✅ purchase_price_eur exists'
        ELSE '❌ purchase_price_eur MISSING'
    END AS purchase_eur_status,
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory' AND column_name = 'sell_price_eur')
        THEN '✅ sell_price_eur exists'
        ELSE '❌ sell_price_eur MISSING'
    END AS sell_eur_status,
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory' AND column_name = 'currency')
        THEN '✅ currency exists'
        ELSE '❌ currency MISSING'
    END AS currency_status;

-- ============================================================================
-- 3. CHECK IF BACKUP TABLE EXISTS
-- ============================================================================

\echo ''
\echo '3. BACKUP TABLE STATUS'
\echo '-------------------------------------------------------------------------'

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'inventory_backup_pre_eur_conversion') THEN
        RAISE NOTICE '✅ Backup table exists: inventory_backup_pre_eur_conversion';
        RAISE NOTICE 'Row count: %', (SELECT COUNT(*) FROM inventory_backup_pre_eur_conversion);
    ELSE
        RAISE NOTICE '❌ Backup table NOT FOUND';
    END IF;
END $$;

-- ============================================================================
-- 4. CHECK IF VIEW EXISTS AND ITS DEFINITION
-- ============================================================================

\echo ''
\echo '4. VIEW STATUS (inventory_eur)'
\echo '-------------------------------------------------------------------------'

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_views WHERE viewname = 'inventory_eur') THEN
        RAISE NOTICE '⚠️ VIEW inventory_eur exists - this might cause issues!';
    ELSE
        RAISE NOTICE '✅ No inventory_eur view found';
    END IF;
END $$;

\echo ''
\echo 'View definition (if exists):'
SELECT definition
FROM pg_views
WHERE viewname = 'inventory_eur';

-- ============================================================================
-- 5. CHECK ACTUAL DATA IN INVENTORY TABLE
-- ============================================================================

\echo ''
\echo '5. DATA VERIFICATION'
\echo '-------------------------------------------------------------------------'

\echo 'Row count in inventory table:'
SELECT COUNT(*) AS total_rows FROM inventory;

\echo ''
\echo 'Sample data (showing column structure issue):'
SELECT
    id,
    brand,
    type,
    purchase_price AS "purchase_price (should be BGN)",
    purchase_price_eur AS "purchase_price_eur (should be EUR)",
    sell_price AS "sell_price (should be BGN)",
    sell_price_eur AS "sell_price_eur (should be EUR)",
    currency,
    stock,
    ordered
FROM inventory
LIMIT 5;

\echo ''
\echo 'Check for NULL EUR values:'
SELECT
    COUNT(*) AS total,
    COUNT(purchase_price_eur) AS has_purchase_eur,
    COUNT(sell_price_eur) AS has_sell_eur,
    COUNT(*) - COUNT(purchase_price_eur) AS missing_purchase_eur,
    COUNT(*) - COUNT(sell_price_eur) AS missing_sell_eur
FROM inventory;

\echo ''
\echo 'Check for unconverted values (EUR ≈ BGN):'
SELECT
    id,
    brand,
    purchase_price AS bgn,
    purchase_price_eur AS eur,
    CASE
        WHEN purchase_price_eur IS NULL THEN '❌ NULL'
        WHEN ABS(purchase_price_eur - purchase_price) < 1 AND purchase_price > 10 THEN '⚠️ UNCONVERTED'
        WHEN ABS(purchase_price_eur - (purchase_price / 1.95583)) / (purchase_price / 1.95583) < 0.02 THEN '✅ OK'
        ELSE '⚠️ CHECK'
    END AS status
FROM inventory
ORDER BY
    CASE
        WHEN purchase_price_eur IS NULL THEN 1
        WHEN ABS(purchase_price_eur - purchase_price) < 1 THEN 2
        ELSE 3
    END,
    brand
LIMIT 10;

-- ============================================================================
-- 6. CHECK WHAT APPLICATION WOULD SEE
-- ============================================================================

\echo ''
\echo '6. APPLICATION QUERY SIMULATION'
\echo '-------------------------------------------------------------------------'

\echo 'Simulating: SELECT * FROM inventory'
\echo 'This is what SupabaseService.getInventory() would return:'
SELECT
    id,
    brand,
    purchase_price,
    purchase_price_eur,
    sell_price,
    sell_price_eur,
    stock
FROM inventory
LIMIT 3;

\echo ''
\echo 'If code expects these column names, check if they exist:'
SELECT
    column_name,
    CASE
        WHEN column_name IN ('id', 'brand', 'type', 'purchase_price', 'sell_price', 'stock', 'ordered') THEN '✅ Expected by original code'
        WHEN column_name IN ('purchase_price_eur', 'sell_price_eur') THEN '✅ Expected by NEW code'
        ELSE '❓ Extra column'
    END AS status
FROM information_schema.columns
WHERE table_name = 'inventory'
ORDER BY ordinal_position;

-- ============================================================================
-- 7. CHECK FOR CONSTRAINT OR PERMISSION ISSUES
-- ============================================================================

\echo ''
\echo '7. CONSTRAINTS AND PERMISSIONS'
\echo '-------------------------------------------------------------------------'

\echo 'Check for constraints on inventory table:'
SELECT
    conname AS constraint_name,
    contype AS constraint_type,
    CASE contype
        WHEN 'p' THEN 'PRIMARY KEY'
        WHEN 'f' THEN 'FOREIGN KEY'
        WHEN 'u' THEN 'UNIQUE'
        WHEN 'c' THEN 'CHECK'
        ELSE contype::text
    END AS constraint_description
FROM pg_constraint
WHERE conrelid = 'inventory'::regclass;

-- ============================================================================
-- 8. IDENTIFY THE PROBLEM
-- ============================================================================

\echo ''
\echo '8. PROBLEM IDENTIFICATION'
\echo '========================================================================='
\echo ''

DO $$
DECLARE
    missing_eur_count INTEGER;
    unconverted_count INTEGER;
    view_exists BOOLEAN;
BEGIN
    -- Check for missing EUR values
    SELECT COUNT(*) INTO missing_eur_count
    FROM inventory
    WHERE purchase_price_eur IS NULL OR sell_price_eur IS NULL;

    -- Check for unconverted values
    SELECT COUNT(*) INTO unconverted_count
    FROM inventory
    WHERE (ABS(purchase_price_eur - purchase_price) < 1 AND purchase_price > 10)
       OR (ABS(sell_price_eur - sell_price) < 1 AND sell_price > 10);

    -- Check if view exists
    SELECT EXISTS (SELECT 1 FROM pg_views WHERE viewname = 'inventory_eur') INTO view_exists;

    -- Report problems
    RAISE NOTICE '========================================================================';
    RAISE NOTICE 'DIAGNOSIS SUMMARY';
    RAISE NOTICE '========================================================================';

    IF missing_eur_count > 0 THEN
        RAISE NOTICE '❌ PROBLEM 1: % items have NULL EUR values', missing_eur_count;
        RAISE NOTICE '   FIX: Re-run the conversion UPDATE statement';
    ELSE
        RAISE NOTICE '✅ All items have EUR values';
    END IF;

    IF unconverted_count > 0 THEN
        RAISE NOTICE '❌ PROBLEM 2: % items have unconverted EUR values (EUR = BGN)', unconverted_count;
        RAISE NOTICE '   FIX: Re-run the conversion UPDATE with correct formula';
    ELSE
        RAISE NOTICE '✅ All items properly converted';
    END IF;

    IF view_exists THEN
        RAISE NOTICE '⚠️  PROBLEM 3: View "inventory_eur" exists with aliased columns';
        RAISE NOTICE '   This view aliases purchase_price_eur AS purchase_price';
        RAISE NOTICE '   If app queries this view, column names wont match code expectations!';
        RAISE NOTICE '   FIX: Drop the view if not needed, or update queries';
    ELSE
        RAISE NOTICE '✅ No conflicting view found';
    END IF;

    RAISE NOTICE '========================================================================';
END $$;

-- ============================================================================
-- 9. RECOMMENDED ACTIONS
-- ============================================================================

\echo ''
\echo '9. RECOMMENDED ACTIONS'
\echo '========================================================================='
\echo ''
\echo 'Based on the diagnosis above, follow these steps:'
\echo ''
\echo 'IF missing EUR values:'
\echo '  → Run: migrations/004_repair_inventory.sql'
\echo ''
\echo 'IF unconverted values (EUR = BGN):'
\echo '  → Run: migrations/004_repair_inventory.sql'
\echo ''
\echo 'IF view "inventory_eur" is causing issues:'
\echo '  → DROP VIEW inventory_eur;'
\echo '  → App should query "inventory" table directly, not the view'
\echo ''
\echo 'IF data is completely corrupted:'
\echo '  → Run: migrations/005_rollback_inventory.sql'
\echo '  → This will restore from backup'
\echo ''
\echo '========================================================================='
\echo 'END OF DIAGNOSTIC REPORT'
\echo '========================================================================='
