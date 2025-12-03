-- ============================================================================
-- FIX EXPENSES CURRENCY CONVERSION
-- ============================================================================
-- Purpose: Convert ALL expense amounts from BGN to EUR
-- Official Rate: 1 EUR = 1.95583 BGN
-- ============================================================================

\echo '========================================================================='
\echo 'FIXING EXPENSES CURRENCY CONVERSION'
\echo 'Date: 2025-12-03'
\echo 'Official Rate: 1 EUR = 1.95583 BGN'
\echo '========================================================================='
\echo ''

-- ============================================================================
-- STEP 1: ADD EUR COLUMN IF MISSING
-- ============================================================================

\echo 'Step 1: Ensuring amount_eur column exists...'

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'expenses' AND column_name = 'amount_eur'
    ) THEN
        ALTER TABLE expenses ADD COLUMN amount_eur DECIMAL(10,2);
        RAISE NOTICE 'Added amount_eur column';
    ELSE
        RAISE NOTICE 'amount_eur column already exists';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'expenses' AND column_name = 'currency'
    ) THEN
        ALTER TABLE expenses ADD COLUMN currency VARCHAR(3) DEFAULT 'BGN';
        RAISE NOTICE 'Added currency column';
    ELSE
        RAISE NOTICE 'currency column already exists';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'expenses' AND column_name = 'migrated_to_eur'
    ) THEN
        ALTER TABLE expenses ADD COLUMN migrated_to_eur BOOLEAN DEFAULT FALSE;
        RAISE NOTICE 'Added migrated_to_eur column';
    ELSE
        RAISE NOTICE 'migrated_to_eur column already exists';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'expenses' AND column_name = 'migration_date'
    ) THEN
        ALTER TABLE expenses ADD COLUMN migration_date TIMESTAMP;
        RAISE NOTICE 'Added migration_date column';
    ELSE
        RAISE NOTICE 'migration_date column already exists';
    END IF;
END $$;

-- ============================================================================
-- STEP 2: BACKUP CURRENT DATA
-- ============================================================================

\echo ''
\echo 'Step 2: Creating backup of current expense data...'

CREATE TABLE IF NOT EXISTS expenses_backup_pre_eur_conversion AS
SELECT * FROM expenses;

SELECT COUNT(*) AS "Backed up expenses" FROM expenses_backup_pre_eur_conversion;

-- ============================================================================
-- STEP 3: CONVERT ALL BGN AMOUNTS TO EUR
-- ============================================================================

\echo ''
\echo 'Step 3: Converting all expense amounts from BGN to EUR...'
\echo 'Using formula: EUR = BGN / 1.95583'
\echo ''

-- Convert expenses that haven't been converted yet
UPDATE expenses
SET
    amount_eur = ROUND(amount / 1.95583, 2),
    currency = 'BGN',
    migrated_to_eur = TRUE,
    migration_date = NOW()
WHERE
    amount_eur IS NULL
    OR migrated_to_eur = FALSE
    OR (ABS(amount_eur - amount) < 1 AND amount > 50);  -- Fix unconverted values

\echo 'Conversion complete!'

-- ============================================================================
-- STEP 4: VERIFY CONVERSION
-- ============================================================================

\echo ''
\echo 'Step 4: Verifying conversion accuracy...'
\echo ''

\echo 'Sample converted expenses:'
SELECT
    id,
    name,
    amount AS original_bgn,
    amount_eur AS converted_eur,
    ROUND(amount / 1.95583, 2) AS expected_eur,
    ROUND(ABS(amount_eur - (amount / 1.95583)) / (amount / 1.95583) * 100, 2) AS deviation_pct,
    CASE
        WHEN ABS(amount_eur - (amount / 1.95583)) / (amount / 1.95583) < 0.02 THEN '✅ OK'
        ELSE '⚠️ CHECK'
    END AS status
FROM expenses
ORDER BY amount DESC
LIMIT 15;

\echo ''
\echo 'Total amounts comparison:'
SELECT
    ROUND(SUM(amount), 2) AS total_bgn,
    ROUND(SUM(amount_eur), 2) AS total_eur,
    ROUND(SUM(amount) / 1.95583, 2) AS expected_total_eur,
    ROUND(ABS(SUM(amount_eur) - (SUM(amount) / 1.95583)) / (SUM(amount) / 1.95583) * 100, 4) AS deviation_pct
FROM expenses;

-- ============================================================================
-- STEP 5: UPDATE APPLICATION TO USE EUR
-- ============================================================================

\echo ''
\echo 'Step 5: Next steps for application code...'
\echo ''
\echo '⚠️ IMPORTANT: Update your application code to:'
\echo '   1. Use amount_eur field instead of amount field for display'
\echo '   2. Store new expenses in EUR in amount_eur field'
\echo '   3. Keep amount field for historical reference only'
\echo ''

-- ============================================================================
-- STEP 6: CREATE VIEW FOR EUR-ONLY ACCESS
-- ============================================================================

\echo 'Step 6: Creating convenient EUR-only view...'

CREATE OR REPLACE VIEW expenses_eur AS
SELECT
    id,
    name,
    amount_eur AS amount,  -- Expose EUR as "amount" for backward compatibility
    amount AS amount_bgn,  -- Keep BGN for reference
    note,
    month,
    currency,
    created_at,
    migrated_to_eur,
    migration_date
FROM expenses;

\echo 'Created view: expenses_eur'
\echo 'You can now query: SELECT * FROM expenses_eur;'

-- ============================================================================
-- ROLLBACK INSTRUCTIONS
-- ============================================================================

\echo ''
\echo '========================================================================='
\echo 'CONVERSION COMPLETE!'
\echo '========================================================================='
\echo ''
\echo 'If you need to rollback:'
\echo '1. DROP TABLE expenses;'
\echo '2. ALTER TABLE expenses_backup_pre_eur_conversion RENAME TO expenses;'
\echo ''
\echo 'Otherwise, keep the backup for your records.'
\echo '========================================================================='
