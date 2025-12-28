-- ============================================================================
-- MIGRATION: Fix Currency Calculation Bugs
-- Version: 006
-- Date: 2025-12-28
-- Issue: Legacy BGN→EUR conversions incorrect, rate=1.0 defaults
-- ============================================================================

-- CRITICAL: BACKUP YOUR DATABASE BEFORE RUNNING THIS
-- Supabase Dashboard → Database → Backups → Create backup

-- ============================================================================
-- STEP 1: ADD CALCULATED TOTAL COLUMNS
-- ============================================================================

-- Add columns to store calculated EUR totals (avoid recalculation bugs)
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS total_eur DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS balance_eur DECIMAL(10,2);

COMMENT ON COLUMN orders.total_eur IS 'Total cost in EUR (calculated once during create/update, stored for reliability)';
COMMENT ON COLUMN orders.balance_eur IS 'Profit in EUR (calculated once during create/update, stored for reliability)';

-- ============================================================================
-- STEP 2: DIAGNOSTIC QUERIES (Run these first to understand your data)
-- ============================================================================

-- Check 1: Count orders by rate type
DO $$
DECLARE
    total_count INT;
    bgn_count INT;
    eur_count INT;
    rate_1_count INT;
    legacy_rate_count INT;
BEGIN
    SELECT COUNT(*) INTO total_count FROM orders;
    SELECT COUNT(*) INTO bgn_count FROM orders WHERE currency = 'BGN';
    SELECT COUNT(*) INTO eur_count FROM orders WHERE currency = 'EUR';
    SELECT COUNT(*) INTO rate_1_count FROM orders WHERE rate = 1.0;
    SELECT COUNT(*) INTO legacy_rate_count FROM orders WHERE rate BETWEEN 1.5 AND 1.8;

    RAISE NOTICE '📊 Order Statistics:';
    RAISE NOTICE '  Total orders: %', total_count;
    RAISE NOTICE '  BGN currency: %', bgn_count;
    RAISE NOTICE '  EUR currency: %', eur_count;
    RAISE NOTICE '  Rate = 1.0 (BUG): %', rate_1_count;
    RAISE NOTICE '  Rate 1.5-1.8 (Legacy BGN): %', legacy_rate_count;
END $$;

-- Check 2: Preview what will be fixed
SELECT
    id,
    date,
    client,
    currency,
    rate,
    cost_usd,
    shipping_usd,
    extras_bgn,
    extras_eur,
    sell_bgn,
    sell_eur,
    -- What total_eur SHOULD be
    CASE
        WHEN currency = 'BGN' THEN
            ROUND(((cost_usd + shipping_usd) * rate + extras_bgn) / 1.95583, 2)
        ELSE
            ROUND((cost_usd + shipping_usd) * rate + COALESCE(extras_eur, 0), 2)
    END AS total_eur_will_be,
    -- What balance_eur SHOULD be
    CASE
        WHEN currency = 'BGN' THEN
            ROUND((sell_bgn - ((cost_usd + shipping_usd) * rate + extras_bgn)) / 1.95583, 2)
        ELSE
            ROUND(COALESCE(sell_eur, 0) - ((cost_usd + shipping_usd) * rate + COALESCE(extras_eur, 0)), 2)
    END AS balance_eur_will_be
FROM orders
ORDER BY date DESC
LIMIT 10;

-- ============================================================================
-- STEP 3: BACKFILL EUR TOTALS FOR LEGACY BGN ORDERS
-- ============================================================================

-- For orders marked as BGN currency (historical):
-- 1. Calculate total in BGN: (cost_usd + shipping_usd) * rate + extras_bgn
-- 2. Convert to EUR: total_bgn / 1.95583
UPDATE orders
SET
    total_eur = ROUND(
        ((COALESCE(cost_usd, 0) + COALESCE(shipping_usd, 0)) * COALESCE(rate, 0) + COALESCE(extras_bgn, 0)) / 1.95583,
        2
    ),
    balance_eur = ROUND(
        (COALESCE(sell_bgn, 0) - ((COALESCE(cost_usd, 0) + COALESCE(shipping_usd, 0)) * COALESCE(rate, 0) + COALESCE(extras_bgn, 0))) / 1.95583,
        2
    )
