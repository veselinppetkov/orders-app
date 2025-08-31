import {ModalsManager} from "./components/ModalsManager.js";

export class UIManager {
    constructor(modules, state, eventBus, router, undoRedo) {  // Добави undoRedo параметър
        this.modules = modules;
        this.state = state;
        this.eventBus = eventBus;
        this.router = router;
        this.undoRedo = undoRedo;  // Запази референцията
        this.currentView = null;

        // Инициализираме месеците БЕЗ да пипаме данните
        this.initializeMonths();

        this.modals = new ModalsManager(modules, state, eventBus);
        window.app = window.app || {};
        window.app.ui = this;
    }

    initializeMonths() {
        // Зареждаме запазените месеци
        let savedMonths = null;
        try {
            const saved = localStorage.getItem('orderSystem_availableMonths');
            if (saved) {
                savedMonths = JSON.parse(saved);
            }
        } catch (e) {
            console.error('Error loading months:', e);
        }

        // Ако няма, генерираме default
        if (!savedMonths || savedMonths.length === 0) {
            savedMonths = this.generateDefaultMonths();
        }

        // Премахваме дубликати
        const uniqueMonths = [];
        const seenKeys = new Set();

        for (const month of savedMonths) {
            if (!seenKeys.has(month.key)) {
                seenKeys.add(month.key);
                uniqueMonths.push(month);
            }
        }

        // Сортираме
        uniqueMonths.sort((a, b) => a.key.localeCompare(b.key));

        this.availableMonths = uniqueMonths;
        this.state.set('availableMonths', uniqueMonths);
        localStorage.setItem('orderSystem_availableMonths', JSON.stringify(uniqueMonths));

        // НЕ викаме ensureCurrentMonth тук - то ще се извика в init()
    }

    generateDefaultMonths() {
        const months = [];
        const currentDate = new Date();

        for (let i = 3; i >= 0; i--) {
            const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
            months.push({
                key: this.formatMonthKey(date),
                name: this.formatMonthName(date)
            });
        }
        return months;
    }

    init() {
        // ВАЖНО: Проверяваме месеца СЛЕД като данните са заредени
        this.ensureCurrentMonth();

        this.render();
        this.attachGlobalListeners();

        this.eventBus.on('route:change', (view) => this.switchView(view));
        this.eventBus.on('notification:show', (data) => this.showNotification(data.message, data.type));
        this.eventBus.on('modal:open', (data) => this.openModal(data));

        this.switchView('orders');
    }

    ensureCurrentMonth() {
        const currentMonth = this.state.get('currentMonth');
        const monthlyData = this.state.get('monthlyData') || {};

        console.log('Ensuring current month:', currentMonth, 'with orders:', monthlyData[currentMonth]?.orders?.length || 0);

        // НЕ създаваме нова структура ако вече има данни!
        if (!monthlyData[currentMonth]) {
            monthlyData[currentMonth] = { orders: [], expenses: [] };
            this.state.set('monthlyData', monthlyData);

            // Инициализираме expenses САМО за нов месец
            this.modules.expenses.initializeMonth(currentMonth);
        } else if (!monthlyData[currentMonth].expenses || monthlyData[currentMonth].expenses.length === 0) {
            // Добавяме expenses САМО ако липсват, БЕЗ да пипаме orders
            this.modules.expenses.addDefaultExpenses(currentMonth);
        }
    }

