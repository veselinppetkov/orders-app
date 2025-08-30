export class ReportsModule {
    constructor(state, eventBus) {
        this.state = state;
        this.eventBus = eventBus;
    }

    getMonthlyStats(month = null) {
        const targetMonth = month || this.state.get('currentMonth');
        const monthlyData = this.state.get('monthlyData');
        const monthData = monthlyData[targetMonth] || { orders: [], expenses: [] };

        const orders = monthData.orders || [];
        const expenses = monthData.expenses || [];

        const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
        const revenue = orders.reduce((sum, o) => sum + o.sellBGN, 0);
        const totalOrderCosts = orders.reduce((sum, o) => sum + o.totalBGN, 0);
        const profit = revenue - totalOrderCosts - totalExpenses;

        return {
            orderCount: orders.length,
            revenue,
            expenses: totalExpenses,
            profit,
            avgProfit: orders.length > 0 ? profit / orders.length : 0
        };
    }

    getAllTimeStats() {
        const monthlyData = this.state.get('monthlyData');
        const allOrders = Object.values(monthlyData).flatMap(m => m.orders || []);
        const allExpenses = Object.values(monthlyData).flatMap(m => m.expenses || []);

        const totalRevenue = allOrders.reduce((sum, o) => sum + o.sellBGN, 0);
        const totalProfit = allOrders.reduce((sum, o) => sum + o.balanceBGN, 0);
        const totalExpenses = allExpenses.reduce((sum, e) => sum + e.amount, 0);

        return {
            totalOrders: allOrders.length,
            totalRevenue,
            totalProfit,
            totalExpenses,
            netProfit: totalProfit - totalExpenses,
            avgProfit: allOrders.length > 0 ? totalProfit / allOrders.length : 0
        };
    }

    getReportByOrigin() {
        const monthlyData = this.state.get('monthlyData');
        const allOrders = Object.values(monthlyData).flatMap(m => m.orders || []);

        return this.aggregateBy(allOrders, 'origin');
    }

    getReportByVendor() {
        const monthlyData = this.state.get('monthlyData');
        const allOrders = Object.values(monthlyData).flatMap(m => m.orders || []);

        return this.aggregateBy(allOrders, 'vendor');
    }

    getReportByMonth() {
        const monthlyData = this.state.get('monthlyData');
        const report = {};

        Object.entries(monthlyData).forEach(([month, data]) => {
            const orders = data.orders || [];
            const expenses = data.expenses || [];

            report[month] = {
                count: orders.length,
                revenue: orders.reduce((sum, o) => sum + o.sellBGN, 0),
                profit: orders.reduce((sum, o) => sum + o.balanceBGN, 0),
                expenses: expenses.reduce((sum, e) => sum + e.amount, 0)
            };
        });

        return report;
    }

    getTopClients(limit = 10) {
        const monthlyData = this.state.get('monthlyData');
        const allOrders = Object.values(monthlyData).flatMap(m => m.orders || []);

        const clientStats = this.aggregateBy(allOrders, 'client');

        return Object.entries(clientStats)
            .sort((a, b) => b[1].profit - a[1].profit)
            .slice(0, limit)
            .map(([client, stats]) => ({ client, ...stats }));
    }

    aggregateBy(orders, field) {
        return orders.reduce((acc, order) => {
            const key = order[field];
            if (!acc[key]) {
                acc[key] = { count: 0, revenue: 0, profit: 0 };
            }
            acc[key].count++;
            acc[key].revenue += order.sellBGN;
            acc[key].profit += order.balanceBGN;
            return acc;
        }, {});
    }
}