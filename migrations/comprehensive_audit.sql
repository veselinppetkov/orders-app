-- ============================================================================
-- COMPREHENSIVE DATABASE AUDIT SCRIPT - ALL TABLES
-- ============================================================================
-- Purpose: Identify ALL data that needs EUR conversion
-- Run this FIRST to understand the extent of the problem
-- ============================================================================

\echo '========================================================================='
\echo 'COMPREHENSIVE CURRENCY AUDIT REPORT'
\echo 'Date: 2025-12-03'
\echo 'Official Rate: 1 EUR = 1.95583 BGN'
\echo '========================================================================='
\echo ''

-- ============================================================================
-- 1. ORDERS TABLE AUDIT
-- ============================================================================

\echo '1. ORDERS TABLE'
\echo '-------------------------------------------------------------------------'

\echo 'Total orders:'
SELECT COUNT(*) AS total_orders FROM orders;

\echo ''
\echo 'Orders with EUR columns:'
SELECT
    COUNT(*) AS total,
    COUNT(extras_eur) AS has_extras_eur,
    COUNT(sell_eur) AS has_sell_eur,
    COUNT(CASE WHEN extras_eur IS NOT NULL AND sell_eur IS NOT NULL THEN 1 END) AS both_eur_fields
FROM orders;

\echo ''
\echo 'Orders with suspicious EUR values (EUR ≈ BGN, no conversion):'
SELECT
    id,
    date,
    client,
    extras_bgn,
    extras_eur,
    ROUND(extras_bgn / 1.95583, 2) AS expected_extras_eur,
    sell_bgn,
    sell_eur,
    ROUND(sell_bgn / 1.95583, 2) AS expected_sell_eur,
    '⚠️ NO CONVERSION' AS issue
FROM orders
WHERE
    (ABS(extras_eur - extras_bgn) < 1 AND extras_bgn > 100)
    OR (ABS(sell_eur - sell_bgn) < 1 AND sell_bgn > 100)
ORDER BY date DESC
LIMIT 10;

\echo ''
\echo 'Orders missing EUR values:'
SELECT
    id,
    date,
    client,
    extras_bgn,
    extras_eur,
    sell_bgn,
    sell_eur,
    '❌ MISSING EUR' AS issue
FROM orders
WHERE extras_eur IS NULL OR sell_eur IS NULL
ORDER BY date DESC
LIMIT 10;

-- ============================================================================
-- 2. EXPENSES TABLE AUDIT (CRITICAL!)
-- ============================================================================

\echo ''
\echo ''
\echo '2. EXPENSES TABLE (CRITICAL)'
\echo '-------------------------------------------------------------------------'

\echo 'Check if amount_eur column exists:'
SELECT
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'expenses'
    AND column_name LIKE '%amount%'
ORDER BY column_name;

\echo ''
\echo 'Total expenses:'
SELECT COUNT(*) AS total_expenses FROM expenses;

\echo ''
\echo 'Expenses analysis:'
SELECT
    COUNT(*) AS total,
    COUNT(amount_eur) AS has_amount_eur,
    SUM(amount) AS total_amount_field,
    SUM(amount_eur) AS total_amount_eur_field,
    ROUND(SUM(amount) / 1.95583, 2) AS expected_total_eur
FROM expenses;

\echo ''
\echo 'Sample expenses (showing potential issues):'
SELECT
    id,
    name,
    amount AS amount_bgn,
    amount_eur,
    ROUND(amount / 1.95583, 2) AS expected_amount_eur,
    CASE
        WHEN amount_eur IS NULL THEN '❌ MISSING EUR'
        WHEN ABS(amount_eur - amount) < 1 AND amount > 100 THEN '⚠️ NO CONVERSION'
        WHEN ABS(amount_eur - (amount / 1.95583)) / (amount / 1.95583) > 0.05 THEN '⚠️ INCORRECT'
        ELSE '✅ OK'
    END AS status
FROM expenses
ORDER BY id DESC
LIMIT 20;

\echo ''
\echo 'Expenses needing conversion:'
SELECT
    id,
    name,
    amount AS amount_bgn,
    amount_eur,
    ROUND(amount / 1.95583, 2) AS correct_amount_eur,
    '🔧 NEEDS FIX' AS action
FROM expenses
WHERE
    amount_eur IS NULL
    OR (ABS(amount_eur - amount) < 1 AND amount > 50)
ORDER BY amount DESC;

-- ============================================================================
-- 3. INVENTORY TABLE AUDIT (CRITICAL!)
-- ============================================================================

\echo ''
\echo ''
\echo '3. INVENTORY TABLE (CRITICAL)'
\echo '-------------------------------------------------------------------------'

\echo 'Check if EUR columns exist:'
SELECT
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'inventory'
    AND (column_name LIKE '%price%' OR column_name = 'currency')
ORDER BY column_name;

\echo ''
\echo 'Total inventory items:'
SELECT COUNT(*) AS total_items FROM inventory;

\echo ''
\echo 'Inventory analysis:'
SELECT
    COUNT(*) AS total,
    COUNT(purchase_price_eur) AS has_purchase_eur,
    COUNT(sell_price_eur) AS has_sell_eur,
    SUM(purchase_price) AS total_purchase_price_field,
    SUM(purchase_price_eur) AS total_purchase_eur_field,
    ROUND(SUM(purchase_price) / 1.95583, 2) AS expected_total_purchase_eur