WHERE currency = 'BGN'
  AND (total_eur IS NULL OR balance_eur IS NULL);

-- Log results
DO $$
DECLARE
    updated_count INT;
BEGIN
    SELECT COUNT(*) INTO updated_count FROM orders WHERE currency = 'BGN' AND total_eur IS NOT NULL;
    RAISE NOTICE '✅ Backfilled EUR totals for % BGN orders', updated_count;
END $$;

-- ============================================================================
-- STEP 4: BACKFILL EUR TOTALS FOR CURRENT EUR ORDERS
-- ============================================================================

-- For orders marked as EUR currency (current):
-- Calculate total in EUR: (cost_usd + shipping_usd) * rate + extras_eur
UPDATE orders
SET
    total_eur = ROUND(
        (COALESCE(cost_usd, 0) + COALESCE(shipping_usd, 0)) * COALESCE(rate, 0) + COALESCE(extras_eur, 0),
        2
    ),
    balance_eur = ROUND(
        COALESCE(sell_eur, 0) - ((COALESCE(cost_usd, 0) + COALESCE(shipping_usd, 0)) * COALESCE(rate, 0) + COALESCE(extras_eur, 0)),
        2
    )
WHERE currency = 'EUR'
  AND rate != 1.0  -- Don't fix rate=1.0 orders yet (needs manual review)
  AND (total_eur IS NULL OR balance_eur IS NULL);

-- Log results
DO $$
DECLARE
    updated_count INT;
BEGIN
    SELECT COUNT(*) INTO updated_count FROM orders WHERE currency = 'EUR' AND rate != 1.0 AND total_eur IS NOT NULL;
    RAISE NOTICE '✅ Backfilled EUR totals for % EUR orders', updated_count;
END $$;

-- ============================================================================
-- STEP 5: IDENTIFY ORDERS WITH rate=1.0 (NEEDS MANUAL REVIEW)
-- ============================================================================

-- These orders have the bug where rate defaulted to 1.0
-- They need the correct USD→EUR rate applied
-- ⚠️ DO NOT run automatic fix without reviewing these first!

CREATE TEMP TABLE rate_1_orders AS
SELECT
    id,
    date,
    client,
    cost_usd,
    shipping_usd,
    extras_eur,
    sell_eur,
    rate,
    -- What total would be with rate=1.0 (current WRONG value)
    ROUND((cost_usd + shipping_usd) * 1.0 + COALESCE(extras_eur, 0), 2) AS total_with_rate_1,
    -- What total should be with correct rate (0.86)
    ROUND((cost_usd + shipping_usd) * 0.86 + COALESCE(extras_eur, 0), 2) AS total_with_correct_rate,
    ROUND(sell_eur - ((cost_usd + shipping_usd) * 0.86 + COALESCE(extras_eur, 0)), 2) AS balance_with_correct_rate
FROM orders
WHERE rate = 1.0
  AND currency = 'EUR'
ORDER BY date DESC;

-- Show orders that need fixing
DO $$
DECLARE
    broken_count INT;
    rec RECORD;
BEGIN
    SELECT COUNT(*) INTO broken_count FROM rate_1_orders;

    IF broken_count > 0 THEN
        RAISE NOTICE '⚠️  Found % orders with rate=1.0 (BUG)', broken_count;
        RAISE NOTICE '⚠️  These orders need manual review before fixing:';
        RAISE NOTICE '';
        RAISE NOTICE 'ID  | Date       | Client              | USD Total | Current € Total | Should Be';
        RAISE NOTICE '----+------------+---------------------+-----------+-----------------+-----------';

        FOR rec IN
            SELECT * FROM rate_1_orders LIMIT 10
        LOOP
            RAISE NOTICE '%  | % | % | $%   | €%    | €%',
                LPAD(rec.id::TEXT, 3),
                rec.date,
                RPAD(COALESCE(rec.client, 'Unknown'), 19),
                LPAD(ROUND(rec.cost_usd + rec.shipping_usd)::TEXT, 9),
                LPAD(rec.total_with_rate_1::TEXT, 15),
                LPAD(rec.total_with_correct_rate::TEXT, 10);
        END LOOP;

        IF broken_count > 10 THEN
            RAISE NOTICE '... and % more', broken_count - 10;
        END IF;

        RAISE NOTICE '';
        RAISE NOTICE '⚠️  TO FIX: Update the query in STEP 6 with your correct eurRate, then uncomment and run it.';
    ELSE
        RAISE NOTICE '✅ No orders with rate=1.0 found (all good!)';
    END IF;
