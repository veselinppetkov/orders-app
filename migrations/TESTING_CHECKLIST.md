# 🧪 BGN to EUR Migration - Testing Checklist

## Pre-Deployment Testing

Before deploying to production, verify all EUR functionality works correctly.

---

## ✅ **Phase 1: Database Verification**

### Database Schema
- [ ] All EUR columns exist in `orders` table (extras_eur, sell_eur, currency)
- [ ] All EUR columns exist in `expenses` table (amount_eur, currency)
- [ ] All EUR columns exist in `inventory` table (purchase_price_eur, sell_price_eur, currency)
- [ ] All historical BGN data has been converted to EUR
- [ ] No NULL values in EUR columns for existing data

### Run Verification Queries
```sql
-- Check orders table
SELECT COUNT(*) as total_orders,
       COUNT(*) FILTER (WHERE extras_eur IS NOT NULL) as has_eur_extras,
       COUNT(*) FILTER (WHERE sell_eur IS NOT NULL) as has_eur_sell
FROM orders;

-- Check expenses table
SELECT COUNT(*) as total_expenses,
       COUNT(*) FILTER (WHERE amount_eur IS NOT NULL) as has_eur_amount
FROM expenses;

-- Check inventory table
SELECT COUNT(*) as total_items,
       COUNT(*) FILTER (WHERE purchase_price_eur IS NOT NULL) as has_eur_purchase,
       COUNT(*) FILTER (WHERE sell_price_eur IS NOT NULL) as has_eur_sell
FROM inventory;

-- Verify conversion accuracy (sample check)
SELECT
    extras_bgn,
    extras_eur,
    ROUND(extras_bgn / 1.95583, 2) as calculated_eur,
    extras_eur - ROUND(extras_bgn / 1.95583, 2) as difference
FROM orders
LIMIT 10;
```

**Expected:** All counts should match, all differences should be 0.00 or ±0.01 (rounding)

---

## ✅ **Phase 2: Settings & Configuration**

### Settings Page
- [ ] Navigate to Settings page (`/settings`)
- [ ] Verify "USD → EUR (€)" field is visible
- [ ] Verify default EUR rate is 0.92
- [ ] Verify "USD → BGN (лв) - Legacy" field is visible
- [ ] Verify default BGN rate is 1.71
- [ ] Change EUR rate to 0.95
- [ ] Click "Запази настройките" (Save Settings)
- [ ] Refresh page - verify EUR rate is still 0.95
- [ ] Change back to 0.92 and save

**Expected:** All settings save and persist correctly

---

## ✅ **Phase 3: Orders Module**

### Viewing Historical Orders (Before 2026-01-01)
- [ ] Navigate to Orders page
- [ ] Find an order with date before 2026-01-01
- [ ] Verify "Total Cost" shows format: `1000.00 лв (511.29 €)`
- [ ] Verify "Sell Price" shows format: `1200.00 лв (613.54 €)`
- [ ] Verify "Profit" shows format with both currencies
- [ ] Colors are correct (green for positive, red for negative)

### Creating New Order (Today's Date)
- [ ] Click "+ Нова поръчка" (New Order)
- [ ] Fill in all required fields:
  - Client: "Test EUR Client"
  - Date: Today's date
  - Cost: 100 USD
  - Shipping: 5 USD
  - Доп. разходи (€): 50
  - Продажна цена (€): 200
- [ ] Verify form labels show "€" not "лв"
- [ ] Click Save
- [ ] Verify order appears in list
- [ ] Verify amounts display correctly (should use EUR)
- [ ] Verify profit calculation is accurate

### Order Calculations
- [ ] Create test order with:
  - Cost: 100 USD, Shipping: 10 USD
  - EUR Rate: 0.92 (from settings)
  - Extras: 20 EUR, Sell: 150 EUR
- [ ] Calculate expected total: (100 + 10) × 0.92 + 20 = 101.2 + 20 = 121.2 EUR
- [ ] Calculate expected profit: 150 - 121.2 = 28.8 EUR
- [ ] Verify displayed values match calculations

**Expected:** All calculations accurate to 0.01 EUR

