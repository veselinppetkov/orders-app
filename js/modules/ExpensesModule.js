// js/modules/ExpensesModule.js - REWRITTEN FOR CLEAN EXPENSE MANAGEMENT

export class ExpensesModule {
    constructor(state, storage, eventBus, supabase) {
        this.state = state;
        this.storage = storage;
        this.eventBus = eventBus;
        this.supabase = supabase; // For future cloud integration

        // Default expenses template
        this.defaultExpenses = [
            { id: 1, name: 'IG Campaign', amount: 1780, note: 'Instagram реклама кампания', isDefault: true },
            { id: 2, name: 'Assurance', amount: 590, note: 'Застраховка', isDefault: true },
            { id: 3, name: 'Fiverr', amount: 530, note: 'Freelance услуги', isDefault: true },
            { id: 4, name: 'Ltd.', amount: 460, note: 'Фирмени разходи', isDefault: true },
            { id: 5, name: 'OLX BG', amount: 90, note: 'OLX България такси', isDefault: true },
            { id: 6, name: 'OLX RO', amount: 55, note: 'OLX Румъния такси', isDefault: true },
            { id: 7, name: 'SmugMug', amount: 45, note: 'Хостинг за снимки', isDefault: true },
            { id: 8, name: 'ChatGPT', amount: 35, note: 'AI асистент', isDefault: true },
            { id: 9, name: 'Revolut', amount: 15, note: 'Банкови такси', isDefault: true },
            { id: 10, name: 'A1', amount: 10, note: 'Мобилен оператор', isDefault: true },
            { id: 11, name: 'Buffer', amount: 10, note: 'Social media management', isDefault: true }
        ];

        // Operation tracking
        this.pendingOperations = new Set();
        this.nextCustomId = 1000; // Start custom IDs at 1000 to avoid conflicts

        // Statistics
        this.stats = {
            totalOperations: 0,
            monthsInitialized: 0,
            defaultExpensesAdded: 0,
            customExpensesCreated: 0
        };

        console.log('💰 ExpensesModule initialized with enhanced management');
        this.setupEventHandlers();
    }

