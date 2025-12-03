/**
 * Browser Console Script: Fix Default Expenses
 * ==============================================
 * Run this in your browser console to fix default expenses with old BGN values
 *
 * Usage:
 * 1. Open browser console (F12)
 * 2. Copy and paste this entire file
 * 3. Run: await fixDefaultExpenses()
 */

const OFFICIAL_RATE = 1.95583;

const CORRECT_DEFAULT_EXPENSES = [
    { name: 'IG Campaign', correctEUR: 1534.29, originalBGN: 3000 },
    { name: 'Assurance', correctEUR: 301.65, originalBGN: 590 },
    { name: 'Fiverr', correctEUR: 270.98, originalBGN: 530 },
    { name: 'Ltd.', correctEUR: 235.23, originalBGN: 460 },
    { name: 'OLX BG', correctEUR: 46.02, originalBGN: 90 },
    { name: 'OLX RO', correctEUR: 102.27, originalBGN: 200 },
    { name: 'SmugMug', correctEUR: 23.01, originalBGN: 45 },
    { name: 'ChatGPT', correctEUR: 17.90, originalBGN: 35 },
    { name: 'Revolut', correctEUR: 7.67, originalBGN: 15 },
    { name: 'A1', correctEUR: 5.11, originalBGN: 10 },
    { name: 'Buffer', correctEUR: 5.11, originalBGN: 10 },
    { name: 'Bazar', correctEUR: 12.78, originalBGN: 25 },
    { name: 'Claude', correctEUR: 15.34, originalBGN: 30 }
];

async function fixDefaultExpenses() {
    console.log('='.repeat(70));
    console.log('FIXING DEFAULT EXPENSES');
    console.log('Date:', new Date().toLocaleString());
    console.log('='.repeat(70));
    console.log('');

    const results = {
        checked: 0,
        needsUpdate: 0,
        updated: 0,
        errors: 0,
        details: []
    };

    try {
        // Get current month
        const currentMonth = window.app?.state?.get('currentMonth');
        if (!currentMonth) {
            console.error('❌ Cannot determine current month. Make sure app is loaded.');
            return;
        }

        console.log(`📅 Checking expenses for: ${currentMonth}`);
        console.log('');

        // Get expenses module
        const expensesModule = window.app?.modules?.expenses;
        if (!expensesModule) {
            console.error('❌ ExpensesModule not available. Make sure app is loaded.');
            return;
        }

        // Get all expenses for current month
        const expenses = await expensesModule.getExpenses(currentMonth);
        console.log(`📊 Found ${expenses.length} total expenses`);
        console.log('');

        // Check each default expense
        for (const defaultExp of CORRECT_DEFAULT_EXPENSES) {
            results.checked++;

            // Find this expense in current month
            const expense = expenses.find(e => e.name === defaultExp.name);

            if (!expense) {
                console.log(`ℹ️  ${defaultExp.name}: Not found in current month (will be created automatically)`);
                continue;
            }

            const currentAmount = parseFloat(expense.amount) || 0;
            const expectedEUR = defaultExp.correctEUR;

            // Check if value is incorrect (BGN shown as EUR)
            const isUnconverted = Math.abs(currentAmount - defaultExp.originalBGN) < 1 && defaultExp.originalBGN > 10;
            const isIncorrect = Math.abs(currentAmount - expectedEUR) / expectedEUR > 0.02;

            if (isUnconverted || isIncorrect) {
                results.needsUpdate++;

                console.log(`⚠️  ${defaultExp.name}:`);
                console.log(`   Current: ${currentAmount.toFixed(2)} €`);
                console.log(`   Should be: ${expectedEUR.toFixed(2)} €`);
                console.log(`   Issue: ${isUnconverted ? 'BGN value shown as EUR (no conversion)' : 'Incorrect EUR value'}`);

                try {
                    // Update the expense
                    await expensesModule.updateExpense(expense.id, {
                        ...expense,
                        amount: expectedEUR,
                        currency: 'EUR'
                    });

                    results.updated++;
                    console.log(`   ✅ Fixed!`);

                    results.details.push({
                        name: defaultExp.name,
                        before: currentAmount.toFixed(2),
                        after: expectedEUR.toFixed(2),
                        status: '✅ Fixed'
                    });
                } catch (error) {
                    results.errors++;
                    console.error(`   ❌ Failed to update: ${error.message}`);

                    results.details.push({
                        name: defaultExp.name,
                        before: currentAmount.toFixed(2),
                        after: expectedEUR.toFixed(2),
                        status: '❌ Error',
                        error: error.message
                    });
                }
            } else {
                console.log(`✅ ${defaultExp.name}: Already correct (${currentAmount.toFixed(2)} €)`);

                results.details.push({
                    name: defaultExp.name,
                    value: currentAmount.toFixed(2),
                    status: '✅ Already correct'
                });
            }
        }

        // Print summary
        console.log('');
        console.log('='.repeat(70));
        console.log('SUMMARY');
        console.log('='.repeat(70));
        console.log(`Total checked: ${results.checked}`);
        console.log(`Needed update: ${results.needsUpdate}`);
        console.log(`Successfully updated: ${results.updated}`);
        console.log(`Errors: ${results.errors}`);
        console.log('');

        if (results.updated > 0) {
            console.log('✅ Updated expenses:');
            console.table(results.details.filter(d => d.status === '✅ Fixed'));
        }

        if (results.errors > 0) {
            console.log('❌ Errors:');
            console.table(results.details.filter(d => d.status === '❌ Error'));
        }

        console.log('');
        console.log('='.repeat(70));
        console.log('NEXT STEPS');
        console.log('='.repeat(70));

        if (results.updated > 0) {
            console.log('1. Refresh the page to see updated values');
            console.log('2. Check the Expenses page - values should now be correct');
            console.log('');
            console.log('Example fixes:');
            console.log('  - IG Campaign: Now shows 1,534.29 € (was 3,000 €) ✅');
            console.log('  - ChatGPT: Now shows 17.90 € (was 35 €) ✅');
        } else if (results.needsUpdate === 0) {
            console.log('✅ All default expenses are already correct!');
            console.log('No action needed.');
        }

        console.log('');
        console.log('='.repeat(70));

        return results;

    } catch (error) {
        console.error('❌ Failed to fix default expenses:', error);
        console.error(error.stack);
        return null;
    }
}

console.log('✅ Default expenses fix tool loaded!');
console.log('');
console.log('Run: await fixDefaultExpenses()');
console.log('');
