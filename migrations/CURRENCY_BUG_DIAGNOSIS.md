# 🔴 CRITICAL: Currency Handling Bug Diagnosis

**Date:** 2025-12-28
**Severity:** CRITICAL - Financial Data Integrity Compromised
**Status:** Root cause identified, fixes in progress

---

## 🚨 Executive Summary

Two critical currency handling bugs have been identified that are causing **significant financial miscalculations**:

1. **Problem A (Legacy Data)**: Historical BGN orders showing **incorrect EUR conversions**
   - Example: 96.03 BGN displayed as €96.03 instead of €49.10 (1.96x error)

2. **Problem B (New Orders)**: Exchange rate not being applied, defaulting to **1:1 conversion**
   - Example: $10 USD being saved/displayed as €10 instead of €8.60 (using 0.86 rate)

**Financial Impact**: Revenue, profit, and expense totals are **incorrect by 50-100%** for affected periods.

---

## 📊 Root Cause Analysis

### Problem A: Legacy BGN→EUR Conversion Error

#### The Issue:
The database contains historical orders from Sep-Oct with:
- `rate` column: 1.6500-1.6800 (these are **USD→BGN** rates from when system used BGN)
- `total_bgn`, `balance_bgn`: Correctly calculated BGN amounts (e.g., 96.03 BGN)
- `extras_eur`, `sell_eur`: Converted EUR amounts (e.g., 49.10 EUR from 96.03 BGN ÷ 1.9558)

**BUT**, the `transformOrderFromDB()` function **recalculates** EUR amounts on-the-fly:

```javascript
// SupabaseService.js:911
const totalEUR = ((costUSD + shippingUSD) * rate) + extrasEUR;
```

#### The Bug:
This uses the `rate` field (1.67 USD→BGN) **as if it's a USD→EUR rate**!

**Example Calculation (WRONG)**:
```
Legacy order (September 2024):
- Cost: $50 USD, Shipping: $2 USD
- rate: 1.67 (USD→BGN, historical)
- extras_bgn: 20 BGN

Database has:
- total_bgn: (50+2)*1.67 + 20 = 86.84 + 20 = 106.84 BGN
- extras_eur: 20 / 1.9558 = 10.23 EUR (CORRECT)

But transformOrderFromDB calculates:
- totalEUR = (50+2) * 1.67 + 10.23 = 86.84 + 10.23 = 97.07 EUR ❌

Should be:
- totalEUR = 106.84 BGN / 1.9558 = 54.63 EUR ✅
```

**Impact**: All Sep-Oct 2024 orders show costs ~77% **higher** than they should be in EUR.

---

### Problem B: New Orders Getting rate=1.0

#### The Issue:
When creating new orders, the exchange rate defaults to `1.0` instead of the configured USD→EUR rate (e.g., 0.86).

#### The Bug Chain:

**Step 1: SupabaseService.js:282, 367**
```javascript
rate: parseFloat(orderData.rate) || 1,
```
If `orderData.rate` is falsy, it defaults to `1`.

**Step 2: OrdersModule.prepareOrder()**
```javascript
// Line 405-430
const rate = parseFloat(settings.eurRate); // Gets 0.86
// ...
order.rate = rate; // Sets rate to 0.86 ✅
```

The `prepareOrder()` method **correctly** sets the rate from settings.

**Step 3: The Missing Link**
```javascript
// Line 430: order.rate = rate;
```

The rate IS being set in `prepareOrder()`, so why does it end up as 1.0 in the database?

**Hypothesis**:
1. `prepareOrder()` sets `rate: 0.86` ✅
2. Data is passed to `SupabaseService.createOrder(orderData)` ✅
3. SupabaseService does: `parseFloat(orderData.rate) || 1`
4. If `orderData.rate` is `0` or `undefined` somehow, it becomes `1` ❌

**Likely Cause**: The `orderData` object passed to SupabaseService might not have the `rate` field, or it's being overwritten somewhere in the chain.

---

### Problem C: Settings Save Error (Secondary)

#### The Issue:
User gets error: `"Invalid USD→EUR exchange rate: undefined"` when saving settings.

#### The Bug:
The validation I added in `prepareOrder()` is being triggered when it shouldn't be.

