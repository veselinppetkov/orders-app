# 🇪🇺 BGN to EUR Migration - Deployment Guide

## Overview
This guide will walk you through the complete deployment process for migrating your order management system from Bulgarian Lev (BGN) to Euro (EUR) in preparation for Bulgaria's official euro adoption on **January 1, 2026**.

**Official Conversion Rate:** 1 EUR = 1.95583 BGN (EU Council approved)

---

## 📋 Pre-Deployment Checklist

### ✅ Before You Begin

- [ ] **CRITICAL:** Create a complete backup of your Supabase database
- [ ] Verify you have admin access to Supabase SQL Editor
- [ ] Review all migration files in the `/migrations` directory
- [ ] Ensure no users are actively using the system during migration
- [ ] Have the rollback script ready in case of issues
- [ ] Test the migration in a development environment first (if available)

---

## 🗄️ Step 1: Database Migration

### 1.1 Access Supabase SQL Editor

1. Log in to your Supabase project at https://supabase.com
2. Navigate to **SQL Editor** in the left sidebar
3. Create a new query

### 1.2 Backup Current Database

```sql
-- Run this FIRST to export your current data
SELECT * FROM orders;
SELECT * FROM expenses;
SELECT * FROM inventory;
SELECT * FROM settings;
```

**Export these results to CSV files as a backup.**

### 1.3 Run Migration Script

1. Open the file `/migrations/001_bgn_to_eur_migration.sql`
2. Copy the entire contents
3. Paste into Supabase SQL Editor
4. Click **Run** to execute
5. Verify the success messages in the output

**Expected output:**
```
✅ BGN to EUR migration completed successfully!
Total orders migrated: X
Total expenses migrated: Y
Total inventory items migrated: Z
Official conversion rate: 1 EUR = 1.95583 BGN
```

### 1.4 Verify Database Changes

Run this verification query:

```sql
-- Verify the migration
SELECT
  'orders' AS table_name,
  COUNT(*) AS total_records,
  COUNT(*) FILTER (WHERE extras_eur IS NOT NULL) AS has_eur_data,
  COUNT(*) FILTER (WHERE migrated_to_eur = TRUE) AS migrated_records
FROM orders
UNION ALL
SELECT
  'expenses',
  COUNT(*),
  COUNT(*) FILTER (WHERE amount_eur IS NOT NULL),
  COUNT(*) FILTER (WHERE migrated_to_eur = TRUE)
FROM expenses
UNION ALL
SELECT
  'inventory',
  COUNT(*),
  COUNT(*) FILTER (WHERE purchase_price_eur IS NOT NULL),
  COUNT(*) FILTER (WHERE migrated_to_eur = TRUE)
FROM inventory;
```

**Expected:** All `has_eur_data` and `migrated_records` counts should match `total_records`.

### 1.5 Update Settings Data

Run this query to add EUR configuration to your settings:

```sql
-- Update settings with EUR rate
UPDATE settings
SET data = data || jsonb_build_object(
  'eurRate', 0.92,
  'baseCurrency', 'EUR',
  'conversionRate', 1.95583,
  'legacyUsdRate', data->>'usdRate'
)
WHERE id = 1;

-- Verify settings
SELECT data FROM settings WHERE id = 1;
```

---

## 💻 Step 2: Deploy Code Changes

### 2.1 Pull Latest Changes

The code changes are already committed to branch: `claude/migrate-bgn-to-eur-01WoV2m9TV1b18t8kv5pBank`

### 2.2 Deploy to Production

Since you're using GitHub Pages or a static host:

1. **If using GitHub Pages:**
   ```bash
   git checkout claude/migrate-bgn-to-eur-01WoV2m9TV1b18t8kv5pBank
   git merge main  # merge any recent changes
   git push origin claude/migrate-bgn-to-eur-01WoV2m9TV1b18t8kv5pBank
   ```

2. **If using a different hosting provider:**
   - Upload all files from this branch to your web server
   - Ensure all files in `/js` directory are updated
   - Clear any CDN or browser caches

### 2.3 Clear Browser Caches

**Important:** Users must clear their browser cache to see the new code.

Inform users to:
- Press `Ctrl + Shift + Delete` (or `Cmd + Shift + Delete` on Mac)
- Clear cached images and files
- Or do a hard refresh: `Ctrl + F5` (or `Cmd + Shift + R` on Mac)

---

## 🧪 Step 3: Testing & Verification

### 3.1 Test Historical Data Display

1. Navigate to Orders page
2. View orders from before January 1, 2026
3. **Expected:** Amounts should show as: `1000.00 лв (511.29 €)`

### 3.2 Test New Order Creation

