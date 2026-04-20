import { CurrencyUtils } from '../../utils/CurrencyUtils.js';

export default class ReportsView {
    constructor(modules, state, eventBus) {
        this.reportsModule = modules.reports;
        this.ordersModule  = modules.orders;
        this.state = state;
        this.eventBus = eventBus;
        this._reportData = null;
        this._charts = [];
    }

    async render() {
        try {
            const [allTimeStats, originReport, vendorReport, monthlyReport, topClients] = await Promise.all([
                this.reportsModule.getAllTimeStats(),
                this.reportsModule.getReportByOrigin(),
                this.reportsModule.getReportByVendor(),
                this.reportsModule.getReportByMonth(),
                this.reportsModule.getTopClients(5),
            ]);

            this._reportData = { allTimeStats, originReport, vendorReport, monthlyReport, topClients };

            const margin = allTimeStats.totalRevenue > 0
                ? ((allTimeStats.netProfit / allTimeStats.totalRevenue) * 100).toFixed(1)
                : '0.0';

            return `
                <div class="reports-view">
                    <div class="reports-header-row">
                        <h2>📊 Отчети и анализи</h2>
                        <div class="reports-header-actions">
                            <button class="btn secondary" id="refresh-reports">🔄 Обнови</button>
                            <button class="btn" id="export-csv-btn">📥 CSV Export</button>
                        </div>
                    </div>

                    <!-- KPI Cards -->
                    <div class="summary-cards">
                        <div class="summary-card">
                            <h3>Общо поръчки</h3>
                            <div class="value">${allTimeStats.totalOrders}</div>
                        </div>
                        <div class="summary-card kpi-revenue">
                            <h3>Общо приходи</h3>
                            <div class="value">${CurrencyUtils.formatAmount(allTimeStats.totalRevenue, 'EUR')}</div>
                        </div>
                        <div class="summary-card kpi-profit">
                            <h3>Нетна печалба</h3>
                            <div class="value">${CurrencyUtils.formatAmount(allTimeStats.netProfit, 'EUR')}</div>
                        </div>
                        <div class="summary-card">
                            <h3>Средна печалба</h3>
                            <div class="value">${CurrencyUtils.formatAmount(allTimeStats.avgProfit, 'EUR')}</div>
                        </div>
                        <div class="summary-card kpi-margin">
                            <h3>Марж</h3>
                            <div class="value">${margin}%</div>
                        </div>
                        <div class="summary-card kpi-expense">
                            <h3>Общо разходи</h3>
                            <div class="value">${CurrencyUtils.formatAmount(allTimeStats.totalExpenses, 'EUR')}</div>
                        </div>
                    </div>

                    <!-- Charts row -->
                    <div class="charts-row">
                        <div class="report-card chart-card-wide">
                            <h3>📈 Приходи и печалба по месец</h3>
                            <div class="chart-canvas-wrapper">
                                <canvas id="trend-chart"></canvas>
                            </div>
                        </div>
                        <div class="report-card chart-card-narrow">
                            <h3>🎯 По източник</h3>
                            <div class="chart-canvas-wrapper chart-canvas-square">
                                <canvas id="origin-chart"></canvas>
                            </div>
                        </div>
                    </div>

                    <!-- Data tables -->
                    <div class="reports-grid">
                        <div class="report-card">
                            <h3>👥 По доставчик</h3>
                            ${this.renderVendorTable(vendorReport)}
                        </div>
                        <div class="report-card">
                            <h3>📅 По месец</h3>
                            ${this.renderMonthlyTable(monthlyReport)}
                        </div>
                        <div class="report-card">
                            <h3>🏆 Топ 5 клиенти</h3>
                            ${this.renderTopClientsTable(topClients)}
                        </div>
                    </div>
                </div>
            `;

        } catch (error) {
            console.error('❌ Failed to render reports view:', error);
            return `
                <div class="error-state">
                    <h3>❌ Failed to load reports</h3>
                    <p>${error.message}</p>
                    <button class="btn" onclick="window.app.ui.currentView.refresh()">🔄 Retry</button>
                </div>
            `;
        }
    }

