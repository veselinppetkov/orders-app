import { DebounceUtils } from '../../utils/DebounceUtils.js';
import { FormatUtils } from '../../utils/FormatUtils.js';
import { CurrencyUtils } from '../../utils/CurrencyUtils.js';

const esc = FormatUtils.escapeHtml;

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
            showAllMonths: false,
            recentlyDelivered: false
        };
        this.selectedOrders = new Set(); // For bulk operations
        this.sortBy = null;
        this.sortDir = 'asc';

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
            const allOrders = this.filters.recentlyDelivered
                ? await this.ordersModule.getRecentlyDelivered(10)
                : await this.ordersModule.filterOrders(this.filters);

            // Calculate free watches count across all months - use getAllOrders() not getOrders(null)
            const allMonthsOrders = await this.ordersModule.getAllOrders();
            const freeCountTotal = allMonthsOrders.filter(o => o.status === 'Свободен').length;

            // Calculate free watches count for current month only
            const currentMonth = this.state.get('currentMonth');
            const currentMonthOrders = await this.ordersModule.getOrders(currentMonth);
            const freeCountMonth = currentMonthOrders.filter(o => o.status === 'Свободен').length;

            // Sort before pagination
            if (this.sortBy) {
                const dir = this.sortDir === 'asc' ? 1 : -1;
                allOrders.sort((a, b) => {
                    let va = a[this.sortBy], vb = b[this.sortBy];
                    if (typeof va === 'string') va = va.toLowerCase();
                    if (typeof vb === 'string') vb = vb.toLowerCase();
                    if (va == null) return 1;
                    if (vb == null) return -1;
                    return va < vb ? -dir : va > vb ? dir : 0;
                });
            }

            // ADD: Update pagination totals
            this.updatePaginationTotals(allOrders.length);

            // ADD: Get current page orders
            const ordersForPage = this.getCurrentPageOrders(allOrders);

            return `
        <div class="orders-view">
            ${this.renderStats(stats)}
            ${this.renderControls(freeCountMonth, freeCountTotal)}
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
                <p>Error: ${esc(error.message)}</p>
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

    _sortArrow(field) {
        if (this.sortBy !== field) return `<span class="sort-arrow">⇅</span>`;
        return `<span class="sort-arrow active">${this.sortDir === 'asc' ? '↑' : '↓'}</span>`;
    }

    renderTable(orders) {
        const sa = this.sortBy;
        const thClass = (f) => `data-sort="${f}"${sa === f ? ' class="sort-active"' : ''}`;
        return `
            <div style="overflow-x: auto;">
                <table class="orders-table">
                    <thead>
                        <tr>
                            <th style="width: 38px;"><input type="checkbox" id="select-all"></th>
                            <th ${thClass('date')} title="Сортирай по дата">Дата ${this._sortArrow('date')}</th>
                            <th ${thClass('client')} title="Сортирай по клиент">Клиент ${this._sortArrow('client')}</th>
                            <th ${thClass('origin')} title="Сортирай поизточник">Произход / Доставчик ${this._sortArrow('origin')}</th>
                            <th ${thClass('model')} title="Сортирай по модел">Модел ${this._sortArrow('model')}</th>
                            <th ${thClass('totalEUR')} title="Сортирай по суми">Суми ${this._sortArrow('totalEUR')}</th>
                            <th ${thClass('status')} title="Сортирай по статус">Статус ${this._sortArrow('status')}</th>
                            <th style="width: 100px;">Действия</th>
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
        const isSelected = this.selectedOrders.has(order.id);

        // Model cell: image/placeholder + fullSet badge + note dot
        const imageInner = order.imageData
            ? `<img src="${esc(order.imageData)}"
                     class="model-image image-clickable"
                     data-order-id="${order.id}"
                     alt="${esc(order.model)}"
                     title="${esc(order.model)}">`
            : `<div class="no-image-placeholder">${esc(order.model)}</div>`;
        const fullSetDot  = order.fullSet  ? `<span class="model-badge fullset-dot"  title="Пълен сет">✓</span>` : '';
        const noteDot     = order.notes    ? `<span class="model-badge note-dot"      title="${esc(order.notes)}">✎</span>` : '';
        const modelCell   = `<div class="model-cell-wrap">${imageInner}${fullSetDot}${noteDot}</div>`;

        const balanceColor = order.balanceEUR < 0
            ? 'var(--text-danger-strong)'
            : 'var(--text-success-strong)';

        return `
        <tr data-order-id="${order.id}" class="order-row clickable-row${isSelected ? ' selected-row' : ''}">
            <td class="cell-checkbox"><input type="checkbox" class="order-checkbox" data-id="${order.id}" ${isSelected ? 'checked' : ''}></td>
            <td class="cell-date">${this.formatDate(order.date)}</td>
            <td class="cell-client">
                <div class="cell-stack">
                    <span class="cell-primary">${esc(order.client)}</span>
                    ${order.phone ? `<span class="cell-secondary">${esc(order.phone)}</span>` : ''}
                </div>
            </td>
            <td class="cell-origin">
                <div class="cell-stack">
                    <span class="badge origin-badge"
                          style="background: ${FormatUtils.getOriginColor(order.origin)}; color: ${FormatUtils.getContrastTextColor(FormatUtils.getOriginColor(order.origin))}">
                        ${esc(order.origin)}
                    </span>
                    <span class="cell-secondary">${esc(order.vendor)}</span>
                </div>
            </td>
            <td class="cell-model image-cell">${modelCell}</td>
            <td class="cell-amounts">
                <div class="cell-stack">
                    <span class="cell-primary amounts-total"><strong>${CurrencyUtils.formatAmount(order.totalEUR, 'EUR')}</strong></span>
                    <span class="cell-secondary amounts-balance" style="color: ${balanceColor}">${CurrencyUtils.formatAmount(order.balanceEUR, 'EUR')}</span>
                    <span class="cell-tertiary amounts-sell">→ ${CurrencyUtils.formatAmount(order.sellEUR, 'EUR')}</span>
                </div>
            </td>
            <td class="cell-status">
                <span class="status-badge clickable"
                      data-order-id="${order.id}"
                      data-current-status="${esc(order.status)}"
                      style="background: ${FormatUtils.getStatusColor(order.status)}; color: ${FormatUtils.getContrastTextColor(FormatUtils.getStatusColor(order.status))}"
                      title="Кликнете за промяна на статуса">
                    ${esc(order.status)}
                </span>
            </td>
            <td class="cell-actions actions-cell">
                <div class="row-actions">
                    <button class="btn btn-sm" data-action="edit" data-id="${order.id}" title="Редактиране">✏️</button>
                    <button class="btn btn-sm info" data-action="duplicate" data-id="${order.id}" title="Дублиране">📋</button>
                    <button class="btn btn-sm danger" data-action="delete" data-id="${order.id}" title="Изтриване">🗑️</button>
                </div>
            </td>
        </tr>
    `;
    }

    // ── Side Drawer ────────────────────────────────────────────────────────────

    async openDrawer(orderId) {
        this.closeDrawer();
        const result = await this.ordersModule.findOrderById(orderId);
        if (!result?.order) return;
        const o = result.order;

        const overlay = document.createElement('div');
        overlay.id = 'order-drawer-overlay';
        overlay.addEventListener('click', () => this.closeDrawer());

        // ESC closes drawer — store handler for cleanup in closeDrawer()
        this._drawerEscHandler = (e) => { if (e.key === 'Escape') this.closeDrawer(); };
        document.addEventListener('keydown', this._drawerEscHandler);

        const balanceColor = o.balanceEUR < 0 ? 'var(--text-danger-strong)' : 'var(--text-success-strong)';
        const imageHtml = o.imageData
            ? `<img src="${esc(o.imageData)}" class="drawer-image" alt="${esc(o.model)}">`
            : '';

        const drawer = document.createElement('div');
        drawer.id = 'order-drawer';
        drawer.className = 'side-drawer';
        drawer.innerHTML = `
            <div class="drawer-header">
                <div class="drawer-title">
                    <span class="drawer-client">${esc(o.client)}</span>
                    <span class="status-badge" style="background: ${FormatUtils.getStatusColor(o.status)}; color: ${FormatUtils.getContrastTextColor(FormatUtils.getStatusColor(o.status))}">${esc(o.status)}</span>
                </div>
                <button class="drawer-close" id="drawer-close-btn">✕</button>
            </div>
            <div class="drawer-body">
                ${imageHtml ? `<div class="drawer-section drawer-image-section">${imageHtml}</div>` : ''}
                <div class="drawer-section">
                    <div class="drawer-meta-grid">
                        <div class="drawer-meta-item"><span class="drawer-label">Дата</span><span>${esc(o.date || '')}</span></div>
                        <div class="drawer-meta-item"><span class="drawer-label">Телефон</span><span>${esc(o.phone || '—')}</span></div>
                        <div class="drawer-meta-item"><span class="drawer-label">Модел</span><span>${esc(o.model)}</span></div>
                        <div class="drawer-meta-item"><span class="drawer-label">Доставчик</span><span>${esc(o.vendor)}</span></div>
                        <div class="drawer-meta-item"><span class="drawer-label">Източник</span><span>${esc(o.origin)}</span></div>
                        <div class="drawer-meta-item"><span class="drawer-label">Пълен сет</span><span>${o.fullSet ? '✅ Да' : '❌ Не'}</span></div>
                    </div>
                </div>
                <div class="drawer-section">
                    <div class="drawer-financials">
                        <div class="drawer-fin-row"><span>Доставна цена</span><span>${CurrencyUtils.formatAmount(o.costUSD || 0, 'USD')}</span></div>
                        <div class="drawer-fin-row"><span>Доставка</span><span>${CurrencyUtils.formatAmount(o.shippingUSD || 0, 'USD')}</span></div>
                        ${o.extrasEUR ? `<div class="drawer-fin-row"><span>Доп. разходи</span><span>${CurrencyUtils.formatAmount(o.extrasEUR, 'EUR')}</span></div>` : ''}
                        <div class="drawer-fin-row"><span>Общо</span><strong>${CurrencyUtils.formatAmount(o.totalEUR, 'EUR')}</strong></div>
                        <div class="drawer-fin-row"><span>Продажна цена</span><strong>${CurrencyUtils.formatAmount(o.sellEUR, 'EUR')}</strong></div>
                        <div class="drawer-fin-row drawer-fin-balance"><span>Баланс</span><strong style="color: ${balanceColor}">${CurrencyUtils.formatAmount(o.balanceEUR, 'EUR')}</strong></div>
                    </div>
                </div>
                ${o.notes ? `
                <div class="drawer-section drawer-notes">
                    <div class="drawer-label">📝 Бележки</div>
                    <p class="drawer-notes-text">${esc(o.notes)}</p>
                </div>` : ''}
                <div class="drawer-actions">
                    <button class="btn" data-drawer-action="edit" data-id="${o.id}">✏️ Редактирай</button>
                    <button class="btn secondary" data-drawer-action="duplicate" data-id="${o.id}">📋 Дублирай</button>
                    <button class="btn danger" data-drawer-action="delete" data-id="${o.id}">🗑️ Изтрий</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
        document.body.appendChild(drawer);

        // Animate in
        requestAnimationFrame(() => {
            overlay.classList.add('active');
            drawer.classList.add('open');
        });

        document.getElementById('drawer-close-btn').addEventListener('click', () => this.closeDrawer());

        drawer.querySelectorAll('[data-drawer-action]').forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.dataset.drawerAction;
                const id = parseInt(btn.dataset.id);
                this.closeDrawer();
                if (action === 'edit') this.eventBus.emit('modal:open', { type: 'order', mode: 'edit', id });
                if (action === 'duplicate') this.eventBus.emit('modal:open', { type: 'order', mode: 'duplicate', id });
                if (action === 'delete') {
                    window.app.ui.modals.confirm(
                        'Сигурни ли сте, че искате да изтриете тази поръчка?',
                        null,
                        async () => {
                            await this.ordersModule.delete(id);
                            this.eventBus.emit('notification:show', { message: '✅ Поръчката е изтрита', type: 'success' });
                            await this.refresh();
                        }
                    );
                }
            });
        });
    }

    closeDrawer() {
        const drawer = document.getElementById('order-drawer');
        const overlay = document.getElementById('order-drawer-overlay');
        if (this._drawerEscHandler) {
            document.removeEventListener('keydown', this._drawerEscHandler);
            this._drawerEscHandler = null;
        }
        if (drawer) {
            drawer.classList.remove('open');
            overlay?.classList.remove('active');
            setTimeout(() => { drawer.remove(); overlay?.remove(); }, 260);
        }
    }

    attachListeners() {
        // Document-level delegated listeners are bound once via _initDocumentListeners.
        // Element-scoped listeners below are safe to re-add on every refresh
        // because the old DOM nodes (and their listeners) are discarded.
        this._initDocumentListeners();

        this.attachExistingListeners();
        this.attachBulkListeners();

        // Filter handlers to reset pagination
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.filters.search = e.target.value;
                this.applyFilters();
            });
        }
    }

    _initDocumentListeners() {
        if (this._docListenersBound) return;
        this._docListenersBound = true;

        // Pagination — delegated on document so it survives re-renders.
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
                this.goToPage(parseInt(e.target.dataset.page));
            }
        });

        // Status popover close-on-outside-click — also bound once.
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.status-popover') && !e.target.closest('.status-badge')) {
                this.closeStatusPopover();
            }
        });
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

            // Update rows visual state (main row + note sub-row)
            document.querySelectorAll('tr[data-order-id]').forEach(row => {
                const orderId = parseInt(row.dataset.orderId);
                const selected = this.selectedOrders.has(orderId);
                row.classList.toggle('selected-row', selected);
                const noteRow = document.querySelector(`tr[data-note-for="${orderId}"]`);
                if (noteRow) noteRow.classList.toggle('selected-row', selected);
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

        window.app.ui.modals.confirm(
            `Промяна на статуса на ${this.selectedOrders.size} поръчки на "${newStatus}"?`,
            null,
            async () => {
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
        });
    }

    async bulkDelete() {
        const count = this.selectedOrders.size;
        window.app.ui.modals.confirm(
            `Сигурни ли сте, че искате да изтриете ${count} поръчки? Действието е необратимо.`,
            null,
            async () => {
                let deleted = 0;
                const orderIds = Array.from(this.selectedOrders);
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
        );
    }

    clearSelection() {
        this.selectedOrders.clear();
        document.querySelectorAll('.order-checkbox').forEach(cb => cb.checked = false);
        document.getElementById('select-all').checked = false;
        this.updateBulkUI();
    }

    // All existing listeners made async
    attachExistingListeners() {
        // Sortable column headers
        document.querySelectorAll('th[data-sort]').forEach(th => {
            th.addEventListener('click', () => {
                const field = th.dataset.sort;
                if (this.sortBy === field) {
                    this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
                } else {
                    this.sortBy = field;
                    this.sortDir = 'asc';
                }
                this.pagination.currentPage = 1;
                this.refresh();
            });
        });

        // Status badge click handlers
        document.querySelectorAll('.status-badge.clickable').forEach(badge => {
            badge.addEventListener('click', (e) => {
                e.stopPropagation();
                this.showStatusPopover(e.target);
            });
        });

        // (Popover outside-click is bound once in _initDocumentListeners.)

        // New order button
        document.getElementById('new-order-btn')?.addEventListener('click', () => {
            this.eventBus.emit('modal:open', { type: 'order', mode: 'create' });
        });

        // Recently delivered button
        document.getElementById('show-recently-delivered-btn')?.addEventListener('click', async () => {
            this.filters.recentlyDelivered = true;
            this.pagination.currentPage = 1;
            await this.refresh();
        });

        // Free watches (month) button - Show free items for current month only
        document.getElementById('show-free-month-btn')?.addEventListener('click', async () => {
            this.filters.status = 'Свободен';
            this.filters.showAllMonths = false;
            this.filters.search = '';
            this.filters.recentlyDelivered = false;
            this.pagination.currentPage = 1;
            await this.refresh();
        });

        // Free watches (total) button - Show all free items across all months
        document.getElementById('show-free-total-btn')?.addEventListener('click', async () => {
            this.filters.status = 'Свободен';
            this.filters.showAllMonths = true;
            this.filters.search = '';
            this.filters.recentlyDelivered = false;
            this.pagination.currentPage = 1;
            await this.refresh();
        });

        // Status filters
        document.querySelectorAll('[data-filter-status]').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                this.filters.status = e.target.dataset.filterStatus;
                this.filters.showAllMonths = false;
                this.filters.recentlyDelivered = false;
                await this.refresh();
            });
        });

        // Search input with clear button - DEBOUNCED ASYNC
        const searchInputWrapper = document.querySelector('.input-with-clear');
        const searchInput = document.getElementById('searchInput');
        const clearBtn = searchInputWrapper?.querySelector('.input-clear-btn');

        if (searchInput && searchInputWrapper) {
            // Toggle has-value class based on input value
            searchInput.addEventListener('input', (e) => {
                this.filters.search = e.target.value;
                this.filters.recentlyDelivered = false;
                searchInputWrapper.classList.toggle('has-value', e.target.value.length > 0);
                this.debouncedRefresh();
            });

            // Clear button click handler
            if (clearBtn) {
                clearBtn.addEventListener('click', () => {
                    this.filters.search = '';
                    searchInput.value = '';
                    searchInputWrapper.classList.remove('has-value');
                    searchInput.focus();
                    this.debouncedRefresh();
                });
            }
        }

        // Origin filter
        document.getElementById('filterOrigin')?.addEventListener('change', async (e) => {
            this.filters.origin = e.target.value;
            this.filters.recentlyDelivered = false;
            await this.refresh();
        });

        // Vendor filter
        document.getElementById('filterVendor')?.addEventListener('change', async (e) => {
            this.filters.vendor = e.target.value;
            this.filters.recentlyDelivered = false;
            await this.refresh();
        });

        // Row click → open Side Drawer (skip interactive child elements)
        document.querySelectorAll('.order-row.clickable-row').forEach(row => {
            row.addEventListener('click', (e) => {
                if (e.target.closest('.order-checkbox, .status-badge, [data-action], .model-image, .row-actions, input, button')) return;
                const orderId = parseInt(row.dataset.orderId);
                this.openDrawer(orderId);
            });
        });

        // Image click — opens image modal (stopPropagation prevents row-click drawer)
        document.querySelectorAll('.model-image.image-clickable').forEach(img => {
            img.addEventListener('click', async (e) => {
                e.stopPropagation();
                const orderId = parseInt(e.currentTarget.dataset.orderId);
                const result = await this.ordersModule.findOrderById(orderId);
                if (!result || !result.order) return;
                const o = result.order;
                window.app.ui.modals.open({
                    type: 'image',
                    imageSrc: o.imageData,
                    title: o.model,
                    caption: `Клиент: ${o.client} | Дата: ${this.formatDate(o.date)}`
                });
            });
        });

        // Order actions - ALL ASYNC
        document.querySelectorAll('[data-action="edit"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const orderId = parseInt(e.currentTarget.dataset.id);
                this.eventBus.emit('modal:open', { type: 'order', mode: 'edit', id: orderId });
            });
        });

        document.querySelectorAll('[data-action="duplicate"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const orderId = parseInt(e.currentTarget.dataset.id);
                this.eventBus.emit('modal:open', { type: 'order', mode: 'duplicate', id: orderId });
            });
        });

        document.querySelectorAll('[data-action="delete"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const orderId = parseInt(e.currentTarget.dataset.id);
                window.app.ui.modals.confirm(
                    'Сигурни ли сте, че искате да изтриете тази поръчка?',
                    null,
                    async () => {
                        try {
                            await this.ordersModule.delete(orderId);
                            await this.refresh();
                            this.eventBus.emit('notification:show', {
                                message: '✅ Поръчката е изтрита',
                                type: 'success'
                            });
                        } catch (error) {
                            console.error('❌ Delete failed:', error);
                            this.eventBus.emit('notification:show', {
                                message: '❌ ' + error.message,
                                type: 'error'
                            });
                        }
                    }
                );
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
                    <p>Error: ${esc(error.message)}</p>
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
        // Helper function to get KPI class based on type and value
        const getKpiClass = (type, value) => {
            if (type === 'profit') return value >= 0 ? 'kpi-profit' : 'kpi-loss';
            if (type === 'expense') return 'kpi-expense';
            return '';
        };

        const soldCount = stats.orderCount || 0;
        const freeCount = stats.freeWatchCount || 0;
        const totalCount = soldCount + freeCount;

        return `
            <div class="month-stats">
                <div class="stat-item">
                    <div class="stat-label">Часовници този месец</div>
                    <div class="stat-value">${totalCount}</div>
                    <div class="stat-sublabel">Продадени: ${soldCount} • Свободни: ${freeCount}</div>
                </div>
                <div class="stat-item ${getKpiClass('expense', stats.operatingExpenses)}">
                    <div class="stat-label">Оперативни разходи</div>
                    <div class="stat-value">${stats.operatingExpenses.toFixed(2)} €</div>
                </div>
                <div class="stat-item ${getKpiClass('profit', stats.profit)}">
                    <div class="stat-label">Печалба</div>
                    <div class="stat-value">${stats.profit.toFixed(2)} €</div>
                </div>
            </div>
        `;
    }

    renderControls(freeCountMonth = 0, freeCountTotal = 0) {
        return `
        <div class="controls">
            <button class="btn" id="new-order-btn">➕ Нова поръчка</button>
            <button class="btn secondary" data-filter-status="all">Всички</button>
            <button class="btn" style="background: #ffc107;" data-filter-status="Очакван">Очаквани</button>
            <button class="btn success" data-filter-status="Доставен">Доставени</button>
            <button class="btn info" data-filter-status="Други">Други</button>
            <button class="btn success" id="show-free-month-btn">🆓 Свободни (месец) <strong>${freeCountMonth}</strong></button>
            <button class="btn success" id="show-free-total-btn">🆓 Свободни (общо) <strong>${freeCountTotal}</strong></button>
            <button class="btn" style="background: #17a2b8; color: white;" id="show-recently-delivered-btn">🚚 Последни доставени</button>
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
                        <div class="input-with-clear ${this.filters.search ? 'has-value' : ''}">
                            <input type="text" id="searchInput" placeholder="Клиент, модел..." value="${esc(this.filters.search)}">
                            <button class="input-clear-btn" type="button" aria-label="Clear search">×</button>
                        </div>
                    </div>
                    <div class="filter-group">
                        <label>Източник:</label>
                        <select id="filterOrigin">
                            <option value="">Всички</option>
                            ${settings.origins.map(o => `<option value="${esc(o)}">${esc(o)}</option>`).join('')}
                        </select>
                    </div>
                    <div class="filter-group">
                        <label>Доставчик:</label>
                        <select id="filterVendor">
                            <option value="">Всички</option>
                            ${settings.vendors.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('')}
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
                        <input type="text" id="searchInput" placeholder="Клиент, модел..." value="${esc(this.filters.search)}">
                    </div>
                    <div class="error-message">Failed to load filter options</div>
                </div>
            `;
        }
    }

    renderActiveFilters() {
        if (this.filters.recentlyDelivered) {
            return `
                <div class="active-filter-badge" style="background: #d1ecf1; color: #0c5460; padding: 10px; margin: 10px 0; border-radius: 5px; display: flex; align-items: center; justify-content: space-between;">
                    <span>🚚 Последни 10 доставени часовника (сортирани по дата на промяна)</span>
                    <button onclick="window.app.ui.currentView.clearFilters()" class="btn btn-sm" style="background: #0c5460; color: white;">✕ Изчисти</button>
                </div>
            `;
        }
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
            showAllMonths: false,
            recentlyDelivered: false
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
        return `${day}.${month}`;
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