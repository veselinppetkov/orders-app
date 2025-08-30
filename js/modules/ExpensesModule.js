export class ExpensesModule {
    constructor(state, storage, eventBus) {
        this.state = state;
        this.storage = storage;
        this.eventBus = eventBus;
        this.defaultExpenses = [
            { id: 1, name: 'IG Campaign', amount: 1780, note: 'Instagram реклама кампания' },
            { id: 2, name: 'Assurance', amount: 590, note: 'Застраховка' },
            { id: 3, name: 'Fiverr', amount: 530, note: 'Freelance услуги' },
            { id: 4, name: 'Ltd.', amount: 460, note: 'Фирмени разходи' },
            { id: 5, name: 'OLX BG', amount: 90, note: 'OLX България такси' },
            { id: 6, name: 'OLX RO', amount: 55, note: 'OLX Румъния такси' },
            { id: 7, name: 'SmugMug', amount: 45, note: 'Хостинг за снимки' },
            { id: 8, name: 'ChatGPT', amount: 35, note: 'AI асистент' },
            { id: 9, name: 'Revolut', amount: 15, note: 'Банкови такси' },
            { id: 10, name: 'A1', amount: 10, note: 'Мобилен оператор' },
            { id: 11, name: 'Buffer', amount: 10, note: 'Social media management' }
        ];
    }

    initializeMonth(month) {
        const monthlyData = this.state.get('monthlyData');

        // Създай структурата само ако месецът не съществува
        if (!monthlyData[month]) {
            monthlyData[month] = { orders: [], expenses: [] };
        }

        // Добави expenses само ако липсват, БЕЗ да пипаш orders
        if (!monthlyData[month].expenses) {
            monthlyData[month].expenses = [];
        }

        if (monthlyData[month].expenses.length === 0) {
            monthlyData[month].expenses = JSON.parse(JSON.stringify(this.defaultExpenses));
            // НЕ запазвай тук - остави state management-а да се грижи
            this.state.set('monthlyData', monthlyData);
        }
    }

    getExpenses(month = null) {
        const targetMonth = month || this.state.get('currentMonth');
        this.initializeMonth(targetMonth);
        const monthlyData = this.state.get('monthlyData');
        return monthlyData[targetMonth]?.expenses || [];
    }

    create(expenseData) {
        const expense = {
            id: Date.now(),
            name: expenseData.name,
            amount: parseFloat(expenseData.amount) || 0, // Конвертиране към число
            note: expenseData.note || ''
        };

        const currentMonth = this.state.get('currentMonth');
        const monthlyData = this.state.get('monthlyData');

        if (!monthlyData[currentMonth].expenses) {
            monthlyData[currentMonth].expenses = [];
        }

        monthlyData[currentMonth].expenses.push(expense);

        this.storage.save('monthlyData', monthlyData);
        this.state.set('monthlyData', monthlyData);
        this.eventBus.emit('expense:created', expense);

        return expense;
    }

    delete(expenseId) {
        const currentMonth = this.state.get('currentMonth');
        const monthlyData = this.state.get('monthlyData');

        monthlyData[currentMonth].expenses = monthlyData[currentMonth].expenses.filter(e => e.id !== expenseId);

        this.storage.save('monthlyData', monthlyData);
        this.state.set('monthlyData', monthlyData);
        this.eventBus.emit('expense:deleted', expenseId);
    }

    update(expenseId, expenseData) {
        const currentMonth = this.state.get('currentMonth');
        const monthlyData = this.state.get('monthlyData');

        const index = monthlyData[currentMonth].expenses.findIndex(e => e.id === expenseId);
        if (index !== -1) {
            monthlyData[currentMonth].expenses[index] = {
                id: expenseId,
                name: expenseData.name,
                amount: parseFloat(expenseData.amount) || 0, // Конвертиране към число
                note: expenseData.note || ''
            };

            this.storage.save('monthlyData', monthlyData);
            this.state.set('monthlyData', monthlyData);
            this.eventBus.emit('expense:updated', monthlyData[currentMonth].expenses[index]);
        }
    }

    getTotalExpenses(month = null) {
        const expenses = this.getExpenses(month);
        return expenses.reduce((sum, e) => sum + e.amount, 0);
    }
}