FROM inventory;

\echo ''
\echo 'Sample inventory items (showing potential issues):'
SELECT
    id,
    brand,
    type,
    purchase_price AS purchase_bgn,
    purchase_price_eur,
    ROUND(purchase_price / 1.95583, 2) AS expected_purchase_eur,
    sell_price AS sell_bgn,
    sell_price_eur,
    ROUND(sell_price / 1.95583, 2) AS expected_sell_eur,
    CASE
        WHEN purchase_price_eur IS NULL THEN '❌ MISSING EUR'
        WHEN ABS(purchase_price_eur - purchase_price) < 1 AND purchase_price > 10 THEN '⚠️ NO CONVERSION'
        ELSE '✅ OK'
    END AS status
FROM inventory
ORDER BY id
LIMIT 20;

\echo ''
\echo 'Inventory items needing conversion:'
SELECT
    id,
    brand,
    purchase_price AS purchase_bgn,
    purchase_price_eur,
    ROUND(purchase_price / 1.95583, 2) AS correct_purchase_eur,
    sell_price AS sell_bgn,
    sell_price_eur,
    ROUND(sell_price / 1.95583, 2) AS correct_sell_eur,
    '🔧 NEEDS FIX' AS action
FROM inventory
WHERE
    purchase_price_eur IS NULL
    OR sell_price_eur IS NULL
    OR (ABS(purchase_price_eur - purchase_price) < 1 AND purchase_price > 10)
    OR (ABS(sell_price_eur - sell_price) < 1 AND sell_price > 10)
ORDER BY brand;

-- ============================================================================
-- 4. SETTINGS TABLE AUDIT
-- ============================================================================

\echo ''
\echo ''
\echo '4. SETTINGS TABLE'
\echo '-------------------------------------------------------------------------'

\echo 'Current settings (check for EUR rate):'
SELECT
    id,
    data->>'eurRate' AS eur_rate,
    data->>'usdRate' AS usd_rate_legacy,
    data->>'baseCurrency' AS base_currency,
    data->>'conversionRate' AS bgn_eur_rate
FROM settings
ORDER BY id DESC
LIMIT 1;

-- ============================================================================
-- 5. FINANCIAL IMPACT SUMMARY
-- ============================================================================

\echo ''
\echo ''
\echo '5. FINANCIAL IMPACT SUMMARY'
\echo '========================================================================='

\echo 'If expenses NOT converted (showing as 5000 EUR instead of 2556 EUR):'
WITH expense_impact AS (
    SELECT
        SUM(amount) AS total_shown_as_eur_wrong,
        SUM(COALESCE(amount_eur, amount / 1.95583)) AS total_correct_eur,
        SUM(amount) - SUM(COALESCE(amount_eur, amount / 1.95583)) AS overstatement
    FROM expenses
)
SELECT
    ROUND(total_shown_as_eur_wrong, 2) AS "Expenses (if shown as EUR directly)",
    ROUND(total_correct_eur, 2) AS "Expenses (correctly converted)",
    ROUND(overstatement, 2) AS "Overstatement Amount",
    ROUND((overstatement / total_correct_eur * 100), 2) AS "Overstatement %"
FROM expense_impact;

\echo ''
\echo 'If inventory NOT converted (showing as 35 EUR instead of 17.90 EUR):'
WITH inventory_impact AS (
    SELECT
        SUM(purchase_price * stock) AS total_value_shown_as_eur_wrong,
        SUM(COALESCE(purchase_price_eur, purchase_price / 1.95583) * stock) AS total_value_correct_eur,
        SUM(purchase_price * stock) - SUM(COALESCE(purchase_price_eur, purchase_price / 1.95583) * stock) AS overstatement
    FROM inventory
)
SELECT
    ROUND(total_value_shown_as_eur_wrong, 2) AS "Inventory Value (if shown as EUR directly)",
    ROUND(total_value_correct_eur, 2) AS "Inventory Value (correctly converted)",
    ROUND(overstatement, 2) AS "Overstatement Amount",
    ROUND((overstatement / NULLIF(total_value_correct_eur, 0) * 100), 2) AS "Overstatement %"
FROM inventory_impact;

-- ============================================================================
-- 6. RECOMMENDATIONS
-- ============================================================================

\echo ''
\echo ''
\echo '6. RECOMMENDED ACTIONS'
\echo '========================================================================='
\echo ''
\echo 'Based on the audit results above:'
\echo ''
\echo '1. If expenses show "❌ MISSING EUR" or "⚠️ NO CONVERSION":'
\echo '   → Run: 002_fix_expenses_currency.sql'
\echo ''
\echo '2. If inventory shows "❌ MISSING EUR" or "⚠️ NO CONVERSION":'
\echo '   → Run: 003_fix_inventory_currency.sql'
\echo ''
\echo '3. If orders show issues:'
\echo '   → Run: 004_fix_orders_currency.sql'
\echo ''
\echo '4. After running fixes, re-run this audit to verify!'
\echo ''
\echo '========================================================================='
\echo 'END OF AUDIT REPORT'
\echo '========================================================================='
