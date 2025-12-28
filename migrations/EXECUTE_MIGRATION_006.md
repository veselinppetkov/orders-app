# 🚀 Execute Migration 006: Fix Currency Calculations

**Status:** Ready to execute
**Risk Level:** Medium (database schema changes, financial data)
**Time Required:** 15-30 minutes
**Reversibility:** High (full rollback script provided)

---

## ⚠️ CRITICAL: Before You Start

### 1. **CREATE DATABASE BACKUP** (MANDATORY)

In Supabase Dashboard:
1. Navigate to **Database** → **Backups**
2. Click **"Create Backup"** or **"Back up now"**
3. Wait for confirmation (usually 1-2 minutes)
4. **Verify backup exists** before proceeding

**DO NOT PROCEED WITHOUT A BACKUP!**

---

## 📋 Migration Overview

This migration will:
- ✅ Add `total_eur` and `balance_eur` columns to orders table
- ✅ Backfill historical BGN orders with correct EUR conversions
- ✅ Backfill current EUR orders with calculated totals
- ✅ Identify orders with rate=1.0 bug
- ✅ Add constraints to prevent future bugs
- ✅ Create trigger for auto-calculation

**What it fixes:**
- Problem A: Legacy BGN→EUR miscalculations (Sep-Oct showing ~2x higher EUR amounts)
- Problem B: New orders getting rate=1.0 instead of 0.86

---

## 🔧 Step-by-Step Execution

### Step 1: Open Supabase SQL Editor

1. Go to **Supabase Dashboard**
2. Select your project
3. Navigate to **SQL Editor** (left sidebar)
4. Click **"New query"**

### Step 2: Run Diagnostic Queries (Optional but Recommended)

Before running the migration, let's see what will be fixed:

```sql
-- Quick preview of current state
SELECT
    COUNT(*) as total_orders,
    COUNT(*) FILTER (WHERE currency = 'BGN') as bgn_orders,
    COUNT(*) FILTER (WHERE currency = 'EUR') as eur_orders,
    COUNT(*) FILTER (WHERE rate = 1.0) as rate_1_orders,
    COUNT(*) FILTER (WHERE rate BETWEEN 1.5 AND 1.8) as legacy_bgn_rate
FROM orders;
```

**Expected output:**
- You should see some orders with `rate_1_orders > 0` (the bug)
- You should see orders with `legacy_bgn_rate > 0` (Sep-Oct BGN orders)

### Step 3: Execute Main Migration

1. **Copy the entire contents** of `/migrations/006_fix_currency_calculations.sql`
2. **Paste into SQL Editor**
3. **Click "Run"** or press `Ctrl+Enter`
4. **Watch the console output** for progress messages

**Expected output:**
```
📊 Order Statistics:
  Total orders: X
  BGN currency: Y
  EUR currency: Z
  Rate = 1.0 (BUG): N
  Rate 1.5-1.8 (Legacy BGN): M

✅ Backfilled EUR totals for Y BGN orders
✅ Backfilled EUR totals for Z EUR orders
⚠️  Found N orders with rate=1.0 (BUG)
```

### Step 4: Review Orders with rate=1.0

The migration will show you orders that have the rate=1.0 bug. Review the output:

```
ID  | Date       | Client              | USD Total | Current € Total | Should Be
----+------------+---------------------+-----------+-----------------+-----------
 7  | 2024-11-15 | Client Name         | $10       | €10.00          | €8.60
```

If this looks correct, proceed to Step 5.

### Step 5: Fix rate=1.0 Orders

1. **In the SQL file**, find the section labeled `STEP 6: FIX rate=1.0 ORDERS`
2. **Uncomment the UPDATE query** (remove `/*` and `*/`)
3. **Verify the rate is 0.86** (already set from your confirmation)
4. **Run the uncommented section**

**The query to uncomment:**
```sql
UPDATE orders
SET
    rate = 0.86,
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
```

### Step 6: Verify Migration Success

Run this verification query:

```sql
-- Should show 0 missing EUR totals and 0 rate=1.0 orders
SELECT
    COUNT(*) as total_orders,
    COUNT(*) FILTER (WHERE total_eur IS NOT NULL) as has_total_eur,
    COUNT(*) FILTER (WHERE balance_eur IS NOT NULL) as has_balance_eur,
    COUNT(*) FILTER (WHERE total_eur IS NULL) as missing_total_eur,
    COUNT(*) FILTER (WHERE rate = 1.0) as still_rate_1
FROM orders;
```

**Expected:**
- `missing_total_eur` should be **0**
- `still_rate_1` should be **0**
- `has_total_eur` should equal `total_orders`

### Step 7: Sample Data Check

View some corrected orders:

```sql
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
```

**What to check:**
- Legacy BGN orders (Sep-Oct): `total_eur` should be ~50% of old totals (correct EUR conversion)
- New EUR orders: `total_eur` should match expected calculations
- No orders with `total_eur = NULL`

---

## ✅ Success Criteria

Migration is successful if:

- [ ] All orders have `total_eur` and `balance_eur` populated
- [ ] No orders have `rate = 1.0` for recent dates
- [ ] Sep-Oct EUR totals are approximately half of what they were (correct BGN→EUR)
- [ ] Dashboard KPIs now show sensible EUR amounts
- [ ] No errors in SQL output

