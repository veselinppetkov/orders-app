// js/core/UndoRedoManager.js - ПОПРАВЕНА ВЕРСИЯ
export class UndoRedoManager {
    constructor(state, storage, eventBus) {
        this.state = state;
        this.storage = storage;
        this.eventBus = eventBus;

        // Стекове за undo/redo
        this.undoStack = [];
        this.redoStack = [];
        this.maxStackSize = 50;

        // Флаг за да избегнем безкрайни цикли
        this.isUndoRedoOperation = false;

        this.setupEventListeners();
        this.setupKeyboardShortcuts();

        console.log('🔄 UndoRedoManager initialized');
    }

    setupEventListeners() {
        // ВАЖНО: Слушаме за "before-" събития, които се случват ПРЕДИ промяната
        const trackedEvents = [
            'order:before-created', 'order:before-updated', 'order:before-deleted',
            'client:before-created', 'client:before-updated', 'client:before-deleted',
            'expense:before-created', 'expense:before-updated', 'expense:before-deleted',
            'inventory:before-created', 'inventory:before-updated', 'inventory:before-deleted'
        ];

        trackedEvents.forEach(event => {
            this.eventBus.on(event, (data) => {
                if (!this.isUndoRedoOperation) {
                    this.saveState(event, data);
                }
            });
        });
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Ctrl+Z за Undo
            if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                this.undo();
            }