    render() {
        const app = document.getElementById('app');
        const currentMonth = this.state.get('currentMonth');

        app.innerHTML = `
            <div class="container">
                <header class="header">
                    <div class="header-content">
                        <div class="header-title">
                            <h1>📦 Система за управление на поръчки</h1>
                            <p>Професионално решение за следене на вашите поръчки</p>
                        </div>
                        
                        <!-- Undo/Redo бутони -->
                        <div class="undo-redo-controls">
                            <button class="undo-btn" id="undo-btn" title="Връщане (Ctrl+Z)">
                                <span class="btn-icon">↩️</span>
                                <span class="btn-text">Undo</span>
                            </button>
                            <button class="redo-btn" id="redo-btn" title="Повторение (Ctrl+Shift+Z)">
                                <span class="btn-icon">↪️</span>
                                <span class="btn-text">Redo</span>
                            </button>
                            <div class="undo-info" id="undo-info">
                                <span id="undo-count">0</span> / <span id="redo-count">0</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="month-selector">
                        <label>Избери месец:</label>
                        <select id="monthSelector">
                            ${this.availableMonths.map(m => `
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

        // Обновяваме състоянието на бутоните
        this.updateUndoRedoButtons();
    }

    updateUndoRedoButtons() {
        const undoBtn = document.getElementById('undo-btn');
        const redoBtn = document.getElementById('redo-btn');
        const undoCount = document.getElementById('undo-count');
        const redoCount = document.getElementById('redo-count');

        if (this.undoRedo) {
            const canUndo = this.undoRedo.canUndo();
            const canRedo = this.undoRedo.canRedo();

            // Обновяваме бутоните
            if (undoBtn) {
                undoBtn.disabled = !canUndo;
                undoBtn.classList.toggle('disabled', !canUndo);
            }

            if (redoBtn) {
                redoBtn.disabled = !canRedo;
                redoBtn.classList.toggle('disabled', !canRedo);
            }

            // Обновяваме брояча
            if (undoCount) undoCount.textContent = this.undoRedo.getUndoCount();
            if (redoCount) redoCount.textContent = this.undoRedo.getRedoCount();
        }
    }

