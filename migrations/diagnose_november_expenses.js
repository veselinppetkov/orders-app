// Diagnostic script to identify problematic expenses in November 2024
// Run this in the browser console when viewing November

async function diagnoseNovemberExpenses() {
    console.group('🔍 NOVEMBER EXPENSES DIAGNOSTIC');

    try {
        const supabase = window.app.services.supabase;

        // Check what month we're viewing
        const currentMonth = window.app.state.get('currentMonth');
        console.log('Current month:', currentMonth);

        // Get November expenses from Supabase
        console.log('\n📊 Querying Supabase for November expenses...');
        const { data: novemberExpenses, error } = await supabase.supabase
            .from('expenses')
            .select('*')
            .eq('month_key', '2024-11')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('❌ Supabase query failed:', error);
            return;
        }

        console.log(`✅ Found ${novemberExpenses.length} expenses in Supabase for November 2024`);

        // Analyze each expense
        console.log('\n📋 Analyzing each expense:');
        console.log('─'.repeat(80));

        const issues = [];

        novemberExpenses.forEach((exp, index) => {
            console.log(`\n${index + 1}. Expense ID: ${exp.id}`);
            console.log(`   Name: ${exp.name || '❌ MISSING'}`);
            console.log(`   Amount (BGN): ${exp.amount}`);
            console.log(`   Amount (EUR): ${exp.amount_eur}`);
            console.log(`   Note: ${exp.note || '(empty)'}`);
            console.log(`   Currency: ${exp.currency || 'not set'}`);
            console.log(`   Is Default: ${exp.is_default || false}`);
            console.log(`   Month Key: ${exp.month_key}`);
            console.log(`   Created: ${exp.created_at}`);

            // Check for issues
            const expIssues = [];

            if (!exp.name) {
                expIssues.push('Missing name');
            }

            if (exp.amount === null || exp.amount === undefined) {
                expIssues.push('Missing amount (BGN)');
            }

            if (exp.amount_eur === null || exp.amount_eur === undefined) {
                expIssues.push('Missing amount_eur');
            }

            if (isNaN(parseFloat(exp.amount))) {
                expIssues.push('Invalid amount (not a number)');
            }

            if (isNaN(parseFloat(exp.amount_eur))) {
                expIssues.push('Invalid amount_eur (not a number)');
            }

            // Check if EUR value looks unconverted (too close to BGN)
            const amountBGN = parseFloat(exp.amount) || 0;
            const amountEUR = parseFloat(exp.amount_eur) || 0;
            if (amountBGN > 50 && Math.abs(amountEUR - amountBGN) < 1) {
                expIssues.push(`⚠️ Unconverted: ${amountEUR} EUR ≈ ${amountBGN} BGN (should be ${(amountBGN / 1.95583).toFixed(2)} EUR)`);
            }

            if (expIssues.length > 0) {
                console.log(`   ⚠️ ISSUES: ${expIssues.join(', ')}`);
                issues.push({
                    id: exp.id,
                    name: exp.name,
                    issues: expIssues
                });
            } else {
                console.log('   ✅ No issues detected');
            }
        });

        console.log('\n' + '─'.repeat(80));

        // Summary
        if (issues.length > 0) {
            console.log('\n⚠️ FOUND ISSUES:');
            issues.forEach(issue => {
                console.log(`   - Expense #${issue.id} (${issue.name || 'unnamed'}): ${issue.issues.join(', ')}`);
            });

            console.log('\n📝 Recommended Actions:');
            console.log('1. Fix missing/invalid data in Supabase');
            console.log('2. Run the EUR conversion fix script if unconverted values detected');
            console.log('3. Or delete problematic expenses and restore defaults');
        } else {
            console.log('\n✅ All November expenses look good!');
            console.log('The issue might be in localStorage or the transform logic.');
        }

        // Check localStorage
        console.log('\n📦 Checking localStorage for November...');
        const monthlyData = window.app.state.get('monthlyData') || {};
        const localNovember = monthlyData['2024-11'];

        if (localNovember && localNovember.expenses) {
            console.log(`Found ${localNovember.expenses.length} expenses in localStorage`);

            localNovember.expenses.forEach((exp, index) => {
                if (!exp.amount || exp.amount === null || exp.amount === undefined || isNaN(exp.amount)) {
                    console.error(`❌ Invalid expense in localStorage [${index}]:`, exp);
                }
            });
        } else {
            console.log('No November data in localStorage');
        }

        console.log('\n🔧 Quick Fixes:');
        console.log('');
        console.log('// Clear November from localStorage:');
        console.log('delete window.app.state.get("monthlyData")["2024-11"]; window.app.ui.currentView.refresh();');
        console.log('');
        console.log('// Restore November defaults:');
        console.log('document.getElementById("reset-expenses-btn").click();');

    } catch (error) {
        console.error('❌ Diagnostic failed:', error);
        console.error(error.stack);
    }

    console.groupEnd();
}

// Run automatically
console.log('🔍 Running November expense diagnostic...');
diagnoseNovemberExpenses();
