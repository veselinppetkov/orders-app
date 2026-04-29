import {ModalsManager} from "./components/ModalsManager.js";
import { FormatUtils } from "../utils/FormatUtils.js";

const esc = FormatUtils.escapeHtml;

export class UIManager {
    constructor(modules, state, eventBus, router, undoRedo) {
        this.modules = modules;
        this.state = state;
        this.eventBus = eventBus;
        this.router = router;
        this.undoRedo = undoRedo;
        this.currentView = null;

        // Toast notification system
        this.toastQueue = [];
        this.maxToasts = 5;
        this.toastIdCounter = 0;

        // Initialize months without touching data
        this.initializeMonths();

        this.modals = new ModalsManager(modules, state, eventBus);
        window.app = window.app || {};
        window.app.ui = this;
    }

    initializeMonths() {
        // Load saved months synchronously (will be recalculated async in init())
        let savedMonths = null;
        try {
            const saved = localStorage.getItem('orderSystem_availableMonths');
            if (saved) {
                savedMonths = JSON.parse(saved);
            }
        } catch (e) {
            console.error('Error loading months:', e);
        }

        // Generate default if none exist (temporary, will be recalculated)
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
        // Temporary fallback - generates current month only
        const months = [];
        const currentDate = new Date();

        months.push({
            key: this.formatMonthKey(currentDate),
            name: this.formatMonthName(currentDate)
        });

        return months;
    }

