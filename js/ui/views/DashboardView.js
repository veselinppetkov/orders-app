// DashboardView.js - Focus Mode "Pulse" Dashboard
// Shows urgent actions, warnings, and key performance metrics at a glance

export default class DashboardView {
    constructor(modules, state, eventBus) {
        this.ordersModule = modules.orders;
        this.inventoryModule = modules.inventory;
        this.reportsModule = modules.reports;
        this.state = state;
        this.eventBus = eventBus;
    }

    async render() {
        try {
            // Gather all data for the dashboard
            const [
                pendingOrders,
                freeWatches,
                inventoryStats,
                monthlyStats,
                allTimeStats
            ] = await Promise.all([
                this.getPendingOrders(),
                this.getFreeWatches(),
                this.getInventoryAlerts(),
                this.reportsModule.getMonthlyStats(),
                this.reportsModule.getAllTimeStatsWithTrends()
            ]);

            const currentMonth = this.state.get('currentMonth');
            const monthName = this.formatMonthName(currentMonth);

            return `
                <div class="pulse-dashboard fade-in">
                    <div class="pulse-header">
                        <h2>Пулс на бизнеса</h2>
                        <p class="pulse-subtitle">${monthName} - Какво изисква внимание днес</p>
                    </div>

                    <!-- Quick Performance Summary -->
                    <div class="pulse-summary">
                        <div class="pulse-summary-item">
                            <div class="pulse-summary-label">Поръчки този месец</div>
                            <div class="pulse-summary-value">${monthlyStats.orderCount}</div>
                        </div>
                        <div class="pulse-summary-item">
                            <div class="pulse-summary-label">Приходи</div>
                            <div class="pulse-summary-value">${monthlyStats.revenue.toFixed(0)} €</div>
                        </div>
                        <div class="pulse-summary-item">
                            <div class="pulse-summary-label">Печалба</div>
                            <div class="pulse-summary-value" style="color: ${monthlyStats.profit >= 0 ? 'var(--text-success-strong)' : 'var(--text-danger-strong)'}">
                                ${monthlyStats.profit.toFixed(0)} €
                            </div>
                        </div>
                        <div class="pulse-summary-item">
                            <div class="pulse-summary-label">Тенденция</div>
                            <div class="pulse-summary-value">
                                ${allTimeStats.trend === 'up' ? '📈' : allTimeStats.trend === 'down' ? '📉' : '➡️'}
                                ${Math.abs(allTimeStats.velocity).toFixed(0)}%
                            </div>
                        </div>
                    </div>

                    <!-- Action Cards Grid -->
                    <div class="pulse-grid">
                        <!-- Urgent: Pending Orders -->
                        <div class="pulse-card ${pendingOrders.length > 0 ? 'urgent' : 'success'}"
                             onclick="window.app.ui.switchView('orders')">
                            <div class="pulse-card-header">
                                <span class="pulse-card-icon">${pendingOrders.length > 0 ? '⏳' : '✅'}</span>
                                <span class="pulse-card-title">Очакващи доставка</span>
                            </div>
                            <div class="pulse-card-value">${pendingOrders.length}</div>
                            <div class="pulse-card-detail">
                                ${pendingOrders.length > 0
                                    ? `${pendingOrders.slice(0, 2).map(o => o.client).join(', ')}${pendingOrders.length > 2 ? ` +${pendingOrders.length - 2} още` : ''}`
                                    : 'Всички поръчки са доставени'}
                            </div>
                            ${pendingOrders.length > 0 ? `
                                <div class="pulse-card-action">
                                    <button class="btn btn-sm">Виж поръчките →</button>
                                </div>
                            ` : ''}
                        </div>

                        <!-- Warning: Low Stock -->
                        <div class="pulse-card ${inventoryStats.lowStockCount > 0 ? 'warning' : 'success'}"
                             onclick="window.app.ui.switchView('inventory')">
                            <div class="pulse-card-header">
                                <span class="pulse-card-icon">${inventoryStats.lowStockCount > 0 ? '📦' : '✅'}</span>
                                <span class="pulse-card-title">Ниска наличност</span>
                            </div>
                            <div class="pulse-card-value">${inventoryStats.lowStockCount}</div>
                            <div class="pulse-card-detail">
                                ${inventoryStats.lowStockCount > 0
                                    ? `${inventoryStats.lowStockItems.slice(0, 2).map(i => i.brand).join(', ')}${inventoryStats.lowStockCount > 2 ? ` +${inventoryStats.lowStockCount - 2} още` : ''}`
                                    : 'Инвентарът е в добро състояние'}
                            </div>
                            ${inventoryStats.outOfStockCount > 0 ? `
                                <div style="margin-top: 8px; color: var(--danger-rose); font-size: 12px; font-weight: 600;">
                                    ⚠️ ${inventoryStats.outOfStockCount} изчерпани напълно
                                </div>
                            ` : ''}
                            ${inventoryStats.lowStockCount > 0 ? `
                                <div class="pulse-card-action">
                                    <button class="btn btn-sm">Провери инвентара →</button>
                                </div>
                            ` : ''}
                        </div>

                        <!-- Info: Free Watches -->
                        <div class="pulse-card info" onclick="window.app.ui.switchView('orders')">
                            <div class="pulse-card-header">
                                <span class="pulse-card-icon">🆓</span>
                                <span class="pulse-card-title">Свободни часовници</span>
                            </div>
                            <div class="pulse-card-value">${freeWatches.length}</div>
                            <div class="pulse-card-detail">
                                ${freeWatches.length > 0
                                    ? `Готови за продажба`
                                    : 'Няма налични за продажба'}
                            </div>
                            ${freeWatches.length > 0 ? `
                                <div class="pulse-card-action">
                                    <button class="btn btn-sm" onclick="event.stopPropagation(); document.getElementById('show-free-btn')?.click();">
                                        Покажи свободните →
                                    </button>
                                </div>
                            ` : ''}
                        </div>
                    </div>

                    <!-- Today's Performance -->
                    <div class="pulse-header" style="margin-top: 32px;">
                        <h3 style="font-size: 18px;">Обща производителност</h3>
                    </div>

                    <div class="pulse-grid" style="grid-template-columns: repeat(4, 1fr);">
                        <div class="pulse-card" style="cursor: default;">
                            <div class="pulse-card-header">
                                <span class="pulse-card-icon">📊</span>
                                <span class="pulse-card-title">Общо поръчки</span>
                            </div>
                            <div class="pulse-card-value" style="font-size: 28px;">${allTimeStats.totalOrders}</div>
                            <div class="pulse-card-detail">За всички времена</div>
                        </div>

                        <div class="pulse-card" style="cursor: default;">
                            <div class="pulse-card-header">
                                <span class="pulse-card-icon">💰</span>
                                <span class="pulse-card-title">Общи приходи</span>
                            </div>
                            <div class="pulse-card-value" style="font-size: 28px;">${allTimeStats.totalRevenue.toFixed(0)} €</div>
                            <div class="pulse-card-detail">За всички времена</div>
                        </div>

                        <div class="pulse-card" style="cursor: default;">
                            <div class="pulse-card-header">
                                <span class="pulse-card-icon">📈</span>
                                <span class="pulse-card-title">Нетна печалба</span>
                            </div>
                            <div class="pulse-card-value" style="font-size: 28px; color: ${allTimeStats.netProfit >= 0 ? 'var(--text-success-strong)' : 'var(--text-danger-strong)'}">
                                ${allTimeStats.netProfit.toFixed(0)} €
                            </div>
                            <div class="pulse-card-detail">След разходи</div>
                        </div>

                        <div class="pulse-card" style="cursor: default;">
                            <div class="pulse-card-header">
                                <span class="pulse-card-icon">⚖️</span>
                                <span class="pulse-card-title">Средна печалба</span>
                            </div>
                            <div class="pulse-card-value" style="font-size: 28px;">${allTimeStats.avgProfit.toFixed(0)} €</div>
                            <div class="pulse-card-detail">На поръчка</div>
                        </div>
                    </div>

                    <!-- Quick Actions -->
                    <div class="pulse-header" style="margin-top: 32px;">
                        <h3 style="font-size: 18px;">Бързи действия</h3>
                    </div>

                    <div class="pulse-quick-actions">
                        <button class="btn" onclick="window.app.ui.eventBus.emit('modal:open', { type: 'order', mode: 'create' })">
                            ➕ Нова поръчка
                        </button>
                        <button class="btn secondary" onclick="window.app.ui.switchView('clients')">
                            👥 Клиенти
                        </button>
                        <button class="btn secondary" onclick="window.app.ui.switchView('reports')">
                            📊 Пълни отчети
                        </button>
                        <button class="btn secondary" onclick="window.app.ui.switchView('expenses')">
                            💰 Разходи
                        </button>
                    </div>
                </div>
            `;

        } catch (error) {
            console.error('❌ Failed to render dashboard:', error);
            return `
                <div class="error-state">
                    <h3>❌ Failed to load dashboard</h3>
                    <p>Error: ${error.message}</p>
                    <button onclick="window.app.ui.currentView.refresh()" class="btn">🔄 Retry</button>
                </div>
            `;
        }
    }