---

## 🔄 If Something Goes Wrong (Rollback)

### Option A: Restore from Backup (Nuclear Option)

In Supabase Dashboard:
1. Go to **Database** → **Backups**
2. Find your backup from Step 1
3. Click **"Restore"**
4. Confirm restoration

**WARNING:** This will lose ALL data changes since the backup!

### Option B: Run Rollback Script (Surgical Option)

1. Open SQL Editor
2. Copy contents of `/migrations/006_fix_currency_calculations_ROLLBACK.sql`
3. Paste and run
4. This removes constraints and triggers (keeps data)

---

## 📊 Expected Changes

### Before Migration:
**September 2024 Order Example:**
- Database: `96.03 BGN` (correct)
- Displayed: `€96.03` ❌ (wrong - treating BGN as EUR)
- Should be: `€49.10` ✅ (96.03 ÷ 1.9558)

**New Order Example (Nov 2024):**
- Input: `$8 + $2 = $10 USD`
- Database rate: `1.0` ❌ (bug)
- Displayed: `€10.00` ❌ (wrong)
- Should be: `€8.60` ✅ ($10 × 0.86)

### After Migration:
**September 2024 Order:**
- Database: `total_eur = 49.10`
- Displayed: `€49.10` ✅ (correct)

**New Orders (going forward):**
- Input: `$10 USD`
- Database rate: `0.86` ✅
- Stored: `total_eur = 8.60`
- Displayed: `€8.60` ✅ (correct)

---

## 🚦 Post-Migration Actions

After migration succeeds:

### 1. Deploy Code Changes

The code fixes have been committed to your branch:
- `js/core/SupabaseService.js` - Fixed transformOrderFromDB, createOrder, updateOrder
- `js/modules/OrdersModule.js` - Added validation and logging

**Deploy:**
```bash
# Already committed on branch claude/remove-bgn-currency-Ii6q1
# Just refresh your browser or redeploy
```

### 2. Test the Application

**Test new order creation:**
1. Go to Orders page
2. Click "Add Order"
3. Create test order: `$8 watch + $2 shipping = $10 USD`
4. Verify it shows `€8.60` (not €10.00)
5. Check database: `rate` should be `0.86`, `total_eur` should be `8.60`

**Test historical orders:**
1. Navigate to September 2024
2. Check if EUR amounts look correct (should be ~50% of what they were)
3. Verify dashboard KPIs make sense

### 3. Verify Dashboard KPIs

1. Go to **Orders** page
2. Check monthly stats at top
3. **Expected changes:**
   - Sep-Oct profits will appear lower (but are now correct in EUR)
   - Current month totals should match expectations
   - No more inflated EUR amounts

### 4. Spot Check Financial Data

Manually verify a few orders:

**For legacy BGN order (Sep-Oct 2024):**
```
If database shows:
- cost_usd: 50, shipping_usd: 2, rate: 1.67, extras_bgn: 20, sell_bgn: 200

Then total_eur should be:
- ((50+2)*1.67 + 20) / 1.9558 = 106.84 / 1.9558 = €54.63 ✅
```

**For new EUR order (Nov 2024+):**
```
If you entered:
- $100 watch + $10 shipping + €50 extras, sell €200, rate 0.86

Then total_eur should be:
- (100+10)*0.86 + 50 = 94.6 + 50 = €144.60 ✅
- balance_eur = 200 - 144.6 = €55.40 ✅
```

---

## 📝 Troubleshooting

### Issue: "Column total_eur already exists"

**Cause:** Migration was partially run before

**Fix:**
```sql
-- Check if columns exist
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'orders'
  AND column_name IN ('total_eur', 'balance_eur');

-- If they exist but are empty, just run STEP 3-6 of migration
```

### Issue: "Cannot add constraint orders_eur_rate_valid"

**Cause:** Existing orders violate the constraint (have rate=1.0)

**Fix:**
1. Comment out the constraint creation in STEP 8
2. Run STEP 6 to fix rate=1.0 orders first
3. Then uncomment and run STEP 8

### Issue: Some totals still look wrong

**Cause:** Application code not deployed yet

**Fix:**
1. Hard refresh browser: `Ctrl+Shift+R` or `Cmd+Shift+R`
2. Clear browser cache
3. Verify code changes are deployed

---

## 📞 Support

If you encounter issues:

1. **Check SQL output** for error messages
2. **Review verification queries** to see current state
3. **Take screenshots** of any errors
4. **Check browser console** for JavaScript errors
5. **Verify database backup** exists before attempting fixes

---

## ✨ After Successful Migration

Your application will now:

- ✅ Display correct EUR amounts for historical BGN orders
- ✅ Use correct USD→EUR exchange rate (0.86) for new orders
- ✅ Store calculated totals in database (no recalculation bugs)
- ✅ Prevent future rate=1.0 defaults
- ✅ Show accurate financial reports and KPIs

**The EUR amounts may appear lower than before, but they are now financially accurate!**

---

**Migration Version:** 006
**Created:** 2025-12-28
**Exchange Rate:** 0.86 USD→EUR (confirmed)
**BGN→EUR Rate:** 1.95583 (EU official)

**Status:** ✅ Ready to execute