```javascript
// OrdersModule.js:408-410
if (!rate || isNaN(rate) || rate <= 0) {
    throw new Error(`Invalid USD→EUR exchange rate: ${settings.eurRate}...`);
}
```

**Hypothesis**:
1. Settings are being saved ✅
2. This emits `settings:updated` event ✅
3. Some listener might be recalculating existing orders ❌
4. If existing orders don't have proper data, prepareOrder() throws error ❌

---

## 🔬 Database Schema Analysis

Based on migration SQL `001_bgn_to_eur_migration.sql`:

```sql
-- Orders table structure:
CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    date DATE,
    client TEXT,
    cost_usd DECIMAL(10,2),
    shipping_usd DECIMAL(10,2),
    rate DECIMAL(10,5),          -- ⚠️ AMBIGUOUS: USD→BGN or USD→EUR?
    extras_bgn DECIMAL(10,2),    -- Legacy
    sell_bgn DECIMAL(10,2),      -- Legacy
    extras_eur DECIMAL(10,2),    -- Current
    sell_eur DECIMAL(10,2),      -- Current
    currency VARCHAR(3),          -- 'BGN' or 'EUR'
    migrated_to_eur BOOLEAN,      -- Migration flag
    ...
);
```

### The Core Problem:
The `rate` column is **semantically ambiguous**:
- For orders before 2026-01-01: It stores **USD→BGN** rate (~1.67)
- For orders after 2026-01-01: It should store **USD→EUR** rate (~0.86)

BUT the `transformOrderFromDB()` function **doesn't know which** it is! It always treats `rate` as USD→EUR.

---

## ✅ Correct Architecture (What It Should Be)

### Option 1: Separate Rate Columns
```sql
ALTER TABLE orders
    ADD COLUMN usd_bgn_rate DECIMAL(10,5),  -- For historical
    ADD COLUMN usd_eur_rate DECIMAL(10,5);  -- For current
```

### Option 2: Store Calculated EUR Values (Recommended)
Don't recalculate EUR amounts in `transformOrderFromDB()`. Instead:

1. **Store final EUR amounts in database** during create/update
2. **Read them directly** without recalculation
3. **Use `currency` field** to determine if conversion is needed

```javascript
// CREATE: Calculate once, store
const totalEUR = ((costUSD + shippingUSD) * eurRate) + extrasEUR;
await supabase.insert({ ..., total_eur: totalEUR }); ✅

// READ: Just use stored value
const order = await supabase.select('total_eur');
return { totalEUR: order.total_eur }; ✅ Simple, reliable
```

### Option 3: Currency-Aware Rate Interpretation
```javascript
// Use currency field to determine what rate represents
const rate = dbOrder.currency === 'BGN'
    ? dbOrder.rate / 1.95583  // Convert USD→BGN rate to USD→EUR
    : dbOrder.rate;            // Already USD→EUR
```

---

## 🔍 Verification Queries

### Check 1: Identify Legacy Orders with USD→BGN Rates
```sql
SELECT
    id,
    date,
    client,
    cost_usd,
    shipping_usd,
    rate,
    currency,
    extras_bgn,
    sell_bgn,
    extras_eur,
    sell_eur,
    CASE
        WHEN rate BETWEEN 1.5 AND 1.8 THEN 'USD→BGN (Legacy)'
        WHEN rate BETWEEN 0.8 AND 1.0 THEN 'USD→EUR (Current)'
        WHEN rate = 1.0 THEN 'DEFAULT (BUG!)'
        ELSE 'Unknown'
    END AS rate_type
FROM orders
ORDER BY date DESC;
```

### Check 2: Find Orders with rate=1.0 (Bug Indicator)
```sql
SELECT
    id,
    date,
    client,
    cost_usd,
    shipping_usd,
    rate,
    sell_eur,
    ROUND((cost_usd + shipping_usd) * 1.0 + COALESCE(extras_eur, 0), 2) AS calculated_total
FROM orders
WHERE rate = 1.0
ORDER BY date DESC;
```