    async generateMonthsFromOrders() {
        try {
            // Get all orders to find the earliest date
            const allOrders = await this.modules.orders.getAllOrders();

            if (allOrders.length === 0) {
                // No orders yet - return current month
                console.log('📅 No orders found - using current month');
                return this.generateDefaultMonths();
            }

            // Find earliest order date
            const earliestOrder = allOrders.reduce((earliest, order) => {
                return new Date(order.date) < new Date(earliest.date) ? order : earliest;
            });

            const startDate = new Date(earliestOrder.date);
            const currentDate = new Date();

            console.log(`📅 Generating months from ${startDate.toISOString().substring(0, 7)} (first order) to ${currentDate.toISOString().substring(0, 7)} (current)`);

            // Generate all months from earliest order to current month
            const months = [];
            let date = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
            const endDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);

            while (date <= endDate) {
                months.push({
                    key: this.formatMonthKey(date),
                    name: this.formatMonthName(date)
                });
                date = new Date(date.getFullYear(), date.getMonth() + 1, 1);
            }

            return months;
        } catch (error) {
            console.error('❌ Failed to generate months from orders:', error);
            return this.generateDefaultMonths();
        }
    }

    async init() {
        // Recalculate available months based on actual orders
        const monthsFromOrders = await this.generateMonthsFromOrders();

        // Update available months
        this.availableMonths = monthsFromOrders;
        this.state.set('availableMonths', monthsFromOrders);
        localStorage.setItem('orderSystem_availableMonths', JSON.stringify(monthsFromOrders));

        // Check month AFTER data is loaded
        await this.ensureCurrentMonth();

        this.render();
        this.attachGlobalListeners();

        this.eventBus.on('route:change', (view) => this.switchView(view));
        this.eventBus.on('notification:show', (data) => this.showNotification(data.message, data.type));

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

            // Initialize expenses ONLY for new month (seeds to Supabase)
            await this.modules.expenses.initializeMonth(currentMonth);
        } else {
            // Ensure expenses exist in Supabase (will seed if missing)
            await this.modules.expenses.ensureMonthExpenses(currentMonth);
        }
    }

    getNavigationItems() {
        return [
            { view: 'orders', label: 'Поръчки', short: 'П' },
            { view: 'clients', label: 'Клиенти', short: 'К' },
            { view: 'inventory', label: 'Инвентар', short: 'И' },
            { view: 'expenses', label: 'Разходи', short: 'Р' },
            { view: 'reports', label: 'Отчети', short: 'О' },
            { view: 'settings', label: 'Настройки', short: 'Н' }
        ];
    }

    getViewMeta(viewName = 'orders') {
        const month = this.availableMonths.find(m => m.key === this.state.get('currentMonth'))?.name || '';
        const map = {
            orders: {
                title: 'Поръчки',
                subtitle: month ? `Работен месец: ${month}` : 'Управление на всички поръчки'
            },
            clients: {
                title: 'Клиенти',
                subtitle: 'Клиентски профили, контакти и история на поръчките'
            },
            inventory: {
                title: 'Инвентар',
                subtitle: 'Наличности, поръчани количества и складови цени'
            },
            expenses: {
                title: 'Разходи',
                subtitle: month ? `Оперативни разходи за ${month}` : 'Оперативни и месечни разходи'
            },
            reports: {
                title: 'Отчети',
                subtitle: 'Оборот, печалба, маржове и месечни справки'
            },
            settings: {
                title: 'Настройки',
                subtitle: 'Валути, доставчици, източници и системни параметри'
            }
        };

        return map[viewName] || map.orders;
    }

    syncNavigationState(viewName = 'orders') {
        document.querySelectorAll('[data-view]').forEach(item => {
            item.classList.toggle('active', item.dataset.view === viewName);
        });

        const meta = this.getViewMeta(viewName);
        const title = document.getElementById('view-title');
        const subtitle = document.getElementById('view-subtitle');
        if (title) title.textContent = meta.title;
        if (subtitle) subtitle.textContent = meta.subtitle;
    }

    closeMobileSidebar() {
        document.getElementById('sidebar')?.classList.remove('open');
        document.getElementById('sidebarBackdrop')?.classList.remove('active');
    }

    render() {
        const app = document.getElementById('app');
        const currentMonth = this.state.get('currentMonth');
        const meta = this.getViewMeta('orders');

        app.innerHTML = `
        <div class="sidebar-backdrop" id="sidebarBackdrop"></div>
        <div class="app-shell">
            <aside class="sidebar" id="sidebar" aria-label="Основна навигация">
                <div class="brand">
                    <div class="brand-mark">RB WTC</div>
                    <div class="brand-sub">Управление на поръчки</div>
                </div>

                <div class="nav-section-label">Главно меню</div>
                <nav class="nav">
                    ${this.getNavigationItems().map(item => `
                        <button class="nav-item ${item.view === 'orders' ? 'active' : ''}" data-view="${item.view}" type="button">
                            <span class="nav-icon" aria-hidden="true">${item.short}</span>
                            <span>${item.label}</span>
                        </button>
                    `).join('')}
                </nav>

                <div class="sidebar-footer">
                    <button class="user-chip" id="logoutBtn" type="button" title="Изход от системата">
                        <span class="user-avatar" aria-hidden="true">RB</span>
                        <span class="user-meta">
                            <span class="user-name">RB WTC</span>
                            <span class="user-email">Изход от системата</span>
                        </span>
                        <span class="user-logout" aria-hidden="true">×</span>
                    </button>
                </div>
            </aside>

            <main class="main">
                <header class="topbar">
                    <button class="menu-toggle" id="menuToggle" type="button" aria-label="Отвори меню">
                        <span></span>
                        <span></span>
                        <span></span>
                    </button>

                    <div class="topbar-title-block">
                        <h1 class="topbar-title" id="view-title">${meta.title}</h1>
                        <p class="topbar-subtitle" id="view-subtitle">${meta.subtitle}</p>
                    </div>

                    <div class="topbar-spacer"></div>

                    <div class="global-search-wrapper">
                        <div class="global-search-input-wrap">
                            <span class="global-search-icon" aria-hidden="true"></span>
                            <input type="text" id="global-search-input" class="global-search-input"
                                   placeholder="Търси клиент, модел, телефон..." autocomplete="off" spellcheck="false">
                        </div>
                        <div class="global-search-results" id="global-search-results"></div>
                    </div>

                    <div class="month-selector">
                        <label for="monthSelector">Месец</label>
                        <select id="monthSelector">
                            ${this.availableMonths.map(m => `
                                <option value="${m.key}" ${m.key === currentMonth ? 'selected' : ''}>
                                    ${m.name}
                                </option>
                            `).join('')}
                        </select>
                        <button class="btn btn-icon-only" id="add-month-btn" type="button" title="Добави следващ месец">+</button>
                    </div>

                    <div class="undo-redo-controls">
                        <button class="undo-btn" id="undo-btn" title="Връщане (Ctrl+Z)">
                            <span class="btn-icon">↶</span>
                            <span class="btn-text">Върни</span>
                        </button>
                        <button class="redo-btn" id="redo-btn" title="Повторение (Ctrl+Shift+Z)">
                            <span class="btn-icon">↷</span>
                            <span class="btn-text">Повтори</span>
                        </button>
                        <div class="undo-info" id="undo-info">
                            <span id="undo-count">0</span> / <span id="redo-count">0</span>
                        </div>
                    </div>
                </header>

                <section id="view-container" class="view-container"></section>
            </main>
        </div>
        
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
        document.getElementById('menuToggle')?.addEventListener('click', () => {
            document.getElementById('sidebar')?.classList.toggle('open');
            document.getElementById('sidebarBackdrop')?.classList.toggle('active');
        });

        document.getElementById('sidebarBackdrop')?.addEventListener('click', () => {
            this.closeMobileSidebar();
        });

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
            this.syncNavigationState(currentViewName);
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
            this.syncNavigationState(currentViewName);

            this.showNotification('Нов месец добавен успешно!', 'success');
            this.updateUndoRedoButtons();
        });

        // Main navigation
        document.querySelectorAll('[data-view]').forEach(item => {
            item.addEventListener('click', async (e) => {
                const view = e.currentTarget.dataset.view;
                this.closeMobileSidebar();
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

        this.setupGlobalSearch();
    }

    setupGlobalSearch() {
        const input = document.getElementById('global-search-input');
        const results = document.getElementById('global-search-results');
        if (!input || !results) return;

        let debounceTimer = null;

        const closeResults = () => {
            results.innerHTML = '';
            results.classList.remove('visible');
        };

        input.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => this._runGlobalSearch(input.value.trim(), results), 300);
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') { input.value = ''; closeResults(); }
        });

        document.addEventListener('click', (e) => {
            if (!e.target.closest('.global-search-wrapper')) closeResults();
        });
    }

    async _runGlobalSearch(term, resultsEl) {
        if (term.length < 2) { resultsEl.innerHTML = ''; resultsEl.classList.remove('visible'); return; }

        try {
            const allOrders = await this.modules.orders.getAllOrders();
            const lower = term.toLowerCase();
            const matches = allOrders.filter(o =>
                (o.client  || '').toLowerCase().includes(lower) ||
                (o.model   || '').toLowerCase().includes(lower) ||
                (o.vendor  || '').toLowerCase().includes(lower) ||
                (o.origin  || '').toLowerCase().includes(lower) ||
                (o.phone   || '').toLowerCase().includes(lower)
            ).slice(0, 10);

            if (!matches.length) {
                resultsEl.innerHTML = '<div class="search-result-empty">Няма резултати</div>';
                resultsEl.classList.add('visible');
                return;
            }

            resultsEl.innerHTML = matches.map(o => {
                const monthKey = o.date ? o.date.substring(0, 7) : '';
                return `
                    <div class="search-result-item" data-order-id="${esc(o.id)}" data-month="${esc(monthKey)}">
                        <div>
                            <div class="search-result-client">${esc(o.client)} — ${esc(o.model)}</div>
                            <div class="search-result-meta">${esc(o.date || '')} · ${esc(o.status)}</div>
                        </div>
                        <div class="search-result-amount">${esc(monthKey)}</div>
                    </div>
                `;
            }).join('');
            resultsEl.classList.add('visible');

            resultsEl.querySelectorAll('.search-result-item').forEach(el => {
                el.addEventListener('click', async () => {
                    const monthKey = el.dataset.month;
                    const orderId = parseInt(el.dataset.orderId);
                    resultsEl.innerHTML = '';
                    resultsEl.classList.remove('visible');
                    document.getElementById('global-search-input').value = '';

                    if (monthKey && monthKey !== this.state.get('currentMonth')) {
                        this.modules.orders.clearCache();
                        this.modules.clients.clearCache();
                        this.state.set('currentMonth', monthKey);
                        localStorage.setItem('orderSystem_currentMonth', monthKey);
                        const selector = document.getElementById('monthSelector');
                        if (selector) selector.value = monthKey;
                    }

                    await this.switchView('orders');

                    if (this.currentView?.revealOrder) {
                        const revealed = await this.currentView.revealOrder(orderId);
                        if (!revealed) {
                            this.showNotification('Поръчката не беше намерена в текущия изглед.', 'warning');
                        }
                    }
                });
            });

        } catch (err) {
            console.error('Global search error:', err);
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

    // UPDATED: Make view switching completely async with skeleton loading
    async switchView(viewName) {
        this.syncNavigationState(viewName);

        const container = document.getElementById('view-container');
        if (!container) return;

        try {
            // FEATURE E: Show skeleton loading state
            container.innerHTML = this.renderSkeletonForView(viewName);

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
            // FEATURE D: Smart empty state for errors
            container.innerHTML = this.renderEmptyState('error', {
                message: `Неуспешно зареждане на ${viewName}: ${error.message}`
            });

            // Attach retry action
            container.querySelector('[data-empty-action="retry"]')?.addEventListener('click', () => {
                this.switchView(viewName);
            });
        }
    }

    // FEATURE E: Skeleton loading templates
    renderSkeletonForView(viewName) {
        const skeletonTemplates = {
            orders: `
                <div class="skeleton-container">
                    <div class="skeleton-title"></div>
                    <div class="skeleton-text medium"></div>
                    ${Array(5).fill(0).map(() => `
                        <div class="skeleton-table-row">
                            <div class="skeleton skeleton-text"></div>
                            <div class="skeleton skeleton-text short"></div>
                            <div class="skeleton skeleton-text medium"></div>
                            <div class="skeleton skeleton-text short"></div>
                            <div class="skeleton skeleton-text"></div>
                        </div>
                    `).join('')}
                </div>
            `,
            clients: `
                <div class="skeleton-container" style="padding: var(--space-lg);">
                    <div class="skeleton-title"></div>
                    ${Array(6).fill(0).map(() => `
                        <div class="skeleton-card" style="margin-bottom: var(--space-md);">
                            <div class="skeleton skeleton-text medium"></div>
                            <div class="skeleton skeleton-text"></div>
                            <div class="skeleton skeleton-text short"></div>
                        </div>
                    `).join('')}
                </div>
            `,
            inventory: `
                <div class="skeleton-container">
                    <div class="skeleton-title"></div>
                    ${Array(5).fill(0).map(() => `
                        <div class="skeleton-table-row">
                            <div class="skeleton skeleton-text"></div>
                            <div class="skeleton skeleton-text"></div>
                            <div class="skeleton skeleton-text short"></div>
                            <div class="skeleton skeleton-button"></div>
                        </div>
                    `).join('')}
                </div>
            `,
            default: `
                <div class="loading-state">
                    <h3>Зареждане...</h3>
                    <p>Данните се подготвят от базата.</p>
                </div>
            `
        };

        return skeletonTemplates[viewName] || skeletonTemplates.default;
    }

    // FEATURE F: Toast Notification Stacking
    showNotification(message, type = 'info', options = {}) {
        const container = document.getElementById('notification-container');
        if (!container) return;

        // Create toast object
        const toast = {
            id: ++this.toastIdCounter,
            message,
            type,
            undoAction: options.undoAction || null,
            duration: options.duration || 4000,
            timestamp: Date.now()
        };

        // Add to queue
        this.toastQueue.push(toast);

        // Limit queue size
        if (this.toastQueue.length > this.maxToasts) {
            const removed = this.toastQueue.shift();
            this.removeToastElement(removed.id);
        }

        // Render toast
        this.renderToast(toast, container);

        // Auto-dismiss
        if (toast.duration > 0) {
            setTimeout(() => this.dismissToast(toast.id), toast.duration);
        }

        return toast.id;
    }

    renderToast(toast, container) {
        const toastEl = document.createElement('div');
        toastEl.className = `toast toast-${toast.type}`;
        toastEl.id = `toast-${toast.id}`;
        toastEl.setAttribute('role', 'alert');
        toastEl.setAttribute('aria-live', 'polite');

        toastEl.innerHTML = `
            <div class="toast-content">
                <div class="toast-icon">${this.getToastIcon(toast.type)}</div>
                <div class="toast-message"></div>
            </div>
            <div class="toast-actions">
                ${toast.undoAction ? `
                    <button class="toast-action-btn" data-toast-id="${toast.id}" data-action="undo">
                        Отмени
                    </button>
                ` : ''}
                <button class="toast-close" data-toast-id="${toast.id}" title="Затвори">
                    ×
                </button>
            </div>
        `;
        // Use textContent to prevent XSS from caller-supplied messages
        toastEl.querySelector('.toast-message').textContent = toast.message ?? '';

        // Event listeners
        toastEl.querySelector('.toast-close')?.addEventListener('click', () => {
            this.dismissToast(toast.id);
        });

        if (toast.undoAction) {
            toastEl.querySelector('[data-action="undo"]')?.addEventListener('click', () => {
                toast.undoAction();
                this.dismissToast(toast.id);
            });
        }

        container.appendChild(toastEl);

        // Trigger animation
        requestAnimationFrame(() => {
            toastEl.classList.add('toast-enter');
        });
    }

    dismissToast(toastId) {
        const toast = this.toastQueue.find(t => t.id === toastId);
        if (!toast) return;

        // Remove from queue
        this.toastQueue = this.toastQueue.filter(t => t.id !== toastId);

        // Animate out
        this.removeToastElement(toastId);
    }

    removeToastElement(toastId) {
        const toastEl = document.getElementById(`toast-${toastId}`);
        if (!toastEl) return;

        toastEl.classList.add('toast-exit');
        setTimeout(() => toastEl.remove(), 300);
    }

    getToastIcon(type) {
        const icons = {
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️'
        };
        return icons[type] || icons.info;
    }

    // FEATURE D: Smart Empty States
    renderEmptyState(context = 'default', customOptions = {}) {
        const states = {
            search: {
                icon: '🔍',
                title: 'Няма резултати',
                message: `Не намерихме резултати за "${customOptions.searchTerm || 'вашето търсене'}"`,
                primaryAction: {
                    text: 'Изчисти филтрите',
                    action: 'clearFilters',
                    variant: 'primary'
                },
                secondaryAction: {
                    text: 'Опитай отново',
                    action: 'retry',
                    variant: 'secondary'
                }
            },
            fresh: {
                icon: customOptions.icon || '📦',
                title: customOptions.title || 'Все още няма данни',
                message: customOptions.message || 'Започнете, като създадете първия запис',
                primaryAction: {
                    text: customOptions.actionText || 'Създай',
                    action: customOptions.action || 'create',
                    variant: 'primary'
                }
            },
            error: {
                icon: '!',
                title: 'Възникна грешка',
                message: customOptions.message || 'Неуспешно зареждане на данните',
                primaryAction: {
                    text: 'Опитай отново',
                    action: 'retry',
                    variant: 'primary'
                },
                secondaryAction: null
            },
            filter: {
                icon: '🔍',
                title: 'Няма съвпадения',
                message: 'Опитайте да промените филтрите',
                primaryAction: {
                    text: 'Изчисти филтрите',
                    action: 'clearFilters',
                    variant: 'primary'
                }
            }
        };

        const state = states[context] || states.fresh;

        return `
            <div class="empty-state">
                <div class="empty-state-icon">${state.icon}</div>
                <h3 class="empty-state-title">${state.title}</h3>
                <p class="empty-state-message">${state.message}</p>
                <div class="empty-state-actions">
                    ${state.primaryAction ? `
                        <button class="btn btn-${state.primaryAction.variant}"
                                data-empty-action="${state.primaryAction.action}">
                            ${state.primaryAction.text}
                        </button>
                    ` : ''}
                    ${state.secondaryAction ? `
                        <button class="btn btn-${state.secondaryAction.variant}"
                                data-empty-action="${state.secondaryAction.action}">
                            ${state.secondaryAction.text}
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
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