    renderVendorTable(data) {
        if (!data || !Object.keys(data).length) return '<p class="no-data">Няма данни</p>';
        const sorted = Object.entries(data).sort((a, b) => b[1].revenue - a[1].revenue);
        return `
            <table class="report-table compact">
                <thead><tr><th>Доставчик</th><th>Бр.</th><th>Приходи</th><th>Печалба</th></tr></thead>
                <tbody>
                    ${sorted.map(([key, v]) => `
                        <tr>
                            <td><strong>${key}</strong></td>
                            <td>${v.count}</td>
                            <td>${CurrencyUtils.formatAmount(v.revenue, 'EUR')}</td>
                            <td class="${v.profit >= 0 ? 'profit-positive' : 'profit-negative'}">${CurrencyUtils.formatAmount(v.profit, 'EUR')}</td>
                        </tr>
                    `).join('')}
                </tbody>
                <tfoot>
                    <tr class="total-row">
                        <td><strong>ОБЩО</strong></td>
                        <td><strong>${sorted.reduce((s, [, v]) => s + v.count, 0)}</strong></td>
                        <td><strong>${CurrencyUtils.formatAmount(sorted.reduce((s, [, v]) => s + v.revenue, 0), 'EUR')}</strong></td>
                        <td><strong>${CurrencyUtils.formatAmount(sorted.reduce((s, [, v]) => s + v.profit, 0), 'EUR')}</strong></td>
                    </tr>
                </tfoot>
            </table>
        `;
    }