    async getPendingOrders() {
        const currentMonth = this.state.get('currentMonth');
        const orders = await this.ordersModule.getOrders(currentMonth);
        return orders.filter(o => o.status === 'Очакван');
    }

    async getFreeWatches() {
        const allOrders = await this.ordersModule.getAllOrders();
        return allOrders.filter(o => o.status === 'Свободен');
    }

    getInventoryAlerts() {
        const stats = this.inventoryModule.getStats();
        return {
            lowStockCount: stats.lowStockItems.length,
            lowStockItems: stats.lowStockItems,
            outOfStockCount: stats.outOfStockItems.length,
            outOfStockItems: stats.outOfStockItems
        };
    }

    formatMonthName(monthKey) {
        const [year, month] = monthKey.split('-');
        const months = ['Януари', 'Февруари', 'Март', 'Април', 'Май', 'Юни',
            'Юли', 'Август', 'Септември', 'Октомври', 'Ноември', 'Декември'];
        return `${months[parseInt(month) - 1]} ${year}`;
    }

    attachListeners() {
        // Dashboard cards are clickable via onclick handlers in the HTML
        // No additional listeners needed
    }

    async refresh() {
        const container = document.getElementById('view-container');
        if (container) {
            try {
                const content = await this.render();
                container.innerHTML = content;
                this.attachListeners();
            } catch (error) {
                console.error('❌ Failed to refresh dashboard:', error);
            }
        }
    }
}
