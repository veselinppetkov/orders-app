import { DebounceUtils } from '../../utils/DebounceUtils.js';

export default class OrdersView {
    constructor(modules, state, eventBus) {
        this.ordersModule = modules.orders;
        this.clientsModule = modules.clients;
        this.reportsModule = modules.reports;
        this.state = state;
        this.eventBus = eventBus;
        this.debouncedRefresh = DebounceUtils.debounce(() => this.refresh(), 300);
        this.storage = modules.orders.storage;
        this.filters = {
            status: 'all',
            search: '',
            origin: '',
            vendor: ''
        };
        this.selectedOrders = new Set(); // За bulk операции
    }

    render() {
        const stats = this.reportsModule.getMonthlyStats();
        const orders = this.ordersModule.filterOrders(this.filters);

        return `
            <div class="orders-view">
                ${this.renderStats(stats)}
                ${this.renderControls()}
                ${this.renderBulkActions()}
                ${this.renderFilters()}
                ${this.renderTable(orders)}
            </div>
        `;
    }

    renderBulkActions() {
        return `
        <div id="bulk-actions" class="bulk-actions" style="display: none;">
            <div class="bulk-info">
                <span id="selected-count">0</span> поръчки избрани
            </div>
            <div class="bulk-controls">
                <select id="bulk-status" class="bulk-select">
                    <option value="">-- Промени статус --</option>
                    <option value="Очакван">Очакван</option>
                    <option value="Доставен">Доставен</option>
                    <option value="Свободен">Свободен</option>
                    <option value="Други">Други</option>
                </select>
                <button class="btn btn-sm" id="apply-bulk-status">
                    Приложи
                </button>
                <button class="btn btn-sm secondary" id="clear-selection">
                    Изчисти избора
                </button>
                <button class="btn btn-sm danger" id="bulk-delete">
                    Изтрий избраните
                </button>
            </div>
        </div>
    `;
    }

