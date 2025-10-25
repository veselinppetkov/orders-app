// js/utils/ExpensesMigration.js - SAFE MIGRATION FROM LOCALSTORAGE TO SUPABASE

export class ExpensesMigration {
    constructor(supabaseService, storageService, stateManager) {
        this.supabase = supabaseService;
        this.storage = storageService;
        this.state = stateManager;

        this.stats = {
            totalExpenses: 0,
            migrated: 0,
            skipped: 0,
            failed: 0,
            startTime: null,
            endTime: null,
            errors: []
        };
    }

    // STEP 1: Analyze what needs to be migrated
    async analyzeLocalExpenses() {
        console.log('🔍 Analyzing localStorage expenses...');

        const monthlyData = this.state.get('monthlyData') || {};
        const analysis = {
            months: [],
            totalExpenses: 0,
            expensesByMonth: {},
            uniqueNames: new Set(),
            defaultExpenses: 0,
            customExpenses: 0
        };

        for (const [month, data] of Object.entries(monthlyData)) {
            if (data.expenses && Array.isArray(data.expenses)) {
                const expenses = data.expenses;

                analysis.months.push(month);
                analysis.expensesByMonth[month] = expenses.length;
                analysis.totalExpenses += expenses.length;

                expenses.forEach(exp => {
                    analysis.uniqueNames.add(exp.name);
                    if (exp.isDefault) {
                        analysis.defaultExpenses++;
                    } else {
                        analysis.customExpenses++;
                    }
                });
            }
        }

        analysis.uniqueNames = Array.from(analysis.uniqueNames);

        console.log('📊 Analysis Results:');
        console.log(`  • Total months with expenses: ${analysis.months.length}`);
        console.log(`  • Total expenses found: ${analysis.totalExpenses}`);
        console.log(`  • Default expenses: ${analysis.defaultExpenses}`);
        console.log(`  • Custom expenses: ${analysis.customExpenses}`);
        console.log(`  • Unique expense names: ${analysis.uniqueNames.length}`);

        return analysis;
    }

    // STEP 2: Check what's already in Supabase
    async checkSupabaseExpenses() {
        console.log('🔍 Checking existing Supabase expenses...');

        try {
            // Get all expenses from Supabase (no month filter)
            const supabaseExpenses = await this.supabase.getExpenses();

            console.log(`📊 Found ${supabaseExpenses.length} expenses in Supabase`);

            // Group by month for comparison
            const byMonth = {};
            supabaseExpenses.forEach(exp => {
                if (!byMonth[exp.month]) {
                    byMonth[exp.month] = [];
                }
                byMonth[exp.month].push(exp);
            });

            return {
                total: supabaseExpenses.length,
                byMonth,
                expenses: supabaseExpenses
            };

        } catch (error) {
            console.warn('⚠️ Could not check Supabase expenses:', error.message);
            return { total: 0, byMonth: {}, expenses: [] };
        }
    }

    // STEP 3: Create backup before migration
    async createBackup() {
        console.log('💾 Creating backup...');

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const monthlyData = this.state.get('monthlyData') || {};

        const backup = {
            timestamp,
            monthlyData: JSON.parse(JSON.stringify(monthlyData)), // Deep copy
            stats: {
                months: Object.keys(monthlyData).length,
                totalExpenses: Object.values(monthlyData).reduce((sum, data) =>
                    sum + (data.expenses?.length || 0), 0)
            }
        };

        // Save to localStorage with special key
        const backupKey = `expenses_migration_backup_${timestamp}`;
        localStorage.setItem(backupKey, JSON.stringify(backup));

        console.log(`✅ Backup created: ${backupKey}`);
        console.log(`   • Months: ${backup.stats.months}`);
        console.log(`   • Expenses: ${backup.stats.totalExpenses}`);

        return backupKey;
    }

    // STEP 4: Migrate expenses with deduplication
    async migrateExpenses(options = {}) {
        const {
            skipExisting = true,  // Skip if expense with same name+month+amount exists
            dryRun = false,       // Don't actually insert, just simulate
            batchSize = 10,       // Insert in batches to avoid rate limits
            onProgress = null     // Callback for progress updates
        } = options;

        console.log('🚀 Starting expenses migration...');
        console.log(`   • Dry run: ${dryRun}`);
        console.log(`   • Skip existing: ${skipExisting}`);
        console.log(`   • Batch size: ${batchSize}`);

        this.stats.startTime = Date.now();

        // Get data
        const monthlyData = this.state.get('monthlyData') || {};
        const supabaseData = await this.checkSupabaseExpenses();

        // Collect all expenses to migrate
        const toMigrate = [];

        for (const [month, data] of Object.entries(monthlyData)) {
            if (data.expenses && Array.isArray(data.expenses)) {
                for (const expense of data.expenses) {
                    // Check if already exists in Supabase
                    const exists = skipExisting && this.expenseExists(
                        expense,
                        month,
                        supabaseData.byMonth[month] || []
                    );

                    if (exists) {
                        this.stats.skipped++;
                        console.log(`⏭️ Skipping existing: ${expense.name} (${month})`);
                    } else {
                        toMigrate.push({
                            month,
                            expense
                        });
                    }
                }
            }
        }

        this.stats.totalExpenses = toMigrate.length + this.stats.skipped;

        console.log(`📦 Found ${toMigrate.length} expenses to migrate`);

        if (toMigrate.length === 0) {
            console.log('✅ Nothing to migrate!');
            return this.stats;
        }

        // Migrate in batches
        for (let i = 0; i < toMigrate.length; i += batchSize) {
            const batch = toMigrate.slice(i, i + batchSize);

            console.log(`📦 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(toMigrate.length / batchSize)}`);

            await this.migrateBatch(batch, dryRun);

            // Progress callback
            if (onProgress) {
                onProgress({
                    current: Math.min(i + batchSize, toMigrate.length),
                    total: toMigrate.length,
                    stats: { ...this.stats }
                });
            }

            // Small delay to avoid rate limits
            if (i + batchSize < toMigrate.length) {
                await this.delay(500);
            }
        }

        this.stats.endTime = Date.now();
        const duration = ((this.stats.endTime - this.stats.startTime) / 1000).toFixed(1);

        console.log('✅ Migration completed!');
        console.log(`   • Duration: ${duration}s`);
        console.log(`   • Total: ${this.stats.totalExpenses}`);
        console.log(`   • Migrated: ${this.stats.migrated}`);
        console.log(`   • Skipped: ${this.stats.skipped}`);
        console.log(`   • Failed: ${this.stats.failed}`);

        if (this.stats.errors.length > 0) {
            console.warn('⚠️ Errors:', this.stats.errors);
        }

        return this.stats;
    }

