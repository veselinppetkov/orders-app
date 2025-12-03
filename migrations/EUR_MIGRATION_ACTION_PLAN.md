# EUR Migration Action Plan

## Goals
- Convert every financial amount to true EUR values using the official 1 EUR = 1.95583 BGN rate.
- Remove BGN-first logic and ensure all calculations and displays are EUR-native.
- Provide a deterministic migration path for Supabase data (orders, expenses, inventory).

## Code Changes (applied in this commit)
1. **Centralized normalization**: `CurrencyUtils.normalizeToEUR` repairs mismatched EUR/BGN pairs by trusting the BGN value when there is disagreement.
2. **EUR-only services**: Supabase service normalizes order/expense payloads to EUR, derives BGN only for backward compatibility, and converts mislabeled database rows on load.
3. **Business logic**: Orders, Clients, Reports, Expenses, and UI components now rely on normalized EUR figures instead of BGN fallbacks.
4. **Inventory & expenses defaults**: All defaults stay in EUR, with derived BGN values used only for reference.

## Data Migration Strategy
1. Run `migrations/002_correct_bgn_relabel.sql` against the Supabase database.
   - Recompute EUR columns from BGN when values disagree (orders).
   - Normalize expenses so `amount_eur` holds the converted value and `amount` mirrors the BGN equivalent.
   - Convert clearly BGN-sized inventory prices (>100) down to EUR.
2. Validate sampled records:
   - Orders: verify `extras_eur`, `sell_eur`, `total_eur`, and `balance_eur` align with `rate` and USD costs.
   - Expenses: ensure `amount_eur` equals `amount / 1.95583` and currency is `EUR`.
   - Inventory: spot-check purchase/sell prices after conversion.
3. Remove any legacy BGN-only UI fields from Supabase dashboards to prevent reintroduction of mixed data.

## Testing Checklist
- Load historical orders and confirm profits/revenues match manual EUR calculations.
- Add/update orders and expenses; verify Supabase rows store EUR values with BGN derived columns.
- Generate client stats and reports; totals should match recalculated EUR values without BGN fallbacks.
- Review inventory stats to ensure valuations are in EUR and align with converted price points.
- Re-run migration script on a backup to confirm idempotency (no double conversions when values already match the rate).
