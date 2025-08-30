export default class ReportsView {
    constructor(modules, state, eventBus) {
        this.reportsModule = modules.reports;
        this.state = state;
        this.eventBus = eventBus;
    }

    render() {
        const allTimeStats = this.reportsModule.getAllTimeStats();
        const originReport = this.reportsModule.getReportByOrigin();
        const vendorReport = this.reportsModule.getReportByVendor();
        const monthlyReport = this.reportsModule.getReportByMonth();
        const topClients = this.reportsModule.getTopClients(5);

        return `
            <div class="reports-view">
                <h2>📊 Отчети и анализи</h2>
                
                <div class="summary-cards">
                    <div class="summary-card">
                        <h3>ОБЩО ПОРЪЧКИ</h3>
                        <div class="value">${allTimeStats.totalOrders}</div>
                    </div>
                    <div class="summary-card" style="background: linear-gradient(135deg, #28a745 0%, #20c997 100%);">
                        <h3>ОБЩО ПРИХОДИ</h3>
                        <div class="value">${allTimeStats.totalRevenue.toFixed(2)} лв</div>
                    </div>
                    <div class="summary-card" style="background: linear-gradient(135deg, #ffc107 0%, #ff9800 100%);">
                        <h3>НЕТНА ПЕЧАЛБА</h3>
                        <div class="value">${allTimeStats.netProfit.toFixed(2)} лв</div>
                    </div>
                    <div class="summary-card" style="background: linear-gradient(135deg, #17a2b8 0%, #138496 100%);">
                        <h3>СРЕДНА ПЕЧАЛБА</h3>
                        <div class="value">${allTimeStats.avgProfit.toFixed(2)} лв</div>
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
                    
                    <div class="report-card">
                        <h3>🏆 Топ клиенти</h3>
                        ${this.renderTopClients(topClients)}
                    </div>
                </div>
            </div>
        `;
    }

    renderReportTable(data, label) {
        const sorted = Object.entries(data).sort((a, b) => b[1].profit - a[1].profit);

        return `
            <table class="report-table">
                <thead>
                    <tr>
                        <th>${label}</th>
                        <th>Брой</th>
                        <th>Печалба</th>
                    </tr>
                </thead>
                <tbody>
                    ${sorted.map(([key, val]) => `
                        <tr>
                            <td>${key}</td>
                            <td>${val.count}</td>
                            <td>${val.profit.toFixed(2)} лв</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    renderMonthlyTable(data) {
        const sorted = Object.entries(data).sort((a, b) => b[0].localeCompare(a[0]));

        return `
            <table class="report-table">
                <thead>
                    <tr>
                        <th>Месец</th>
                        <th>Поръчки</th>
                        <th>Печалба</th>
                    </tr>
                </thead>
                <tbody>
                    ${sorted.map(([month, val]) => `
                        <tr>
                            <td>${this.formatMonth(month)}</td>
                            <td>${val.count}</td>
                            <td>${(val.profit - val.expenses).toFixed(2)} лв</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    renderTopClients(clients) {
        return `
            <table class="report-table">
                <thead>
                    <tr>
                        <th>Клиент</th>
                        <th>Поръчки</th>
                        <th>Приходи</th>
                    </tr>
                </thead>
                <tbody>
                    ${clients.map(c => `
                        <tr>
                            <td>${c.client}</td>
                            <td>${c.count}</td>
                            <td>${c.revenue.toFixed(2)} лв</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    formatMonth(monthKey) {
        const [year, month] = monthKey.split('-');
        const months = ['Ян', 'Фев', 'Мар', 'Апр', 'Май', 'Юни', 'Юли', 'Авг', 'Сеп', 'Окт', 'Ное', 'Дек'];
        return `${months[parseInt(month) - 1]} ${year}`;
    }

    attachListeners() {
        // Reports don't need many listeners
    }
}