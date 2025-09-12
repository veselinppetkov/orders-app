export default class ReportsView {
    constructor(modules, state, eventBus) {
        this.reportsModule = modules.reports;
        this.state = state;
        this.eventBus = eventBus;
    }

    async render() {
        try {
            // ALL DATA LOADING IS NOW ASYNC
            const allTimeStats = await this.reportsModule.getAllTimeStats();
            const originReport = await this.reportsModule.getReportByOrigin();
            const vendorReport = await this.reportsModule.getReportByVendor();
            const monthlyReport = await this.reportsModule.getReportByMonth();
            const topClients = await this.reportsModule.getTopClients(5);

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
                    
                    <div class="report-actions">
                        <button class="btn" id="refresh-reports">🔄 Обнови отчетите</button>
                        <button class="btn secondary" id="export-reports">📤 Експорт в CSV</button>
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

    renderReportTable(data, label) {
        if (!data || Object.keys(data).length === 0) {
            return `<p class="no-data">Няма данни за показване</p>`;
        }

        const sorted = Object.entries(data).sort((a, b) => b[1].profit - a[1].profit);

        return `
            <table class="report-table">
                <thead>
                    <tr>
                        <th>${label}</th>
                        <th>Брой</th>
                        <th>Приходи</th>
                        <th>Печалба</th>
                    </tr>
                </thead>
                <tbody>
                    ${sorted.map(([key, val]) => `
                        <tr>
                            <td><strong>${key}</strong></td>
                            <td>${val.count}</td>
                            <td>${val.revenue.toFixed(2)} лв</td>
                            <td><strong>${val.profit.toFixed(2)} лв</strong></td>
                        </tr>
                    `).join('')}
                </tbody>
                <tfoot>
                    <tr class="total-row">
                        <td><strong>ОБЩО</strong></td>
                        <td><strong>${sorted.reduce((sum, [, val]) => sum + val.count, 0)}</strong></td>
                        <td><strong>${sorted.reduce((sum, [, val]) => sum + val.revenue, 0).toFixed(2)} лв</strong></td>
                        <td><strong>${sorted.reduce((sum, [, val]) => sum + val.profit, 0).toFixed(2)} лв</strong></td>
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

        return `
            <table class="report-table">
                <thead>
                    <tr>
                        <th>Месец</th>
                        <th>Поръчки</th>
                        <th>Приходи</th>
                        <th>Разходи</th>
                        <th>Нетна печалба</th>
                    </tr>
                </thead>
                <tbody>
                    ${sorted.map(([month, val]) => {
            const netProfit = val.profit - val.expenses;
            return `
                            <tr>
                                <td><strong>${this.formatMonth(month)}</strong></td>
                                <td>${val.count}</td>
                                <td>${val.revenue.toFixed(2)} лв</td>
                                <td>${val.expenses.toFixed(2)} лв</td>
                                <td class="${netProfit >= 0 ? 'profit-positive' : 'profit-negative'}">
                                    <strong>${netProfit.toFixed(2)} лв</strong>
                                </td>
                            </tr>
                        `;
        }).join('')}
                </tbody>
                <tfoot>
                    <tr class="total-row">
                        <td><strong>ОБЩО</strong></td>
                        <td><strong>${sorted.reduce((sum, [, val]) => sum + val.count, 0)}</strong></td>
                        <td><strong>${sorted.reduce((sum, [, val]) => sum + val.revenue, 0).toFixed(2)} лв</strong></td>
                        <td><strong>${sorted.reduce((sum, [, val]) => sum + val.expenses, 0).toFixed(2)} лв</strong></td>
                        <td><strong>${sorted.reduce((sum, [, val]) => sum + (val.profit - val.expenses), 0).toFixed(2)} лв</strong></td>
                    </tr>
                </tfoot>
            </table>
        `;
    }

    renderTopClients(clients) {
        if (!clients || clients.length === 0) {
            return `<p class="no-data">Няма клиентски данни</p>`;
        }

        return `
            <table class="report-table">
                <thead>
                    <tr>
                        <th>Позиция</th>
                        <th>Клиент</th>
                        <th>Поръчки</th>
                        <th>Приходи</th>
                        <th>Печалба</th>
                    </tr>
                </thead>
                <tbody>
                    ${clients.map((c, index) => `
                        <tr>
                            <td class="rank-cell">
                                <span class="rank ${index < 3 ? 'top-rank' : ''}">${index + 1}</span>
                            </td>
                            <td><strong>${c.client}</strong></td>
                            <td>${c.count}</td>
                            <td>${c.revenue.toFixed(2)} лв</td>
                            <td><strong>${c.profit.toFixed(2)} лв</strong></td>
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
        // Refresh reports button
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

        // Export reports button
        document.getElementById('export-reports')?.addEventListener('click', async () => {
            try {
                await this.exportReportsToCSV();
                this.eventBus.emit('notification:show', {
                    message: '📤 Отчетите са експортирани успешно!',
                    type: 'success'
                });
            } catch (error) {
                this.eventBus.emit('notification:show', {
                    message: '❌ Грешка при експорт: ' + error.message,
                    type: 'error'
                });
            }
        });
    }

    async exportReportsToCSV() {
        try {
            const allTimeStats = await this.reportsModule.getAllTimeStats();
            const originReport = await this.reportsModule.getReportByOrigin();
            const vendorReport = await this.reportsModule.getReportByVendor();
            const monthlyReport = await this.reportsModule.getReportByMonth();
            const topClients = await this.reportsModule.getTopClients(10);

            let csvContent = '';

            // Summary section
            csvContent += 'ОБОБЩЕНИ СТАТИСТИКИ\n';
            csvContent += `Общо поръчки,${allTimeStats.totalOrders}\n`;
            csvContent += `Общо приходи,${allTimeStats.totalRevenue.toFixed(2)} лв\n`;
            csvContent += `Нетна печалба,${allTimeStats.netProfit.toFixed(2)} лв\n`;
            csvContent += `Средна печалба,${allTimeStats.avgProfit.toFixed(2)} лв\n\n`;

            // Origins report
            csvContent += 'ОТЧЕТ ПО ИЗТОЧНИЦИ\n';
            csvContent += 'Източник,Брой,Приходи,Печалба\n';
            Object.entries(originReport)
                .sort((a, b) => b[1].profit - a[1].profit)
                .forEach(([origin, data]) => {
                    csvContent += `${origin},${data.count},${data.revenue.toFixed(2)},${data.profit.toFixed(2)}\n`;
                });
            csvContent += '\n';

            // Vendors report
            csvContent += 'ОТЧЕТ ПО ДОСТАВЧИЦИ\n';
            csvContent += 'Доставчик,Брой,Приходи,Печалба\n';
            Object.entries(vendorReport)
                .sort((a, b) => b[1].profit - a[1].profit)
                .forEach(([vendor, data]) => {
                    csvContent += `${vendor},${data.count},${data.revenue.toFixed(2)},${data.profit.toFixed(2)}\n`;
                });
            csvContent += '\n';

            // Monthly report
            csvContent += 'МЕСЕЧЕН ОТЧЕТ\n';
            csvContent += 'Месец,Поръчки,Приходи,Разходи,Нетна печалба\n';
            Object.entries(monthlyReport)
                .sort((a, b) => b[0].localeCompare(a[0]))
                .forEach(([month, data]) => {
                    const netProfit = data.profit - data.expenses;
                    csvContent += `${this.formatMonth(month)},${data.count},${data.revenue.toFixed(2)},${data.expenses.toFixed(2)},${netProfit.toFixed(2)}\n`;
                });
            csvContent += '\n';

            // Top clients
            csvContent += 'ТОП КЛИЕНТИ\n';
            csvContent += 'Позиция,Клиент,Поръчки,Приходи,Печалба\n';
            topClients.forEach((client, index) => {
                csvContent += `${index + 1},${client.client},${client.count},${client.revenue.toFixed(2)},${client.profit.toFixed(2)}\n`;
            });

            // Create and download file
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', `reports_${new Date().toISOString().split('T')[0]}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

        } catch (error) {
            console.error('❌ Export to CSV failed:', error);
            throw error;
        }
    }

    // ASYNC REFRESH METHOD
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