1. Create a new test order
2. Enter amounts (should default to EUR if today's date is after Jan 1, 2026)
3. **Expected:** Amounts stored in EUR, calculations work correctly

### 3.3 Test Settings Configuration

1. Navigate to Settings page
2. Verify you see "USD to EUR Exchange Rate" field
3. Try changing the rate and saving
4. **Expected:** New rate should be saved and applied to calculations

### 3.4 Test Reports

1. Navigate to Reports page
2. Generate monthly reports
3. **Expected:**
   - Historical months show BGN with EUR conversion
   - Recent months show EUR as primary currency
   - Totals calculate correctly

### 3.5 Test Expense Tracking

1. Add a new expense
2. **Expected:** Expense is recorded in EUR (or BGN if before cutoff date)
3. View expenses list
4. **Expected:** All amounts display correctly with proper currency

### 3.6 Test Inventory Management

1. View inventory items
2. Add new item with EUR pricing
3. **Expected:** Prices display in EUR for new items
4. Historical items show both BGN and EUR

---

## 🔄 Step 4: Data Synchronization (If Needed)

If you have data in localStorage that needs to be synced:

### 4.1 Force Supabase Sync

1. Open browser console (F12)
2. Run:
   ```javascript
   // Force reload from Supabase
   await app.modules.orders.syncFromSupabase();
   await app.modules.expenses.syncFromSupabase();
   await app.modules.inventory.syncFromSupabase();
   console.log('✅ Sync complete');
   ```

### 4.2 Verify LocalStorage

```javascript
// Check localStorage data
console.log('Settings:', JSON.parse(localStorage.getItem('orderSystem_settings')));
console.log('Monthly Data:', JSON.parse(localStorage.getItem('orderSystem_monthlyData')));
```

---

## ⚠️ Rollback Procedure (Emergency Only)

If something goes wrong and you need to rollback:

### Database Rollback

1. Open Supabase SQL Editor
2. Open `/migrations/001_bgn_to_eur_migration_ROLLBACK.sql`
3. Copy and paste the entire script
4. Click **Run**
5. Restore settings via application UI

### Code Rollback

```bash
git checkout main
git push origin main --force
```

### Notify Users

Send a message to all users to:
- Clear browser cache
- Refresh the application
- Report any issues

---

## 📊 Post-Deployment Monitoring

### Week 1 After Deployment

- [ ] Monitor error logs in browser console
- [ ] Check Supabase logs for database errors
- [ ] Verify no data corruption in reports
- [ ] Confirm calculations are accurate (spot-check 10+ orders)
- [ ] Ensure new orders are created in EUR correctly

### Week 2-4 After Deployment

- [ ] Gather user feedback
- [ ] Monitor performance (page load times, query speeds)
- [ ] Verify reports spanning pre/post migration periods
- [ ] Check financial totals against external records

---

## 🆘 Troubleshooting

### Issue: EUR fields are NULL in database

**Solution:**
```sql
-- Re-run conversion for specific table
UPDATE orders
SET
  extras_eur = ROUND(extras_bgn / 1.95583, 2),
  sell_eur = ROUND(sell_bgn / 1.95583, 2)
WHERE extras_eur IS NULL OR sell_eur IS NULL;
```

### Issue: Wrong currency displayed in UI

**Cause:** Browser cache or localStorage conflict

**Solution:**
1. Clear browser cache (Ctrl+Shift+Delete)
2. Clear localStorage:
   ```javascript
   localStorage.clear();
   location.reload();
   ```

### Issue: Settings not saving EUR rate

**Cause:** Settings table JSONB structure issue

**Solution:**
```sql
-- Check current settings
SELECT data FROM settings WHERE id = 1;

-- Manually fix if needed
UPDATE settings
SET data = jsonb_build_object(
  'eurRate', 0.92,
  'baseCurrency', 'EUR',
  'conversionRate', 1.95583,
  'usdRate', 1.71,
  'factoryShipping', 1.5,
  'origins', (data->'origins'),
  'vendors', (data->'vendors')
)
WHERE id = 1;
```

### Issue: Calculation errors in totals

**Cause:** Rounding inconsistencies or wrong conversion rate

**Solution:**
1. Verify official rate is used (1.95583)
2. Check CurrencyUtils.js is imported correctly
3. Console log calculations for debugging:
   ```javascript
   console.log('BGN:', amount, 'EUR:', CurrencyUtils.convertBGNtoEUR(amount));
   ```

---

## 📞 Support & Questions

### Common Questions

**Q: Will historical data be lost?**
A: No, all BGN values are preserved. EUR values are calculated and stored alongside BGN.

**Q: Can I still see amounts in BGN?**
A: Yes, historical transactions (before Jan 1, 2026) display both BGN and EUR.

**Q: What if I need to revert back to BGN?**
A: Use the rollback script, but note that any EUR-only data entered after migration will be lost.

**Q: How do I change the USD→EUR exchange rate?**
A: Go to Settings page, update "USD to EUR Exchange Rate" field, click Save.

**Q: Will reports still work correctly?**
A: Yes, reports will show mixed currencies for transition periods with proper conversions.

---

## ✅ Migration Complete Checklist

Final verification before considering migration complete:

- [ ] Database migration executed successfully
- [ ] All tables have EUR columns populated
- [ ] Settings updated with EUR configuration
- [ ] Code deployed and accessible
- [ ] Users instructed to clear caches
- [ ] Historical data displays correctly (BGN with EUR conversion)
- [ ] New data creates in EUR
- [ ] Settings page allows EUR rate configuration
- [ ] Reports calculate correctly
- [ ] No console errors in browser
- [ ] Backup verified and stored safely
- [ ] Rollback script tested (in dev environment if available)
- [ ] Users notified of changes and new features

---

## 📝 Maintenance Notes

### Regular Updates

- **Monthly:** Review and update USD→EUR exchange rate if needed
- **Quarterly:** Verify conversion accuracy in reports
- **Annually:** Archive old BGN data if desired (keep for 7+ years for audit compliance)

### After January 1, 2026

- System will automatically use EUR as primary currency for all new transactions
- Historical BGN data will continue to display with EUR conversion notation
- No further action required unless exchange rates change significantly

---

## 🎉 Success!

If all checklist items are complete and tests pass, your migration is successful!

Your system is now fully prepared for Bulgaria's euro adoption on January 1, 2026.

**Official References:**
- [EU Council Press Release](https://www.consilium.europa.eu/en/press/press-releases/2025/07/08/bulgaria-ready-to-use-the-euro-from-1-january-2026-council-takes-final-steps/)
- [Official Bulgaria Euro Website](https://evroto.bg/en)
- Conversion Rate: 1 EUR = 1.95583 BGN (Fixed by EU Law)

---

*Last Updated: 2025-12-03*
*Migration Version: 001*
