export default class ExpensesView {
    constructor(modules, state, eventBus) {
        this.expensesModule = modules.expenses;
        this.state = state;
        this.eventBus = eventBus;
    }

    async render() {
        try {
            // FIXED: Await async methods
            const expenses = await this.expensesModule.getExpensesSorted(null, 'amount', 'desc');
            const total = await this.expensesModule.getTotalExpenses();
            const currentMonth = this.state.get('currentMonth');

            // DEFENSIVE: Validate expenses data
            console.log(`📊 Rendering ${expenses.length} expenses for ${currentMonth}. Total: ${total}`);

            // Filter out any expenses with invalid data
            const validExpenses = expenses.filter(exp => {
                if (!exp || exp.amount === undefined || exp.amount === null) {
                    console.error('⚠️ Invalid expense found:', exp);
                    return false;
                }
                return true;
            });

            // DEFENSIVE: Ensure total is a valid number
            const safeTotal = isNaN(total) || total === undefined || total === null ? 0 : total;

            return `
            <div class="expenses-view">
                <h2>💰 Месечни разходи</h2>
                <p style="margin-bottom: 20px; color: #6c757d;">
                    Управлявайте постоянните месечни разходи на бизнеса за <strong>${this.formatMonth(currentMonth)}</strong>
                </p>

                <div class="controls">
                    <button class="btn" id="new-expense-btn">➕ Добави разход</button>
                    <button class="btn secondary" id="reset-expenses-btn">🔄 Възстанови defaults</button>
                </div>

                ${validExpenses.length > 0 ? `
                    <div class="expenses-list">
                        ${validExpenses.map(expense => this.renderExpenseItem(expense)).join('')}
                    </div>

                    <div class="total-expenses">
                        <h3>Общо месечни разходи за ${this.formatMonth(currentMonth)}:</h3>
                        <div class="total-amount">${safeTotal.toFixed(2)} €</div>
                        <div class="total-info">
                            <small>${validExpenses.length} позиции • Средно ${(safeTotal / validExpenses.length).toFixed(2)} € на позиция</small>
                        </div>
                    </div>
                ` : `
                    <div class="empty-state">
                        <h3>Няма добавени разходи</h3>
                        <p>Започнете като добавите първия си месечен разход</p>
                        <button class="btn" onclick="document.getElementById('new-expense-btn').click()">➕ Добави разход</button>
                    </div>
                `}
            </div>
        `;

        } catch (error) {
            console.error('❌ Failed to render expenses view:', error);
            return `
            <div class="error-state">
                <h3>❌ Failed to load expenses</h3>
                <p>Error: ${error.message}</p>
                <button onclick="window.app.ui.currentView.refresh()" class="btn">🔄 Retry</button>
            </div>
        `;
        }
    }

    renderExpenseItem(expense) {
        // FIXED: Proper badge logic - check isDefault property instead of ID range
        const isDefaultExpense = expense.isDefault === true;

        // DEFENSIVE: Ensure amount is valid
        const safeAmount = (expense.amount !== undefined && expense.amount !== null && !isNaN(expense.amount))
            ? parseFloat(expense.amount)
            : 0;

        // DEFENSIVE: Ensure name exists
        const safeName = expense.name || expense.category || 'Unnamed expense';

        return `
        <div class="expense-item ${isDefaultExpense ? 'default-expense' : 'custom-expense'}">
            <div class="expense-info">
                <div class="expense-header">
                    <div class="expense-name">${safeName}</div>
                    ${isDefaultExpense ? '<span class="expense-badge default">Default</span>' : '<span class="expense-badge custom">Custom</span>'}
                </div>
                <div class="expense-amount">${safeAmount.toFixed(2)} €</div>
                ${expense.note ? `<div class="expense-note">${expense.note}</div>` : ''}

                <!-- REMOVED: Percentage display as requested -->
            </div>
            <div class="expense-actions">
                <button class="btn btn-sm" data-action="edit" data-id="${expense.id}" title="Редактиране">✏️</button>
                <button class="btn btn-sm danger" data-action="delete" data-id="${expense.id}" title="Изтриване">🗑️</button>
            </div>
        </div>
    `;
    }