    renderMonthlyTable(data) {
        if (!data || !Object.keys(data).length) return '<p class="no-data">Няма данни</p>';
        const sorted = Object.entries(data).sort((a, b) => b[0].localeCompare(a[0]));
        return `
            <table class="report-table">
                <thead>
                    <tr><th>Месец</th><th>Бр.</th><th>Приходи</th><th>Разходи</th><th>Печалба</th></tr>
                </thead>
                <tbody>
                    ${sorted.map(([month, v]) => {
                        const net = v.profit - v.expenses;
                        return `
                            <tr>
                                <td><strong>${this.formatMonth(month)}</strong></td>
                                <td>${v.count}</td>
                                <td>${CurrencyUtils.formatAmount(v.revenue, 'EUR')}</td>
                                <td>${CurrencyUtils.formatAmount(v.expenses, 'EUR')}</td>
                                <td class="${net >= 0 ? 'profit-positive' : 'profit-negative'}">
                                    <strong>${CurrencyUtils.formatAmount(net, 'EUR')}</strong>
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
                <tfoot>
                    <tr class="total-row">
                        <td><strong>ОБЩО</strong></td>
                        <td><strong>${sorted.reduce((s, [, v]) => s + v.count, 0)}</strong></td>
                        <td><strong>${CurrencyUtils.formatAmount(sorted.reduce((s, [, v]) => s + v.revenue, 0), 'EUR')}</strong></td>
                        <td><strong>${CurrencyUtils.formatAmount(sorted.reduce((s, [, v]) => s + v.expenses, 0), 'EUR')}</strong></td>
                        <td><strong>${CurrencyUtils.formatAmount(sorted.reduce((s, [, v]) => s + (v.profit - v.expenses), 0), 'EUR')}</strong></td>
                    </tr>
                </tfoot>
            </table>
        `;
    }

    renderTopClientsTable(clients) {
        if (!clients || !clients.length) return '<p class="no-data">Няма данни</p>';
        return `
            <table class="report-table compact">
                <thead><tr><th>Клиент</th><th>Бр.</th><th>Приходи</th><th>Печалба</th></tr></thead>
                <tbody>
                    ${clients.map((c, i) => `
                        <tr>
                            <td><span class="rank-badge">${i + 1}</span> ${c.client}</td>
                            <td>${c.count}</td>
                            <td>${CurrencyUtils.formatAmount(c.revenue, 'EUR')}</td>
                            <td class="${c.profit >= 0 ? 'profit-positive' : 'profit-negative'}">${CurrencyUtils.formatAmount(c.profit, 'EUR')}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    _initCharts() {
        if (!window.Chart || !this._reportData) return;

        // Destroy previous charts to avoid memory leaks on re-render
        this._charts.forEach(c => c.destroy());
        this._charts = [];

        const { monthlyReport, originReport } = this._reportData;

        // ── Trend line chart ──────────────────────────────────────────────
        const trendCtx = document.getElementById('trend-chart');
        if (trendCtx && monthlyReport) {
            const months = Object.keys(monthlyReport).sort();
            const revenues = months.map(m => +(monthlyReport[m].revenue || 0).toFixed(2));
            const profits  = months.map(m => +((monthlyReport[m].profit - monthlyReport[m].expenses) || 0).toFixed(2));
            const labels   = months.map(m => this.formatMonth(m));

            this._charts.push(new window.Chart(trendCtx, {
                type: 'line',
                data: {
                    labels,
                    datasets: [
                        {
                            label: 'Приходи (€)',
                            data: revenues,
                            borderColor: '#C5AE82',
                            backgroundColor: 'rgba(197,174,130,0.1)',
                            tension: 0.3,
                            fill: true,
                            pointBackgroundColor: '#C5AE82',
                            pointRadius: 4,
                        },
                        {
                            label: 'Нетна печалба (€)',
                            data: profits,
                            borderColor: '#9BBF9A',
                            backgroundColor: 'rgba(155,191,154,0.08)',
                            tension: 0.3,
                            fill: true,
                            pointBackgroundColor: '#9BBF9A',
                            pointRadius: 4,
                        },
                    ],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: { mode: 'index', intersect: false },
                    plugins: {
                        legend: {
                            labels: { color: '#5A554E', font: { size: 12 } },
                        },
                        tooltip: {
                            callbacks: {
                                label: ctx => ` ${ctx.dataset.label}: ${ctx.raw.toFixed(2)} €`,
                            },
                        },
                    },
                    scales: {
                        x: { ticks: { color: '#5A554E', font: { size: 11 } }, grid: { color: 'rgba(0,0,0,0.04)' } },
                        y: { ticks: { color: '#5A554E', font: { size: 11 }, callback: v => v + ' €' }, grid: { color: 'rgba(0,0,0,0.04)' } },
                    },
                },
            }));
        }

        // ── Origin doughnut ───────────────────────────────────────────────
        const originCtx = document.getElementById('origin-chart');
        if (originCtx && originReport) {
            const entries = Object.entries(originReport).sort((a, b) => b[1].count - a[1].count);
            const palette = ['#C5AE82','#9BBF9A','#C98B8B','#8B9DBF','#D2B48C','#7FBFBF','#BF9F7F'];
            this._charts.push(new window.Chart(originCtx, {
                type: 'doughnut',
                data: {
                    labels: entries.map(([k]) => k),
                    datasets: [{
                        data: entries.map(([, v]) => v.count),
                        backgroundColor: entries.map((_, i) => palette[i % palette.length]),
                        borderWidth: 2,
                        borderColor: '#FFFFFF',
                    }],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: { color: '#5A554E', font: { size: 11 }, padding: 12, boxWidth: 12 },
                        },
                        tooltip: {
                            callbacks: {
                                label: ctx => ` ${ctx.label}: ${ctx.raw} поръчки`,
                            },
                        },
                    },
                    cutout: '60%',
                },
            }));
        }
    }

    exportCSV() {
        if (!this._reportData) return;
        const { monthlyReport } = this._reportData;
        const bom = '\uFEFF';
        const header = 'Месец,Поръчки,Приходи (EUR),Разходи (EUR),Нетна печалба (EUR)\n';
        const rows = Object.entries(monthlyReport)
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([month, v]) => {
                const net = (v.profit - v.expenses).toFixed(2);
                return `${month},${v.count},${v.revenue.toFixed(2)},${v.expenses.toFixed(2)},${net}`;
            })
            .join('\n');
        const blob = new Blob([bom + header + rows], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `orders-report-${new Date().toISOString().substring(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        this.eventBus.emit('notification:show', { message: '✅ CSV файлът е изтеглен', type: 'success' });
    }

    formatMonth(monthKey) {
        const [year, month] = monthKey.split('-');
        const months = ['Ян', 'Фев', 'Мар', 'Апр', 'Май', 'Юни', 'Юли', 'Авг', 'Сеп', 'Окт', 'Ное', 'Дек'];
        return `${months[parseInt(month) - 1]} ${year}`;
    }

    attachListeners() {
        document.getElementById('refresh-reports')?.addEventListener('click', async () => {
            this.eventBus.emit('notification:show', { message: '🔄 Обновяване...', type: 'info' });
            try {
                await this.refresh();
                this.eventBus.emit('notification:show', { message: '✅ Отчетите са обновени', type: 'success' });
            } catch (error) {
                this.eventBus.emit('notification:show', { message: '❌ ' + error.message, type: 'error' });
            }
        });

        document.getElementById('export-csv-btn')?.addEventListener('click', () => this.exportCSV());

        // Charts need Chart.js to be loaded
        if (window.Chart) {
            this._initCharts();
        } else {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js';
            script.onload = () => this._initCharts();
            document.head.appendChild(script);
        }
    }

    async refresh() {
        const container = document.getElementById('view-container');
        if (!container) return;
        try {
            const content = await this.render();
            container.innerHTML = content;
            this.attachListeners();
        } catch (error) {
            console.error('❌ Failed to refresh reports view:', error);
        }
    }
}