    attachGlobalListeners() {
        // Undo/Redo бутони
        document.getElementById('undo-btn')?.addEventListener('click', () => {
            this.undoRedo.undo();
            this.updateUndoRedoButtons();
        });

        document.getElementById('redo-btn')?.addEventListener('click', () => {
            this.undoRedo.redo();
            this.updateUndoRedoButtons();
        });

        // Останалите съществуващи listeners...
        document.getElementById('monthSelector')?.addEventListener('change', async (e) => {
            const newMonth = e.target.value;
            this.state.set('currentMonth', newMonth);
            localStorage.setItem('orderSystem_currentMonth', newMonth);

            const monthlyData = this.state.get('monthlyData');
            if (!monthlyData[newMonth]) {
                monthlyData[newMonth] = { orders: [], expenses: [] };
                this.state.set('monthlyData', monthlyData);
                this.modules.expenses.initializeMonth(newMonth);
            }

            const currentViewName = this.router.getCurrentView();
            await this.switchView(currentViewName);
            this.updateUndoRedoButtons();
        });

        document.getElementById('add-month-btn')?.addEventListener('click', async () => {
            const selector = document.getElementById('monthSelector');
            const lastMonth = this.availableMonths[this.availableMonths.length - 1];
            const lastDate = new Date(lastMonth.key + '-01');
            const newDate = new Date(lastDate.getFullYear(), lastDate.getMonth() + 1, 1);

            const monthKey = this.formatMonthKey(newDate);
            const monthName = this.formatMonthName(newDate);

            if (this.availableMonths.some(m => m.key === monthKey)) {
                this.showNotification('Този месец вече съществува!', 'error');
                return;
            }

            const newMonth = { key: monthKey, name: monthName };
            this.availableMonths.push(newMonth);

            this.state.set('availableMonths', this.availableMonths);
            localStorage.setItem('orderSystem_availableMonths', JSON.stringify(this.availableMonths));

            const option = document.createElement('option');
            option.value = monthKey;
            option.textContent = monthName;
            selector.appendChild(option);
            selector.value = monthKey;

            this.state.set('currentMonth', monthKey);
            localStorage.setItem('orderSystem_currentMonth', monthKey);

            const monthlyData = this.state.get('monthlyData');
            monthlyData[monthKey] = { orders: [], expenses: [] };
            this.state.set('monthlyData', monthlyData);

            this.modules.expenses.initializeMonth(monthKey);

            const currentViewName = this.router.getCurrentView();
            await this.switchView(currentViewName);

            this.showNotification('Нов месец добавен успешно!', 'success');
            this.updateUndoRedoButtons();
        });

        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const view = e.target.dataset.view;
                this.router.navigate(view);
            });
        });

        // Обновяваме бутоните при всяко действие
        this.eventBus.on('order:created', () => this.updateUndoRedoButtons());
        this.eventBus.on('order:updated', () => this.updateUndoRedoButtons());
        this.eventBus.on('order:deleted', () => this.updateUndoRedoButtons());
        this.eventBus.on('client:created', () => this.updateUndoRedoButtons());
        this.eventBus.on('client:updated', () => this.updateUndoRedoButtons());
        this.eventBus.on('client:deleted', () => this.updateUndoRedoButtons());
    }

    // Всички останали методи остават същите...
    initializeMonths() {
        // Зареждаме запазените месеци
        let savedMonths = null;
        try {
            const saved = localStorage.getItem('orderSystem_availableMonths');
            if (saved) {
                savedMonths = JSON.parse(saved);
            }
        } catch (e) {
            console.error('Error loading months:', e);
        }

        // Ако няма, генерираме default
        if (!savedMonths || savedMonths.length === 0) {
            savedMonths = this.generateDefaultMonths();
        }

        // Премахваме дубликати
        const uniqueMonths = [];
        const seenKeys = new Set();

        for (const month of savedMonths) {
            if (!seenKeys.has(month.key)) {
                seenKeys.add(month.key);
                uniqueMonths.push(month);
            }
        }

        // Сортираме
        uniqueMonths.sort((a, b) => a.key.localeCompare(b.key));

        this.availableMonths = uniqueMonths;
        this.state.set('availableMonths', uniqueMonths);
        localStorage.setItem('orderSystem_availableMonths', JSON.stringify(uniqueMonths));
    }

    generateDefaultMonths() {
        const months = [];
        const currentDate = new Date();

        for (let i = 3; i >= 0; i--) {
            const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
            months.push({
                key: this.formatMonthKey(date),
                name: this.formatMonthName(date)
            });
        }
        return months;
    }

    init() {
        this.ensureCurrentMonth();
        this.render();
        this.attachGlobalListeners();

        this.eventBus.on('route:change', (view) => this.switchView(view));
        this.eventBus.on('notification:show', (data) => this.showNotification(data.message, data.type));
        this.eventBus.on('modal:open', (data) => this.openModal(data));

        this.switchView('orders');
    }

    ensureCurrentMonth() {
        const currentMonth = this.state.get('currentMonth');
        const monthlyData = this.state.get('monthlyData') || {};

        console.log('Ensuring current month:', currentMonth, 'with orders:', monthlyData[currentMonth]?.orders?.length || 0);

        if (!monthlyData[currentMonth]) {
            monthlyData[currentMonth] = { orders: [], expenses: [] };
            this.state.set('monthlyData', monthlyData);
            this.modules.expenses.initializeMonth(currentMonth);
        } else if (!monthlyData[currentMonth].expenses || monthlyData[currentMonth].expenses.length === 0) {
            this.modules.expenses.addDefaultExpenses(currentMonth);
        }
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

    async switchView(viewName) {
        document.querySelectorAll('.tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.view === viewName);
        });

        try {
            const moduleName = viewName === 'inventory' ? 'InventoryView' :
                viewName.charAt(0).toUpperCase() + viewName.slice(1) + 'View';

            const module = await import(`./views/${moduleName}.js`);
            const ViewClass = module.default;

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
        if (!container) return;

        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        container.appendChild(notification);

        setTimeout(() => notification.remove(), 3000);
    }

    openModal(data) {
        if (this.modals) {
            this.modals.open(data);
        }
    }
}