// js/modules/ExpensesModule.js - COMPLETE REWRITE WITH SUPABASE INTEGRATION

export class ExpensesModule {
    constructor(state, storage, eventBus, supabase) {
        this.state = state;
        this.storage = storage;
        this.eventBus = eventBus;
        this.supabase = supabase;

        // Default expense templates (kept as local-only templates)
        this.defaultExpenses = [
            { name: 'IG Campaign', amount: 1780, note: 'Instagram реклама кампания', isDefault: true },
            { name: 'Assurance', amount: 590, note: 'Застраховка', isDefault: true },
            { name: 'Fiverr', amount: 530, note: 'Freelance услуги', isDefault: true },
            { name: 'Ltd.', amount: 460, note: 'Фирмени разходи', isDefault: true },
            { name: 'OLX BG', amount: 90, note: 'OLX България такси', isDefault: true },
            { name: 'OLX RO', amount: 55, note: 'OLX Румъния такси', isDefault: true },
            { name: 'SmugMug', amount: 45, note: 'Хостинг за снимки', isDefault: true },
            { name: 'ChatGPT', amount: 35, note: 'AI асистент', isDefault: true },
            { name: 'Bazar', amount: 35, note: 'Обяви', isDefault: true },
            { name: 'Revolut', amount: 15, note: 'Банкови такси', isDefault: true },
            { name: 'A1', amount: 10, note: 'Мобилен оператор', isDefault: true },
            { name: 'Buffer', amount: 10, note: 'Social media management', isDefault: true }
        ];

        // Operation tracking
        this.pendingOperations = new Set();
        this.nextCustomId = 1000; // Fallback IDs for localStorage-only expenses

        // Statistics
        this.stats = {
            totalOperations: 0,
            supabaseOperations: 0,
            fallbackOperations: 0,
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

    // GET EXPENSES with Supabase priority
// GET EXPENSES with Supabase priority (preserves defaults)
async getExpenses(month = null) {
    const targetMonth = month || this.state.get('currentMonth');

    try {
        // Ensure month structure exists with defaults
        await this.ensureMonthExpenses(targetMonth);

        try {
            // Try Supabase first
            const supabaseExpenses = await this.supabase.getExpenses(targetMonth);
            this.stats.supabaseOperations++;

            // Smart backup: Don't overwrite defaults with empty Supabase results
            if (supabaseExpenses.length > 0) {
                // Supabase has data - use it and backup
                this.backupExpensesToLocalStorage(targetMonth, supabaseExpenses);
                console.log(`✅ Loaded ${supabaseExpenses.length} expenses from Supabase for ${targetMonth}`);
                return supabaseExpenses;
            } else {
                // Supabase empty - check if localStorage has defaults
                const localExpenses = this.getExpensesFromLocalStorage(targetMonth);

                if (localExpenses.length > 0) {
                    // Keep localStorage defaults (don't overwrite with empty)
                    console.log(`✅ Using ${localExpenses.length} default expenses from localStorage for ${targetMonth}`);
                    return localExpenses;
                } else {
                    // Both empty - return empty array
                    console.log(`ℹ️ No expenses found for ${targetMonth}`);
                    return [];
                }
            }

        } catch (supabaseError) {
            console.warn('⚠️ Supabase load failed, using localStorage:', supabaseError.message);
            this.stats.fallbackOperations++;

            // Fallback to localStorage (which has defaults from ensureMonthExpenses)
            const localExpenses = this.getExpensesFromLocalStorage(targetMonth);
            console.log(`✅ Loaded ${localExpenses.length} expenses from localStorage for ${targetMonth}`);
            return localExpenses;
        }

    } catch (error) {
        console.error('❌ Failed to get expenses:', error);
        return [];
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

            try {
                // Prepare expense data for Supabase
                const expenseToCreate = {
                    month: currentMonth,
                    name: expenseData.name.trim(),
                    amount: parseFloat(expenseData.amount) || 0,
                    note: expenseData.note?.trim() || '',
                    isDefault: false
                };

                // Try Supabase first
                const savedExpense = await this.supabase.createExpense(expenseToCreate);
                this.stats.supabaseOperations++;
                this.stats.totalOperations++;
                this.stats.customExpensesCreated++;

                // Backup to localStorage (use Supabase ID)
                const localExpense = {
                    id: savedExpense.id,  // Use Supabase ID for consistency
                    name: savedExpense.name,
                    amount: savedExpense.amount,
                    note: savedExpense.note || '',
                    isDefault: false,
                    createdAt: new Date().toISOString()
                };

                await this.addExpenseToLocalStorage(currentMonth, localExpense);

                // Emit successful creation
                this.eventBus.emit('expense:created', {
                    expense: savedExpense,
                    month: currentMonth,
                    operationId,
                    source: 'supabase'
                });

                console.log('✅ Expense created successfully in Supabase:', savedExpense.id);
                return savedExpense;

            } catch (supabaseError) {
                console.warn('⚠️ Supabase create failed, falling back to localStorage:', supabaseError.message);
                this.stats.fallbackOperations++;
                this.stats.totalOperations++;
                this.stats.customExpensesCreated++;

                // Fallback: Create with local ID
                const localExpense = {
                    id: this.nextCustomId++,
                    name: expenseData.name.trim(),
                    amount: parseFloat(expenseData.amount) || 0,
                    note: expenseData.note?.trim() || '',
                    isDefault: false,
                    createdAt: new Date().toISOString()
                };

                await this.addExpenseToLocalStorage(currentMonth, localExpense);

                // Emit fallback creation
                this.eventBus.emit('expense:created', {
                    expense: localExpense,
                    month: currentMonth,
                    operationId,
                    source: 'localStorage'
                });

                console.log('✅ Expense created in localStorage fallback:', localExpense.id);
                return localExpense;
            }

        } catch (error) {
            this.eventBus.emit('expense:create-failed', { error, expenseData, operationId });
            throw error;

        } finally {
            this.pendingOperations.delete(operationId);
        }
    }

    // UPDATE EXPENSE with Supabase priority
    async update(expenseId, expenseData) {
        const operationId = `update_${expenseId}_${Date.now()}`;
        this.pendingOperations.add(operationId);

        try {
            // Validate input
            this.validateExpenseData(expenseData);

            const currentMonth = this.state.get('currentMonth');

            // Emit before-update event for undo/redo
            this.eventBus.emit('expense:before-updated', { expenseId, expenseData });

            try {
                // Try Supabase first
                const updatedExpense = await this.supabase.updateExpense(expenseId, {
                    name: expenseData.name.trim(),
                    amount: parseFloat(expenseData.amount) || 0,
                    note: expenseData.note?.trim() || ''
                });

                this.stats.supabaseOperations++;
                this.stats.totalOperations++;

                // Update localStorage backup
                await this.updateExpenseInLocalStorage(currentMonth, expenseId, updatedExpense);

                // Emit successful update
                this.eventBus.emit('expense:updated', {
                    expense: updatedExpense,
                    month: currentMonth,
                    operationId,
                    source: 'supabase'
                });

                console.log('✅ Expense updated successfully in Supabase:', expenseId);
                return updatedExpense;

            } catch (supabaseError) {
                console.warn('⚠️ Supabase update failed, falling back to localStorage:', supabaseError.message);
                this.stats.fallbackOperations++;
                this.stats.totalOperations++;

                // Fallback: Update localStorage only
                const updates = {
                    name: expenseData.name.trim(),
                    amount: parseFloat(expenseData.amount) || 0,
                    note: expenseData.note?.trim() || ''
                };

                const localExpense = await this.updateExpenseInLocalStorage(currentMonth, expenseId, updates);

                // Emit fallback update
                this.eventBus.emit('expense:updated', {
                    expense: localExpense,
                    month: currentMonth,
                    operationId,
                    source: 'localStorage'
                });

                console.log('✅ Expense updated in localStorage fallback:', expenseId);
                return localExpense;
            }

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

            try {
                // Try Supabase first (only if it has a numeric ID from Supabase)
                if (typeof expenseId === 'number' && expenseId < 1000) {
                    await this.supabase.deleteExpense(expenseId);
                    this.stats.supabaseOperations++;
                } else {
                    // Skip Supabase for local-only expenses (ID >= 1000)
                    console.log('⚠️ Local-only expense, skipping Supabase delete');
                    this.stats.fallbackOperations++;
                }

                this.stats.totalOperations++;

                // Remove from localStorage backup
                await this.deleteExpenseFromLocalStorage(currentMonth, expenseId);

                // Emit successful deletion
                this.eventBus.emit('expense:deleted', {
                    expenseId,
                    expense: expenseToDelete,
                    month: currentMonth,
                    operationId,
                    source: typeof expenseId === 'number' && expenseId < 1000 ? 'supabase' : 'localStorage'
                });

                console.log('✅ Expense deleted successfully:', expenseId);
                return true;

            } catch (supabaseError) {
                console.warn('⚠️ Supabase delete failed, falling back to localStorage:', supabaseError.message);
                this.stats.fallbackOperations++;
                this.stats.totalOperations++;

                // Fallback: Delete from localStorage only
                await this.deleteExpenseFromLocalStorage(currentMonth, expenseId);

                // Emit fallback deletion
                this.eventBus.emit('expense:deleted', {
                    expenseId,
                    expense: expenseToDelete,
                    month: currentMonth,
                    operationId,
                    source: 'localStorage'
                });

                console.log('✅ Expense deleted in localStorage fallback:', expenseId);
                return true;
            }

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

    backupExpensesToLocalStorage(month, expenses) {
        const monthlyData = this.state.get('monthlyData') || {};
        if (!monthlyData[month]) {
            monthlyData[month] = { orders: [], expenses: [] };
        }

        // CRITICAL FIX: Merge instead of replace to preserve default expenses
        // 1. Keep all default expenses (isDefault: true) from localStorage
        const existingDefaults = (monthlyData[month].expenses || [])
            .filter(expense => expense.isDefault === true);

        // 2. Get all custom expenses from Supabase (they don't have isDefault or it's false)
        const customExpenses = expenses.filter(expense => expense.isDefault !== true);

        // 3. Merge: defaults first, then customs
        monthlyData[month].expenses = [...existingDefaults, ...customExpenses];

        this.storage.save('monthlyData', monthlyData);
        this.state.set('monthlyData', monthlyData);

        console.log(`✅ Merged expenses for ${month}: ${existingDefaults.length} defaults + ${customExpenses.length} customs = ${monthlyData[month].expenses.length} total`);
    }

    async addExpenseToLocalStorage(month, expense) {
        const monthlyData = this.state.get('monthlyData') || {};

        // Ensure month structure exists
        if (!monthlyData[month]) {
            monthlyData[month] = { orders: [], expenses: [] };
        }

        monthlyData[month].expenses.push(expense);

        this.storage.save('monthlyData', monthlyData);
        this.state.set('monthlyData', monthlyData);
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
        const monthlyData = this.state.get('monthlyData') || {};
        return monthlyData[month]?.expenses?.find(e => e.id === expenseId);
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
                    expenses: this.createDefaultExpenses()
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
                monthlyData[month].expenses = this.createDefaultExpenses();

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

            // Reset to defaults (local only)
            monthlyData[targetMonth].expenses = this.createDefaultExpenses();

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

    createDefaultExpenses() {
        // Create deep copy of default expenses with temporary local IDs
        return this.defaultExpenses.map((expense, index) => ({
            id: index + 1, // Temporary IDs for defaults (1-11)
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
            successRate: (this.stats.supabaseOperations + this.stats.fallbackOperations) > 0 ?
                ((this.stats.supabaseOperations / (this.stats.supabaseOperations + this.stats.fallbackOperations)) * 100).toFixed(1) + '%' : '0%',
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