    setupEventHandlers() {
        // Monitor month changes to initialize expenses
        this.eventBus.on('month:changed', (month) => {
            this.ensureMonthExpenses(month);
        });

        // Clear any cached calculations when expenses change
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

    // INITIALIZE MONTH with careful data preservation
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

            // Initialize new month structure
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

    // ADD DEFAULT EXPENSES to existing month
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

    // CREATE EXPENSE
    async create(expenseData) {
        const operationId = `create_${Date.now()}`;
        this.pendingOperations.add(operationId);

        try {
            // Validate input
            this.validateExpenseData(expenseData);

            // Emit before-create event for undo/redo
            this.eventBus.emit('expense:before-created', expenseData);

            const expense = {
                id: this.nextCustomId++,
                name: expenseData.name.trim(),
                amount: parseFloat(expenseData.amount) || 0,
                note: expenseData.note?.trim() || '',
                isDefault: false,
                createdAt: new Date().toISOString()
            };

            const currentMonth = this.state.get('currentMonth');
            const monthlyData = this.state.get('monthlyData') || {};

            // Ensure month structure exists
            await this.ensureMonthExpenses(currentMonth);

            // Add expense
            monthlyData[currentMonth].expenses.push(expense);

            this.stats.totalOperations++;
            this.stats.customExpensesCreated++;

            this.storage.save('monthlyData', monthlyData);
            this.state.set('monthlyData', monthlyData);

            this.eventBus.emit('expense:created', {
                expense,
                month: currentMonth,
                operationId
            });

            console.log('✅ Expense created successfully:', expense.name);
            return expense;

        } catch (error) {
            this.eventBus.emit('expense:create-failed', { error, expenseData, operationId });
            throw error;

        } finally {
            this.pendingOperations.delete(operationId);
        }
    }

    // UPDATE EXPENSE
    async update(expenseId, expenseData) {
        const operationId = `update_${expenseId}_${Date.now()}`;
        this.pendingOperations.add(operationId);

        try {
            // Validate input
            this.validateExpenseData(expenseData);

            const currentMonth = this.state.get('currentMonth');
            const monthlyData = this.state.get('monthlyData') || {};

            if (!monthlyData[currentMonth]?.expenses) {
                throw new Error('No expenses found for current month');
            }

            const expenses = monthlyData[currentMonth].expenses;
            const index = expenses.findIndex(e => e.id === expenseId);

            if (index === -1) {
                throw new Error(`Expense not found: ${expenseId}`);
            }

            const oldExpense = expenses[index];

            // Emit before-update event for undo/redo
            this.eventBus.emit('expense:before-updated', {
                id: expenseId,
                oldExpense,
                newData: expenseData
            });

            const updatedExpense = {
                ...oldExpense,
                name: expenseData.name.trim(),
                amount: parseFloat(expenseData.amount) || 0,
                note: expenseData.note?.trim() || '',
                updatedAt: new Date().toISOString()
            };

            expenses[index] = updatedExpense;

            this.stats.totalOperations++;

            this.storage.save('monthlyData', monthlyData);
            this.state.set('monthlyData', monthlyData);

            this.eventBus.emit('expense:updated', {
                expense: updatedExpense,
                oldExpense,
                month: currentMonth,
                operationId
            });

            console.log('✅ Expense updated successfully:', updatedExpense.name);
            return updatedExpense;

        } catch (error) {
            this.eventBus.emit('expense:update-failed', { error, expenseId, expenseData, operationId });
            throw error;

        } finally {
            this.pendingOperations.delete(operationId);
        }
    }

    // DELETE EXPENSE
    async delete(expenseId) {
        const operationId = `delete_${expenseId}_${Date.now()}`;
        this.pendingOperations.add(operationId);

        try {
            const currentMonth = this.state.get('currentMonth');
            const monthlyData = this.state.get('monthlyData') || {};

            if (!monthlyData[currentMonth]?.expenses) {
                throw new Error('No expenses found for current month');
            }

            const expenses = monthlyData[currentMonth].expenses;
            const index = expenses.findIndex(e => e.id === expenseId);

            if (index === -1) {
                throw new Error(`Expense not found: ${expenseId}`);
            }

            const expenseToDelete = expenses[index];

            // Emit before-delete event for undo/redo
            this.eventBus.emit('expense:before-deleted', expenseToDelete);

            // Remove expense
            expenses.splice(index, 1);

            this.stats.totalOperations++;

            this.storage.save('monthlyData', monthlyData);
            this.state.set('monthlyData', monthlyData);

            this.eventBus.emit('expense:deleted', {
                expenseId,
                expense: expenseToDelete,
                month: currentMonth,
                operationId
            });

            console.log('✅ Expense deleted successfully:', expenseToDelete.name);

        } catch (error) {
            this.eventBus.emit('expense:delete-failed', { error, expenseId, operationId });
            throw error;

        } finally {
            this.pendingOperations.delete(operationId);
        }
    }

    // GET EXPENSES for month
    async getExpenses(month = null) {
        try {
            const targetMonth = month || this.state.get('currentMonth');
            const monthlyData = this.state.get('monthlyData') || {};

            // Ensure month structure exists
            await this.ensureMonthExpenses(targetMonth);

            const expenses = monthlyData[targetMonth]?.expenses || [];

            // Sort expenses: defaults first, then custom by creation date
            return expenses.sort((a, b) => {
                if (a.isDefault && !b.isDefault) return -1;
                if (!a.isDefault && b.isDefault) return 1;
                if (a.isDefault && b.isDefault) return a.id - b.id;
                return (b.createdAt || '').localeCompare(a.createdAt || '');
            });

        } catch (error) {
            console.error('❌ Failed to get expenses:', error);
            return [];
        }
    }

    // GET TOTAL EXPENSES for month
    async getTotalExpenses(month = null) {
        try {
            const expenses = await this.getExpenses(month);
            return expenses.reduce((sum, expense) => sum + (parseFloat(expense.amount) || 0), 0);

        } catch (error) {
            console.error('❌ Failed to calculate total expenses:', error);
            return 0;
        }
    }

    // GET EXPENSE BREAKDOWN
    async getExpenseBreakdown(month = null) {
        try {
            const expenses = await this.getExpenses(month);
            const total = expenses.reduce((sum, e) => sum + e.amount, 0);

            return {
                total,
                count: expenses.length,
                defaultExpenses: expenses.filter(e => e.isDefault).length,
                customExpenses: expenses.filter(e => !e.isDefault).length,
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

    // RESET EXPENSES to defaults
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

            // Reset to defaults
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

    // UTILITY METHODS
    createDefaultExpenses() {
        // Create deep copy of default expenses with new timestamps
        return this.defaultExpenses.map(expense => ({
            ...expense,
            createdAt: new Date().toISOString()
        }));
    }

    async ensureMonthExpenses(month) {
        const monthlyData = this.state.get('monthlyData') || {};

        if (!monthlyData[month]) {
            await this.initializeMonth(month);
        } else if (!monthlyData[month].expenses || monthlyData[month].expenses.length === 0) {
            await this.addDefaultExpenses(month);
        }
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

    // STATISTICS AND DEBUGGING
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
            console.groupEnd();
        });
    }

    // HEALTH CHECK
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

            return {
                status: issues.length === 0 ? 'healthy' : 'issues',
                issues,
                currentMonth,
                expenseCount: expenses.length,
                totalAmount: expenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0)
            };

        } catch (error) {
            return {
                status: 'error',
                issues: [error.message],
                error: error.message
            };
        }
    }

    // CLEANUP
    destroy() {
        console.log('🗑️ Destroying ExpensesModule...');

        this.pendingOperations.clear();

        console.log('✅ ExpensesModule destroyed');
    }
}