// js/modules/ExpensesModule.js - COMPLETE REWRITE WITH SUPABASE INTEGRATION

import { CurrencyUtils } from '../utils/CurrencyUtils.js';

export class ExpensesModule {
    constructor(state, storage, eventBus, supabase) {
        this.state = state;
        this.storage = storage;
        this.eventBus = eventBus;
        this.supabase = supabase;

        // Default expense templates (EUR only)
        this.defaultExpenses = [
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
        ];

        // Operation tracking
        this.pendingOperations = new Set();

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

    // Get all expenses from Supabase (single source of truth)
    async getExpenses(month = null) {
        const targetMonth = month || this.state.get('currentMonth');

        try {
            // Ensure month has been seeded with default expenses
            await this.ensureMonthExpenses(targetMonth);

            // Load ALL expenses from Supabase (defaults + customs)
            const expenses = await this.supabase.getExpenses(targetMonth);
            this.stats.supabaseOperations++;

            console.log(`✅ Loaded ${expenses.length} expenses from Supabase for ${targetMonth}`);
            return expenses;

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

    // UPDATE EXPENSE in Supabase (all expenses)
    async update(expenseId, expenseData) {
        const operationId = `update_${expenseId}_${Date.now()}`;
        this.pendingOperations.add(operationId);

        try {
            // Validate input
            this.validateExpenseData(expenseData);

            const currentMonth = this.state.get('currentMonth');

            // Emit before-update event for undo/redo
            this.eventBus.emit('expense:before-updated', { expenseId, expenseData });

            // Update in Supabase (all expenses, defaults and customs)
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

            console.log('✅ Expense updated in Supabase:', expenseId);
            return updatedExpense;

        } catch (error) {
            this.eventBus.emit('expense:update-failed', { error, expenseId, expenseData, operationId });
            throw error;

        } finally {
            this.pendingOperations.delete(operationId);
        }
    }

    // DELETE EXPENSE from Supabase (all expenses)
    async delete(expenseId) {
        const operationId = `delete_${expenseId}_${Date.now()}`;
        this.pendingOperations.add(operationId);

        try {
            const currentMonth = this.state.get('currentMonth');

            // Emit before-delete event for undo/redo
            this.eventBus.emit('expense:before-deleted', { expenseId });

            // Delete from Supabase (all expenses, defaults and customs)
            await this.supabase.deleteExpense(expenseId);
            this.stats.supabaseOperations++;
            this.stats.totalOperations++;

            // Emit successful deletion
            this.eventBus.emit('expense:deleted', {
                expenseId,
                month: currentMonth,
                operationId,
                source: 'supabase'
            });

            console.log('✅ Expense deleted from Supabase:', expenseId);
            return true;

        } catch (error) {
            this.eventBus.emit('expense:delete-failed', { error, expenseId, operationId });
            throw error;

        } finally {
            this.pendingOperations.delete(operationId);
        }
    }

    // ============================================
    // MONTH INITIALIZATION
    // ============================================

    async initializeMonth(month) {
        const operationId = `init_${month}_${Date.now()}`;
        this.pendingOperations.add(operationId);

        try {
            console.log(`💰 Initializing expenses for month: ${month}`);

            // Check if month already has expenses in Supabase
            const existing = await this.supabase.getExpenses(month);

            if (existing.length > 0) {
                console.log(`Month ${month} already has ${existing.length} expenses in Supabase`);
                return;
            }

            // Seed default expenses to Supabase
            console.log(`📝 Seeding ${this.defaultExpenses.length} default expenses to Supabase for ${month}`);

            for (const template of this.defaultExpenses) {
                await this.supabase.createExpense({
                    month,
                    name: template.name,
                    amount: template.amount,
                    note: template.note || '',
                    isDefault: true,
                    templateId: template.name.toLowerCase().replace(/[^a-z0-9]/g, '_') // e.g., "ig_campaign"
                });
            }

            this.stats.monthsInitialized++;
            this.stats.defaultExpensesAdded++;
            this.stats.supabaseOperations += this.defaultExpenses.length;

            this.eventBus.emit('expenses:month-initialized', {
                month,
                expenseCount: this.defaultExpenses.length
            });

            console.log(`✅ Seeded ${this.defaultExpenses.length} default expenses to Supabase for ${month}`);

        } catch (error) {
            console.error(`❌ Failed to initialize month ${month}:`, error);
            throw error;

        } finally {
            this.pendingOperations.delete(operationId);
        }
    }

    async ensureMonthExpenses(month) {
        // Check if month needs initialization in Supabase
        const existing = await this.supabase.getExpenses(month);

        if (existing.length === 0) {
            await this.initializeMonth(month);
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

            // Get existing expenses from Supabase
            const oldExpenses = await this.supabase.getExpenses(targetMonth);

            // Emit before-reset event for undo/redo
            this.eventBus.emit('expenses:before-reset', {
                month: targetMonth,
                oldExpenses
            });

            // Delete all existing expenses from Supabase
            console.log(`🗑️ Deleting ${oldExpenses.length} expenses from Supabase for ${targetMonth}`);
            for (const expense of oldExpenses) {
                await this.supabase.deleteExpense(expense.id);
            }
            this.stats.supabaseOperations += oldExpenses.length;

            // Re-seed default expenses to Supabase
            console.log(`📝 Re-seeding ${this.defaultExpenses.length} default expenses to Supabase for ${targetMonth}`);
            for (const template of this.defaultExpenses) {
                await this.supabase.createExpense({
                    month: targetMonth,
                    name: template.name,
                    amount: template.amount,
                    note: template.note || '',
                    isDefault: true,
                    templateId: template.name.toLowerCase().replace(/[^a-z0-9]/g, '_')
                });
            }
            this.stats.supabaseOperations += this.defaultExpenses.length;

            this.stats.totalOperations++;
            this.stats.defaultExpensesAdded++;

            // Get the newly seeded expenses
            const newExpenses = await this.supabase.getExpenses(targetMonth);

            this.eventBus.emit('expenses:reset', {
                month: targetMonth,
                newExpenses,
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
            defaultExpenseCount: this.defaultExpenses.length
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
            const issues = [];

            // Load expenses from Supabase
            const expenses = await this.supabase.getExpenses(currentMonth);

            // Check if current month has expenses
            if (expenses.length === 0) {
                issues.push('Current month has no expenses (may need initialization)');
            }

            // Check for duplicate expense IDs
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