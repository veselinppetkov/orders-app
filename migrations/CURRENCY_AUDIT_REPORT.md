# 🔍 Currency Conversion Audit Report

**Date:** 2025-12-03
**Status:** ⚠️ CRITICAL ISSUES FOUND
**Severity:** HIGH - Financial data accuracy impacted

---

## 🚨 Critical Issues Identified

### **Issue #1: Dangerous Fallback Logic**

**Problem:** The codebase uses `(o.sellEUR || o.sellBGN || 0)` fallback pattern throughout. This is **critically flawed** because:

1. If `sellEUR` exists but contains **unconverted BGN values** (e.g., 6000 BGN copied as 6000 EUR), it uses the wrong value
2. If `sellEUR` is missing, it falls back to `sellBGN` **without conversion**
3. This causes display of incorrect financial data (e.g., 6,000 BGN shown as 6,000 EUR instead of 3,067.64 EUR)

**Affected Files:**
- ❌ `js/modules/ClientsModule.js` lines 435, 436, 442
- ❌ `js/modules/ReportsModule.js` lines 18, 19, 39, 40, 83, 84, 85
- ❌ `js/core/SupabaseService.js` lines 923, 924
- ❌ Multiple UI view files

**Example Error:**
```javascript
// WRONG: Uses EUR value even if it's just a copied BGN value
totalRevenue: orders.reduce((sum, o) => sum + (o.sellEUR || o.sellBGN || 0), 0)

// CORRECT: Always ensure proper conversion
totalRevenue: orders.reduce((sum, o) => sum + this.getProperEURValue(o), 0)
```

---

### **Issue #2: No Data Validation**

**Problem:** The code assumes EUR values in the database are correct, with no validation to check if conversion was applied.

**Risk:** If the database migration wasn't run, or failed partially, the app displays wrong financial data.

**Solution Needed:**
- Add validation to verify EUR values are approximately BGN/1.95583
- Flag suspicious data where EUR ≈ BGN (indicating no conversion)
- Auto-convert on-the-fly if values are suspicious

---

### **Issue #3: Mixed Currency Calculations**

**Problem:** Some calculations add BGN and EUR values without proper conversion.

**Example in SupabaseService.js:917-926:**
```javascript
const totalBGN = ((dbOrder.cost_usd + dbOrder.shipping_usd) * dbOrder.rate) + dbOrder.extras_bgn;
const balanceBGN = dbOrder.sell_bgn - Math.ceil(totalBGN);

// EUR calculation uses converted values
const extrasEUR = dbOrder.extras_eur || CurrencyUtils.convertBGNtoEUR(dbOrder.extras_bgn);
const sellEUR = dbOrder.sell_eur || CurrencyUtils.convertBGNtoEUR(dbOrder.sell_bgn);
const totalEUR = CurrencyUtils.convertBGNtoEUR(totalBGN);
const balanceEUR = sellEUR - totalEUR;
```

**Issue:** If `dbOrder.extras_eur` exists but is wrong, `balanceEUR` will be calculated incorrectly.

---

### **Issue #4: Inconsistent Field Names**

**Database columns:**
- `extras_eur`, `sell_eur` (snake_case)

**JavaScript objects:**
- `extrasEUR`, `sellEUR` (camelCase)

This is fine, but the fallback logic doesn't account for data inconsistencies.

---

## 📊 Detailed Code Audit

### **File: js/modules/ClientsModule.js**

**Line 435:** ❌ CRITICAL
```javascript
totalRevenue: orders.reduce((sum, o) => sum + (o.sellEUR || o.sellBGN || 0), 0),
```
**Problem:** Assumes `sellEUR` is correct if it exists. No conversion applied if using `sellBGN`.

**Fix Required:**
```javascript
totalRevenue: orders.reduce((sum, o) => {
    // Always use EUR value, converting from BGN if needed
    return sum + (o.sellEUR && o.sellEUR > 0 ? o.sellEUR : CurrencyUtils.convertBGNtoEUR(o.sellBGN || 0));
}, 0),
```

---

**Line 436:** ❌ CRITICAL
```javascript
totalProfit: orders.reduce((sum, o) => sum + (o.balanceEUR || o.balanceBGN || 0), 0),
```
**Same issue as above.**

---

**Line 442:** ❌ CRITICAL
```javascript
avgOrderValue: orders.length > 0 ?
    orders.reduce((sum, o) => sum + (o.sellEUR || o.sellBGN || 0), 0) / orders.length : 0
```
**Same issue as above.**

---

### **File: js/modules/ReportsModule.js**

**Lines 18-20:** ❌ CRITICAL
```javascript
const revenue = orders.reduce((sum, o) => sum + (o.sellEUR || o.sellBGN || 0), 0);
const totalOrderCosts = orders.reduce((sum, o) => sum + (o.totalEUR || o.totalBGN || 0), 0);
const profit = revenue - totalOrderCosts - totalExpenses;
```

**Lines 39-41:** ❌ CRITICAL
```javascript
const totalRevenue = allOrders.reduce((sum, o) => sum + (o.sellEUR || o.sellBGN || 0), 0);
const totalProfit = allOrders.reduce((sum, o) => sum + (o.balanceEUR || o.balanceBGN || 0), 0);
const totalExpenses = allExpenses.reduce((sum, e) => sum + (e.amountEUR || e.amount || 0), 0);
```

