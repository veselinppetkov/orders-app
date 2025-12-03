/**
 * Currency Conversion Verification Tool
 * =======================================
 * Run this in browser console to verify EUR conversion accuracy
 *
 * Usage:
 * 1. Open your application in the browser
 * 2. Open Developer Console (F12)
 * 3. Copy and paste this entire file
 * 4. Run: await verifyCurrencyConversion()
 */

const OFFICIAL_RATE = 1.95583;
const TOLERANCE = 0.02; // 2% tolerance

async function verifyCurrencyConversion() {
    console.log('='.repeat(60));
    console.log('EUR CONVERSION VERIFICATION REPORT');
    console.log('Date:', new Date().toLocaleString());
    console.log('Official Rate: 1 EUR = 1.95583 BGN');
    console.log('='.repeat(60));
    console.log('');

    const results = {
        orders: { total: 0, suspicious: 0, missing: 0, correct: 0 },
        financial: { totalRevenueBGN: 0, totalRevenueEUR: 0, expectedRevenueEUR: 0 },
        issues: []
    };

    try {
        // Get all orders
        const ordersModule = window.app?.modules?.orders;
        if (!ordersModule) {
            console.error('❌ OrdersModule not available');
            return;
        }

        const allOrders = await ordersModule.getAllOrders();
        results.orders.total = allOrders.length;

        console.log(`📊 Total Orders: ${allOrders.length}`);
        console.log('');

        // Analyze each order
        console.log('🔍 Analyzing orders...');
        console.log('');

        allOrders.forEach((order, index) => {
            const sellBGN = order.sellBGN || 0;
            const sellEUR = order.sellEUR || 0;
            const extrasBGN = order.extrasBGN || 0;
            const extrasEUR = order.extrasEUR || 0;

            // Check for missing EUR values
            if (sellBGN > 0 && sellEUR === 0) {
                results.orders.missing++;
                results.issues.push({
                    type: 'MISSING_EUR',
                    order: order.id,
                    client: order.client,
                    date: order.date,
                    sellBGN,
                    sellEUR: 'MISSING',
                    expectedEUR: (sellBGN / OFFICIAL_RATE).toFixed(2)
                });
            }

            // Check for suspicious EUR values (EUR ≈ BGN)
            if (sellBGN > 100 && sellEUR > 0 && Math.abs(sellEUR - sellBGN) < 1) {
                results.orders.suspicious++;
                results.issues.push({
                    type: 'SUSPICIOUS_UNCONVERTED',
                    order: order.id,
                    client: order.client,
                    date: order.date,
                    sellBGN,
                    sellEUR,
                    expectedEUR: (sellBGN / OFFICIAL_RATE).toFixed(2),
                    issue: `EUR value (${sellEUR}) is too close to BGN value (${sellBGN}) - likely not converted`
                });
            }

            // Check for significant deviation
            if (sellBGN > 0 && sellEUR > 0) {
                const expectedEUR = sellBGN / OFFICIAL_RATE;
                const deviation = Math.abs(sellEUR - expectedEUR) / expectedEUR;

                if (deviation > TOLERANCE) {
                    results.issues.push({
                        type: 'DEVIATION',
                        order: order.id,
                        client: order.client,
                        date: order.date,
                        sellBGN,
                        sellEUR,
                        expectedEUR: expectedEUR.toFixed(2),
                        deviation: (deviation * 100).toFixed(2) + '%'
                    });
                } else {
                    results.orders.correct++;
                }
            }

            // Accumulate totals
            results.financial.totalRevenueBGN += sellBGN;
            results.financial.totalRevenueEUR += sellEUR;
        });

        results.financial.expectedRevenueEUR = results.financial.totalRevenueBGN / OFFICIAL_RATE;

        // Print summary
        console.log('📈 SUMMARY');
        console.log('-'.repeat(60));
        console.log(`Total Orders: ${results.orders.total}`);
        console.log(`✅ Correct Conversions: ${results.orders.correct}`);
        console.log(`⚠️ Suspicious (Unconverted): ${results.orders.suspicious}`);
        console.log(`❌ Missing EUR Values: ${results.orders.missing}`);
        console.log('');

        // Print financial comparison
        console.log('💰 FINANCIAL SUMMARY');
        console.log('-'.repeat(60));
        console.log(`Total Revenue (BGN): ${results.financial.totalRevenueBGN.toFixed(2)} лв`);
        console.log(`Total Revenue (EUR - stored): ${results.financial.totalRevenueEUR.toFixed(2)} €`);
        console.log(`Total Revenue (EUR - expected): ${results.financial.expectedRevenueEUR.toFixed(2)} €`);

        const financialDeviation = Math.abs(
            results.financial.totalRevenueEUR - results.financial.expectedRevenueEUR
        ) / results.financial.expectedRevenueEUR * 100;

        console.log(`Deviation: ${financialDeviation.toFixed(4)}%`);
        console.log('');

        if (financialDeviation > 1) {
            console.error('🚨 CRITICAL: Financial deviation exceeds 1%!');
            console.error('   This indicates significant currency conversion issues.');
            console.error('   Review the issues below and run the database fix scripts.');
        } else {
            console.log('✅ Financial deviation is within acceptable range.');
        }
        console.log('');

        // Print issues
        if (results.issues.length > 0) {
            console.log('⚠️ ISSUES FOUND');
            console.log('-'.repeat(60));
            console.log(`Total Issues: ${results.issues.length}`);
            console.log('');

            // Group issues by type
            const issuesByType = results.issues.reduce((acc, issue) => {
                if (!acc[issue.type]) acc[issue.type] = [];
                acc[issue.type].push(issue);
                return acc;
            }, {});

            Object.entries(issuesByType).forEach(([type, issues]) => {
                console.log(`\n${type}: ${issues.length} issues`);
                console.table(issues.slice(0, 10)); // Show first 10
                if (issues.length > 10) {
                    console.log(`... and ${issues.length - 10} more`);
                }
            });
        } else {
            console.log('✅ No issues found! All conversions look correct.');
        }

        console.log('');
        console.log('='.repeat(60));
        console.log('VERIFICATION COMPLETE');
        console.log('='.repeat(60));

        // Recommendations
        if (results.orders.suspicious > 0 || results.orders.missing > 0) {
            console.log('');
            console.log('📋 RECOMMENDATIONS:');
            console.log('');
            console.log('1. Run the database migration script if not already done:');
            console.log('   migrations/001_bgn_to_eur_migration.sql');
            console.log('');
            console.log('2. Or run the verification SQL script to identify and fix issues:');
            console.log('   migrations/verify_eur_conversion.sql');
            console.log('');
            console.log('3. If EUR columns exist but contain wrong values, run the fix UPDATE queries.');
            console.log('');
            console.log('4. After fixes, refresh the page and run this verification again.');
        }

        return results;

    } catch (error) {
        console.error('❌ Verification failed:', error);
        console.error(error.stack);
        return null;
    }
}

// Sample conversion examples
function showConversionExamples() {
    console.log('💡 CONVERSION EXAMPLES');
    console.log('-'.repeat(60));
    console.log('Official Rate: 1 EUR = 1.95583 BGN');
    console.log('');

    const examples = [
        { bgn: 6000, eur: 6000 / 1.95583 },
        { bgn: 1000, eur: 1000 / 1.95583 },
        { bgn: 500, eur: 500 / 1.95583 },
        { bgn: 195.583, eur: 195.583 / 1.95583 }
    ];

    console.table(examples.map(ex => ({
        'BGN': ex.bgn.toFixed(2) + ' лв',
        'EUR (correct)': ex.eur.toFixed(2) + ' €',
        'EUR (WRONG - unconverted)': ex.bgn.toFixed(2) + ' € ❌'
    })));

    console.log('');
    console.log('Note: If you see 6,000 BGN displayed as 6,000 EUR, conversion was NOT applied!');
    console.log('      Correct value should be: 3,067.64 EUR');
}

console.log('✅ Currency verification tool loaded!');
console.log('');
console.log('Run: await verifyCurrencyConversion()');
console.log('Or: showConversionExamples()');
console.log('');