### Monthly Stats Summary
- [ ] Scroll to bottom of Orders page
- [ ] Verify "Приходи" (Revenue) shows in €
- [ ] Verify "Разходи" (Expenses) shows in €
- [ ] Verify "Печалба" (Profit) shows in €
- [ ] Values should be sums of all orders + expenses

---

## ✅ **Phase 4: Expenses Module**

### Viewing Default Expenses
- [ ] Navigate to Expenses page
- [ ] Verify default expenses show EUR amounts:
  - IG Campaign: 1534.29 €
  - Assurance: 301.65 €
  - Fiverr: 270.98 €
  - (and others...)
- [ ] Verify total shows in € (not лв)
- [ ] Verify average shows in €

### Creating Custom Expense
- [ ] Click "+ Добави разход" (Add Expense)
- [ ] Verify form label shows "Сума (€)"
- [ ] Enter: Name: "Test Expense", Amount: 100, Note: "Testing EUR"
- [ ] Click Save
- [ ] Verify expense appears in list with "100.00 €"
- [ ] Verify total updated correctly

### Editing Expense
- [ ] Click edit on any expense
- [ ] Change amount to 150.50
- [ ] Save
- [ ] Verify amount updated to "150.50 €"
- [ ] Verify total recalculated

---

## ✅ **Phase 5: Inventory Module**

### Viewing Inventory
- [ ] Navigate to Inventory page
- [ ] Verify all purchase prices show in € (e.g., "17.90 €")
- [ ] Verify all sell prices show in € (e.g., "35.79 €")
- [ ] Verify "Стойност на склад" (Stock Value) shows in €
- [ ] Verify "Потенциални приходи" (Potential Revenue) shows in €

### Inventory Stats
- [ ] Verify total stock value calculation is correct
- [ ] Example: 12 items × 17.90 € = 214.80 €
- [ ] Verify table footer shows total value in €

### Adding/Editing Inventory Item
- [ ] Click "+ Добави артикул" (Add Item)
- [ ] Verify "Доставна цена (€)" label
- [ ] Verify "Продажна цена (€)" label
- [ ] Enter test values: Purchase: 25.00, Sell: 50.00
- [ ] Save
- [ ] Verify item shows with EUR prices

---

## ✅ **Phase 6: Reports Module**

### All-Time Stats
- [ ] Navigate to Reports page
- [ ] Verify "ОБЩО ПРИХОДИ" shows in € (not лв)
- [ ] Verify "НЕТНА ПЕЧАЛБА" shows in €
- [ ] Verify "СРЕДНА ПЕЧАЛБА" shows in €

### Reports by Origin
- [ ] Scroll to "По източник" table
- [ ] Verify "Приходи" column shows in €
- [ ] Verify "Печалба" column shows in €
- [ ] Verify footer totals show in €
- [ ] Spot-check: Pick one origin, verify sum is correct

### Reports by Vendor
- [ ] Check "По доставчик" table
- [ ] Verify all amounts in €
- [ ] Verify footer totals in €

### Reports by Month
- [ ] Check "По месец" table
- [ ] Verify columns show:
  - Приходи in €
  - Разходи in €
  - Нетна печалба in €
- [ ] Verify footer totals in €
- [ ] Pick one month, manually calculate: Revenue - Expenses
- [ ] Verify matches "Нетна печалба"

---

## ✅ **Phase 7: Client Statistics**

### Client Stats
- [ ] Navigate to Orders page
- [ ] Click on any client name (if you have client detail view)
- [ ] OR check client statistics in reports
- [ ] Verify:
  - Total Revenue in €
  - Total Profit in €
  - Average Order Value in €

---

## ✅ **Phase 8: Integration Tests**

### Complete Order Flow
1. [ ] Settings: Set EUR rate to 0.90
2. [ ] Create new order with USD costs
3. [ ] Verify EUR amounts calculated using 0.90 rate
4. [ ] Add matching expense
5. [ ] Check Reports - verify new order/expense appear
6. [ ] Verify monthly totals updated
7. [ ] Delete test order
8. [ ] Verify Reports updated (removed from totals)

### Historical Data Compatibility
- [ ] Load old orders (before migration)
- [ ] Verify they display with both BGN and EUR
- [ ] Verify calculations still work
- [ ] Edit an old order
- [ ] Save without changing amounts
- [ ] Verify EUR values preserved correctly

