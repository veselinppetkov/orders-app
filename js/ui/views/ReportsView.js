// js/ui/views/ReportsView.js - WITH REACTIVE PATTERNS

export default class ReportsView {
    constructor(modules, state, eventBus) {
        this.reportsModule = modules.reports;
        this.state = state;
        this.eventBus = eventBus;
    }

    // Render delta chip for KPIs
    renderDeltaChip(delta, label = 'vs миналия месец') {
        if (delta === 0 || isNaN(delta)) {
            return `<span class="delta-chip neutral">
                <span class="delta-arrow">━</span> 0%
            </span>`;
        }

        const isPositive = delta > 0;
        const chipClass = isPositive ? 'positive' : 'negative';
        const arrow = isPositive ? '↑' : '↓';
        const displayValue = Math.abs(delta).toFixed(1);

        return `
            <span class="delta-chip ${chipClass}" title="${label}">
                <span class="delta-arrow">${arrow}</span> ${displayValue}%
            </span>
        `;
    }

    async render() {
        try {
            // Load data with trend information
            const allTimeStats = await this.reportsModule.getAllTimeStatsWithTrends();
            const originReport = await this.reportsModule.getReportByOrigin();
            const vendorReport = await this.reportsModule.getReportByVendor();
            const monthlyReport = await this.reportsModule.getReportByMonth();

            // Calculate velocity from recent months
            const velocityChip = this.renderDeltaChip(allTimeStats.velocity, 'спрямо предходен месец');

            return `
                <div class="reports-view fade-in">
                    <h2>📊 Отчети и анализи</h2>

                    <div class="summary-cards">
                        <div class="summary-card">
                            <h3>ОБЩО ПОРЪЧКИ</h3>
                            <div class="value">${allTimeStats.totalOrders}</div>
                            <span class="trend-label">Всички времена</span>
                        </div>
                        <div class="summary-card" style="background: linear-gradient(135deg, #28a745 0%, #20c997 100%);">
                            <h3>ОБЩО ПРИХОДИ</h3>
                            <div class="value">${allTimeStats.totalRevenue.toFixed(2)} €</div>
                            <span class="trend-label">Всички времена</span>
                        </div>
                        <div class="summary-card" style="background: linear-gradient(135deg, #ffc107 0%, #ff9800 100%);">
                            <h3>НЕТНА ПЕЧАЛБА</h3>
                            <div class="value">
                                ${allTimeStats.netProfit.toFixed(2)} €
                                ${velocityChip}
                            </div>
                            <span class="trend-label">Тенденция: ${allTimeStats.trend === 'up' ? '📈 нагоре' : allTimeStats.trend === 'down' ? '📉 надолу' : '➡️ стабилна'}</span>
                        </div>
                        <div class="summary-card" style="background: linear-gradient(135deg, #17a2b8 0%, #138496 100%);">
                            <h3>СРЕДНА ПЕЧАЛБА</h3>
                            <div class="value">${allTimeStats.avgProfit.toFixed(2)} €</div>
                            <span class="trend-label">На поръчка</span>
                        </div>
                    </div>
                    
                    <div class="reports-grid">
                        <div class="report-card">
                            <h3>📊 По източник</h3>
                            ${this.renderReportTable(originReport, 'Източник')}
                        </div>
                        
                        <div class="report-card">
                            <h3>👥 По доставчик</h3>
                            ${this.renderReportTable(vendorReport, 'Доставчик')}
                        </div>
                        
                        <div class="report-card">
                            <h3>📅 По месец</h3>
                            ${this.renderMonthlyTable(monthlyReport)}
                        </div>
                        
                        <!-- REMOVED: Top Clients section -->
                    </div>
                    
                    <div class="report-actions">
                        <button class="btn" id="refresh-reports">🔄 Обнови отчетите</button>
                        <!-- REMOVED: CSV Export button -->
                    </div>
                </div>
            `;

        } catch (error) {
            console.error('❌ Failed to render reports view:', error);
            return `
                <div class="error-state">
                    <h3>❌ Failed to load reports</h3>
                    <p>Error: ${error.message}</p>
                    <button onclick="window.app.ui.currentView.refresh()" class="btn">🔄 Retry</button>
                </div>
            `;
        }
    }

