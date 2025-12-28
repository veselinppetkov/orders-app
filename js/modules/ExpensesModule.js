// js/modules/ExpensesModule.js - COMPLETE REWRITE WITH SUPABASE INTEGRATION

import { CurrencyUtils } from '../utils/CurrencyUtils.js';

export class ExpensesModule {
    constructor(state, storage, eventBus, supabase) {
        this.state = state;
        this.storage = storage;
        this.eventBus = eventBus;
        this.supabase = supabase;

        this.defaultExpensesHistory = [
            {
                effectiveFrom: '2025-09',
                expenses: [
                    { name: 'IG Campaign', amount: 1534.29, note: 'Instagram реклама кампания', isDefault: true, currency: 'EUR' },
                    { name: 'Assurance', amount: 301.65, note: 'Застраховка', isDefault: true, currency: 'EUR' },
                    { name: 'Fiverr', amount: 270.98, note: 'Freelance услуги', isDefault: true, currency: 'EUR' },
                    { name: 'Ltd.', amount: 235.23, note: 'Фирмени разходи', isDefault: true, currency: 'EUR' },
                    { name: 'OLX BG', amount: 46.02, note: 'OLX България такси', isDefault: true, currency: 'EUR' },
                    { name: 'OLX RO', amount: 102.27, note: 'OLX Румъния такси', isDefault: true, currency: 'EUR' },
                    { name: 'SmugMug', amount: 23.01, note: 'Хостинг за снимки', isDefault: true, currency: 'EUR' },
                    { name: 'ChatGPT', amount: 17.90, note: 'AI асистент', isDefault: true, currency: 'EUR' },
                    { name: 'Revolut', amount: 7.67, note: 'Банкови такси', isDefault: true, currency: 'EUR' },
                    { name: 'A1', amount: 5.11, note: 'Мобилен оператор', isDefault: true, currency: 'EUR' },
                    { name: 'Buffer', amount: 5.11, note: 'Social media management', isDefault: true, currency: 'EUR' },
                    { name: 'Bazar', amount: 12.78, note: 'Обяви', isDefault: true, currency: 'EUR' },
                    { name: 'Claude', amount: 15.34, note: 'Обяви', isDefault: true, currency: 'EUR' },
                ]
            },

            // Version 2: Add future price changes here
            // Uncomment and edit when prices change:
            // {
            //     effectiveFrom: '2026-01',  // Effective from January 2026
            //     expenses: [
            //         { name: 'IG Campaign', amount: 1534.29, note: 'Instagram реклама кампания', isDefault: true, currency: 'EUR' },
            //         { name: 'Assurance', amount: 301.65, note: 'Застраховка', isDefault: true, currency: 'EUR' },
            //         { name: 'Fiverr', amount: 270.98, note: 'Freelance услуги', isDefault: true, currency: 'EUR' },
            //         { name: 'Ltd.', amount: 235.23, note: 'Фирмени разходи', isDefault: true, currency: 'EUR' },
            //         { name: 'OLX BG', amount: 46.02, note: 'OLX България такси', isDefault: true, currency: 'EUR' },
            //         { name: 'OLX RO', amount: 102.27, note: 'OLX Румъния такси', isDefault: true, currency: 'EUR' },
            //         { name: 'SmugMug', amount: 23.01, note: 'Хостинг за снимки', isDefault: true, currency: 'EUR' },
            //         { name: 'ChatGPT', amount: 20.00, note: 'AI асистент', isDefault: true, currency: 'EUR' },  // PRICE INCREASED
            //         { name: 'Revolut', amount: 7.67, note: 'Банкови такси', isDefault: true, currency: 'EUR' },
            //         { name: 'A1', amount: 5.11, note: 'Мобилен оператор', isDefault: true, currency: 'EUR' },
            //         { name: 'Buffer', amount: 5.11, note: 'Social media management', isDefault: true, currency: 'EUR' },
            //         { name: 'Bazar', amount: 12.78, note: 'Обяви', isDefault: true, currency: 'EUR' },
            //         { name: 'Claude', amount: 15.34, note: 'Обяви', isDefault: true, currency: 'EUR' },
            //     ]
            // },
        // Default expense templates (EUR only)
        this.defaultExpenses = [
            { name: 'IG Campaign', amount: 1535, note: 'Instagram реклама кампания', isDefault: true, currency: 'EUR' },
            { name: 'Assurance', amount: 300, note: 'Застраховка', isDefault: true, currency: 'EUR' },
            { name: 'Fiverr', amount: 270, note: 'Freelance услуги', isDefault: true, currency: 'EUR' },
            { name: 'Ltd.', amount: 235, note: 'Фирмени разходи', isDefault: true, currency: 'EUR' },
            { name: 'OLX BG', amount: 100, note: 'OLX България такси', isDefault: true, currency: 'EUR' },
            { name: 'OLX RO', amount: 100, note: 'OLX Румъния такси', isDefault: true, currency: 'EUR' },
            { name: 'SmugMug', amount: 25, note: 'Хостинг за снимки', isDefault: true, currency: 'EUR' },
            { name: 'ChatGPT', amount: 20, note: 'AI асистент', isDefault: true, currency: 'EUR' },
            { name: 'Revolut', amount: 10, note: 'Банкови такси', isDefault: true, currency: 'EUR' },
            { name: 'A1', amount: 10, note: 'Мобилен оператор', isDefault: true, currency: 'EUR' },
            { name: 'Buffer', amount: 5, note: 'Social media management', isDefault: true, currency: 'EUR' },
            { name: 'Bazar', amount: 15, note: 'Обяви', isDefault: true, currency: 'EUR' },
            { name: 'Claude', amount: 15, note: 'Обяви', isDefault: true, currency: 'EUR' },
        ];

        // Operation tracking
        this.pendingOperations = new Set();
        this.nextCustomId = 1000; // Fallback IDs for localStorage-only expenses

        // Statistics
        this.stats = {
            totalOperations: 0,
            supabaseOperations: 0,
            monthsInitialized: 0,
            defaultExpensesAdded: 0,
            customExpensesCreated: 0
        };

        console.log('💰 ExpensesModule initialized with Supabase integration');
        this.setupEventHandlers();
    }

    setupEventHandlers() {
        // Monitor month changes to load expenses
        this.eventBus.on('month:changed', async (month) => {
            await this.ensureMonthExpenses(month);
        });

        // Clear cached calculations when expenses change
        this.eventBus.on('expense:created', () => {
            this.invalidateCalculations();
        });

        this.eventBus.on('expense:updated', () => {
            this.invalidateCalculations();
        });

        this.eventBus.on('expense:deleted', () => {
            this.invalidateCalculations();
        });
    }

    // ============================================
    // CORE CRUD OPERATIONS WITH SUPABASE
    // ============================================

    // Get expenses from Supabase (merged with default templates)
    async getExpenses(month = null) {
        const targetMonth = month || this.state.get('currentMonth');

        try {
            // Ensure month structure exists with defaults
            await this.ensureMonthExpenses(targetMonth);

            // Load custom expenses from Supabase
            const supabaseExpenses = await this.supabase.getExpenses(targetMonth);
            this.stats.supabaseOperations++;

            // Get default expenses from localStorage
            const defaults = this.getExpensesFromLocalStorage(targetMonth);
            const defaultExpenses = defaults.filter(e => e.isDefault === true);

            // CRITICAL FIX: Remove localStorage defaults that have the same name as Supabase expenses
            // This prevents duplication when old default expenses exist in both Supabase and localStorage
            const supabaseNames = new Set(supabaseExpenses.map(e => e.name));
            const uniqueDefaults = defaultExpenses.filter(e => !supabaseNames.has(e.name));

            // Merge unique defaults with custom expenses from Supabase
            const mergedExpenses = [...uniqueDefaults, ...supabaseExpenses];

            console.log(`✅ Loaded ${supabaseExpenses.length} from Supabase + ${uniqueDefaults.length} unique defaults (${defaultExpenses.length - uniqueDefaults.length} duplicates filtered). Total: ${mergedExpenses.length} for ${targetMonth}`);
            return mergedExpenses;

        } catch (error) {
            console.error('❌ Failed to get expenses:', error);
            throw error;
        }
    }

    // GET EXPENSES sorted by amount (highest to lowest)
async getExpensesSorted(month = null, sortBy = 'amount', order = 'desc') {
    const expenses = await this.getExpenses(month);

    // Sort by specified field
    return expenses.sort((a, b) => {
        let valueA, valueB;

        switch (sortBy) {
            case 'amount':
                valueA = parseFloat(a.amount) || 0;
                valueB = parseFloat(b.amount) || 0;
                break;
            case 'name':
                valueA = a.name.toLowerCase();
                valueB = b.name.toLowerCase();
                break;
            case 'date':
                valueA = new Date(a.createdAt || 0);
                valueB = new Date(b.createdAt || 0);
                break;
            default:
                valueA = a.amount;
                valueB = b.amount;
        }

        // Sort ascending or descending
        if (order === 'asc') {
            return valueA > valueB ? 1 : valueA < valueB ? -1 : 0;
        } else {
            return valueB > valueA ? 1 : valueB < valueA ? -1 : 0;
        }
    });
}

    // CREATE EXPENSE with Supabase priority
    async create(expenseData) {
        const operationId = `create_${Date.now()}`;
        this.pendingOperations.add(operationId);

        try {
            // Validate input
            this.validateExpenseData(expenseData);

            const currentMonth = this.state.get('currentMonth');

            // Emit before-create event for undo/redo
            this.eventBus.emit('expense:before-created', expenseData);

            // Prepare expense data for Supabase
            const expenseToCreate = {
                month: currentMonth,
                name: expenseData.name.trim(),
                amount: parseFloat(expenseData.amount) || 0,
                note: expenseData.note?.trim() || '',
                isDefault: false
            };

            // Create in Supabase
            const savedExpense = await this.supabase.createExpense(expenseToCreate);
            this.stats.supabaseOperations++;
            this.stats.totalOperations++;
            this.stats.customExpensesCreated++;

            // Emit successful creation
            this.eventBus.emit('expense:created', {
                expense: savedExpense,
                month: currentMonth,
                operationId,
                source: 'supabase'
            });

            console.log('✅ Expense created successfully in Supabase:', savedExpense.id);
            return savedExpense;

        } catch (error) {
            this.eventBus.emit('expense:create-failed', { error, expenseData, operationId });
            throw error;

        } finally {
            this.pendingOperations.delete(operationId);
        }
    }

    // UPDATE EXPENSE with Supabase priority
// UPDATE EXPENSE with Supabase priority
async update(expenseId, expenseData) {
    const operationId = `update_${expenseId}_${Date.now()}`;
    this.pendingOperations.add(operationId);

    try {
        // Validate input
        this.validateExpenseData(expenseData);

        const currentMonth = this.state.get('currentMonth');

        // ============================================
        // FIX: Check if this is a default expense FIRST
        // ============================================
        const existingExpense = await this.findExpenseById(currentMonth, expenseId);
        if (!existingExpense) {
            throw new Error(`Expense not found: ${expenseId}`);
        }

        const isDefaultExpense = existingExpense.isDefault === true;

        // Emit before-update event for undo/redo
        this.eventBus.emit('expense:before-updated', { expenseId, expenseData });

        // ============================================
        // FIX: Default expenses are local-only, skip Supabase
        // ============================================
        if (isDefaultExpense) {
            console.log('📝 Updating default expense (local-only):', expenseId);
            this.stats.totalOperations++;

            // Update localStorage only, PRESERVING isDefault flag
            const updates = {
                name: expenseData.name.trim(),
                amount: parseFloat(expenseData.amount) || 0,
                note: expenseData.note?.trim() || '',
                isDefault: true  // CRITICAL: Preserve the flag
            };

            const localExpense = await this.updateExpenseInLocalStorage(currentMonth, expenseId, updates);

            this.eventBus.emit('expense:updated', {
                expense: localExpense,
                month: currentMonth,
                operationId,
                source: 'localStorage'
            });

            console.log('✅ Default expense updated in localStorage:', expenseId);
            return localExpense;
        }

        // ============================================
        // Custom expenses: Update in Supabase
        // ============================================
        const updatedExpense = await this.supabase.updateExpense(expenseId, {
            name: expenseData.name.trim(),
            amount: parseFloat(expenseData.amount) || 0,
            note: expenseData.note?.trim() || ''
        });

        this.stats.supabaseOperations++;
        this.stats.totalOperations++;

        this.eventBus.emit('expense:updated', {
            expense: updatedExpense,
            month: currentMonth,
            operationId,
            source: 'supabase'
        });

        console.log('✅ Custom expense updated in Supabase:', expenseId);
        return updatedExpense;

    } catch (error) {
        this.eventBus.emit('expense:update-failed', { error, expenseId, expenseData, operationId });
        throw error;

    } finally {
        this.pendingOperations.delete(operationId);
    }
}

    // DELETE EXPENSE with Supabase priority
    async delete(expenseId) {
        const operationId = `delete_${expenseId}_${Date.now()}`;
        this.pendingOperations.add(operationId);

        try {
            const currentMonth = this.state.get('currentMonth');

            // Find expense before deletion
            const expenseToDelete = await this.findExpenseById(currentMonth, expenseId);
            if (!expenseToDelete) {
                throw new Error(`Expense not found: ${expenseId}`);
            }

            // Emit before-delete event for undo/redo
            this.eventBus.emit('expense:before-deleted', expenseToDelete);

            // Check if this is a default expense (local-only)
            const isDefaultExpense = expenseToDelete.isDefault === true;

            if (isDefaultExpense) {
                // Default expenses are localStorage-only
                this.stats.totalOperations++;

                await this.deleteExpenseFromLocalStorage(currentMonth, expenseId);

                this.eventBus.emit('expense:deleted', {
                    expenseId,
                    expense: expenseToDelete,
                    month: currentMonth,
                    operationId,
                    source: 'localStorage'
                });

                console.log('✅ Default expense deleted from localStorage:', expenseId);
                return true;
            }

            // Custom expenses - delete from Supabase
            await this.supabase.deleteExpense(expenseId);
            this.stats.supabaseOperations++;
            this.stats.totalOperations++;

            // Emit successful deletion
            this.eventBus.emit('expense:deleted', {
                expenseId,
                expense: expenseToDelete,
                month: currentMonth,
                operationId,
                source: 'supabase'
            });

            console.log('✅ Custom expense deleted from Supabase:', expenseId);
            return true;

        } catch (error) {
            this.eventBus.emit('expense:delete-failed', { error, expenseId, operationId });
            throw error;

        } finally {
            this.pendingOperations.delete(operationId);
        }
    }

    // ============================================
    // LOCALSTORAGE HELPERS
    // ============================================

    getExpensesFromLocalStorage(month) {
        const monthlyData = this.state.get('monthlyData') || {};
        return monthlyData[month]?.expenses || [];
    }


    async updateExpenseInLocalStorage(month, expenseId, updates) {
        const monthlyData = this.state.get('monthlyData') || {};

        if (!monthlyData[month]?.expenses) {
            throw new Error(`No expenses found for month: ${month}`);
        }

        const expense = monthlyData[month].expenses.find(e => e.id === expenseId);
        if (!expense) {
            throw new Error(`Expense not found: ${expenseId}`);
        }

        // Apply updates
        Object.assign(expense, updates);

        this.storage.save('monthlyData', monthlyData);
        this.state.set('monthlyData', monthlyData);

        return expense;
    }

    async findExpenseById(month, expenseId) {
        // Search in merged expenses list (includes both localStorage defaults AND Supabase custom expenses)
        const allExpenses = await this.getExpenses(month);
        return allExpenses.find(e => e.id === expenseId);
    }

    async deleteExpenseFromLocalStorage(month, expenseId) {
        const monthlyData = this.state.get('monthlyData') || {};

        if (!monthlyData[month]?.expenses) {
            throw new Error(`No expenses found for month: ${month}`);
        }

        const index = monthlyData[month].expenses.findIndex(e => e.id === expenseId);
        if (index === -1) {
            throw new Error(`Expense not found in localStorage: ${expenseId}`);
        }

        monthlyData[month].expenses.splice(index, 1);

        this.storage.save('monthlyData', monthlyData);
        this.state.set('monthlyData', monthlyData);
    }

    // ============================================
    // MONTH INITIALIZATION
    // ============================================

    async initializeMonth(month) {
        const operationId = `init_${month}_${Date.now()}`;
        this.pendingOperations.add(operationId);

        try {
            console.log(`💰 Initializing expenses for month: ${month}`);

            const monthlyData = this.state.get('monthlyData') || {};

            // CRITICAL: Check if month already has orders
            if (monthlyData[month]?.orders?.length > 0) {
                console.log(`Month ${month} already has ${monthlyData[month].orders.length} orders, preserving data`);

                // Only add expenses if missing
                if (!monthlyData[month].expenses || monthlyData[month].expenses.length === 0) {
                    await this.addDefaultExpenses(month);
                }
                return;
            }

            // Initialize new month structure (local only - defaults don't sync to Supabase)
            if (!monthlyData[month]) {
                monthlyData[month] = {
                    orders: [],
                    expenses: this.createDefaultExpenses(month)  // Use version appropriate for this month
                };

                this.stats.monthsInitialized++;
                this.stats.defaultExpensesAdded++;

                this.storage.save('monthlyData', monthlyData);
                this.state.set('monthlyData', monthlyData);

                this.eventBus.emit('expenses:month-initialized', {
                    month,
                    expenseCount: monthlyData[month].expenses.length
                });

                console.log(`✅ Initialized new month ${month} with ${monthlyData[month].expenses.length} default expenses`);
            }

        } catch (error) {
            console.error(`❌ Failed to initialize month ${month}:`, error);
            throw error;

        } finally {
            this.pendingOperations.delete(operationId);
        }
    }

    async addDefaultExpenses(month) {
        const operationId = `add_defaults_${month}_${Date.now()}`;
        this.pendingOperations.add(operationId);

        try {
            const monthlyData = this.state.get('monthlyData') || {};

            if (monthlyData[month] && (!monthlyData[month].expenses || monthlyData[month].expenses.length === 0)) {
                monthlyData[month].expenses = this.createDefaultExpenses(month);  // Use version appropriate for this month

                this.stats.defaultExpensesAdded++;

                this.storage.save('monthlyData', monthlyData);
                this.state.set('monthlyData', monthlyData);

                this.eventBus.emit('expenses:defaults-added', {
                    month,
                    expenseCount: monthlyData[month].expenses.length
                });

                console.log(`✅ Added default expenses to ${month}`);
            }

        } catch (error) {
            console.error(`❌ Failed to add default expenses to ${month}:`, error);
            throw error;

        } finally {
            this.pendingOperations.delete(operationId);
        }
    }

    async ensureMonthExpenses(month) {
        const monthlyData = this.state.get('monthlyData') || {};

        if (!monthlyData[month]) {
            await this.initializeMonth(month);
        } else if (!monthlyData[month].expenses || monthlyData[month].expenses.length === 0) {
            await this.addDefaultExpenses(month);
        }
    }

    // ============================================
    // CALCULATIONS AND ANALYSIS
    // ============================================

    async getTotalExpenses(month = null) {
        try {
            const targetMonth = month || this.state.get('currentMonth');
            const expenses = await this.getExpenses(targetMonth);

            return expenses.reduce((sum, expense) => {
                return sum + (parseFloat(expense.amount) || 0);
            }, 0);

        } catch (error) {
            console.error('❌ Failed to calculate total expenses:', error);
            return 0;
        }
    }

    async getExpenseBreakdown(month = null) {
        try {
            const targetMonth = month || this.state.get('currentMonth');
            const expenses = await this.getExpenses(targetMonth);

            const total = expenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
            const defaultExpenses = expenses.filter(e => e.isDefault).length;
            const customExpenses = expenses.filter(e => !e.isDefault).length;

            return {
                total,
                count: expenses.length,
                defaultExpenses,
                customExpenses,
                avgExpense: expenses.length > 0 ? total / expenses.length : 0,
                maxExpense: expenses.length > 0 ? Math.max(...expenses.map(e => e.amount)) : 0,
                minExpense: expenses.length > 0 ? Math.min(...expenses.map(e => e.amount)) : 0,
                breakdown: expenses.map(e => ({
                    name: e.name,
                    amount: e.amount,
                    percentage: total > 0 ? (e.amount / total * 100).toFixed(1) : 0,
                    isDefault: e.isDefault
                })).sort((a, b) => b.amount - a.amount)
            };

        } catch (error) {
            console.error('❌ Failed to calculate expense breakdown:', error);
            return {
                total: 0,
                count: 0,
                defaultExpenses: 0,
                customExpenses: 0,
                avgExpense: 0,
                maxExpense: 0,
                minExpense: 0,
                breakdown: []
            };
        }
    }

    // ============================================
    // RESET AND UTILITIES
    // ============================================

    async resetToDefaults(month = null) {
        const operationId = `reset_${month || 'current'}_${Date.now()}`;
        this.pendingOperations.add(operationId);

        try {
            const targetMonth = month || this.state.get('currentMonth');

            if (!confirm(`Сигурни ли сте, че искате да нулирате разходите за ${this.formatMonth(targetMonth)}? Всички промени ще бъдат загубени.`)) {
                return false;
            }

            const monthlyData = this.state.get('monthlyData') || {};

            // Emit before-reset event for undo/redo
            const oldExpenses = monthlyData[targetMonth]?.expenses || [];
            this.eventBus.emit('expenses:before-reset', {
                month: targetMonth,
                oldExpenses
            });

            // Ensure month exists
            if (!monthlyData[targetMonth]) {
                monthlyData[targetMonth] = { orders: [], expenses: [] };
            }

            // Reset to defaults (local only) - uses version appropriate for this month
            monthlyData[targetMonth].expenses = this.createDefaultExpenses(targetMonth);

            this.stats.totalOperations++;
            this.stats.defaultExpensesAdded++;

            this.storage.save('monthlyData', monthlyData);
            this.state.set('monthlyData', monthlyData);

            this.eventBus.emit('expenses:reset', {
                month: targetMonth,
                newExpenses: monthlyData[targetMonth].expenses,
                operationId
            });

            console.log(`✅ Reset expenses to defaults for ${targetMonth}`);
            return true;

        } catch (error) {
            console.error(`❌ Failed to reset expenses:`, error);
            throw error;

        } finally {
            this.pendingOperations.delete(operationId);
        }
    }

    // ============================================
    // VERSIONED DEFAULTS HELPERS
    // ============================================

    /**
     * Find the applicable default expenses version for a given month
     * Returns the most recent version that is <= the target month
     * This ensures historical months use historical prices
     *
     * @param {string} targetMonth - Month in YYYY-MM format (e.g., '2025-09', '2026-01')
     * @returns {object} The applicable version object with effectiveFrom and expenses
     */
    getApplicableDefaultsVersion(targetMonth) {
        // Sort versions by effectiveFrom date (newest first)
        const sortedVersions = [...this.defaultExpensesHistory].sort((a, b) =>
            b.effectiveFrom.localeCompare(a.effectiveFrom)
        );

        // Find the most recent version that's <= targetMonth
        const applicableVersion = sortedVersions.find(version =>
            version.effectiveFrom <= targetMonth
        );

        // Fallback to the oldest version if targetMonth is before all versions
        const version = applicableVersion || sortedVersions[sortedVersions.length - 1];

        console.log(`📅 Using default expenses version from ${version.effectiveFrom} for month ${targetMonth}`);
        return version;
    }

    /**
     * Create default expenses for a specific month using the appropriate version
     * This ensures non-retroactive changes - historical months keep historical prices
     *
     * @param {string} month - Month in YYYY-MM format (e.g., '2025-09', '2026-01')
     * @returns {array} Array of default expense objects with temporary IDs
     */
    createDefaultExpenses(month) {
        // Get the version that was active for this month
        const version = this.getApplicableDefaultsVersion(month);

        // Create deep copy of default expenses with temporary local IDs
        return version.expenses.map((expense, index) => ({
            id: index + 1, // Temporary IDs for defaults (1-13)
            name: expense.name,
            amount: expense.amount,
            note: expense.note,
            isDefault: true,
            createdAt: new Date().toISOString()
        }));
    }

    validateExpenseData(expenseData) {
        if (!expenseData.name || typeof expenseData.name !== 'string') {
            throw new Error('Expense name is required');
        }

        if (expenseData.name.trim().length === 0) {
            throw new Error('Expense name cannot be empty');
        }

        if (expenseData.name.length > 100) {
            throw new Error('Expense name is too long (max 100 characters)');
        }

        if (expenseData.amount === undefined || expenseData.amount === null || expenseData.amount === '') {
            throw new Error('Expense amount is required');
        }

        const amount = parseFloat(expenseData.amount);
        if (isNaN(amount)) {
            throw new Error('Expense amount must be a valid number');
        }

        if (amount < 0) {
            throw new Error('Expense amount cannot be negative');
        }

        if (amount > 999999) {
            throw new Error('Expense amount is too large (max 999,999)');
        }

        if (expenseData.note && expenseData.note.length > 500) {
            throw new Error('Expense note is too long (max 500 characters)');
        }
    }

    formatMonth(monthKey) {
        const [year, month] = monthKey.split('-');
        const months = ['Януари', 'Февруари', 'Март', 'Април', 'Май', 'Юни',
            'Юли', 'Август', 'Септември', 'Октомври', 'Ноември', 'Декември'];
        return `${months[parseInt(month) - 1]} ${year}`;
    }

    invalidateCalculations() {
        // Clear any cached calculations when expenses change
        // This can be expanded later if we add caching
    }

    // ============================================
    // STATISTICS AND DEBUGGING
    // ============================================

    getStatistics() {
        return {
            ...this.stats,
            pendingOperations: this.pendingOperations.size,
            defaultExpenseCount: this.defaultExpenses.length,
            nextCustomId: this.nextCustomId
        };
    }

    async getDetailedStats() {
        try {
            const currentMonth = this.state.get('currentMonth');
            const expenses = await this.getExpenses(currentMonth);
            const breakdown = await this.getExpenseBreakdown(currentMonth);

            return {
                module: this.getStatistics(),
                currentMonth: {
                    month: currentMonth,
                    formattedMonth: this.formatMonth(currentMonth),
                    expenses: expenses.length,
                    total: breakdown.total,
                    breakdown
                }
            };

        } catch (error) {
            console.error('❌ Failed to get detailed stats:', error);
            return {
                module: this.getStatistics(),
                currentMonth: null
            };
        }
    }

    debugExpenses() {
        this.getDetailedStats().then(stats => {
            console.group('🔍 EXPENSES MODULE DEBUG');
            console.log('Module Statistics:', stats.module);
            console.log('Current Month:', stats.currentMonth);
            console.log('Default Expenses Template:', this.defaultExpenses.length, 'items');
            console.log('Pending Operations:', Array.from(this.pendingOperations));
            console.log('Supabase Connected:', !!this.supabase);
            console.groupEnd();
        });
    }

    // ============================================
    // HEALTH CHECK
    // ============================================

    async healthCheck() {
        try {
            const currentMonth = this.state.get('currentMonth');
            const monthlyData = this.state.get('monthlyData') || {};

            const issues = [];

            // Check if current month has expenses
            if (!monthlyData[currentMonth]?.expenses) {
                issues.push('Current month has no expenses');
            } else if (monthlyData[currentMonth].expenses.length === 0) {
                issues.push('Current month has empty expenses array');
            }

            // Check for duplicate expense IDs
            const expenses = monthlyData[currentMonth]?.expenses || [];
            const ids = expenses.map(e => e.id);
            const uniqueIds = new Set(ids);
            if (ids.length !== uniqueIds.size) {
                issues.push('Duplicate expense IDs detected');
            }

            // Check for invalid amounts
            const invalidAmounts = expenses.filter(e => isNaN(parseFloat(e.amount)) || e.amount < 0);
            if (invalidAmounts.length > 0) {
                issues.push(`${invalidAmounts.length} expenses with invalid amounts`);
            }

            // Check Supabase connection
            const supabaseStatus = this.supabase ? 'connected' : 'disconnected';

            return {
                status: issues.length === 0 ? 'healthy' : 'issues',
                issues,
                currentMonth,
                expenseCount: expenses.length,
                totalAmount: expenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0),
                supabase: supabaseStatus,
                statistics: this.getStatistics()
            };

        } catch (error) {
            return {
                status: 'error',
                issues: [error.message],
                error: error.message
            };
        }
    }

    // ============================================
    // CLEANUP
    // ============================================

    destroy() {
        console.log('🗑️ Destroying ExpensesModule...');
        this.pendingOperations.clear();
        console.log('✅ ExpensesModule destroyed');
    }
}