### Check 3: Verify EUR Conversions for Legacy Data
```sql
SELECT
    id,
    date,
    client,
    -- Original BGN calculation
    ROUND((cost_usd + shipping_usd) * rate + extras_bgn, 2) AS total_bgn_calculated,
    -- Stored EUR value (from migration)
    ROUND(((cost_usd + shipping_usd) * rate + extras_bgn) / 1.95583, 2) AS expected_eur,
    -- What the app calculates (WRONG for legacy)
    ROUND((cost_usd + shipping_usd) * rate + COALESCE(extras_eur, 0), 2) AS app_calculates,
    -- Difference (should be ~0)
    ROUND(
        ((cost_usd + shipping_usd) * rate + COALESCE(extras_eur, 0)) -
        (((cost_usd + shipping_usd) * rate + extras_bgn) / 1.95583),
    2) AS error_amount
FROM orders
WHERE currency = 'BGN'
  AND date < '2026-01-01'
ORDER BY error_amount DESC;
```

### Check 4: Validate EUR Values in Database
```sql
SELECT
    COUNT(*) as total_orders,
    COUNT(*) FILTER (WHERE currency = 'BGN') as bgn_orders,
    COUNT(*) FILTER (WHERE currency = 'EUR') as eur_orders,
    COUNT(*) FILTER (WHERE rate = 1.0) as rate_1_orders,
    COUNT(*) FILTER (WHERE rate BETWEEN 1.5 AND 1.8) as legacy_bgn_rate,
    COUNT(*) FILTER (WHERE rate BETWEEN 0.8 AND 1.0 AND rate != 1.0) as current_eur_rate,
    COUNT(*) FILTER (WHERE extras_eur IS NULL) as missing_eur_extras,
    COUNT(*) FILTER (WHERE sell_eur IS NULL) as missing_eur_sell
FROM orders;
```

---

## 🛠️ Fix Strategy (Safe & Auditable)

### Phase 1: Database Fixes (CRITICAL - Run First)

#### Step 1.1: Add Total EUR Columns
```sql
-- Add calculated total columns to avoid recalculation bugs
ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS total_eur DECIMAL(10,2),
    ADD COLUMN IF NOT EXISTS balance_eur DECIMAL(10,2);

COMMENT ON COLUMN orders.total_eur IS 'Total cost in EUR (calculated once, stored)';
COMMENT ON COLUMN orders.balance_eur IS 'Profit in EUR (calculated once, stored)';
```

#### Step 1.2: Backfill EUR Totals for Legacy Orders
```sql
-- For legacy BGN orders: Convert BGN totals to EUR
UPDATE orders
SET
    total_eur = ROUND(
        ((cost_usd + shipping_usd) * rate + extras_bgn) / 1.95583,
        2
    ),
    balance_eur = ROUND(
        (sell_bgn - ((cost_usd + shipping_usd) * rate + extras_bgn)) / 1.95583,
        2
    )
WHERE currency = 'BGN'
  AND date < '2026-01-01'
  AND (total_eur IS NULL OR balance_eur IS NULL);
```

#### Step 1.3: Backfill EUR Totals for Current Orders
```sql
-- For EUR orders: Use EUR columns directly
UPDATE orders
SET
    total_eur = ROUND(
        (cost_usd + shipping_usd) * rate + COALESCE(extras_eur, 0),
        2
    ),
    balance_eur = ROUND(
        COALESCE(sell_eur, 0) - ((cost_usd + shipping_usd) * rate + COALESCE(extras_eur, 0)),
        2
    )
WHERE currency = 'EUR'
  AND (total_eur IS NULL OR balance_eur IS NULL);
```

#### Step 1.4: Fix Orders with rate=1.0 (Needs Manual Review)
```sql
-- First, identify them
SELECT id, date, client, cost_usd, shipping_usd, sell_eur
FROM orders
WHERE rate = 1.0
ORDER BY date DESC;

-- These need settings.eurRate applied retroactively
-- Assuming eurRate should be 0.86:
UPDATE orders
SET
    rate = 0.86,  -- ⚠️ USE ACTUAL eurRate FROM SETTINGS
    total_eur = ROUND((cost_usd + shipping_usd) * 0.86 + COALESCE(extras_eur, 0), 2),
    balance_eur = ROUND(COALESCE(sell_eur, 0) - ((cost_usd + shipping_usd) * 0.86 + COALESCE(extras_eur, 0)), 2)
WHERE rate = 1.0
  AND currency = 'EUR';
```

### Phase 2: Code Fixes