    renderReportTable(data, labelTitle) {
        if (!data || Object.keys(data).length === 0) {
            return `<p class="no-data">Няма данни за ${labelTitle.toLowerCase()}</p>`;
        }

        const sorted = Object.entries(data).sort((a, b) => b[1].profit - a[1].profit);

        return `
            <table class="report-table">
                <thead>
                    <tr>
                        <th>${labelTitle}</th>
                        <th>Поръчки</th>
                        <th>Приходи</th>
                        <th>Печалба</th>
                    </tr>
                </thead>
                <tbody>
                    ${sorted.map(([key, value]) => `
                        <tr>
                            <td><strong>${key}</strong></td>
                            <td>${value.count}</td>
                            <td>${value.revenue.toFixed(2)} €</td>
                            <td class="${value.profit >= 0 ? 'profit-positive' : 'profit-negative'}">
                                <strong>${value.profit.toFixed(2)} €</strong>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
                <tfoot>
                    <tr class="total-row">
                        <td><strong>ОБЩО</strong></td>
                        <td><strong>${sorted.reduce((sum, [, val]) => sum + val.count, 0)}</strong></td>
                        <td><strong>${sorted.reduce((sum, [, val]) => sum + val.revenue, 0).toFixed(2)} €</strong></td>
                        <td><strong>${sorted.reduce((sum, [, val]) => sum + val.profit, 0).toFixed(2)} €</strong></td>
                    </tr>
                </tfoot>
            </table>
        `;
    }

    renderMonthlyTable(data) {
        if (!data || Object.keys(data).length === 0) {
            return `<p class="no-data">Няма месечни данни</p>`;
        }

        const sorted = Object.entries(data).sort((a, b) => b[0].localeCompare(a[0]));

        // Calculate deltas between consecutive months
        const withDeltas = sorted.map(([month, value], index) => {
            const prevMonth = sorted[index + 1];
            let delta = 0;
            if (prevMonth) {
                const prevProfit = prevMonth[1].profit - prevMonth[1].expenses;
                const currentProfit = value.profit - value.expenses;
                if (prevProfit !== 0) {
                    delta = ((currentProfit - prevProfit) / Math.abs(prevProfit)) * 100;
                }
            }
            return { month, value, delta };
        });

        return `
            <table class="report-table">
                <thead>
                    <tr>
                        <th>Месец</th>
                        <th>Поръчки</th>
                        <th>Приходи</th>
                        <th>Разходи</th>
                        <th>Нетна печалба</th>
                        <th>Промяна</th>
                    </tr>
                </thead>
                <tbody>
                    ${withDeltas.map(({ month, value, delta }) => {
            const netProfit = value.profit - value.expenses;
            return `
                            <tr>
                                <td><strong>${this.formatMonth(month)}</strong></td>
                                <td>${value.count}</td>
                                <td>${value.revenue.toFixed(2)} €</td>
                                <td>${value.expenses.toFixed(2)} €</td>
                                <td class="${netProfit >= 0 ? 'profit-positive' : 'profit-negative'}">
                                    <strong>${netProfit.toFixed(2)} €</strong>
                                </td>
                                <td>${this.renderDeltaChip(delta, 'vs предишен месец')}</td>
                            </tr>
                        `;
        }).join('')}
                </tbody>
                <tfoot>
                    <tr class="total-row">
                        <td><strong>ОБЩО</strong></td>
                        <td><strong>${sorted.reduce((sum, [, val]) => sum + val.count, 0)}</strong></td>
                        <td><strong>${sorted.reduce((sum, [, val]) => sum + val.revenue, 0).toFixed(2)} €</strong></td>
                        <td><strong>${sorted.reduce((sum, [, val]) => sum + val.expenses, 0).toFixed(2)} €</strong></td>
                        <td><strong>${sorted.reduce((sum, [, val]) => sum + (val.profit - val.expenses), 0).toFixed(2)} €</strong></td>
                        <td></td>
                    </tr>
                </tfoot>
            </table>
        `;
    }

    // REMOVED: renderTopClients method completely

    formatMonth(monthKey) {
        const [year, month] = monthKey.split('-');
        const months = ['Ян', 'Фев', 'Мар', 'Апр', 'Май', 'Юни', 'Юли', 'Авг', 'Сеп', 'Окт', 'Ное', 'Дек'];
        return `${months[parseInt(month) - 1]} ${year}`;
    }

    attachListeners() {
        // Refresh reports button (KEEP THIS)
        document.getElementById('refresh-reports')?.addEventListener('click', async () => {
            this.eventBus.emit('notification:show', {
                message: '🔄 Обновяване на отчетите...',
                type: 'info'
            });

            try {
                await this.refresh();
                this.eventBus.emit('notification:show', {
                    message: '✅ Отчетите са обновени успешно!',
                    type: 'success'
                });
            } catch (error) {
                this.eventBus.emit('notification:show', {
                    message: '❌ Грешка при обновяване: ' + error.message,
                    type: 'error'
                });
            }
        });

        // REMOVED: Export reports button event listener
    }

    // REMOVED: exportReportsToCSV method completely

    // ASYNC REFRESH METHOD (KEEP THIS)
    async refresh() {
        const container = document.getElementById('view-container');
        if (container) {
            // Show loading state
            container.innerHTML = `
                <div class="loading-state">
                    <h3>📊 Loading reports...</h3>
                    <p>Calculating statistics from database...</p>
                </div>
            `;

            try {
                const content = await this.render();
                container.innerHTML = content;
                this.attachListeners();
            } catch (error) {
                console.error('❌ Failed to refresh reports view:', error);
                container.innerHTML = `
                    <div class="error-state">
                        <h3>❌ Failed to load reports</h3>
                        <p>Error: ${error.message}</p>
                        <button onclick="window.app.ui.currentView.refresh()" class="btn">🔄 Retry</button>
                    </div>
                `;
            }
        }
    }
}