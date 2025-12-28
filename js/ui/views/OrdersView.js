import { DebounceUtils } from '../../utils/DebounceUtils.js';
import { FormatUtils } from '../../utils/FormatUtils.js';
import { CurrencyUtils } from '../../utils/CurrencyUtils.js';

export default class OrdersView {
    constructor(modules, state, eventBus) {
        this.ordersModule = modules.orders;
        this.clientsModule = modules.clients;
        this.reportsModule = modules.reports;
        this.settingsModule = modules.settings;
        this.state = state;
        this.eventBus = eventBus;
        this.debouncedRefresh = DebounceUtils.debounce(() => this.refresh(), 300);
        this.storage = modules.orders.storage;
        this.filters = {
            status: 'all',
            search: '',
            origin: '',
            vendor: '',
            model: '',
            showAllMonths: false
        };
        this.selectedOrders = new Set(); // For bulk operations

        this.pagination = {
            currentPage: 1,
            ordersPerPage: 25,
            totalOrders: 0,
            totalPages: 0
        };
    }

    async render() {
        try {
            const stats = await this.reportsModule.getMonthlyStats();
            const allOrders = await this.ordersModule.filterOrders(this.filters);

            // Calculate free watches count across all months - use getAllOrders() not getOrders(null)
            const allMonthsOrders = await this.ordersModule.getAllOrders();
            const freeCount = allMonthsOrders.filter(o => o.status === 'Свободен').length;

            // ADD: Update pagination totals
            this.updatePaginationTotals(allOrders.length);

            // ADD: Get current page orders
            const ordersForPage = this.getCurrentPageOrders(allOrders);

            return `
        <div class="orders-view">
            ${this.renderStats(stats)}
            ${this.renderControls(freeCount)}
            ${this.renderBulkActions()}
            ${await this.renderFilters()}
            ${this.renderActiveFilters()}
            ${this.renderPaginationInfo()}
            ${this.renderTable(ordersForPage)}
            ${this.renderPaginationControls()}
        </div>
        `;

        } catch (error) {
            console.error('❌ Failed to render orders view:', error);
            return `
            <div class="error-state">
                <h3>❌ Failed to load orders</h3>
                <p>Error: ${error.message}</p>
                <button onclick="window.app.ui.currentView.refresh()" class="btn">🔄 Retry</button>
            </div>
        `;
        }
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
                            <th style="width: 40px;">
                                <input type="checkbox" id="select-all">
                            </th>
                            <th>Дата</th>
                            <th>Клиент</th>
                            <th>Телефон</th>
                            <th>Източник</th>
                            <th>Доставчик</th>
                            <th>Модел</th>
                            <th>Общо (€)</th>
                            <th>П-на цена (€)</th>
                            <th>Баланс (€)</th>
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
            <td>
                <span class="badge origin-badge" 
                      style="background: ${FormatUtils.getOriginColor(order.origin)}; color: ${FormatUtils.getContrastTextColor(FormatUtils.getOriginColor(order.origin))}">
                    ${order.origin}
                </span>
            </td>
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
            <td><strong>${CurrencyUtils.formatAmount(order.totalEUR, 'EUR')}</strong></td>
            <td>${CurrencyUtils.formatAmount(order.sellEUR, 'EUR')}</td>
            <td><strong style="color: ${order.balanceEUR < 0 ? '#dc3545' : '#28a745'}">${CurrencyUtils.formatAmount(order.balanceEUR, 'EUR')}</strong></td>
            <td>${order.fullSet ? '✅' : '❌'}</td>
            <td>
                <span class="status-badge clickable"
                      data-order-id="${order.id}"
                      data-current-status="${order.status}"
                      style="background: ${FormatUtils.getStatusColor(order.status)}; color: ${FormatUtils.getContrastTextColor(FormatUtils.getStatusColor(order.status))}"
                      title="Кликнете за промяна на статуса">
                    ${order.status}
                </span>
            </td>
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
        // All existing listeners made async
        this.attachExistingListeners();
        this.attachBulkListeners();
        document.addEventListener('click', (e) => {
            if (e.target.id === 'page-first') {
                this.goToPage(1);
            } else if (e.target.id === 'page-prev') {
                this.goToPage(this.pagination.currentPage - 1);
            } else if (e.target.id === 'page-next') {
                this.goToPage(this.pagination.currentPage + 1);
            } else if (e.target.id === 'page-last') {
                this.goToPage(this.pagination.totalPages);
            } else if (e.target.classList.contains('page-num')) {
                const page = parseInt(e.target.dataset.page);
                this.goToPage(page);
            }
        });

        // UPDATE: Filter handlers to reset pagination
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.filters.search = e.target.value;
                this.applyFilters(); // This now resets pagination
            });
        }
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

        // Bulk action buttons
        document.getElementById('apply-bulk-status')?.addEventListener('click', async () => {
            await this.applyBulkStatus();
        });

        document.getElementById('clear-selection')?.addEventListener('click', () => {
            this.clearSelection();
        });

        document.getElementById('bulk-delete')?.addEventListener('click', async () => {
            await this.bulkDelete();
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

    async applyBulkStatus() {
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
            const orderIds = Array.from(this.selectedOrders);

            // Show progress
            this.eventBus.emit('notification:show', {
                message: `🔄 Обновяване на ${orderIds.length} поръчки...`,
                type: 'info'
            });

            for (const orderId of orderIds) {
                try {
                    // Find the order first
                    const result = await this.ordersModule.findOrderById(orderId);
                    if (result && result.order) {
                        // Update with new status
                        const updatedOrderData = { ...result.order, status: newStatus };
                        await this.ordersModule.update(orderId, updatedOrderData);
                        updated++;
                    }
                } catch (error) {
                    console.error(`❌ Error updating order ${orderId}:`, error);
                }
            }

            this.eventBus.emit('notification:show', {
                message: `✅ Статусът на ${updated} поръчки е променен`,
                type: 'success'
            });

            this.selectedOrders.clear();
            await this.refresh();
            this.updateBulkUI();
        }
    }

    async bulkDelete() {
        if (confirm(`Сигурни ли сте, че искате да изтриете ${this.selectedOrders.size} поръчки?`)) {
            let deleted = 0;
            const orderIds = Array.from(this.selectedOrders);

            // Show progress for bulk operations
            this.eventBus.emit('notification:show', {
                message: `🔄 Изтриване на ${orderIds.length} поръчки...`,
                type: 'info'
            });

            for (const orderId of orderIds) {
                try {
                    await this.ordersModule.delete(orderId);
                    deleted++;
                } catch (error) {
                    console.error(`❌ Error deleting order ${orderId}:`, error);
                }
            }

            this.selectedOrders.clear();

            this.eventBus.emit('notification:show', {
                message: `✅ ${deleted} поръчки бяха изтрити`,
                type: 'success'
            });

            await this.refresh();
            this.updateBulkUI();
        }
    }

    clearSelection() {
        this.selectedOrders.clear();
        document.querySelectorAll('.order-checkbox').forEach(cb => cb.checked = false);
        document.getElementById('select-all').checked = false;
        this.updateBulkUI();
    }

    // All existing listeners made async
    attachExistingListeners() {
        // Status badge click handlers
        document.querySelectorAll('.status-badge.clickable').forEach(badge => {
            badge.addEventListener('click', (e) => {
                e.stopPropagation();
                this.showStatusPopover(e.target);
            });
        });

        // Close popover when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.status-popover') && !e.target.closest('.status-badge')) {
                this.closeStatusPopover();
            }
        });

        // New order button
        document.getElementById('new-order-btn')?.addEventListener('click', () => {
            this.eventBus.emit('modal:open', { type: 'order', mode: 'create' });
        });

        // Free watches button - Show all free items across all months
        document.getElementById('show-free-btn')?.addEventListener('click', async () => {
            this.filters.status = 'Свободен';
            this.filters.showAllMonths = true;
            this.filters.search = ''; // Clear search to show all free items
            this.pagination.currentPage = 1; // Reset to first page
            await this.refresh();
        });

        // Status filters
        document.querySelectorAll('[data-filter-status]').forEach(btn => {
            btn.addEventListener('click', async (e) => { // MAKE ASYNC
                this.filters.status = e.target.dataset.filterStatus;
                this.filters.showAllMonths = false; // Reset showAllMonths when using regular status filter
                await this.refresh(); // ADD AWAIT
            });
        });

        // Search input - DEBOUNCED ASYNC
        document.getElementById('searchInput')?.addEventListener('input', (e) => {
            this.filters.search = e.target.value;
            this.debouncedRefresh(); // This calls refresh() which is now async
        });

        // Model filter input
        document.getElementById('modelFilter')?.addEventListener('input', (e) => {
            this.filters.model = e.target.value;
            this.pagination.currentPage = 1; // Reset to first page
            this.debouncedRefresh();
        });

        // Origin filter
        document.getElementById('filterOrigin')?.addEventListener('change', async (e) => { // MAKE ASYNC
            this.filters.origin = e.target.value;
            await this.refresh(); // ADD AWAIT
        });

        // Vendor filter
        document.getElementById('filterVendor')?.addEventListener('change', async (e) => { // MAKE ASYNC
            this.filters.vendor = e.target.value;
            await this.refresh(); // ADD AWAIT
        });

        // Order actions - ALL ASYNC
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
            btn.addEventListener('click', async (e) => { // MAKE ASYNC
                const orderId = parseInt(e.target.dataset.id);
                if (confirm('Сигурни ли сте, че искате да изтриете тази поръчка?')) {
                    try {
                        await this.ordersModule.delete(orderId); // ADD AWAIT
                        await this.refresh(); // ADD AWAIT
                        this.eventBus.emit('notification:show', {
                            message: 'Поръчката е изтрита успешно!',
                            type: 'success'
                        });
                    } catch (error) {
                        console.error('❌ Delete failed:', error);
                        this.eventBus.emit('notification:show', {
                            message: 'Грешка при изтриване: ' + error.message,
                            type: 'error'
                        });
                    }
                }
            });
        });
    }

    // COMPLETE ASYNC REFRESH
    async refresh() {
        this.selectedOrders.clear();
        const container = document.getElementById('view-container');
        if (container) {
            // Show loading state
            container.innerHTML = `
            <div class="loading-state">
                <h3>📦 Loading orders...</h3>
                <p>Fetching data from database...</p>
            </div>
        `;

            try {
                // Load async content
                const content = await this.render();
                container.innerHTML = content;
                this.attachListeners();
            } catch (error) {
                console.error('❌ Failed to refresh orders view:', error);
                container.innerHTML = `
                <div class="error-state">
                    <h3>❌ Failed to load orders</h3>
                    <p>Error: ${error.message}</p>
                    <button onclick="window.app.ui.currentView.refresh()" class="btn">🔄 Retry</button>
                </div>
            `;
            }
        }
    }

    // Smart refresh for event handling
    async smartRefresh(eventData) {
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

        await this.refresh();
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
                    <div class="stat-value">${stats.revenue.toFixed(2)} €</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">Разходи</div>
                    <div class="stat-value">${stats.expenses.toFixed(2)} €</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">Печалба</div>
                    <div class="stat-value">${stats.profit.toFixed(2)} €</div>
                </div>
            </div>
        `;
    }

    renderControls(freeCount = 0) {
        return `
        <div class="controls">
            <button class="btn" id="new-order-btn">➕ Нова поръчка</button>
            <button class="btn secondary" data-filter-status="all">Всички</button>
            <button class="btn" style="background: #ffc107;" data-filter-status="Очакван">Очаквани</button>
            <button class="btn success" data-filter-status="Доставен">Доставени</button>
            <button class="btn info" data-filter-status="Други">Други</button>
            <button class="btn success" id="show-free-btn">🆓 Свободни часовници (${freeCount})</button>
        </div>
    `;
    }

    // MAKE FILTERS ASYNC to load settings
    async renderFilters() {
        try {
            const settings = await this.settingsModule.getSettings();

            return `
                <div class="filter-section">
                    <div class="filter-group">
                        <label>Търсене:</label>
                        <input type="text" id="searchInput" placeholder="Клиент, модел..." value="${this.filters.search}">
                    </div>
                    <div class="filter-group">
                        <label>Марка:</label>
                        <input type="text" id="modelFilter" placeholder="Rolex, OMEGA..." value="${this.filters.model}">
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
        } catch (error) {
            console.error('❌ Failed to load filter settings:', error);
            return `
                <div class="filter-section">
                    <div class="filter-group">
                        <label>Търсене:</label>
                        <input type="text" id="searchInput" placeholder="Клиент, модел..." value="${this.filters.search}">
                    </div>
                    <div class="error-message">Failed to load filter options</div>
                </div>
            `;
        }
    }

    renderActiveFilters() {
        if (this.filters.showAllMonths && this.filters.status === 'Свободен') {
            return `
                <div class="active-filter-badge" style="background: #d1ecf1; color: #0c5460; padding: 10px; margin: 10px 0; border-radius: 5px; display: flex; align-items: center; justify-content: space-between;">
                    <span>📊 Показване на всички свободни часовници от всички месеци</span>
                    <button onclick="window.app.ui.currentView.clearFilters()" class="btn btn-sm" style="background: #0c5460; color: white;">✕ Изчисти</button>
                </div>
            `;
        }
        return '';
    }

    clearFilters() {
        this.filters = {
            status: 'all',
            search: '',
            origin: '',
            vendor: '',
            model: '',
            showAllMonths: false
        };
        this.pagination.currentPage = 1;
        this.refresh();
    }

    // INLINE STATUS TOGGLE METHODS
    showStatusPopover(badgeElement) {
        // Close any existing popover
        this.closeStatusPopover();

        const orderId = parseInt(badgeElement.dataset.orderId);
        const currentStatus = badgeElement.dataset.currentStatus;

        // Available statuses
        const statuses = ['Очакван', 'Доставен', 'Свободен', 'Други'];

        // Create popover
        const popover = document.createElement('div');
        popover.className = 'status-popover';
        popover.innerHTML = `
            <div class="status-popover-header">Промяна на статус</div>
            <div class="status-popover-options">
                ${statuses.map(status => `
                    <button class="status-option ${status === currentStatus ? 'current' : ''}"
                            data-status="${status}"
                            data-order-id="${orderId}"
                            style="background: ${FormatUtils.getStatusColor(status)}; color: ${FormatUtils.getContrastTextColor(FormatUtils.getStatusColor(status))}"
                            ${status === currentStatus ? 'disabled' : ''}>
                        ${status}
                        ${status === currentStatus ? '<span class="current-indicator">✓</span>' : ''}
                    </button>
                `).join('')}
            </div>
        `;

        // Position popover
        const rect = badgeElement.getBoundingClientRect();
        popover.style.position = 'absolute';
        popover.style.top = `${rect.bottom + window.scrollY + 5}px`;
        popover.style.left = `${rect.left + window.scrollX}px`;
        popover.style.zIndex = '1000';

        // Add to DOM
        document.body.appendChild(popover);

        // Attach option click handlers
        popover.querySelectorAll('.status-option:not([disabled])').forEach(option => {
            option.addEventListener('click', async (e) => {
                const newStatus = e.currentTarget.dataset.status;
                const orderId = parseInt(e.currentTarget.dataset.orderId);
                await this.updateOrderStatus(orderId, newStatus, badgeElement);
            });
        });

        // Store reference for cleanup
        this.activePopover = popover;
    }

    closeStatusPopover() {
        if (this.activePopover) {
            this.activePopover.remove();
            this.activePopover = null;
        }
    }

    async updateOrderStatus(orderId, newStatus, badgeElement) {
        const oldStatus = badgeElement.dataset.currentStatus;

        // Store original state for rollback
        const originalBadge = {
            text: badgeElement.textContent.trim(),
            background: badgeElement.style.background,
            color: badgeElement.style.color,
            status: oldStatus
        };

        try {
            // OPTIMISTIC UI UPDATE
            badgeElement.textContent = newStatus;
            badgeElement.style.background = FormatUtils.getStatusColor(newStatus);
            badgeElement.style.color = FormatUtils.getContrastTextColor(FormatUtils.getStatusColor(newStatus));
            badgeElement.dataset.currentStatus = newStatus;
            badgeElement.classList.add('updating');

            // Close popover
            this.closeStatusPopover();

            // Show loading state
            this.eventBus.emit('notification:show', {
                message: '🔄 Обновяване на статус...',
                type: 'info'
            });

            // Find and update the order
            const result = await this.ordersModule.findOrderById(orderId);
            if (!result || !result.order) {
                throw new Error('Поръчката не е намерена');
            }

            // Update order with new status
            const updatedOrderData = { ...result.order, status: newStatus };
            await this.ordersModule.update(orderId, updatedOrderData);

            // Success feedback
            badgeElement.classList.remove('updating');
            badgeElement.classList.add('update-success');
            setTimeout(() => badgeElement.classList.remove('update-success'), 1000);

            this.eventBus.emit('notification:show', {
                message: `✅ Статусът е променен на "${newStatus}"`,
                type: 'success'
            });

        } catch (error) {
            console.error('❌ Status update failed:', error);

            // ROLLBACK UI
            badgeElement.textContent = originalBadge.text;
            badgeElement.style.background = originalBadge.background;
            badgeElement.style.color = originalBadge.color;
            badgeElement.dataset.currentStatus = originalBadge.status;
            badgeElement.classList.remove('updating');
            badgeElement.classList.add('update-error');
            setTimeout(() => badgeElement.classList.remove('update-error'), 1000);

            this.eventBus.emit('notification:show', {
                message: '❌ Грешка при промяна на статус: ' + error.message,
                type: 'error'
            });
        }
    }

    formatDate(dateStr) {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        const day = date.getDate().toString().padStart(2, '0');
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const year = date.getFullYear();
        return `${day}.${month}.${year}`;
    }