END $$;

-- ============================================================================
-- STEP 6: FIX rate=1.0 ORDERS (⚠️ UNCOMMENT AFTER REVIEWING)
-- ============================================================================

-- ⚠️ MANUAL ACTION REQUIRED:
-- 1. Check your settings table to get the correct eurRate value
SELECT data->>'eurRate' AS current_eur_rate FROM settings WHERE id = 1;

-- 2. Uncomment and run this UPDATE (rate 0.86 confirmed by user)

/*
-- Fix orders with rate=1.0 by applying correct USD→EUR rate
UPDATE orders
SET
    rate = 0.86,  -- ✅ Confirmed USD→EUR rate
    total_eur = ROUND(
        (COALESCE(cost_usd, 0) + COALESCE(shipping_usd, 0)) * 0.86 + COALESCE(extras_eur, 0),
        2
    ),
    balance_eur = ROUND(
        COALESCE(sell_eur, 0) - ((COALESCE(cost_usd, 0) + COALESCE(shipping_usd, 0)) * 0.86 + COALESCE(extras_eur, 0)),
        2
    )
WHERE rate = 1.0
  AND currency = 'EUR';

-- Log results
DO $$
DECLARE
    fixed_count INT;
BEGIN
    SELECT COUNT(*) INTO fixed_count FROM orders WHERE currency = 'EUR' AND rate = 0.86;
    RAISE NOTICE '✅ Fixed % orders with rate=1.0 bug', fixed_count;
END $$;
*/

-- ============================================================================
-- STEP 7: VERIFICATION QUERIES
-- ============================================================================

-- Verify all orders now have EUR totals
SELECT
    COUNT(*) as total_orders,
    COUNT(*) FILTER (WHERE total_eur IS NOT NULL) as has_total_eur,
    COUNT(*) FILTER (WHERE balance_eur IS NOT NULL) as has_balance_eur,
    COUNT(*) FILTER (WHERE total_eur IS NULL) as missing_total_eur,
    COUNT(*) FILTER (WHERE rate = 1.0) as still_rate_1
FROM orders;

-- Check for any suspicious values
SELECT
    id,
    date,
    client,
    currency,
    rate,
    total_eur,
    balance_eur,
    CASE
        WHEN total_eur IS NULL THEN 'Missing total_eur'
        WHEN balance_eur IS NULL THEN 'Missing balance_eur'
        WHEN total_eur <= 0 AND sell_eur > 0 THEN 'Invalid: Zero/Negative Total'
        WHEN rate = 1.0 AND currency = 'EUR' THEN 'Suspicious: Rate=1.0'
        WHEN rate BETWEEN 1.5 AND 1.8 AND currency = 'EUR' THEN 'Wrong: Legacy rate for EUR order'
        ELSE 'OK'
    END AS validation_status
FROM orders
WHERE validation_status != 'OK'
ORDER BY date DESC;

-- Sample of corrected values
SELECT
    id,
    date,
    client,
    currency,
    rate,
    cost_usd,
    shipping_usd,
    extras_eur,
    sell_eur,
    total_eur,
    balance_eur
FROM orders
ORDER BY date DESC
LIMIT 10;

-- ============================================================================
-- STEP 8: CREATE CONSTRAINT TO PREVENT FUTURE BUGS
-- ============================================================================

-- Ensure total_eur is always populated for new orders
ALTER TABLE orders
  ADD CONSTRAINT orders_total_eur_required
  CHECK (total_eur IS NOT NULL OR status = 'Очакван');