---

## ✅ **Phase 9: Browser Compatibility**

Test in multiple browsers:
- [ ] Chrome/Edge (latest)
- [ ] Firefox (latest)
- [ ] Safari (if on Mac)
- [ ] Mobile browser (iOS/Android)

For each browser, verify:
- [ ] € symbol displays correctly (not as box/question mark)
- [ ] All pages load without errors
- [ ] Forms work correctly
- [ ] Data saves and loads

---

## ✅ **Phase 10: Console & Error Checking**

### Browser Console
- [ ] Open Developer Tools (F12)
- [ ] Navigate through all pages
- [ ] Check Console tab for errors

**Expected:** No red errors. Yellow warnings OK.

### Network Requests
- [ ] Check Network tab
- [ ] Create/edit/delete operations
- [ ] Verify Supabase requests succeed (200 status)
- [ ] No 400/500 errors

### LocalStorage
- [ ] Open Application/Storage tab
- [ ] Check localStorage
- [ ] Verify settings have eurRate field
- [ ] Verify data structure looks correct

---

## ✅ **Phase 11: Edge Cases**

### Zero/Negative Values
- [ ] Create order with 0 EUR extras
- [ ] Create order with negative profit
- [ ] Verify displays correctly
- [ ] Verify color coding (red for negative)

### Large Numbers
- [ ] Create order with 10,000 EUR sell price
- [ ] Verify formatting (10000.00 €, not 1e4)
- [ ] Verify calculations don't overflow

### Decimal Precision
- [ ] Enter amount: 123.456789
- [ ] Verify rounds to 123.46 €
- [ ] Verify calculations use rounded values

### Missing Data
- [ ] Load page with no orders
- [ ] Verify empty state displays
- [ ] Load page with no expenses
- [ ] Verify empty state displays

---

## ✅ **Phase 12: Data Integrity**

### Backup & Restore
- [ ] Settings → Export Data
- [ ] Verify JSON file downloads
- [ ] Open file, verify EUR fields present
- [ ] Create test order
- [ ] Import the backup
- [ ] Verify test order removed (restored to backup state)

### Manual Calculation Spot-Check
Pick 3 random orders and manually calculate:
1. Total Cost = (USD Cost + USD Shipping) × EUR Rate + EUR Extras
2. Profit = EUR Sell Price - Total Cost

- [ ] Order 1: Calculations match? ___________
- [ ] Order 2: Calculations match? ___________
- [ ] Order 3: Calculations match? ___________

**Expected:** All match within ±0.01 EUR

---

## ✅ **Phase 13: Performance**

- [ ] Page load time < 2 seconds
- [ ] Orders page with 100+ orders loads smoothly
- [ ] No lag when scrolling through tables
- [ ] Forms open/close quickly
- [ ] No memory leaks (check Task Manager after 10 min use)

---

## 🐛 **Bug Tracking**

If you find any issues, document them here:

| # | Issue | Severity | Page/Module | Notes |
|---|-------|----------|-------------|-------|
| 1 | | High/Medium/Low | | |
| 2 | | High/Medium/Low | | |
| 3 | | High/Medium/Low | | |

---

## ✅ **Final Sign-Off**

Once all tests pass:

- [ ] All database queries return expected results
- [ ] All UI displays € instead of лв
- [ ] All calculations accurate
- [ ] No console errors
- [ ] All browsers work
- [ ] Historical data preserved
- [ ] New data uses EUR correctly
- [ ] Settings save/load correctly
- [ ] Backup/restore works

**Tested by:** ________________
**Date:** ________________
**Migration Version:** 001
**Status:** ✅ PASSED / ❌ FAILED

---

## 📞 **Support**

If you encounter issues during testing:

1. Check browser console for errors
2. Verify database migration ran successfully
3. Clear browser cache (Ctrl+Shift+Delete)
4. Try in incognito/private window
5. Check Supabase logs

**Common Issues:**
- **€ shows as box:** Clear cache, hard refresh (Ctrl+F5)
- **Calculations wrong:** Verify EUR rate in Settings
- **Data not saving:** Check Supabase connection
- **Old prices show:** Clear localStorage

---

**Last Updated:** 2025-12-03
**Migration Version:** 001
**Total Test Cases:** 100+