// ADD: Pagination logic methods
    updatePaginationTotals(totalOrders) {
        this.pagination.totalOrders = totalOrders;
        this.pagination.totalPages = Math.ceil(totalOrders / this.pagination.ordersPerPage);

        // Keep current page within bounds
        if (this.pagination.currentPage > this.pagination.totalPages) {
            this.pagination.currentPage = Math.max(1, this.pagination.totalPages);
        }
    }

    getCurrentPageOrders(allOrders) {
        const start = (this.pagination.currentPage - 1) * this.pagination.ordersPerPage;
        const end = start + this.pagination.ordersPerPage;
        return allOrders.slice(start, end);
    }

    renderPaginationInfo() {
        if (this.pagination.totalOrders === 0) return '';

        const start = (this.pagination.currentPage - 1) * this.pagination.ordersPerPage + 1;
        const end = Math.min(start + this.pagination.ordersPerPage - 1, this.pagination.totalOrders);

        return `
        <div class="pagination-info">
            Показани <strong>${start}-${end}</strong> от <strong>${this.pagination.totalOrders}</strong> поръчки
        </div>
    `;
    }

    renderPaginationControls() {
        if (this.pagination.totalPages <= 1) return '';

        const { currentPage, totalPages } = this.pagination;

        return `
        <div class="pagination-controls">
            <button class="btn pagination-btn" 
                    id="page-first" 
                    ${currentPage === 1 ? 'disabled' : ''}>
                « Първа
            </button>
            <button class="btn pagination-btn" 
                    id="page-prev" 
                    ${currentPage === 1 ? 'disabled' : ''}>
                ‹ Предишна
            </button>
            
            <div class="page-numbers">
                ${this.renderPageNumbers()}
            </div>
            
            <button class="btn pagination-btn" 
                    id="page-next" 
                    ${currentPage === totalPages ? 'disabled' : ''}>
                Следваща ›
            </button>
            <button class="btn pagination-btn" 
                    id="page-last" 
                    ${currentPage === totalPages ? 'disabled' : ''}>
                Последна »
            </button>
        </div>
    `;
    }

    renderPageNumbers() {
        const { currentPage, totalPages } = this.pagination;
        const pageNumbers = [];

        // Show max 7 page numbers with smart truncation
        const maxVisible = 7;
        let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
        let end = Math.min(totalPages, start + maxVisible - 1);

        // Adjust start if we're near the end
        if (end - start + 1 < maxVisible) {
            start = Math.max(1, end - maxVisible + 1);
        }

        // Always show first page
        if (start > 1) {
            pageNumbers.push(`<button class="btn page-num" data-page="1">1</button>`);
            if (start > 2) {
                pageNumbers.push(`<span class="page-ellipsis">...</span>`);
            }
        }

        // Show page range
        for (let i = start; i <= end; i++) {
            const isActive = i === currentPage ? 'active' : '';
            pageNumbers.push(`<button class="btn page-num ${isActive}" data-page="${i}">${i}</button>`);
        }

        // Always show last page
        if (end < totalPages) {
            if (end < totalPages - 1) {
                pageNumbers.push(`<span class="page-ellipsis">...</span>`);
            }
            pageNumbers.push(`<button class="btn page-num" data-page="${totalPages}">${totalPages}</button>`);
        }

        return pageNumbers.join('');
    }

    goToPage(page) {
        const newPage = Math.max(1, Math.min(page, this.pagination.totalPages));
        if (newPage !== this.pagination.currentPage) {
            this.pagination.currentPage = newPage;
            this.selectedOrders.clear(); // Clear selection when changing pages
            this.refresh();
        }
    }

// ADD: Reset pagination when filters change
    async applyFilters() {
        this.pagination.currentPage = 1; // Reset to first page
        await this.debouncedRefresh();
    }
}