-- Ensure rate is never 1.0 for EUR orders created after this migration
ALTER TABLE orders
  ADD CONSTRAINT orders_eur_rate_valid
  CHECK (
    (currency = 'EUR' AND rate != 1.0 AND rate > 0) OR
    (currency != 'EUR')
  );

-- ============================================================================
-- STEP 9: CREATE TRIGGER TO AUTO-CALCULATE TOTALS
-- ============================================================================

-- Function to automatically calculate and store EUR totals
CREATE OR REPLACE FUNCTION calculate_order_eur_totals()
RETURNS TRIGGER AS $$
BEGIN
    -- Calculate total_eur based on currency
    IF NEW.currency = 'BGN' THEN
        -- Legacy: Calculate in BGN, then convert to EUR
        NEW.total_eur := ROUND(
            ((COALESCE(NEW.cost_usd, 0) + COALESCE(NEW.shipping_usd, 0)) * COALESCE(NEW.rate, 0) + COALESCE(NEW.extras_bgn, 0)) / 1.95583,
            2
        );
        NEW.balance_eur := ROUND(
            (COALESCE(NEW.sell_bgn, 0) - ((COALESCE(NEW.cost_usd, 0) + COALESCE(NEW.shipping_usd, 0)) * COALESCE(NEW.rate, 0) + COALESCE(NEW.extras_bgn, 0))) / 1.95583,
            2
        );
    ELSE
        -- Current: Calculate in EUR
        NEW.total_eur := ROUND(
            (COALESCE(NEW.cost_usd, 0) + COALESCE(NEW.shipping_usd, 0)) * COALESCE(NEW.rate, 0) + COALESCE(NEW.extras_eur, 0),
            2
        );
        NEW.balance_eur := ROUND(
            COALESCE(NEW.sell_eur, 0) - NEW.total_eur,
            2
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger (only for INSERT, UPDATE is handled by application)
DROP TRIGGER IF EXISTS orders_calculate_eur_totals ON orders;
CREATE TRIGGER orders_calculate_eur_totals
    BEFORE INSERT ON orders
    FOR EACH ROW
    EXECUTE FUNCTION calculate_order_eur_totals();

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

DO $$
DECLARE
    total_orders INT;
    total_eur_count INT;
    rate_1_count INT;
BEGIN
    SELECT COUNT(*) INTO total_orders FROM orders;
    SELECT COUNT(*) INTO total_eur_count FROM orders WHERE total_eur IS NOT NULL;
    SELECT COUNT(*) INTO rate_1_count FROM orders WHERE rate = 1.0;

    RAISE NOTICE '';
    RAISE NOTICE '✅ Currency calculation fix migration completed!';
    RAISE NOTICE '';
    RAISE NOTICE 'Summary:';
    RAISE NOTICE '  Total orders: %', total_orders;
    RAISE NOTICE '  Orders with total_eur: %', total_eur_count;
    RAISE NOTICE '  Orders still with rate=1.0: %', rate_1_count;
    RAISE NOTICE '';

    IF rate_1_count > 0 THEN
        RAISE NOTICE '⚠️  ACTION REQUIRED: Fix % orders with rate=1.0 (see STEP 6)', rate_1_count;
    ELSE
        RAISE NOTICE '✅ All orders have valid exchange rates!';
    END IF;

    IF total_eur_count = total_orders THEN
        RAISE NOTICE '✅ All orders have EUR totals calculated!';
    ELSE
        RAISE NOTICE '⚠️  % orders missing EUR totals (review needed)', total_orders - total_eur_count;
    END IF;

    RAISE NOTICE '';
    RAISE NOTICE 'Next steps:';
    RAISE NOTICE '1. Deploy application code fixes (see CURRENCY_BUG_DIAGNOSIS.md)';
    RAISE NOTICE '2. Test creating new orders';
    RAISE NOTICE '3. Verify dashboard KPIs are now correct';
    RAISE NOTICE '';
END $$;

-- Log migration execution
-- INSERT INTO schema_migrations (version, name, executed_at)
-- VALUES ('006', 'fix_currency_calculations', NOW());