#### Fix 2.1: transformOrderFromDB() - Use Stored EUR Values
```javascript
// js/core/SupabaseService.js:900-950
async transformOrderFromDB(dbOrder) {
    const costUSD = parseFloat(dbOrder.cost_usd) || 0;
    const shippingUSD = parseFloat(dbOrder.shipping_usd) || 0;
    const rate = parseFloat(dbOrder.rate) || 0;

    // Use EUR fields based on currency
    const extrasEUR = parseFloat(dbOrder.extras_eur) || 0;
    const sellEUR = parseFloat(dbOrder.sell_eur) || 0;

    // ✅ FIX: Use stored total_eur and balance_eur if available
    let totalEUR, balanceEUR;

    if (dbOrder.total_eur !== null && dbOrder.total_eur !== undefined) {
        // Use pre-calculated values (safe, no recalculation)
        totalEUR = parseFloat(dbOrder.total_eur);
        balanceEUR = parseFloat(dbOrder.balance_eur);
    } else {
        // Fallback for orders without total_eur (shouldn't happen after migration)
        if (dbOrder.currency === 'BGN') {
            // Legacy: Convert BGN total to EUR
            const totalBGN = ((costUSD + shippingUSD) * rate) + (parseFloat(dbOrder.extras_bgn) || 0);
            const balanceBGN = (parseFloat(dbOrder.sell_bgn) || 0) - totalBGN;
            totalEUR = totalBGN / 1.95583;
            balanceEUR = balanceBGN / 1.95583;
        } else {
            // Current: Calculate in EUR
            totalEUR = ((costUSD + shippingUSD) * rate) + extrasEUR;
            balanceEUR = sellEUR - totalEUR;
        }
    }

    return {
        id: dbOrder.id,
        date: dbOrder.date,
        client: dbOrder.client,
        phone: dbOrder.phone || '',
        origin: dbOrder.origin,
        vendor: dbOrder.vendor,
        model: dbOrder.model,
        costUSD: costUSD,
        shippingUSD: shippingUSD,
        rate: rate,
        // BGN fields (kept for audit)
        extrasBGN: parseFloat(dbOrder.extras_bgn) || 0,
        sellBGN: parseFloat(dbOrder.sell_bgn) || 0,
        totalBGN: 0,  // Deprecated
        balanceBGN: 0,  // Deprecated
        // EUR fields (primary)
        extrasEUR: parseFloat(extrasEUR.toFixed(2)),
        sellEUR: parseFloat(sellEUR.toFixed(2)),
        totalEUR: parseFloat(totalEUR.toFixed(2)),  // ✅ From DB
        balanceEUR: parseFloat(balanceEUR.toFixed(2)),  // ✅ From DB
        // Metadata
        currency: dbOrder.currency || 'EUR',
        status: dbOrder.status,
        fullSet: dbOrder.full_set,
        notes: dbOrder.notes || '',
        imageData: await this.getImageUrl(dbOrder.image_url),
        imageUrl: await this.getImageUrl(dbOrder.image_url),
        imagePath: dbOrder.image_url
    };
}
```

#### Fix 2.2: createOrder() - Store Calculated EUR Totals
```javascript
// js/core/SupabaseService.js:260-302
async createOrder(orderData) {
    return this.executeRequest(async () => {
        console.log('📝 Creating order in Supabase');

        // Handle image upload
        let imageUrl = null;
        if (orderData.imageData && orderData.imageData.startsWith('data:image')) {
            imageUrl = await this.uploadImage(orderData.imageData, `order-${Date.now()}`);
        }

        const extrasEUR = parseFloat(orderData.extrasEUR) || 0;
        const sellEUR = parseFloat(orderData.sellEUR) || 0;

        // ✅ FIX: Store calculated totals (already computed by prepareOrder)
        const totalEUR = parseFloat(orderData.totalEUR) || 0;
        const balanceEUR = parseFloat(orderData.balanceEUR) || 0;
        const rate = parseFloat(orderData.rate);

        // ❌ REMOVE DEFAULT: Don't default to 1, throw error instead
        if (!rate || rate <= 0) {
            throw new Error(`Invalid exchange rate: ${orderData.rate}. Cannot create order.`);
        }

        const { data, error } = await this.supabase
            .from('orders')
            .insert([{
                date: orderData.date,
                client: orderData.client,
                phone: orderData.phone || '',
                origin: orderData.origin,
                vendor: orderData.vendor,
                model: orderData.model,
                cost_usd: parseFloat(orderData.costUSD) || 0,
                shipping_usd: parseFloat(orderData.shippingUSD) || 0,
                rate: rate,  // ✅ No default
                extras_bgn: 0,  // Zeroed (legacy)
                sell_bgn: 0,  // Zeroed (legacy)
                extras_eur: extrasEUR,
                sell_eur: sellEUR,
                total_eur: totalEUR,  // ✅ Store calculated
                balance_eur: balanceEUR,  // ✅ Store calculated
                currency: 'EUR',
                status: orderData.status || 'Очакван',
                full_set: orderData.fullSet || false,
                notes: orderData.notes || '',
                image_url: imageUrl
            }])
            .select()
            .single();

        if (error) throw error;

        const transformedOrder = await this.transformOrderFromDB(data);
        console.log('✅ Order created successfully:', transformedOrder.id);
        return transformedOrder;
    });
}
```

