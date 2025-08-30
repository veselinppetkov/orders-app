import {ModalsManager} from "./components/ModalsManager.js";

export class UIManager {
    constructor(modules, state, eventBus, router) {
        this.modules = modules;
        this.state = state;
        this.eventBus = eventBus;
        this.router = router;
        this.currentView = null;
        this.availableMonths = this.loadAvailableMonths();

        this.modals = new ModalsManager(modules, state, eventBus);

        window.app = window.app || {};
        window.app.ui = this;

        // Initialize months if needed
        this.ensureCurrentMonth();


    }

    ensureCurrentMonth() {
        const currentMonth = this.state.get('currentMonth');
        const monthlyData = this.state.get('monthlyData');

        if (!monthlyData[currentMonth]) {
            monthlyData[currentMonth] = { orders: [], expenses: [] };
            this.state.set('monthlyData', monthlyData);
        }

        // НЕ извиквайте initializeMonth тук ако вече има данни!
        if (!monthlyData[currentMonth].expenses || monthlyData[currentMonth].expenses.length === 0) {
            this.modules.expenses.initializeMonth(currentMonth);
        }
    }

    init() {
        this.render();
        this.attachGlobalListeners();

        // Listen for events
        this.eventBus.on('route:change', (view) => this.switchView(view));
        this.eventBus.on('notification:show', (data) => this.showNotification(data.message, data.type));
        this.eventBus.on('modal:open', (data) => this.openModal(data));

        // Initial view
        this.switchView('orders');
    }

    render() {
        const app = document.getElementById('app');
        const months = this.getAvailableMonths();
        const currentMonth = this.state.get('currentMonth');

        app.innerHTML = `
            <div class="container">
                <header class="header">
                    <h1>📦 Система за управление на поръчки</h1>
                    <p>Професионално решение за следене на вашите поръчки</p>
                    <div class="month-selector">
                        <label>Избери месец:</label>
                        <select id="monthSelector">
                            ${months.map(m => `
                                <option value="${m.key}" ${m.key === currentMonth ? 'selected' : ''}>
                                    ${m.name}
                                </option>
                            `).join('')}
                        </select>
                        <button class="btn btn-white" id="add-month-btn">➕ Нов месец</button>
                    </div>
                </header>
                
                <nav class="tabs">
                    <button class="tab active" data-view="orders">📋 Поръчки</button>
                    <button class="tab" data-view="clients">👥 Клиенти</button>
                    <button class="tab" data-view="inventory">📦 Инвентар</button>
                    <button class="tab" data-view="expenses">💰 Разходи</button>
                    <button class="tab" data-view="reports">📊 Отчети</button>
                    <button class="tab" data-view="settings">⚙️ Настройки</button>
                </nav>
                
                <main id="view-container" class="view-container"></main>
            </div>
            
            <div id="modal-container"></div>
            <div id="notification-container"></div>
        `;
    }

    saveAvailableMonths(months) {
        localStorage.setItem('orderSystem_availableMonths', JSON.stringify(months));
    }

    getAvailableMonths() {
        const months = [];
        const currentDate = new Date();

        // Last 4 months
        for (let i = 3; i >= 0; i--) {
            const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
            months.push({
                key: this.formatMonthKey(date),
                name: this.formatMonthName(date)
            });
        }

        return months;
    }


    formatMonthKey(date) {
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        return `${year}-${month}`;
    }

    formatMonthName(date) {
        const months = ['Януари', 'Февруари', 'Март', 'Април', 'Май', 'Юни',
            'Юли', 'Август', 'Септември', 'Октомври', 'Ноември', 'Декември'];
        return `${months[date.getMonth()]} ${date.getFullYear()}`;
    }

    attachGlobalListeners() {

        document.getElementById('monthSelector')?.addEventListener('change', async (e) => {
            this.state.set('currentMonth', e.target.value);
            this.ensureCurrentMonth();

            // Изчакваме презареждането да завърши
            const currentViewName = this.router.getCurrentView();
            await this.switchView(currentViewName);
        });
        // Add month button
        document.getElementById('add-month-btn')?.addEventListener('click', async () => {
            const selector = document.getElementById('monthSelector');
            const lastOption = selector.options[selector.options.length - 1];
            const lastDate = new Date(lastOption.value + '-01T00:00:00');
            const newDate = new Date(lastDate.getFullYear(), lastDate.getMonth() + 1, 1);

            const monthKey = this.formatMonthKey(newDate);
            const monthName = this.formatMonthName(newDate);

            if ([...selector.options].some(opt => opt.value === monthKey)) {
                this.showNotification('Този месец вече съществува!', 'error');
                return;
            }

            const months = this.state.get('availableMonths');
            months.push({ key: monthKey, name: monthName });
            this.state.set('availableMonths', months);
            localStorage.setItem('orderSystem_availableMonths', JSON.stringify(months));

            const option = document.createElement('option');
            option.value = monthKey;
            option.textContent = monthName;
            selector.appendChild(option);
            selector.value = monthKey;

            this.state.set('currentMonth', monthKey);
            this.ensureCurrentMonth();
            this.modules.expenses.initializeMonth(monthKey);

            this.availableMonths.push({ key: monthKey, name: monthName });
            this.saveAvailableMonths(this.availableMonths);

            // Изчакваме презареждането
            const currentViewName = this.router.getCurrentView();
            await this.switchView(currentViewName);

            this.showNotification('Нов месец добавен успешно!', 'success');
        });

        // Tab navigation
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const view = e.target.dataset.view;
                console.log('Tab clicked:', view); // За дебъг
                this.router.navigate(view);
            });
        });
    }

    async switchView(viewName) {
        // Update active tab
        document.querySelectorAll('.tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.view === viewName);
        });

        // Load view dynamically
        try {
            let ViewClass;

            // Специална проверка за inventory
            if (viewName === 'inventory') {
                const module = await import('./views/InventoryView.js');
                ViewClass = module.default;
            } else {
                const module = await import(`./views/${viewName.charAt(0).toUpperCase() + viewName.slice(1)}View.js`);
                ViewClass = module.default;
            }

            this.currentView = new ViewClass(this.modules, this.state, this.eventBus);

            const container = document.getElementById('view-container');
            if (container) {
                container.innerHTML = this.currentView.render();
                this.currentView.attachListeners();
            }
        } catch (error) {
            console.error(`Error loading view ${viewName}:`, error);
            this.showNotification('Грешка при зареждане на изгледа', 'error');
        }
    }

    showNotification(message, type = 'info') {
        const container = document.getElementById('notification-container');
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        container.appendChild(notification);

        setTimeout(() => notification.remove(), 3000);
    }

    openModal(data) {
        // This would open the appropriate modal based on data.type
        console.log('Modal requested:', data);
        // Implementation would go here
    }
}