    renderTable(orders) {
        return `
            <div style="overflow-x: auto;">
                <table class="orders-table">
                    <thead>
                        <tr>
                            <th style="width: 40px;"></th>
                            <th>Дата</th>
                            <th>Клиент</th>
                            <th>Телефон</th>
                            <th>Източник</th>
                            <th>Доставчик</th>
                            <th>Модел</th>
                            <th>Общо (BGN)</th>
                            <th>П-на цена (BGN)</th>
                            <th>Баланс (BGN)</th>
                            <th>Пълен сет</th>
                            <th>Статус</th>
                            <th>Бележки</th>
                            <th>Действия</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${orders.map(order => this.renderOrderRow(order)).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    renderOrderRow(order) {
        const statusClass = this.ordersModule.getStatusClass(order.status);
        const isSelected = this.selectedOrders.has(order.id);

        return `
            <tr data-order-id="${order.id}" class="${isSelected ? 'selected-row' : ''}">
                <td>
                    <input type="checkbox" 
                           class="order-checkbox" 
                           data-id="${order.id}"
                           ${isSelected ? 'checked' : ''}>
                </td>
                <td>${this.formatDate(order.date)}</td>
                <td>${order.client}</td>
                <td>${order.phone || ''}</td>
                <td><span class="badge" style="background: ${this.getOriginColor(order.origin)}">${order.origin}</span></td>
                <td>${order.vendor}</td>
                <td class="image-cell">
                    ${order.imageData ?
            `<img src="${order.imageData}" 
                             class="model-image" 
                             alt="${order.model}" 
                             title="${order.model}"
                             onclick="window.app.ui.modals.open({
                                 type: 'image',
                                 imageSrc: '${order.imageData}',
                                 title: '${order.model}',
                                 caption: 'Клиент: ${order.client} | Дата: ${this.formatDate(order.date)}'
                             })">` :
            `<div class="no-image-placeholder">${order.model}</div>`
        }
                </td>
                <td><strong>${order.totalBGN.toFixed(2)} лв</strong></td>
                <td>${order.sellBGN.toFixed(2)} лв</td>
                <td><strong style="color: ${order.balanceBGN < 0 ? '#dc3545' : '#28a745'}">${order.balanceBGN.toFixed(2)} лв</strong></td>
                <td>${order.fullSet ? '✅' : '❌'}</td>
                <td><span class="status-badge ${statusClass}">${order.status}</span></td>
                <td>${order.notes}</td>
<td>
    <button class="btn btn-sm" data-action="edit" data-id="${order.id}" title="Редактиране">✏️</button>
    <button class="btn btn-sm info" data-action="duplicate" data-id="${order.id}" title="Дублиране">📋</button>
    <button class="btn btn-sm danger" data-action="delete" data-id="${order.id}" title="Изтриване">🗑️</button>
</td>
            </tr>
        `;
    }

    attachListeners() {
        // Existing listeners...
        this.attachExistingListeners();

        // Bulk operation listeners
        this.attachBulkListeners();
    }

    attachBulkListeners() {
        // Select all checkbox
        document.getElementById('select-all')?.addEventListener('change', (e) => {
            const checkboxes = document.querySelectorAll('.order-checkbox');
            checkboxes.forEach(cb => {
                cb.checked = e.target.checked;
                const orderId = parseInt(cb.dataset.id);
                if (e.target.checked) {
                    this.selectedOrders.add(orderId);
                } else {
                    this.selectedOrders.delete(orderId);
                }
            });
            this.updateBulkUI();
        });

        // Individual checkboxes
        document.querySelectorAll('.order-checkbox').forEach(cb => {
            cb.addEventListener('change', (e) => {
                const orderId = parseInt(e.target.dataset.id);
                if (e.target.checked) {
                    this.selectedOrders.add(orderId);
                } else {
                    this.selectedOrders.delete(orderId);
                }
                this.updateBulkUI();
            });
        });

        // ДОБАВЕТЕ ТЕЗИ НОВИ LISTENERS ТУК:
        // Bulk action buttons
        document.getElementById('apply-bulk-status')?.addEventListener('click', () => {
            this.applyBulkStatus();
        });

        document.getElementById('clear-selection')?.addEventListener('click', () => {
            this.clearSelection();
        });

        document.getElementById('bulk-delete')?.addEventListener('click', () => {
            this.bulkDelete();
        });
    }

    updateBulkUI() {
        const bulkActions = document.getElementById('bulk-actions');
        const selectedCount = document.getElementById('selected-count');

        if (this.selectedOrders.size > 0) {
            bulkActions.style.display = 'flex';
            selectedCount.textContent = this.selectedOrders.size;

            // Update rows visual state
            document.querySelectorAll('tr[data-order-id]').forEach(row => {
                const orderId = parseInt(row.dataset.orderId);
                if (this.selectedOrders.has(orderId)) {
                    row.classList.add('selected-row');
                } else {
                    row.classList.remove('selected-row');
                }
            });
        } else {
            bulkActions.style.display = 'none';
        }
    }

    applyBulkStatus() {
        const newStatus = document.getElementById('bulk-status').value;
        if (!newStatus) {
            this.eventBus.emit('notification:show', {
                message: 'Моля изберете статус',
                type: 'error'
            });
            return;
        }

        if (confirm(`Промяна на статуса на ${this.selectedOrders.size} поръчки на "${newStatus}"?`)) {
            let updated = 0;

            // Директно обновяване в localStorage
            const monthlyData = JSON.parse(localStorage.getItem('orderSystem_monthlyData'));
            const currentMonth = this.state.get('currentMonth');

            this.selectedOrders.forEach(orderId => {
                const orderIndex = monthlyData[currentMonth].orders.findIndex(o => o.id === orderId);
                if (orderIndex !== -1) {
                    monthlyData[currentMonth].orders[orderIndex].status = newStatus;
                    updated++;
                }
            });

            // Запазване
            localStorage.setItem('orderSystem_monthlyData', JSON.stringify(monthlyData));

            // Обновяване на state
            this.state.set('monthlyData', monthlyData);

            this.eventBus.emit('notification:show', {
                message: `Статусът на ${updated} поръчки е променен`,
                type: 'success'
            });

            // Презареждане на цялото view
            this.selectedOrders.clear();
            window.app.ui.switchView('orders');
        }
    }

    bulkDelete() {
        if (confirm(`Сигурни ли сте, че искате да изтриете ${this.selectedOrders.size} поръчки?`)) {
            let deleted = 0;
            const orderIds = Array.from(this.selectedOrders); // Convert to array first

            // Delete each order individually to ensure proper state management
            orderIds.forEach(orderId => {
                try {
                    this.ordersModule.delete(orderId);
                    deleted++;
                } catch (error) {
                    console.error(`Error deleting order ${orderId}:`, error);
                }
            });

            // Clear selection immediately
            this.selectedOrders.clear();

            // Show notification
            this.eventBus.emit('notification:show', {
                message: `${deleted} поръчки бяха изтрити`,
                type: 'success'
            });

            // Force immediate UI refresh without timeout
            this.refresh();

            // Update bulk UI state
            this.updateBulkUI();
        }
    }

    clearSelection() {
        this.selectedOrders.clear();
        document.querySelectorAll('.order-checkbox').forEach(cb => cb.checked = false);
        document.getElementById('select-all').checked = false;
        this.updateBulkUI();
    }

    // Останалите методи остават същите...
    attachExistingListeners() {
        // Копирайте всички съществуващи listeners тук
        // New order button
        document.getElementById('new-order-btn')?.addEventListener('click', () => {
            this.eventBus.emit('modal:open', { type: 'order', mode: 'create' });
        });

        // Status filters
        document.querySelectorAll('[data-filter-status]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.filters.status = e.target.dataset.filterStatus;
                this.refresh();
            });
        });

        // Search input
        document.getElementById('searchInput')?.addEventListener('input', (e) => {
            this.filters.search = e.target.value;
            this.debouncedRefresh();
        });

        // Origin filter
        document.getElementById('filterOrigin')?.addEventListener('change', (e) => {
            this.filters.origin = e.target.value;
            this.refresh();
        });

        // Vendor filter
        document.getElementById('filterVendor')?.addEventListener('change', (e) => {
            this.filters.vendor = e.target.value;
            this.refresh();
        });

        // Order actions
        document.querySelectorAll('[data-action="edit"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const orderId = parseInt(e.target.dataset.id);
                this.eventBus.emit('modal:open', { type: 'order', mode: 'edit', id: orderId });
            });
        });

        document.querySelectorAll('[data-action="duplicate"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const orderId = parseInt(e.target.dataset.id);
                this.eventBus.emit('modal:open', { type: 'order', mode: 'duplicate', id: orderId });
            });
        });

        document.querySelectorAll('[data-action="delete"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const orderId = parseInt(e.target.dataset.id);
                if (confirm('Сигурни ли сте, че искате да изтриете тази поръчка?')) {
                    this.ordersModule.delete(orderId);
                    this.refresh();
                }
            });
        });
    }

// js/ui/views/OrdersView.js - Replace the refresh() method

    refresh() {
        // Store current focus info before DOM destruction
        const focusedElement = document.activeElement;
        const focusId = focusedElement?.id;
        const selectionStart = focusedElement?.selectionStart;
        const selectionEnd = focusedElement?.selectionEnd;
        const isSearchInput = focusId === 'searchInput';

        // Clear selection and re-render
        this.selectedOrders.clear();
        const container = document.getElementById('view-container');
        if (container) {
            container.innerHTML = this.render();
            this.attachListeners();

            // Restore focus if it was on search input
            if (isSearchInput) {
                const newSearchInput = document.getElementById('searchInput');
                if (newSearchInput) {
                    newSearchInput.focus();
                    // Restore cursor position
                    if (typeof selectionStart === 'number') {
                        newSearchInput.setSelectionRange(selectionStart, selectionEnd);
                    }
                }
            }
        }
    }

// Добави нов метод за smart refresh
    smartRefresh(eventData) {
        // Ако поръчката е създадена/обновена в друг месец, покажи предупреждение
        if (eventData && eventData.createdInMonth) {
            const currentMonth = this.state.get('currentMonth');
            if (eventData.createdInMonth !== currentMonth) {
                this.eventBus.emit('notification:show', {
                    message: `Поръчката е създадена в ${this.formatMonth(eventData.createdInMonth)}. Сменете месеца за да я видите.`,
                    type: 'info'
                });
            }
        }

        if (eventData && eventData.movedToMonth) {
            const currentMonth = this.state.get('currentMonth');
            if (eventData.movedToMonth !== currentMonth) {
                this.eventBus.emit('notification:show', {
                    message: `Поръчката е преместена в ${this.formatMonth(eventData.movedToMonth)}. Сменете месеца за да я видите.`,
                    type: 'info'
                });
            }
        }

        this.refresh();
    }

    formatMonth(monthKey) {
        const [year, month] = monthKey.split('-');
        const months = ['Ян', 'Фев', 'Мар', 'Апр', 'Май', 'Юни', 'Юли', 'Авг', 'Сеп', 'Окт', 'Ное', 'Дек'];
        return `${months[parseInt(month) - 1]} ${year}`;
    }

    // Utility methods remain the same
    renderStats(stats) {
        return `
            <div class="month-stats">
                <div class="stat-item">
                    <div class="stat-label">Поръчки този месец</div>
                    <div class="stat-value">${stats.orderCount}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">Приходи</div>
                    <div class="stat-value">${stats.revenue.toFixed(2)} лв</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">Разходи</div>
                    <div class="stat-value">${stats.expenses.toFixed(2)} лв</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">Печалба</div>
                    <div class="stat-value">${stats.profit.toFixed(2)} лв</div>
                </div>
            </div>
        `;
    }

    renderControls() {
        return `
            <div class="controls">
                <button class="btn" id="new-order-btn">➕ Нова поръчка</button>
                <button class="btn secondary" data-filter-status="all">Всички</button>
                <button class="btn" style="background: #ffc107;" data-filter-status="pending">Очаквани</button>
                <button class="btn success" data-filter-status="delivered">Доставени</button>
                <button class="btn info" data-filter-status="free">Свободни</button>
                <button class="btn info" data-filter-status="other">Други</button>
            </div>
        `;
    }

    renderFilters() {
        const settings = this.state.get('settings');
        return `
            <div class="filter-section">
                <div class="filter-group">
                    <label>Търсене:</label>
                    <input type="text" id="searchInput" placeholder="Клиент, модел..." value="${this.filters.search}">
                </div>
                <div class="filter-group">
                    <label>Източник:</label>
                    <select id="filterOrigin">
                        <option value="">Всички</option>
                        ${settings.origins.map(o => `<option value="${o}">${o}</option>`).join('')}
                    </select>
                </div>
                <div class="filter-group">
                    <label>Доставчик:</label>
                    <select id="filterVendor">
                        <option value="">Всички</option>
                        ${settings.vendors.map(v => `<option value="${v}">${v}</option>`).join('')}
                    </select>
                </div>
            </div>
        `;
    }

    formatDate(dateStr) {
        return new Date(dateStr).toLocaleDateString('bg-BG');
    }

    getOriginColor(origin) {
        const colors = {
            'OLX': '#dc3545',
            'Bazar.bg': '#ff9800',
            'Instagram': '#667eea',
            'WhatsApp': '#28a745',
            'Facebook': '#3b5998',
            'IG Ads': '#764ba2'
        };
        return colors[origin] || '#6c757d';
    }
}