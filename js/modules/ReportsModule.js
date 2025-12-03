export class ReportsModule {
    constructor(state, eventBus, ordersModule) {  // ADD ordersModule dependency
        this.state = state;
        this.eventBus = eventBus;
        this.ordersModule = ordersModule;  // NEW: Direct access to orders
    }

    async getMonthlyStats(month = null) {
        const targetMonth = month || this.state.get('currentMonth');

        // GET ORDERS FROM SUPABASE, not localStorage
        const orders = await this.ordersModule.getOrders(targetMonth);

        // GET EXPENSES from localStorage (still there)
        const monthlyData = this.state.get('monthlyData');
        const expenses = monthlyData[targetMonth]?.expenses || [];

        const totalExpenses = expenses.reduce((sum, e) => sum + (e.amountEUR || e.amount || 0), 0);
        const revenue = orders.reduce((sum, o) => sum + (o.sellEUR || 0), 0);
        const totalOrderCosts = orders.reduce((sum, o) => sum + (o.totalEUR || 0), 0);
        const profit = revenue - totalOrderCosts - totalExpenses;

        return {
            orderCount: orders.length,
            revenue,
            expenses: totalExpenses,
            profit,
            avgProfit: orders.length > 0 ? profit / orders.length : 0
        };
    }

    async getAllTimeStats() {
        // GET ALL ORDERS from Supabase
        const allOrders = await this.ordersModule.getAllOrders();

        // GET ALL EXPENSES from localStorage
        const monthlyData = this.state.get('monthlyData');
        const allExpenses = Object.values(monthlyData).flatMap(m => m.expenses || []);

        const totalRevenue = allOrders.reduce((sum, o) => sum + (o.sellEUR || 0), 0);
        const totalProfit = allOrders.reduce((sum, o) => sum + (o.balanceEUR || 0), 0);
        const totalExpenses = allExpenses.reduce((sum, e) => sum + (e.amountEUR || e.amount || 0), 0);

        return {
            totalOrders: allOrders.length,
            totalRevenue,
            totalProfit,
            totalExpenses,
            netProfit: totalProfit - totalExpenses,
            avgProfit: allOrders.length > 0 ? totalProfit / allOrders.length : 0
        };
    }

    async getReportByOrigin() {
        const allOrders = await this.ordersModule.getAllOrders();
        return this.aggregateBy(allOrders, 'origin');
    }

    async getReportByVendor() {
        const allOrders = await this.ordersModule.getAllOrders();
        return this.aggregateBy(allOrders, 'vendor');
    }

    async getReportByMonth() {
        const allOrders = await this.ordersModule.getAllOrders();
        const monthlyData = this.state.get('monthlyData');
        const report = {};

        // Group orders by month
        const ordersByMonth = {};
        allOrders.forEach(order => {
            const month = order.date.substring(0, 7); // "2024-01"
            if (!ordersByMonth[month]) ordersByMonth[month] = [];
            ordersByMonth[month].push(order);
        });

        // Build report combining orders and expenses
        Object.keys(ordersByMonth).forEach(month => {
            const orders = ordersByMonth[month];
            const expenses = monthlyData[month]?.expenses || [];

            report[month] = {
                count: orders.length,
                revenue: orders.reduce((sum, o) => sum + (o.sellEUR || 0), 0),
                profit: orders.reduce((sum, o) => sum + (o.balanceEUR || 0), 0),
                expenses: expenses.reduce((sum, e) => sum + (e.amountEUR || e.amount || 0), 0)
            };
        });

        return report;
    }

    async getTopClients(limit = 10) {
        const allOrders = await this.ordersModule.getAllOrders();
        const clientStats = this.aggregateBy(allOrders, 'client');

        return Object.entries(clientStats)
            .sort((a, b) => b[1].profit - a[1].profit)
            .slice(0, limit)
            .map(([client, stats]) => ({ client, ...stats }));
    }

    // Helper method - EUR only (orders validated by SupabaseService)
    aggregateBy(orders, field) {
        return orders.reduce((acc, order) => {
            const key = order[field];
            if (!acc[key]) {
                acc[key] = { count: 0, revenue: 0, profit: 0 };
            }
            acc[key].count++;
            acc[key].revenue += (order.sellEUR || 0);
            acc[key].profit += (order.balanceEUR || 0);
            return acc;
        }, {});
    }
}