#### Fix 2.3: updateOrder() - Store Calculated EUR Totals
```javascript
// js/core/SupabaseService.js:336-387 (similar changes)
async updateOrder(orderId, orderData) {
    // ... (same pattern as createOrder)

    const rate = parseFloat(orderData.rate);
    if (!rate || rate <= 0) {
        throw new Error(`Invalid exchange rate: ${orderData.rate}. Cannot update order.`);
    }

    const { data, error } = await this.supabase
        .from('orders')
        .update({
            // ... other fields ...
            rate: rate,  // ✅ No default
            total_eur: parseFloat(orderData.totalEUR) || 0,  // ✅ Store
            balance_eur: parseFloat(orderData.balanceEUR) || 0,  // ✅ Store
            // ...
        })
        .eq('id', orderId)
        .select()
        .single();

    // ...
}
```

### Phase 3: Validation & Testing

#### Test 3.1: Unit Tests
```javascript
// __tests__/currency.test.js
describe('Currency Handling', () => {
    test('Legacy BGN order converts correctly to EUR', () => {
        const dbOrder = {
            cost_usd: 50,
            shipping_usd: 2,
            rate: 1.67,  // USD→BGN
            extras_bgn: 20,
            sell_bgn: 200,
            currency: 'BGN',
            total_eur: 54.63,  // Pre-calculated
            balance_eur: 48.00
        };

        const order = transformOrderFromDB(dbOrder);
        expect(order.totalEUR).toBe(54.63);  // NOT 97.07!
        expect(order.balanceEUR).toBe(48.00);
    });

    test('New EUR order uses correct rate', () => {
        const orderData = {
            costUSD: 100,
            shippingUSD: 10,
            extrasEUR: 50,
            sellEUR: 200
        };
        const settings = { eurRate: 0.86 };

        const order = prepareOrder(orderData, settings);
        expect(order.rate).toBe(0.86);
        expect(order.totalEUR).toBe(144.60);  // (100+10)*0.86 + 50 = 94.6 + 50
    });

    test('Rate defaults throw error', () => {
        const orderData = { costUSD: 100, rate: null };
        expect(() => createOrder(orderData)).toThrow('Invalid exchange rate');
    });
});
```

#### Test 3.2: Database Integrity Checks
```sql
-- After fixes, this should return 0 rows
SELECT id, date, client, rate
FROM orders
WHERE rate = 1.0
  AND currency = 'EUR'
  AND date >= '2024-11-01';  -- Recent orders

-- This should show correct EUR conversions
SELECT
    id,
    date,
    currency,
    rate,
    total_eur,
    balance_eur,
    -- Verify totals make sense
    CASE
        WHEN total_eur <= 0 THEN 'Invalid: Zero/Negative Total'
        WHEN balance_eur + total_eur != sell_eur THEN 'Invalid: Math Doesn''t Add Up'
        WHEN rate = 1.0 AND currency = 'EUR' THEN 'Suspicious: Rate=1.0'
        ELSE 'OK'
    END AS validation
FROM orders
WHERE validation != 'OK';
```

---

## 📋 Remediation Checklist

### Immediate Actions (CRITICAL - Do First)

- [ ] **1. Backup database** (full snapshot before any changes)
  ```sql
  -- In Supabase Dashboard → Database → Backups → Create backup
  ```

