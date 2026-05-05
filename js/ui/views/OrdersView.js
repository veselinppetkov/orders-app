import { DebounceUtils } from '../../utils/DebounceUtils.js';
import { FormatUtils } from '../../utils/FormatUtils.js';
import { CurrencyUtils } from '../../utils/CurrencyUtils.js';
import { VirtualScroller } from '../../utils/VirtualScroller.js';

const esc = FormatUtils.escapeHtml;
const FREE_STATUS = 'Свободен';

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
            const currentMonth = this.state.get('currentMonth');
            const [stats, allOrders, currentMonthOrders] = await Promise.all([
                this.reportsModule.getMonthlyStats(),
                this.getDisplayOrders(),
                this.ordersModule.getOrders(currentMonth, { includeImageUrls: false, preferLightweight: true })
            ]);
            const previousMonth = this.getPreviousMonthKey(currentMonth);
            let previousStats = null;
            try {
                previousStats = await this.reportsModule.getMonthlyStats(previousMonth);
            } catch (error) {
                console.warn('Could not load previous month stats:', error);
            }

            const hasAdditionalFilters = Boolean(this.filters.search || this.filters.origin || this.filters.vendor);
            const freeCountTotal = this.filters.showAllMonths && this.filters.status === FREE_STATUS && !hasAdditionalFilters
                ? allOrders.length
                : (await this.ordersModule.getAllOrders({
                    includeImageUrls: false,
                    preferLightweight: true,
                    status: FREE_STATUS
                })).length;

            const deliveredCountTotal = this.filters.showAllMonths && this.filters.status === 'Доставен' && !hasAdditionalFilters
                ? allOrders.length
                : (await this.ordersModule.getAllOrders({
                    includeImageUrls: false,
                    preferLightweight: true,
                    status: 'Доставен'
                })).length;

            // Calculate free watches count for current month only
            const freeCountMonth = currentMonthOrders.filter(o => o.status === FREE_STATUS).length;
            const statusCounts = this.getStatusCounts(currentMonthOrders);

            // ADD: Update pagination totals
            this.updatePaginationTotals(allOrders.length);

            // ADD: Get current page orders
            const ordersForPage = this.getCurrentPageOrders(allOrders);

            return `
        <div class="orders-view">
            ${this.renderStats(stats, previousStats, currentMonth, previousMonth)}
            ${this.renderControls(freeCountMonth, freeCountTotal, statusCounts, deliveredCountTotal)}
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
                <h3>Поръчките не можаха да се заредят</h3>
                <p>Грешка: ${esc(error.message)}</p>
                <button id="retry-orders-view" class="btn btn-primary" type="button">Опитай отново</button>
            </div>
        `;
        }
    }

    async getDisplayOrders() {
        const allOrders = this.filters.recentlyDelivered
            ? await this.ordersModule.getRecentlyDelivered(10)
            : await this.ordersModule.filterOrders(this.filters);

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

        return allOrders;
    }

    getStatusCounts(orders) {
        const counts = {
            all: orders.length,
            'Очакван': 0,
            'Доставен': 0,
            'Свободен': 0,
            'Други': 0
        };

        orders.forEach(order => {
            if (counts[order.status] === undefined) counts[order.status] = 0;
            counts[order.status] += 1;
        });

        return counts;
    }

    getPreviousMonthKey(monthKey) {
        const [year, month] = monthKey.split('-').map(Number);
        const date = new Date(year, month - 2, 1);
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    }

    formatMonthName(monthKey, mode = 'short') {
        const [, month] = monthKey.split('-');
        const full = ['Януари', 'Февруари', 'Март', 'Април', 'Май', 'Юни', 'Юли', 'Август', 'Септември', 'Октомври', 'Ноември', 'Декември'];
        const short = ['Ян', 'Фев', 'Мар', 'Апр', 'Май', 'Юни', 'Юли', 'Авг', 'Сеп', 'Окт', 'Ное', 'Дек'];
        return (mode === 'full' ? full : short)[parseInt(month, 10) - 1];
    }

    resetFiltersForOrderReveal() {
        this.filters = {
            status: 'all',
            search: '',
            origin: '',
            vendor: '',
            showAllMonths: false,
            recentlyDelivered: false
        };
    }

    waitForRow(orderId, timeout = 1200) {
        const selector = `tr[data-order-id="${CSS.escape(String(orderId))}"]`;
        const started = performance.now();

        return new Promise(resolve => {
            const find = () => {
                const row = document.querySelector(selector);
                if (row) {
                    resolve(row);
                    return;
                }

                if (performance.now() - started >= timeout) {
                    resolve(null);
                    return;
                }

                requestAnimationFrame(find);
            };

            find();
        });
    }

    async revealOrder(orderId) {
        let allOrders = await this.getDisplayOrders();
        let orderIndex = allOrders.findIndex(order => String(order.id) === String(orderId));

        if (orderIndex === -1) {
            this.resetFiltersForOrderReveal();
            allOrders = await this.getDisplayOrders();
            orderIndex = allOrders.findIndex(order => String(order.id) === String(orderId));
        }

        if (orderIndex === -1) return false;

        this.pagination.currentPage = Math.floor(orderIndex / this.pagination.ordersPerPage) + 1;
        await this.refresh();

        const row = await this.waitForRow(orderId);
        if (!row) return false;

        row.classList.remove('highlight-row');
        row.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });

        window.setTimeout(() => {
            row.classList.add('highlight-row');
            row.setAttribute('tabindex', '-1');
            row.focus({ preventScroll: true });
            window.setTimeout(() => row.classList.remove('highlight-row'), 3200);
        }, 250);

        return true;
    }

    renderBulkActions() {
        return `
        <div id="bulk-actions" class="bulk-actions" style="display: none;">
            <div class="bulk-info">
                Избрани: <span id="selected-count">0</span>
            </div>
            <div class="bulk-controls">
                <select id="bulk-status" class="bulk-select">
                    <option value="">Промени статус...</option>
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
        const VIRTUAL_THRESHOLD = 50;
        const sa = this.sortBy;
        const thClass = (f) => `data-sort="${f}"${sa === f ? ' class="sort-active"' : ''}`;
        const thead = `
            <thead>
                <tr>
                    <th style="width: 38px;"><input type="checkbox" id="select-all"></th>
                    <th ${thClass('date')} title="Сортирай по дата">Дата ${this._sortArrow('date')}</th>
                    <th ${thClass('client')} title="Сортирай по клиент">Клиент ${this._sortArrow('client')}</th>
                    <th ${thClass('model')} title="Сортирай по модел">Снимка ${this._sortArrow('model')}</th>
                    <th class="no-sort">Бележки</th>
                    <th ${thClass('origin')} title="Сортирай по източник">Източник / доставчик ${this._sortArrow('origin')}</th>
                    <th ${thClass('totalEUR')} title="Сортирай по суми">Финанси ${this._sortArrow('totalEUR')}</th>
                    <th ${thClass('status')} title="Сортирай по статус">Статус ${this._sortArrow('status')}</th>
                    <th style="width: 100px;">Действия</th>
                </tr>
            </thead>`;

        if (orders.length >= VIRTUAL_THRESHOLD) {
            this._vsOrders = orders;
            return `
                <div id="orders-vs-container" style="overflow-x:auto;">
                    <div id="orders-vs-scroll" style="height:65vh;overflow-y:auto;">
                        <table class="orders-table">
                            ${thead}
                            <tbody id="orders-vs-tbody"></tbody>
                        </table>
                    </div>
                </div>`;
        }

        this._vsOrders = null;
        return `
            <div style="overflow-x: auto;">
                <table class="orders-table">
                    ${thead}
                    <tbody>
                        ${orders.length ? orders.map(order => this.renderOrderRow(order)).join('') : this.renderEmptyRows()}
                    </tbody>
                </table>
            </div>`;
    }

    renderEmptyRows() {
        return `
            <tr>
                <td colspan="9">
                    <div class="empty-state orders-empty-state">
                        <div class="empty-state-icon">П</div>
                        <h3 class="empty-state-title">Няма поръчки</h3>
                        <p class="empty-state-message">Няма записи, които отговарят на избраните филтри.</p>
                        <div class="empty-state-actions">
                            <button class="btn secondary" type="button" data-empty-action="clear-orders-filters">Изчисти филтрите</button>
                            <button class="btn btn-primary" type="button" id="empty-new-order-btn">Нова поръчка</button>
                        </div>
                    </div>
                </td>
            </tr>
        `;
    }

    renderOrderRow(order) {
        const isSelected = this.selectedOrders.has(order.id);

        // Product image cell. No generated initials are shown; empty products stay neutral.
        const imageInner = order.imageData
            ? `<img src="${esc(order.imageData)}"
                     class="model-image image-clickable"
                     data-order-id="${order.id}"
                     alt="${esc(order.model)}"
                     title="${esc(order.model)}">`
            : `<div class="no-image-placeholder" title="${esc(order.model || 'Без модел')}">Без снимка</div>`;
        const notesCell = order.notes
            ? `<div class="notes-preview">${esc(order.notes)}</div>`
            : `<div class="notes-preview notes-empty">Няма бележки</div>`;

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
            <td class="cell-product image-cell">
                <div class="product-thumb-wrap">${imageInner}</div>
            </td>
            <td class="cell-notes">${notesCell}</td>
            <td class="cell-origin">
                <div class="cell-stack">
                    <span class="badge origin-badge"
                          style="background: ${FormatUtils.getOriginColor(order.origin)}; color: ${FormatUtils.getContrastTextColor(FormatUtils.getOriginColor(order.origin))}">
                        ${esc(order.origin)}
                    </span>
                    <span class="cell-secondary">${esc(order.vendor)}</span>
                </div>
            </td>
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
        let fullImageUrl = null;
        try {
            fullImageUrl = await this.ordersModule.getFullImageUrl(o);
        } catch (error) {
            console.warn('Could not load full drawer image:', error);
        }
        const drawerImageUrl = fullImageUrl || o.imageData;
        const imageHtml = drawerImageUrl
            ? `<img src="${esc(drawerImageUrl)}" class="drawer-image" alt="${esc(o.model)}">`
            : '';

        const drawer = document.createElement('div');
        drawer.id = 'order-drawer';
        drawer.className = 'side-drawer';
        drawer.innerHTML = `
            <div class="drawer-header">
                <div class="drawer-title">
                    <div class="drawer-client-row">
                        <span class="drawer-client">${esc(o.client)}</span>
                        <button class="drawer-copy-btn" type="button" data-copy-value="${esc(o.client || '')}" data-copy-message="Името е копирано">Копирай име</button>
                    </div>
                    <span class="status-badge" style="background: ${FormatUtils.getStatusColor(o.status)}; color: ${FormatUtils.getContrastTextColor(FormatUtils.getStatusColor(o.status))}">${esc(o.status)}</span>
                </div>
                <button class="drawer-close" id="drawer-close-btn">✕</button>
            </div>
            <div class="drawer-body">
                ${imageHtml ? `<div class="drawer-section drawer-image-section">${imageHtml}</div>` : ''}
                <div class="drawer-section">
                    <div class="drawer-meta-grid">
                        <div class="drawer-meta-item"><span class="drawer-label">Дата</span><span>${this.formatDate(o.date)}</span></div>
                        <div class="drawer-meta-item drawer-meta-copyable">
                            <span class="drawer-label">Телефон</span>
                            <span class="drawer-copy-row">
                                <span>${esc(o.phone || '—')}</span>
                                ${o.phone ? `<button class="drawer-copy-btn" type="button" data-copy-value="${esc(o.phone)}" data-copy-message="Телефонът е копиран">Копирай</button>` : ''}
                            </span>
                        </div>
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

        drawer.querySelector('#drawer-close-btn')?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.closeDrawer();
        });

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

        drawer.querySelectorAll('[data-copy-value]').forEach(btn => {
            btn.addEventListener('click', async (event) => {
                event.preventDefault();
                event.stopPropagation();
                await this.copyDrawerValue(btn.dataset.copyValue || '', btn.dataset.copyMessage || 'Стойността е копирана');
            });
        });
    }

    async copyDrawerValue(value, successMessage = 'Стойността е копирана') {
        const text = (value || '').trim();
        if (!text) return;

        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(text);
            } else {
                const textarea = document.createElement('textarea');
                textarea.value = text;
                textarea.setAttribute('readonly', '');
                textarea.style.position = 'fixed';
                textarea.style.opacity = '0';
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                textarea.remove();
            }

            this.eventBus.emit('notification:show', { message: successMessage, type: 'success' });
        } catch (error) {
            console.error('Copy failed:', error);
            this.eventBus.emit('notification:show', { message: 'Копирането не беше успешно', type: 'error' });
        }
    }

    closeDrawer() {
        if (this._drawerEscHandler) {
            document.removeEventListener('keydown', this._drawerEscHandler);
            this._drawerEscHandler = null;
        }

        const drawers = document.querySelectorAll('#order-drawer');
        const overlays = document.querySelectorAll('#order-drawer-overlay');

        if (drawers.length) {
            drawers.forEach(drawer => drawer.classList.remove('open'));
            overlays.forEach(overlay => overlay.classList.remove('active'));

            setTimeout(() => {
                drawers.forEach(drawer => drawer.remove());
                overlays.forEach(overlay => overlay.remove());
            }, 260);
        } else {
            overlays.forEach(overlay => overlay.remove());
        }
    }

    attachListeners() {
        // Document-level delegated listeners are bound once via _initDocumentListeners.
        // Element-scoped listeners below are safe to re-add on every refresh
        // because the old DOM nodes (and their listeners) are discarded.
        this._initDocumentListeners();

        this.attachExistingListeners();
        this.attachBulkListeners();

        // Virtual scroll — mount after DOM is ready
        if (this._vsOrders) {
            const scroll = document.getElementById('orders-vs-scroll');
            const tbody  = document.getElementById('orders-vs-tbody');
            if (scroll && tbody) {
                if (this._virtualScroller) this._virtualScroller.destroy();
                this._virtualScroller = new VirtualScroller({
                    container: scroll,
                    tbody,
                    items: this._vsOrders,
                    renderRow: (order) => this.renderOrderRow(order)
                });
                this._virtualScroller.mount();
            }
            this._vsOrders = null;
        }
    }

    _initDocumentListeners() {
        if (OrdersView._docListenersBound) return;
        OrdersView._docListenersBound = true;

        const getCurrentOrdersView = () => {
            const view = window.app?.ui?.currentView;
            return view instanceof OrdersView ? view : null;
        };

        // Pagination — delegated on document so it survives re-renders.
        document.addEventListener('click', (e) => {
            const view = getCurrentOrdersView();
            if (!view) return;

            if (e.target.id === 'page-first') view.goToPage(1);
            else if (e.target.id === 'page-prev') view.goToPage(view.pagination.currentPage - 1);
            else if (e.target.id === 'page-next') view.goToPage(view.pagination.currentPage + 1);
            else if (e.target.id === 'page-last') view.goToPage(view.pagination.totalPages);
            else if (e.target.classList.contains('page-num')) view.goToPage(parseInt(e.target.dataset.page));
        });

        // Status popover close-on-outside-click — also bound once.
        document.addEventListener('click', (e) => {
            const view = getCurrentOrdersView();
            if (!view) return;

            if (!e.target.closest('.status-popover') && !e.target.closest('.status-badge')) {
                view.closeStatusPopover();
            }
        });

        // Row-level events — delegated so virtual-scrolled rows work without re-binding.
        document.addEventListener('click', (e) => {
            const view = getCurrentOrdersView();
            if (!view) return;

            // Status badge → popover
            const badge = e.target.closest('.status-badge.clickable');
            if (badge) { e.stopPropagation(); view.showStatusPopover(badge); return; }

            // Image → modal
            const img = e.target.closest('.model-image.image-clickable');
            if (img) {
                e.stopPropagation();
                const orderId = parseInt(img.dataset.orderId);
                view.ordersModule.findOrderById(orderId).then(async result => {
                    if (!result?.order) return;
                    const o = result.order;
                    let fullImageUrl = null;
                    try {
                        fullImageUrl = await view.ordersModule.getFullImageUrl(o);
                    } catch (error) {
                        console.warn('Could not load full order image:', error);
                    }
                    window.app.ui.modals.open({
                        type: 'image', imageSrc: fullImageUrl || o.imageData, title: o.model,
                        caption: `Клиент: ${o.client} | Дата: ${view.formatDate(o.date)}`
                    });
                }).catch(error => console.warn('Could not open order image:', error));
                return;
            }

            // Action buttons (edit / duplicate / delete)
            const actionBtn = e.target.closest('[data-action]');
            if (actionBtn && actionBtn.closest('.orders-table')) {
                e.stopPropagation();
                view._handleRowAction(actionBtn.dataset.action, parseInt(actionBtn.dataset.id));
                return;
            }

            // Row click → side drawer
            const row = e.target.closest('.order-row.clickable-row');
            if (row && !e.target.closest('.order-checkbox, .status-badge, [data-action], .model-image, .row-actions, input, button')) {
                view.openDrawer(parseInt(row.dataset.orderId));
            }
        });

        // Checkbox delegation (works for virtual-scrolled rows too)
        document.addEventListener('change', (e) => {
            const view = getCurrentOrdersView();
            if (!view) return;

            if (e.target.id === 'select-all') {
                const checked = e.target.checked;
                document.querySelectorAll('.order-checkbox').forEach(cb => {
                    cb.checked = checked;
                    const id = parseInt(cb.dataset.id);
                    if (checked) view.selectedOrders.add(id); else view.selectedOrders.delete(id);
                });
                view.updateBulkUI();
            } else if (e.target.classList.contains('order-checkbox')) {
                const id = parseInt(e.target.dataset.id);
                if (e.target.checked) view.selectedOrders.add(id); else view.selectedOrders.delete(id);
                view.updateBulkUI();
            }
        });
    }

    _handleRowAction(action, orderId) {
        switch (action) {
            case 'edit':
                this.eventBus.emit('modal:open', { type: 'order', mode: 'edit', id: orderId });
                break;
            case 'duplicate':
                this.eventBus.emit('modal:open', { type: 'order', mode: 'duplicate', id: orderId });
                break;
            case 'delete':
                window.app.ui.modals.confirm('Сигурни ли сте, че искате да изтриете тази поръчка?', null, async () => {
                    try {
                        await this.ordersModule.delete(orderId);
                        await this.refresh();
                        this.eventBus.emit('notification:show', { message: '✅ Поръчката е изтрита', type: 'success' });
                    } catch (error) {
                        console.error('❌ Delete failed:', error);
                        this.eventBus.emit('notification:show', { message: '❌ ' + error.message, type: 'error' });
                    }
                });
                break;
        }
    }

    attachBulkListeners() {
        // Checkbox events are delegated in _initDocumentListeners() for virtual-scroll compat.
        // Only bind the bulk action toolbar buttons here (they're outside the table).
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

        // Status badge, row click, image click, action buttons — delegated once
        // in _initDocumentListeners() for virtual-scroll compatibility.

        document.getElementById('retry-orders-view')?.addEventListener('click', () => {
            this.refresh();
        });
        document.getElementById('empty-new-order-btn')?.addEventListener('click', () => {
            this.eventBus.emit('modal:open', { type: 'order', mode: 'create' });
        });
        document.querySelector('[data-empty-action="clear-orders-filters"]')?.addEventListener('click', () => {
            this.clearFilters();
        });
        document.getElementById('clear-active-filter')?.addEventListener('click', () => {
            this.clearFilters();
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

        // Delivered watches (total) button - Show all delivered items across all months, newest first
        document.getElementById('show-delivered-total-btn')?.addEventListener('click', async () => {
            this.filters.status = 'Доставен';
            this.filters.showAllMonths = true;
            this.filters.search = '';
            this.filters.recentlyDelivered = false;
            this.sortBy = 'date';
            this.sortDir = 'desc';
            this.pagination.currentPage = 1;
            await this.refresh();
        });

        // Status filters
        document.querySelectorAll('[data-filter-status]').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                this.filters.status = e.currentTarget.dataset.filterStatus;
                this.filters.showAllMonths = false;
                this.filters.recentlyDelivered = false;
                this.pagination.currentPage = 1;
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
            this.pagination.currentPage = 1;
            await this.refresh();
        });

        // Vendor filter
        document.getElementById('filterVendor')?.addEventListener('change', async (e) => {
            this.filters.vendor = e.target.value;
            this.filters.recentlyDelivered = false;
            this.pagination.currentPage = 1;
            await this.refresh();
        });

        // Row click, image click, action buttons, status badge — all delegated
        // once in _initDocumentListeners() so virtual-scrolled rows work too.
    }

    // COMPLETE ASYNC REFRESH
    async refresh() {
        this.selectedOrders.clear();
        const container = document.getElementById('view-container');
        if (container) {
            // Show skeleton loading state
            container.innerHTML = `
            <div class="orders-view">
                <div class="month-stats">
                    ${Array.from({ length: 4 }, () => `
                        <div class="stat-item">
                            <div class="skeleton-line sk-line-s" style="height:14px;width:60px;margin:0 auto 6px;"></div>
                            <div class="skeleton-line sk-title" style="height:22px;width:80px;margin:0 auto;"></div>
                        </div>
                    `).join('')}
                </div>
                <div style="display:flex;flex-direction:column;gap:0;margin-top:16px;border:1px solid var(--border-default,#e2e8f0);border-radius:var(--radius-md,8px);overflow:hidden;">
                    ${Array.from({ length: 8 }, (_, i) => `
                        <div class="skeleton-table-row" style="${i % 2 === 1 ? 'background:var(--bg-subtle,#f8fafc)' : ''}">
                            <div class="skeleton-line sk-cell-md"></div>
                            <div class="skeleton-line sk-cell-lg"></div>
                            <div class="skeleton-line sk-cell-sm"></div>
                            <div class="skeleton-line sk-cell-md"></div>
                            <div class="skeleton-line sk-cell-xs"></div>
                            <div class="skeleton-line sk-cell-sm"></div>
                        </div>
                    `).join('')}
                </div>
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
                    <h3>Поръчките не можаха да се заредят</h3>
                    <p>Грешка: ${esc(error.message)}</p>
                    <button id="retry-orders-view" class="btn btn-primary" type="button">Опитай отново</button>
                </div>
            `;
                container.querySelector('#retry-orders-view')?.addEventListener('click', () => this.refresh());
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

    renderStats(stats, previousStats = null, currentMonth = '', previousMonth = '') {
        const currentCount = stats.totalOrders ?? ((stats.orderCount || 0) + (stats.freeWatchCount || 0));
        const previousCount = previousStats
            ? (previousStats.totalOrders ?? ((previousStats.orderCount || 0) + (previousStats.freeWatchCount || 0)))
            : 0;
        const revenue = stats.revenue || 0;
        const operatingExpenses = stats.operatingExpenses || 0;
        const watchCosts = stats.watchCosts || 0;
        const totalExpenses = stats.expenses ?? (operatingExpenses + watchCosts);
        const balance = stats.profit ?? (revenue - totalExpenses);
        const percentChange = previousCount > 0
            ? ((currentCount - previousCount) / previousCount) * 100
            : (currentCount > 0 ? 100 : 0);
        const roundedChange = Math.round(percentChange);
        const changePrefix = roundedChange > 0 ? '+' : '';
        const previousMonthName = previousMonth ? this.formatMonthName(previousMonth, 'full').toLowerCase() : 'предходния месец';
        const balanceClass = balance >= 0 ? 'kpi-balance-positive' : 'kpi-balance-negative';

        return `
            <div class="month-stats">
                <div class="stat-item">
                    <div class="stat-label">Поръчки този месец</div>
                    <div class="stat-value">${currentCount}</div>
                    <div class="stat-sublabel ${roundedChange >= 0 ? 'trend-up' : 'trend-down'}">${changePrefix}${roundedChange}% спрямо ${previousMonthName}</div>
                </div>
                <div class="stat-item kpi-expense">
                    <div class="stat-label">Оперативни разходи</div>
                    <div class="stat-value">${operatingExpenses.toFixed(2)} €</div>
                    <div class="stat-sublabel">Разходи за текущия месец</div>
                </div>
                <div class="stat-item ${balanceClass}">
                    <div class="stat-label">Баланс</div>
                    <div class="stat-value">${balance.toFixed(2)} €</div>
                </div>
            </div>
        `;
    }

    renderControls(freeCountMonth = 0, freeCountTotal = 0, statusCounts = {}, deliveredCountTotal = 0) {
        const active = (status, extra = false) => {
            if (extra === 'recent') return this.filters.recentlyDelivered ? 'active' : '';
            if (extra === 'free-all') return this.filters.status === 'Свободен' && this.filters.showAllMonths ? 'active' : '';
            if (extra === 'delivered-all') return this.filters.status === 'Доставен' && this.filters.showAllMonths ? 'active' : '';
            return this.filters.status === status && !this.filters.showAllMonths && !this.filters.recentlyDelivered ? 'active' : '';
        };

        return `
        <div class="controls status-chip-row">
            <button class="filter-chip ${active('all')}" data-filter-status="all">Всички <span>${statusCounts.all || 0}</span></button>
            <button class="filter-chip tone-pending ${active('Очакван')}" data-filter-status="Очакван">Очаквани <span>${statusCounts['Очакван'] || 0}</span></button>
            <button class="filter-chip tone-delivered ${active('Доставен')}" data-filter-status="Доставен">Доставени <span>${statusCounts['Доставен'] || 0}</span></button>
            <button class="filter-chip tone-delivered ${active('Доставен', 'delivered-all')}" id="show-delivered-total-btn">Доставени общо <span>${deliveredCountTotal}</span></button>
            <button class="filter-chip tone-free ${active('Свободен')}" id="show-free-month-btn">Свободни този месец <span>${freeCountMonth}</span></button>
            <button class="filter-chip tone-free ${active('Свободен', 'free-all')}" id="show-free-total-btn">Свободни общо <span>${freeCountTotal}</span></button>
            <button class="filter-chip tone-other ${active('Други')}" data-filter-status="Други">Други <span>${statusCounts['Други'] || 0}</span></button>
            <button class="filter-chip tone-recent ${active('', 'recent')}" id="show-recently-delivered-btn">Последни доставени</button>
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
                            <input type="text" id="searchInput" placeholder="Клиент, модел, телефон..." value="${esc(this.filters.search)}">
                            <button class="input-clear-btn" type="button" aria-label="Изчисти търсенето">×</button>
                        </div>
                    </div>
                    <div class="filter-group">
                        <label>Източник:</label>
                        <select id="filterOrigin">
                            <option value="">Всички</option>
                            ${settings.origins.map(o => `<option value="${esc(o)}" ${this.filters.origin === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}
                        </select>
                    </div>
                    <div class="filter-group">
                        <label>Доставчик:</label>
                        <select id="filterVendor">
                            <option value="">Всички</option>
                            ${settings.vendors.map(v => `<option value="${esc(v)}" ${this.filters.vendor === v ? 'selected' : ''}>${esc(v)}</option>`).join('')}
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
                    <div class="error-message">Филтрите не можаха да се заредят.</div>
                </div>
            `;
        }
    }

    renderActiveFilters() {
        if (this.filters.recentlyDelivered) {
            return `
                <div class="active-filter-badge">
                    <span>Показани са последните 10 доставени часовника.</span>
                    <button id="clear-active-filter" class="btn btn-sm secondary" type="button">Изчисти</button>
                </div>
            `;
        }
        if (this.filters.showAllMonths && this.filters.status === 'Свободен') {
            return `
                <div class="active-filter-badge">
                    <span>Показани са всички свободни часовници от всички месеци.</span>
                    <button id="clear-active-filter" class="btn btn-sm secondary" type="button">Изчисти</button>
                </div>
            `;
        }
        if (this.filters.showAllMonths && this.filters.status === 'Доставен') {
            return `
                <div class="active-filter-badge">
                    <span>Показани са всички доставени часовници от всички месеци, най-новите най-горе.</span>
                    <button id="clear-active-filter" class="btn btn-sm secondary" type="button">Изчисти</button>
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
        const isoMatch = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (isoMatch) return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;

        const date = new Date(dateStr);
        const day = date.getDate().toString().padStart(2, '0');
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
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
