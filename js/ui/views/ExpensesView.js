// js/ui/views/ExpensesView.js
export default class ExpensesView {
    constructor(modules, state, eventBus) {
        this.expensesModule = modules.expenses;
        this.state = state;
        this.eventBus = eventBus;
    }

    render() {
        const expenses = this.expensesModule.getExpenses();
        const total = this.expensesModule.getTotalExpenses();

        return `
            <div class="expenses-view">
                <h2>💰 Месечни разходи</h2>
                <p style="margin-bottom: 20px; color: #6c757d;">Управлявайте постоянните месечни разходи на бизнеса</p>
                
                <div class="controls">
                    <button class="btn" id="new-expense-btn">➕ Добави разход</button>
                </div>
                
                <div class="expenses-list">
                    ${expenses.map(expense => this.renderExpenseItem(expense)).join('')}
                </div>
                
                <div class="total-expenses">
                    <h3>Общо месечни разходи:</h3>
                    <div class="total-amount">${total.toFixed(2)} лв</div>
                </div>
            </div>
        `;
    }

    renderExpenseItem(expense) {
        return `
            <div class="expense-item">
                <div class="expense-info">
                    <div class="expense-name">${expense.name}</div>
                    <div class="expense-amount">${expense.amount.toFixed(2)} лв</div>
                    ${expense.note ? `<div class="expense-note">${expense.note}</div>` : ''}
                </div>
                <div class="expense-actions">
                    <button class="btn btn-sm" data-action="edit" data-id="${expense.id}">✏️</button>
                    <button class="btn btn-sm danger" data-action="delete" data-id="${expense.id}">🗑️</button>
                </div>
            </div>
        `;
    }

    attachListeners() {
        document.getElementById('new-expense-btn')?.addEventListener('click', () => {
            this.eventBus.emit('modal:open', { type: 'expense', mode: 'create' });
        });

        document.querySelectorAll('[data-action]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = e.target.dataset.action;
                const expenseId = parseInt(e.target.dataset.id);

                if (action === 'edit') {
                    this.eventBus.emit('modal:open', { type: 'expense', mode: 'edit', id: expenseId });
                } else if (action === 'delete') {
                    if (confirm('Сигурни ли сте?')) {
                        this.expensesModule.delete(expenseId);
                        this.refresh();
                    }
                }
            });
        });
    }

    refresh() {
        const container = document.getElementById('view-container');
        if (container) {
            container.innerHTML = this.render();
            this.attachListeners();
        }
    }
}