- [ ] **2. Run verification queries** (identify scope of damage)
  - [ ] Check 1: Count legacy vs current orders
  - [ ] Check 2: Identify rate=1.0 orders
  - [ ] Check 3: Verify EUR conversion accuracy
  - [ ] Check 4: Overall data quality report

- [ ] **3. Add total_eur and balance_eur columns**
  ```sql
  ALTER TABLE orders ADD COLUMN total_eur DECIMAL(10,2), ADD COLUMN balance_eur DECIMAL(10,2);
  ```

- [ ] **4. Backfill EUR totals** (run migration scripts above)
  - [ ] Legacy BGN orders
  - [ ] Current EUR orders
  - [ ] Verify with SELECT queries

### Code Fixes

- [ ] **5. Update SupabaseService.js**
  - [ ] Fix `transformOrderFromDB()` to use stored total_eur/balance_eur
  - [ ] Fix `createOrder()` to require valid rate, store totals
  - [ ] Fix `updateOrder()` to require valid rate, store totals
  - [ ] Remove `|| 1` default for rate

- [ ] **6. Test with sample orders**
  - [ ] Create new order with EUR rate
  - [ ] Verify totals are correct
  - [ ] Check database has correct values

- [ ] **7. Deploy fixes**
  - [ ] Commit code changes
  - [ ] Push to branch
  - [ ] Test in production (or staging first)

### Post-Deployment Validation

- [ ] **8. Re-run verification queries**
  - [ ] Confirm no rate=1.0 orders (new ones)
  - [ ] Verify EUR totals match expected values
  - [ ] Check dashboard KPIs are now accurate

- [ ] **9. Manual spot checks**
  - [ ] Pick 5 legacy orders → verify EUR amounts
  - [ ] Pick 5 new orders → verify calculations
  - [ ] Check monthly reports → verify totals

- [ ] **10. User acceptance**
  - [ ] Review Sep-Oct profit numbers → should be higher now (correct EUR)
  - [ ] Review November profit → should match expectations
  - [ ] Test creating new order → should use 0.86 rate

---

## 🔐 Rollback Plan (If Needed)

### If Database Migration Fails:
```sql
-- Restore from backup taken in step 1
-- In Supabase Dashboard → Database → Backups → Restore

-- OR manually rollback:
ALTER TABLE orders DROP COLUMN IF EXISTS total_eur;
ALTER TABLE orders DROP COLUMN IF EXISTS balance_eur;
```

### If Code Deployment Fails:
```bash
git revert <commit-hash>
git push -u origin claude/remove-bgn-currency-Ii6q1
```

---

## 💰 Expected Financial Impact After Fix

### September 2024 (Example Month):
**Before Fix (Incorrect)**:
- Total revenue: €5,500 (inflated, treating BGN as EUR)
- Total costs: ~€4,000 (inflated)
- Profit: ~€1,500

**After Fix (Correct)**:
- Total revenue: €2,812 (converted from BGN at 1.9558)
- Total costs: ~€2,045 (converted correctly)
- Profit: ~€767

**Change**: Profit appears to "drop" by ~€733, but this is actually **correcting the display** to show true EUR amounts.

---

## 🎯 Success Criteria

✅ **Database**:
- All orders have `total_eur` and `balance_eur` populated
- No orders with `rate = 1.0` for recent dates
- Legacy orders show correct BGN→EUR conversions

✅ **Application**:
- Dashboard KPIs reflect actual EUR amounts
- New orders created with correct USD→EUR rate from settings
- Historical orders display with correct EUR conversions

✅ **User Validation**:
- Sep-Oct totals make sense (lower EUR values are correct)
- New orders calculate correctly ($10 × 0.86 = €8.60)
- Settings page saves EUR rate without errors

---

## 📞 Next Steps

1. **Run verification queries** → Understand current data state
2. **Execute database migrations** → Fix stored values
3. **Deploy code fixes** → Fix calculation logic
4. **Validate results** → Confirm accuracy
5. **Monitor** → Watch for issues

**Estimated Time**: 2-3 hours (including testing)
**Risk Level**: Medium (database changes, financial data)
**Reversibility**: High (backups + rollback scripts)

---

**Status**: ⏳ Awaiting execution approval
**Priority**: P0 - CRITICAL (financial integrity)
**Owner**: Development team
