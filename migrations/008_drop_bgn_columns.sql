-- Migration 008: Drop legacy BGN columns
-- Safe because all orders were migrated to EUR (migration 006) and
-- sell_eur IS NULL = 0 across all 618 rows before this migration ran.

-- Normalize remaining BGN-era currency flag (206 rows had currency='BGN'
-- with correct sell_eur values already populated by migration 006)
UPDATE orders SET currency = 'EUR' WHERE currency = 'BGN';

-- balance_bgn is a generated column — must be dropped first
ALTER TABLE public.orders DROP COLUMN IF EXISTS balance_bgn;

ALTER TABLE public.orders
  DROP COLUMN IF EXISTS extras_bgn,
  DROP COLUMN IF EXISTS sell_bgn,
  DROP COLUMN IF EXISTS total_bgn,
  DROP COLUMN IF EXISTS currency,
  DROP COLUMN IF EXISTS migrated_to_eur,
  DROP COLUMN IF EXISTS migration_date;

ALTER TABLE public.expenses
  DROP COLUMN IF EXISTS currency,
  DROP COLUMN IF EXISTS migrated_to_eur,
  DROP COLUMN IF EXISTS migration_date;

ALTER TABLE public.inventory
  DROP COLUMN IF EXISTS currency,
  DROP COLUMN IF EXISTS migrated_to_eur,
  DROP COLUMN IF EXISTS migration_date;