**Lines 83-85:** ❌ CRITICAL
```javascript
revenue: orders.reduce((sum, o) => sum + (o.sellEUR || o.sellBGN || 0), 0),
profit: orders.reduce((sum, o) => sum + (o.balanceEUR || o.balanceBGN || 0), 0),
expenses: expenses.reduce((sum, e) => sum + (e.amountEUR || e.amount || 0), 0)
```

**All have the same dangerous fallback pattern.**

---

### **File: js/core/SupabaseService.js**

**Lines 923-924:** ⚠️ MODERATE RISK
```javascript
const extrasEUR = dbOrder.extras_eur || CurrencyUtils.convertBGNtoEUR(dbOrder.extras_bgn);
const sellEUR = dbOrder.sell_eur || CurrencyUtils.convertBGNtoEUR(dbOrder.sell_bgn);
```

**Issue:** Better than other files (has conversion), but still trusts `extras_eur` if it exists, without validation.

**Better approach:**
```javascript
// Validate EUR value or convert from BGN
const extrasEUR = this.validateAndConvertEUR(dbOrder.extras_eur, dbOrder.extras_bgn);
const sellEUR = this.validateAndConvertEUR(dbOrder.sell_eur, dbOrder.sell_bgn);
```

---

### **File: js/modules/OrdersModule.js**

**Lines 271-285:** ⚠️ MODERATE RISK

Needs review for currency handling in `prepareOrder()` method.

---

## 🎯 Root Cause Analysis

### **Why This Happened:**

1. **Assumption of successful migration:** Code assumes database EUR columns are always correctly populated
2. **Backward compatibility over correctness:** Fallback to BGN values seems safe but is dangerous
3. **No data validation layer:** Missing checks to verify EUR values are sensible
4. **Dual-currency transition incomplete:** System still heavily relies on BGN values

---

## ✅ Required Fixes

### **Priority 1: Immediate Fixes (Production Impact)**

1. ✅ **Add data validation helper:**
   ```javascript
   validateAndConvertEUR(eurValue, bgnValue) {
       if (eurValue && eurValue > 0) {
           // Check if EUR value looks valid (not just copied BGN)
           const expectedEUR = CurrencyUtils.convertBGNtoEUR(bgnValue);
           const tolerance = 0.05; // 5% tolerance
           if (Math.abs(eurValue - expectedEUR) / expectedEUR < tolerance) {
               return eurValue; // Valid EUR value
           }
           // Suspicious value, log warning
           console.warn(`Suspicious EUR value: ${eurValue}, expected ~${expectedEUR.toFixed(2)}`);
       }
       // No EUR value or suspicious, convert from BGN
       return CurrencyUtils.convertBGNtoEUR(bgnValue || 0);
   }
   ```

2. ✅ **Fix all reduce() operations** to use proper conversion instead of fallback

3. ✅ **Update transformOrderFromDB** to validate EUR values

---

### **Priority 2: Data Migration Verification**

1. ✅ Create script to verify database EUR values
2. ✅ Check if all orders have proper EUR values (EUR ≈ BGN / 1.95583)
3. ✅ Flag and fix any incorrect data

---

### **Priority 3: Remove Dual-Currency Logic**

1. ✅ Eliminate all `|| o.sellBGN` fallbacks
2. ✅ Keep BGN fields for historical reference only
3. ✅ Make EUR the single source of truth

---

## 🔬 Testing Strategy

### **Test Cases:**

1. **Order with 6,000 BGN sell price:**
   - Expected EUR display: 3,067.64 EUR
   - NOT: 6,000 EUR

2. **Monthly report totals:**
   - Verify all values are in EUR
   - Check calculations match manual computation

3. **Client stats:**
   - Total revenue should be sum of sellEUR (properly converted)
   - NOT sum of unconverted values

---

## 📅 Action Plan

| Priority | Action | Owner | Status |
|----------|--------|-------|--------|
| P0 | Add validation helper function | Dev | ⏳ Pending |
| P0 | Fix ClientsModule calculations | Dev | ⏳ Pending |
| P0 | Fix ReportsModule calculations | Dev | ⏳ Pending |
| P0 | Fix SupabaseService transform | Dev | ⏳ Pending |
| P1 | Create data verification script | Dev | ⏳ Pending |
| P1 | Run verification on database | User | ⏳ Pending |
| P2 | Remove BGN fallback logic | Dev | ⏳ Pending |
| P2 | Add unit tests for currency | Dev | ⏳ Pending |

---

## 💰 Example Calculations

**Original BGN Values:**
- Sell Price: 6,000 BGN
- Extras: 1,000 BGN
- Total Cost: 4,000 BGN
- Balance (Profit): 2,000 BGN

**Correct EUR Values (÷ 1.95583):**
- Sell Price: 3,067.64 EUR ✅
- Extras: 511.29 EUR ✅
- Total Cost: 2,045.12 EUR ✅
- Balance (Profit): 1,022.52 EUR ✅

**WRONG (Current Bug):**
- Sell Price: 6,000 EUR ❌
- Extras: 1,000 EUR ❌
- Total Cost: 4,000 EUR ❌
- Balance (Profit): 2,000 EUR ❌

**Financial Impact:** Values appear **195.583% higher** than they should be!

---

**Status:** 🔴 Urgent fixes required
**Next Step:** Implement validation helper and fix all calculation logic
