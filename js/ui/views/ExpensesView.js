export default class ExpensesView {
    constructor(modules, state, eventBus) {
        this.expensesModule = modules.expenses;
        this.state = state;
        this.eventBus = eventBus;
    }

    async render() {
        try {
            // FIXED: Await async methods
            const expenses = await this.expensesModule.getExpenses();
            const total = await this.expensesModule.getTotalExpenses();
            const currentMonth = this.state.get('currentMonth');

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
                
                ${expenses.length > 0 ? `
                    <div class="expenses-list">
                        ${expenses.map(expense => this.renderExpenseItem(expense)).join('')}
                    </div>
                    
                    <div class="total-expenses">
                        <h3>Общо месечни разходи за ${this.formatMonth(currentMonth)}:</h3>
                        <div class="total-amount">${total.toFixed(2)} лв</div>
                        <div class="total-info">
                            <small>${expenses.length} позиции • Средно ${(total / expenses.length).toFixed(2)} лв на позиция</small>
                        </div>
                    </div>
                ` : `
                    <div class="empty-state">
                        <h3>Няма добавени разходи</h3>
                        <p>Започнете като добавите първия си месечен разход</p>
                        <button class="btn" onclick="document.getElementById('new-expense-btn').click()">➕ Добави разход</button>
                    </div>
                `}
                
                <div class="expenses-insights">
                    <h3>📊 Анализ на разходите</h3>
                    <div class="insights-grid">
                        <div class="insight-card">
                            <div class="insight-label">Най-голям разход</div>
                            <div class="insight-value">
                                ${expenses.length > 0 ?
                (() => {
                    const maxExpense = expenses.reduce((max, exp) => exp.amount > max.amount ? exp : max, expenses[0]);
                    return `${maxExpense.name} (${maxExpense.amount.toFixed(2)} лв)`;
                })()
                : 'Няма данни'
            }
                            </div>
                        </div>
                        <div class="insight-card">
                            <div class="insight-label">Процент от общо</div>
                            <div class="insight-value">
                                ${expenses.length > 0 && total > 0 ?
                `${((expenses.reduce((max, exp) => exp.amount > max.amount ? exp : max, expenses[0]).amount / total) * 100).toFixed(1)}%`
                : 'Няма данни'
            }
                            </div>
                        </div>
                    </div>
                </div>
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
        const isDefaultExpense = expense.id < 100;

        return `
        <div class="expense-item ${isDefaultExpense ? 'default-expense' : 'custom-expense'}">
            <div class="expense-info">
                <div class="expense-header">
                    <div class="expense-name">${expense.name}</div>
                    ${isDefaultExpense ? '<span class="expense-badge default">Default</span>' : '<span class="expense-badge custom">Custom</span>'}
                </div>
                <div class="expense-amount">${expense.amount.toFixed(2)} лв</div>
                ${expense.note ? `<div class="expense-note">${expense.note}</div>` : ''}
                
                <div class="expense-stats">
                    <small>
                        <!-- Calculate percentage inline to avoid async complexity -->
                        ${this.calculatePercentageSync(expense)} от общите разходи
                    </small>
                </div>
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