    async migrateBatch(batch, dryRun) {
        for (const { month, expense } of batch) {
            try {
                if (dryRun) {
                    console.log(`[DRY RUN] Would migrate: ${expense.name} (${month}) - ${expense.amount} лв`);
                    this.stats.migrated++;
                } else {
                    // Transform to Supabase format
                    const expenseData = {
                        month,
                        name: expense.name || expense.category, // Support both field names
                        amount: parseFloat(expense.amount) || 0,
                        note: expense.note || expense.description || '',
                        isDefault: expense.isDefault || false
                    };

                    // Insert via SupabaseService
                    await this.supabase.createExpense(expenseData);

                    this.stats.migrated++;
                    console.log(`✅ Migrated: ${expense.name} (${month})`);
                }

            } catch (error) {
                this.stats.failed++;
                this.stats.errors.push({
                    month,
                    expense: expense.name,
                    error: error.message
                });
                console.error(`❌ Failed to migrate ${expense.name} (${month}):`, error.message);
            }
        }
    }

    expenseExists(localExpense, month, supabaseExpenses) {
        // Check if expense with same name, month, and amount exists
        return supabaseExpenses.some(supExp =>
            supExp.name === localExpense.name &&
            Math.abs(parseFloat(supExp.amount) - parseFloat(localExpense.amount)) < 0.01
        );
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // STEP 5: Verify migration
    async verifyMigration() {
        console.log('🔍 Verifying migration...');

        const localAnalysis = await this.analyzeLocalExpenses();
        const supabaseData = await this.checkSupabaseExpenses();

        const verification = {
            localTotal: localAnalysis.totalExpenses,
            supabaseTotal: supabaseData.total,
            match: localAnalysis.totalExpenses === supabaseData.total,
            monthComparison: {}
        };

        // Compare each month
        for (const month of localAnalysis.months) {
            const localCount = localAnalysis.expensesByMonth[month];
            const supabaseCount = (supabaseData.byMonth[month] || []).length;

            verification.monthComparison[month] = {
                local: localCount,
                supabase: supabaseCount,
                match: localCount === supabaseCount
            };
        }

        console.log('📊 Verification Results:');
        console.log(`   • Local expenses: ${verification.localTotal}`);
        console.log(`   • Supabase expenses: ${verification.supabaseTotal}`);
        console.log(`   • Match: ${verification.match ? '✅' : '❌'}`);

        // Show month-by-month comparison
        for (const [month, comp] of Object.entries(verification.monthComparison)) {
            const status = comp.match ? '✅' : '⚠️';
            console.log(`   ${status} ${month}: Local=${comp.local}, Supabase=${comp.supabase}`);
        }

        return verification;
    }

    // STEP 6: Restore from backup (if needed)
    async restoreFromBackup(backupKey) {
        console.log(`🔄 Restoring from backup: ${backupKey}`);

        try {
            const backupData = localStorage.getItem(backupKey);
            if (!backupData) {
                throw new Error('Backup not found');
            }

            const backup = JSON.parse(backupData);

            // Restore monthlyData
            this.storage.save('monthlyData', backup.monthlyData);
            this.state.set('monthlyData', backup.monthlyData);

            console.log('✅ Backup restored successfully');
            console.log(`   • Months: ${backup.stats.months}`);
            console.log(`   • Expenses: ${backup.stats.totalExpenses}`);

            return true;

        } catch (error) {
            console.error('❌ Restore failed:', error);
            throw error;
        }
    }

    // List available backups
    listBackups() {
        const backups = [];

        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('expenses_migration_backup_')) {
                try {
                    const data = JSON.parse(localStorage.getItem(key));
                    backups.push({
                        key,
                        timestamp: data.timestamp,
                        stats: data.stats
                    });
                } catch (error) {
                    console.warn(`⚠️ Invalid backup: ${key}`);
                }
            }
        }

        return backups.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    }

    // Generate migration report
    generateReport() {
        const duration = this.stats.endTime && this.stats.startTime
            ? ((this.stats.endTime - this.stats.startTime) / 1000).toFixed(1)
            : 'N/A';

        return {
            summary: {
                total: this.stats.totalExpenses,
                migrated: this.stats.migrated,
                skipped: this.stats.skipped,
                failed: this.stats.failed,
                duration: `${duration}s`
            },
            errors: this.stats.errors,
            successRate: this.stats.totalExpenses > 0
                ? ((this.stats.migrated / this.stats.totalExpenses) * 100).toFixed(1)
                : 0
        };
    }
}