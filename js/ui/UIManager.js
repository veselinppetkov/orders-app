import {ModalsManager} from "./components/ModalsManager.js";

export class UIManager {
    constructor(modules, state, eventBus, router, undoRedo) {
        this.modules = modules;
        this.state = state;
        this.eventBus = eventBus;
        this.router = router;
        this.undoRedo = undoRedo;
        this.currentView = null;

        // Initialize months without touching data
        this.initializeMonths();

        this.modals = new ModalsManager(modules, state, eventBus);
        window.app = window.app || {};
        window.app.ui = this;
    }

    initializeMonths() {
        // Load saved months
        let savedMonths = null;
        try {
            const saved = localStorage.getItem('orderSystem_availableMonths');
            if (saved) {
                savedMonths = JSON.parse(saved);
            }
        } catch (e) {
            console.error('Error loading months:', e);
        }

        // Generate default if none exist
        if (!savedMonths || savedMonths.length === 0) {
            savedMonths = this.generateDefaultMonths();
        }

        // Remove duplicates
        const uniqueMonths = [];
        const seenKeys = new Set();

        for (const month of savedMonths) {
            if (!seenKeys.has(month.key)) {
                seenKeys.add(month.key);
                uniqueMonths.push(month);
            }
        }

        // Sort by date
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

    async init() {
        // Check month AFTER data is loaded
        await this.ensureCurrentMonth();

        this.render();
        this.attachGlobalListeners();

        this.eventBus.on('route:change', (view) => this.switchView(view));
        this.eventBus.on('notification:show', (data) => this.showNotification(data.message, data.type));
        this.eventBus.on('modal:open', (data) => this.openModal(data));

        await this.switchView('orders');
    }


    async ensureCurrentMonth() {
        const currentMonth = this.state.get('currentMonth');
        const monthlyData = this.state.get('monthlyData') || {};

        console.log('Ensuring current month:', currentMonth, 'with orders:', monthlyData[currentMonth]?.orders?.length || 0);

        // Don't create new structure if data already exists!
        if (!monthlyData[currentMonth]) {
            monthlyData[currentMonth] = { orders: [], expenses: [] };
            this.state.set('monthlyData', monthlyData);

            // Initialize expenses ONLY for new month
            await this.modules.expenses.initializeMonth(currentMonth);
        } else if (!monthlyData[currentMonth].expenses || monthlyData[currentMonth].expenses.length === 0) {
            // Add expenses ONLY if missing, WITHOUT touching orders
            await this.modules.expenses.addDefaultExpenses(currentMonth);
        }
    }

    render() {
        const app = document.getElementById('app');
        const currentMonth = this.state.get('currentMonth');

        app.innerHTML = `
        <div class="container">
            <header class="header">
                <div class="header-content">
                    <div class="header-left">
                        <h1>📦 Управление на поръчки</h1>
                    </div>
                    <div class="header-right">
                        <button class="btn btn-logout" id="logoutBtn" title="Изход от системата">
                            🚪 Изход
                        </button>
                    </div>
                </div>
                
                <div class="header-controls">
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

            // Update buttons
            if (undoBtn) {
                undoBtn.disabled = !canUndo;
                undoBtn.classList.toggle('disabled', !canUndo);
            }

            if (redoBtn) {
                redoBtn.disabled = !canRedo;
                redoBtn.classList.toggle('disabled', !canRedo);
            }

            // Update counter
            if (undoCount) undoCount.textContent = this.undoRedo.getUndoCount();
            if (redoCount) redoCount.textContent = this.undoRedo.getRedoCount();
        }
    }

    attachGlobalListeners() {
        // Undo/Redo buttons
        document.getElementById('undo-btn')?.addEventListener('click', () => {
            this.undoRedo.undo();
            this.updateUndoRedoButtons();
        });

        document.getElementById('redo-btn')?.addEventListener('click', () => {
            this.undoRedo.redo();
            this.updateUndoRedoButtons();
        });

        // Month selector - MAKE ASYNC
        document.getElementById('monthSelector')?.addEventListener('change', async (e) => {
            const newMonth = e.target.value;

            // CLEAR CACHE when switching months
            this.modules.orders.clearCache();
            this.modules.clients.clearCache();

            this.state.set('currentMonth', newMonth);
            localStorage.setItem('orderSystem_currentMonth', newMonth);

            const monthlyData = this.state.get('monthlyData');
            if (!monthlyData[newMonth]) {
                monthlyData[newMonth] = { orders: [], expenses: [] };
                this.state.set('monthlyData', monthlyData);
                await this.modules.expenses.initializeMonth(newMonth);
            }

            const currentViewName = this.router.getCurrentView();
            await this.switchView(currentViewName);
            this.updateUndoRedoButtons();
        });

        // Add month button - MAKE ASYNC
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

            await this.modules.expenses.initializeMonth(monthKey);

            const currentViewName = this.router.getCurrentView();
            await this.switchView(currentViewName);

            this.showNotification('Нов месец добавен успешно!', 'success');
            this.updateUndoRedoButtons();
        });

        // Tab navigation
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', async (e) => {
                const view = e.target.dataset.view;
                this.router.navigate(view);
            });
        });

        // Update buttons on events
        this.eventBus.on('order:created', () => this.updateUndoRedoButtons());
        this.eventBus.on('order:updated', () => this.updateUndoRedoButtons());
        this.eventBus.on('order:deleted', () => this.updateUndoRedoButtons());
        this.eventBus.on('client:created', () => this.updateUndoRedoButtons());
        this.eventBus.on('client:updated', () => this.updateUndoRedoButtons());
        this.eventBus.on('client:deleted', () => this.updateUndoRedoButtons());

        // Logout button
        document.getElementById('logoutBtn')?.addEventListener('click', async () => {
            if (confirm('Сигурни ли сте, че искате да излезете?')) {
                await window.app.supabase.signOut();
            }
        });
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

    // UPDATED: Make view switching completely async
    async switchView(viewName) {
        document.querySelectorAll('.tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.view === viewName);
        });

        const container = document.getElementById('view-container');
        if (!container) return;

        try {
            // Show loading state
            container.innerHTML = `
                <div class="loading-state">
                    <h3>📦 Loading ${viewName}...</h3>
                    <p>Fetching data from database...</p>
                </div>
            `;

            const moduleName = viewName === 'inventory' ? 'InventoryView' :
                viewName.charAt(0).toUpperCase() + viewName.slice(1) + 'View';

            const module = await import(`./views/${moduleName}.js`);
            const ViewClass = module.default;

            this.currentView = new ViewClass(this.modules, this.state, this.eventBus);

            // Always treat render as potentially async
            const renderResult = this.currentView.render();
            let content;

            if (renderResult instanceof Promise) {
                content = await renderResult;
            } else {
                content = renderResult;
            }

            container.innerHTML = content;

            // Attach listeners
            if (this.currentView.attachListeners) {
                this.currentView.attachListeners();
            }

        } catch (error) {
            console.error(`❌ Error loading view ${viewName}:`, error);
            container.innerHTML = `
                <div class="error-state">
                    <h3>❌ Failed to load ${viewName}</h3>
                    <p>Error: ${error.message}</p>
                    <button onclick="window.app.ui.switchView('${viewName}')" class="btn">🔄 Retry</button>
                </div>
            `;
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

    async openModal(data) {
        if (this.modals) {
            await this.modals.open(data);
        }
    }

    async restoreFromBackup(key, timestamp) {
        if (confirm(`Are you sure you want to restore ${key} from backup created at ${new Date(timestamp).toLocaleString()}?`)) {
            try {
                const backupKey = `backup_orderSystem_${key}_${timestamp}`;
                const backupData = localStorage.getItem(backupKey);

                if (backupData) {
                    const parsed = JSON.parse(backupData);
                    this.state.set(key, parsed);
                    this.modules.orders.storage.save(key, parsed);
                    this.showNotification(`✅ ${key} restored from backup`, 'success');

                    // Refresh current view
                    if (this.currentView?.refresh) {
                        await this.currentView.refresh();
                    }
                } else {
                    throw new Error('Backup not found');
                }
            } catch (error) {
                this.showNotification(`❌ Restore failed: ${error.message}`, 'error');
            }
        }
    }
}