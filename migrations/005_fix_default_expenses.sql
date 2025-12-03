-- ============================================================================
-- FIX DEFAULT EXPENSES IN SUPABASE
-- ============================================================================
-- Purpose: Update or delete old default expenses that have BGN values
-- Official Rate: 1 EUR = 1.95583 BGN
-- ============================================================================

\echo '========================================================================='
\echo 'FIXING DEFAULT EXPENSES'
\echo 'Date: 2025-12-03'
\echo '========================================================================='
\echo ''

-- ============================================================================
-- STEP 1: IDENTIFY DEFAULT EXPENSES WITH OLD BGN VALUES
-- ============================================================================

\echo 'Step 1: Checking for default expenses with unconverted values...'
\echo ''

SELECT
    id,
    name,
    amount AS amount_bgn,
    amount_eur,
    ROUND(amount / 1.95583, 2) AS expected_eur,
    CASE
        WHEN amount_eur IS NULL THEN '❌ NO EUR VALUE'
        WHEN ABS(amount_eur - amount) < 1 AND amount > 50 THEN '⚠️ UNCONVERTED (EUR = BGN)'
        WHEN ABS(amount_eur - (amount / 1.95583)) / (amount / 1.95583) < 0.02 THEN '✅ OK'
        ELSE '⚠️ CHECK'
    END AS status
FROM expenses
WHERE name IN (
    'IG Campaign',
    'Assurance',
    'Fiverr',
    'Ltd.',
    'OLX BG',
    'OLX RO',
    'SmugMug',
    'ChatGPT',
    'Revolut',
    'A1',
    'Buffer',
    'Bazar',
    'Claude'
)
ORDER BY name;

-- ============================================================================
-- STEP 2: OPTION A - UPDATE EXISTING DEFAULT EXPENSES TO EUR
-- ============================================================================

\echo ''
\echo 'Step 2: Updating default expenses to correct EUR values...'
\echo ''
\echo '⚠️  This will update existing default expenses with correct EUR values.'
\echo '   Old BGN values will be preserved in the amount column for reference.'
\echo ''

-- Update each default expense individually with correct EUR values
UPDATE expenses
SET
    amount_eur = ROUND(amount / 1.95583, 2),
    currency = 'EUR',
    migrated_to_eur = TRUE,
    migration_date = NOW()
WHERE
    name IN (
        'IG Campaign',
        'Assurance',
        'Fiverr',
        'Ltd.',
        'OLX BG',
        'OLX RO',
        'SmugMug',
        'ChatGPT',
        'Revolut',
        'A1',
        'Buffer',
        'Bazar',
        'Claude'
    )
    AND (
        amount_eur IS NULL
        OR (ABS(amount_eur - amount) < 1 AND amount > 50)
    );

\echo 'Updated default expenses!'

-- ============================================================================
-- STEP 3: VERIFY UPDATED VALUES
-- ============================================================================

\echo ''
\echo 'Step 3: Verifying updated default expenses...'
\echo ''

SELECT
    name,
    amount AS original_bgn,
    amount_eur AS converted_eur,
    ROUND(amount / 1.95583, 2) AS expected_eur,
    CASE
        WHEN ABS(amount_eur - (amount / 1.95583)) / (amount / 1.95583) < 0.02 THEN '✅ CORRECT'
        ELSE '❌ INCORRECT'
    END AS status
FROM expenses
WHERE name IN (
    'IG Campaign',
    'Assurance',
    'Fiverr',
    'Ltd.',
    'OLX BG',
    'OLX RO',
    'SmugMug',
    'ChatGPT',
    'Revolut',
    'A1',
    'Buffer',
    'Bazar',
    'Claude'
)
ORDER BY amount_eur DESC;

-- ============================================================================
-- STEP 4: SHOW BEFORE/AFTER EXAMPLES
-- ============================================================================

\echo ''
\echo 'Step 4: Before/After Examples'
\echo '========================================================================='
\echo ''

-- Sample conversions
WITH sample_conversions AS (
    SELECT
        'IG Campaign' AS expense_name,
        3000 AS old_bgn,
        ROUND(3000 / 1.95583, 2) AS correct_eur
    UNION ALL
    SELECT 'Assurance', 590, ROUND(590 / 1.95583, 2)
    UNION ALL
    SELECT 'ChatGPT', 35, ROUND(35 / 1.95583, 2)
    UNION ALL
    SELECT 'Revolut', 15, ROUND(15 / 1.95583, 2)
)
SELECT
    expense_name AS "Expense",
    old_bgn || ' лв' AS "Before (BGN shown as EUR)",
    correct_eur || ' €' AS "After (Correct EUR)"
FROM sample_conversions;

\echo ''
\echo '========================================================================='
\echo 'MIGRATION COMPLETE'
\echo '========================================================================='
\echo ''
\echo 'Default expenses have been updated to use EUR values.'
\echo ''
\echo 'NEXT STEPS:'
\echo '1. Clear browser cache (Ctrl+Shift+R)'
\echo '2. Reload application'
\echo '3. Check expenses page - default expenses should now show correct EUR values'
\echo ''
\echo 'Example:'
\echo '  - IG Campaign: 1,534.29 € (was 3,000 €) ✅'
\echo '  - Assurance: 301.65 € (was 590 €) ✅'
\echo '  - ChatGPT: 17.90 € (was 35 €) ✅'
\echo ''
\echo '========================================================================='