    calculatePercentageSync(expense) {
        // Calculate total from expenses in memory instead of calling async method
        const currentMonth = this.state.get('currentMonth');
        const monthlyData = this.state.get('monthlyData') || {};
        const expenses = monthlyData[currentMonth]?.expenses || [];
        const total = expenses.reduce((sum, exp) => sum + (parseFloat(exp.amount) || 0), 0);

        if (total === 0) return '0%';
        return `${((expense.amount / total) * 100).toFixed(1)}%`;
    }

    formatMonth(monthKey) {
        const [year, month] = monthKey.split('-');
        const months = ['Януари', 'Февруари', 'Март', 'Април', 'Май', 'Юни',
            'Юли', 'Август', 'Септември', 'Октомври', 'Ноември', 'Декември'];
        return `${months[parseInt(month) - 1]} ${year}`;
    }

    attachListeners() {
        // New expense button
        document.getElementById('new-expense-btn')?.addEventListener('click', () => {
            this.eventBus.emit('modal:open', { type: 'expense', mode: 'create' });
        });

        // Reset expenses button
        document.getElementById('reset-expenses-btn')?.addEventListener('click', async () => {
            if (confirm('Сигурни ли сте, че искате да възстановите default разходите? Това ще изтрие всички промени.')) {
                try {
                    const currentMonth = this.state.get('currentMonth');

                    // Clear current expenses
                    const monthlyData = this.state.get('monthlyData') || {};
                    if (monthlyData[currentMonth]) {
                        monthlyData[currentMonth].expenses = [];
                        this.state.set('monthlyData', monthlyData);
                    }

                    // Re-initialize with defaults
                    await this.expensesModule.initializeMonth(currentMonth);

                    this.eventBus.emit('notification:show', {
                        message: 'Default разходите са възстановени успешно!',
                        type: 'success'
                    });

                    await this.refresh();

                } catch (error) {
                    console.error('❌ Reset expenses failed:', error);
                    this.eventBus.emit('notification:show', {
                        message: 'Грешка при възстановяване: ' + error.message,
                        type: 'error'
                    });
                }
            }
        });

        // Expense action buttons
        document.querySelectorAll('[data-action]').forEach(btn => {
            btn.addEventListener('click', async (e) => { // MAKE ASYNC
                const action = e.target.dataset.action;
                const expenseId = parseInt(e.target.dataset.id);

                if (action === 'edit') {
                    this.eventBus.emit('modal:open', { type: 'expense', mode: 'edit', id: expenseId });
                } else if (action === 'delete') {
                    if (confirm('Сигурни ли сте, че искате да изтриете този разход?')) {
                        try {
                            await this.expensesModule.delete(expenseId); // MAKE ASYNC (even though it's currently sync)
                            this.eventBus.emit('notification:show', {
                                message: 'Разходът е изтрит успешно!',
                                type: 'success'
                            });
                            await this.refresh();
                        } catch (error) {
                            console.error('❌ Delete expense failed:', error);
                            this.eventBus.emit('notification:show', {
                                message: 'Грешка при изтриване: ' + error.message,
                                type: 'error'
                            });
                        }
                    }
                }
            });
        });
    }

    // ASYNC REFRESH METHOD
    async refresh() {
        const container = document.getElementById('view-container');
        if (container) {
            // Show loading state
            container.innerHTML = `
                <div class="loading-state">
                    <h3>💰 Loading expenses...</h3>
                    <p>Calculating monthly costs...</p>
                </div>
            `;

            try {
                const content = await this.render();
                container.innerHTML = content;
                this.attachListeners();
            } catch (error) {
                console.error('❌ Failed to refresh expenses view:', error);
                container.innerHTML = `
                    <div class="error-state">
                        <h3>❌ Failed to load expenses</h3>
                        <p>Error: ${error.message}</p>
                        <button onclick="window.app.ui.currentView.refresh()" class="btn">🔄 Retry</button>
                    </div>
                `;
            }
        }
    }
}