            // Ctrl+Shift+Z или Ctrl+Y за Redo
            if ((e.ctrlKey && e.shiftKey && e.key === 'Z') || (e.ctrlKey && e.key === 'y')) {
                e.preventDefault();
                this.redo();
            }
        });
    }

    saveState(action, data) {
        // Сега запазваме състоянието точно когато се извика (ПРЕДИ промяната)
        const currentState = {
            monthlyData: JSON.parse(JSON.stringify(this.state.get('monthlyData'))),
            clientsData: JSON.parse(JSON.stringify(this.state.get('clientsData'))),
            inventory: JSON.parse(JSON.stringify(this.state.get('inventory'))),
            timestamp: Date.now(),
            action: action,
            data: this.extractActionData(action, data)
        };

        this.undoStack.push(currentState);

        // Ограничаваме размера на стека
        if (this.undoStack.length > this.maxStackSize) {
            this.undoStack.shift();
        }

        // Изчистваме redo стека при ново действие
        this.redoStack = [];

        console.log(`💾 State saved for action: ${action} (Stack size: ${this.undoStack.length})`);

        // Debug - показваме какво точно запазваме
        if (action.includes('order')) {
            const monthlyData = currentState.monthlyData;
            const currentMonth = this.state.get('currentMonth');
            const ordersInCurrentMonth = monthlyData[currentMonth]?.orders?.length || 0;
            console.log(`📦 Saved state with ${ordersInCurrentMonth} orders in ${currentMonth}`);
        }
    }

    extractActionData(action, data) {
        // Извличаме полезна информация за показване в нотификацията
        if (action.includes('order')) {
            return {
                type: 'order',
                client: data?.client || 'Unknown',
                model: data?.model || 'Unknown'
            };
        } else if (action.includes('client')) {
            return {
                type: 'client',
                name: data?.name || 'Unknown'
            };
        } else if (action.includes('expense')) {
            return {
                type: 'expense',
                name: data?.name || 'Unknown'
            };
        } else if (action.includes('inventory')) {
            return {
                type: 'inventory',
                brand: data?.brand || 'Unknown'
            };
        }

        return { type: 'unknown' };
    }

    undo() {
        if (this.undoStack.length === 0) {
            this.showUndoNotification('Няма действия за връщане', 'info');
            return false;
        }

        // Запазваме текущото състояние в redo стека
        const currentState = {
            monthlyData: JSON.parse(JSON.stringify(this.state.get('monthlyData'))),
            clientsData: JSON.parse(JSON.stringify(this.state.get('clientsData'))),
            inventory: JSON.parse(JSON.stringify(this.state.get('inventory'))),
            timestamp: Date.now()
        };

        this.redoStack.push(currentState);

        // Взимаме последното състояние от undo стека (състоянието ПРЕДИ промяната)
        const previousState = this.undoStack.pop();

        // Възстановяваме състоянието
        this.restoreState(previousState);

        // Показваме подробна нотификация
        this.showUndoNotification(this.getUndoMessage(previousState), 'success');

        console.log(`↩️ Undo performed: ${previousState.action}`);

        // Debug
        const monthlyData = previousState.monthlyData;
        const currentMonth = this.state.get('currentMonth');
        const ordersInCurrentMonth = monthlyData[currentMonth]?.orders?.length || 0;
        console.log(`📦 Restored state with ${ordersInCurrentMonth} orders in ${currentMonth}`);

        return true;
    }

    redo() {
        if (this.redoStack.length === 0) {
            this.showUndoNotification('Няма действия за повторение', 'info');
            return false;
        }

        // Запазваме текущото състояние в undo стека
        const currentState = {
            monthlyData: JSON.parse(JSON.stringify(this.state.get('monthlyData'))),
            clientsData: JSON.parse(JSON.stringify(this.state.get('clientsData'))),
            inventory: JSON.parse(JSON.stringify(this.state.get('inventory'))),
            timestamp: Date.now()
        };

        this.undoStack.push(currentState);

        // Взимаме състоянието от redo стека
        const nextState = this.redoStack.pop();

        // Възстановяваме състоянието
        this.restoreState(nextState);

        this.showUndoNotification('↪️ Повторено действие', 'success');

        console.log('↪️ Redo performed');
        return true;
    }

    restoreState(state) {
        this.isUndoRedoOperation = true;

        console.log('🔄 Restoring state...');

        this.state.update({
            monthlyData: state.monthlyData,
            clientsData: state.clientsData,
            inventory: state.inventory
        });

        const saves = [
            this.storage.save('monthlyData', state.monthlyData),
            this.storage.save('clientsData', state.clientsData),
            this.storage.save('inventory', state.inventory)
        ];

        if (saves.some(ok => !ok)) {
            console.error('❌ Undo/redo: one or more saves failed');
            window.app?.ui?.eventBus?.emit('toast:show', {
                type: 'error',
                message: 'Запис при undo/redo се провали'
            });
        }

        // Refresh UI, then release the flag so any state reads during refresh
        // still see us as "undo/redo in progress" and don't capture new history.
        this.refreshCurrentView(() => {
            this.isUndoRedoOperation = false;
        });
    }

    getUndoMessage(state) {
        const action = this.getActionText(state.action);
        const data = state.data;

        if (data?.type === 'order') {
            return `↩️ Върнато: ${action} (${data.client} - ${data.model})`;
        } else if (data?.type === 'client') {
            return `↩️ Върнато: ${action} (${data.name})`;
        } else if (data?.type === 'expense') {
            return `↩️ Върнато: ${action} (${data.name})`;
        } else if (data?.type === 'inventory') {
            return `↩️ Върнато: ${action} (${data.brand})`;
        }

        return `↩️ Върнато: ${action}`;
    }

    showUndoNotification(message, type) {
        // Създаваме специална нотификация с Undo/Redo информация
        const container = document.getElementById('notification-container');
        if (!container) return;

        const notification = document.createElement('div');
        notification.className = `notification undo-notification ${type}`;

        // Добавяме информация за текущото състояние
        const undoCount = this.getUndoCount();
        const redoCount = this.getRedoCount();

        notification.innerHTML = `
            <div class="notification-content">
                <div class="notification-message">${message}</div>
                <div class="notification-counter">Undo: ${undoCount} | Redo: ${redoCount}</div>
            </div>
        `;

        container.appendChild(notification);

        // По-дълго показване за undo/redo нотификации
        setTimeout(() => notification.remove(), 4000);
    }

    getActionText(action) {
        const actionTexts = {
            'order:before-created': 'Създаване на поръчка',
            'order:before-updated': 'Редактиране на поръчка',
            'order:before-deleted': 'Изтриване на поръчка',
            'client:before-created': 'Създаване на клиент',
            'client:before-updated': 'Редактиране на клиент',
            'client:before-deleted': 'Изтриване на клиент',
            'expense:before-created': 'Създаване на разход',
            'expense:before-updated': 'Редактиране на разход',
            'expense:before-deleted': 'Изтриване на разход',
            'inventory:before-created': 'Създаване на артикул',
            'inventory:before-updated': 'Редактиране на артикул',
            'inventory:before-deleted': 'Изтриване на артикул'
        };

        return actionTexts[action] || 'Неизвестно действие';
    }

    refreshCurrentView(onDone) {
        if (window.app?.ui?.currentView?.refresh) {
            setTimeout(async () => {
                try {
                    await window.app.ui.currentView.refresh();
                } finally {
                    if (typeof onDone === 'function') onDone();
                }
            }, 100);
        } else if (typeof onDone === 'function') {
            onDone();
        }

        // Обновяваме и Undo/Redo бутоните
        if (window.app?.ui?.updateUndoRedoButtons) {
            window.app.ui.updateUndoRedoButtons();
        }
    }

    canUndo() {
        return this.undoStack.length > 0;
    }

    canRedo() {
        return this.redoStack.length > 0;
    }

    getUndoCount() {
        return this.undoStack.length;
    }

    getRedoCount() {
        return this.redoStack.length;
    }

    clear() {
        this.undoStack = [];
        this.redoStack = [];
        console.log('🗑️ Undo/Redo stacks cleared');
    }

    // Debug информация
    getDebugInfo() {
        return {
            undoStackSize: this.undoStack.length,
            redoStackSize: this.redoStack.length,
            canUndo: this.canUndo(),
            canRedo: this.canRedo(),
            lastActions: this.undoStack.slice(-5).map(s => ({
                action: s.action,
                data: s.data,
                time: new Date(s.timestamp).toLocaleTimeString()
            }))
        };
    }
}