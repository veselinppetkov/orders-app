import {ModalsManager} from "./components/ModalsManager.js";
import { DataProtectionDashboard } from "./components/DataProtectionDashboard.js";

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

        this.protectionDashboard = new DataProtectionDashboard(this.modules.orders.storage, eventBus);
        this.startDataProtectionMonitoring();

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

    startDataProtectionMonitoring() {
        // Start export reminder system
        this.protectionDashboard.checkExportReminder();

        // Monitor storage health every 5 minutes
        setInterval(() => {
            const health = this.modules.orders.storage.getStorageHealth();
            if (health.status === 'error' || health.status === 'warning') {
                this.showNotification(
                    `⚠️ Storage ${health.status}: ${health.error || 'Space running low'}`,
                    'warning'
                );
            }
        }, 5 * 60 * 1000); // 5 minutes
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

        // ADD protection widget to header
        const protectionWidget = this.protectionDashboard.createStatusWidget();

        app.innerHTML = `
        <div class="container">
            <header class="header">
                <div class="header-content">
                    <div class="header-title">
                        <h1>📦 Система за управление на поръчки</h1>
                        <p>Професионално решение за следене на вашите поръчки</p>
                    </div>
                    
                    <div class="header-controls">
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
                        
                        <!-- ADD Protection Widget -->
                        ${protectionWidget}
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
            
            <!-- Rest of existing content -->
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

// FIND this method and REPLACE it:
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
                // Check if render method is async
                const renderResult = this.currentView.render();

                if (renderResult instanceof Promise) {
                    // Async render - show loading first
                    container.innerHTML = `
                    <div class="loading-state">
                        <h3>Loading...</h3>
                    </div>
                `;

                    const content = await renderResult;
                    container.innerHTML = content;
                } else {
                    // Sync render
                    container.innerHTML = renderResult;
                }

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

    urgentExport() {
        try {
            this.modules.orders.storage.exportData();
            localStorage.setItem('lastManualExport', Date.now().toString());
            this.showNotification('📤 Emergency export completed!', 'success');

            // Refresh protection widget
            setTimeout(() => {
                const widget = document.getElementById('data-protection-widget');
                if (widget) {
                    widget.outerHTML = this.protectionDashboard.createStatusWidget();
                }
            }, 1000);
        } catch (error) {
            this.showNotification('❌ Export failed: ' + error.message, 'error');
        }
    }

    forceBackup() {
        try {
            const criticalKeys = ['monthlyData', 'clientsData', 'settings', 'inventory'];
            let backed = 0;

            criticalKeys.forEach(key => {
                const data = this.state.get(key);
                if (data) {
                    this.modules.orders.storage.createRollingBackup(key);
                    backed++;
                }
            });

            this.showNotification(`💾 Force backup completed for ${backed} data types`, 'success');
        } catch (error) {
            this.showNotification('❌ Backup failed: ' + error.message, 'error');
        }
    }

    cleanupStorage() {
        try {
            this.modules.orders.storage.emergencyCleanup();
            this.showNotification('🧹 Storage cleanup completed', 'success');

            // Refresh widget
            setTimeout(() => {
                const widget = document.getElementById('data-protection-widget');
                if (widget) {
                    widget.outerHTML = this.protectionDashboard.createStatusWidget();
                }
            }, 1000);
        } catch (error) {
            this.showNotification('❌ Cleanup failed: ' + error.message, 'error');
        }
    }

    testRecovery() {
        try {
            const backups = this.modules.orders.storage.listBackups();
            const backupCount = Object.values(backups).reduce((sum, arr) => sum + arr.length, 0);

            if (backupCount > 0) {
                this.showNotification(`✅ Recovery test passed: ${backupCount} backups available`, 'success');
            } else {
                this.showNotification('⚠️ No backups found for recovery', 'warning');
            }
        } catch (error) {
            this.showNotification('❌ Recovery test failed: ' + error.message, 'error');
        }
    }

    showBackupManager() {
        const modalContent = this.protectionDashboard.createBackupManagerModal();
        const container = document.getElementById('modal-container');
        container.innerHTML = modalContent;
        container.querySelector('.modal').classList.add('active');
    }

    restoreFromBackup(key, timestamp) {
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
                        this.currentView.refresh();
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