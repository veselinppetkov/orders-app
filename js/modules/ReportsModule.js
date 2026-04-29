import { CurrencyUtils } from '../utils/CurrencyUtils.js';

export class ReportsModule {
    constructor(state, eventBus, ordersModule, expensesModule) {
        this.state = state;
        this.eventBus = eventBus;
        this.ordersModule = ordersModule;
        this.expensesModule = expensesModule;
    }

    getOrderEurMetrics(order) {
        const sellEUR = order.sellEUR || 0;
        const totalEUR = order.totalEUR || 0;
        const balanceEUR = order.balanceEUR || 0;

        return { sellEUR, totalEUR, balanceEUR };
    }

    async getReportsData(topClientLimit = 5) {
        const allOrders = await this.ordersModule.getAllOrders({ includeImageUrls: false, preferLightweight: true });
        const soldOrders = allOrders.filter(o => o.status !== 'Свободен');
        const uniqueMonths = [...new Set(soldOrders.map(o => o.date?.substring(0, 7)).filter(Boolean))];
        const expensesByMonth = new Map();

        await Promise.all(uniqueMonths.map(async (month) => {
            const expenses = await this.expensesModule.getExpenses(month);
            expensesByMonth.set(month, expenses);
        }));

        const originReport = this.aggregateBy(soldOrders, 'origin');
        const vendorReport = this.aggregateBy(soldOrders, 'vendor');
        const clientStats = this.aggregateBy(soldOrders, 'client');
        const monthlyReport = {};

        for (const order of soldOrders) {
            const month = order.date?.substring(0, 7);
            if (!month) continue;
            if (!monthlyReport[month]) {
                const monthExpenses = expensesByMonth.get(month) || [];
                monthlyReport[month] = {
                    count: 0,
                    revenue: 0,
                    profit: 0,
                    expenses: monthExpenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0)
                };
            }

            monthlyReport[month].count++;
            monthlyReport[month].revenue += order.sellEUR || 0;
            monthlyReport[month].profit += order.balanceEUR || 0;
        }

        const totalRevenue = soldOrders.reduce((sum, o) => sum + (o.sellEUR || 0), 0);
        const totalProfit = soldOrders.reduce((sum, o) => sum + (o.balanceEUR || 0), 0);
        const totalExpenses = [...expensesByMonth.values()]
            .flat()
            .reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);

        const allTimeStats = {
            totalOrders: soldOrders.length,
            totalRevenue,
            totalProfit,
            totalExpenses,
            netProfit: totalProfit - totalExpenses,
            avgProfit: soldOrders.length > 0 ? totalProfit / soldOrders.length : 0
        };

        const topClients = Object.entries(clientStats)
            .sort((a, b) => b[1].profit - a[1].profit)
            .slice(0, topClientLimit)
            .map(([client, stats]) => ({ client, ...stats }));

        return { allTimeStats, originReport, vendorReport, monthlyReport, topClients };
    }

    async getMonthlyStats(month = null) {
        const targetMonth = month || this.state.get('currentMonth');

        // Load orders and expenses from Supabase
        const allOrders = await this.ordersModule.getOrders(targetMonth, { includeImageUrls: false, preferLightweight: true });
        const expenses = await this.expensesModule.getExpenses(targetMonth);

        // Filter out "Свободен" (Free/Inventory) watches - they're inventory, not sales
        const soldOrders = allOrders.filter(o => o.status !== 'Свободен');
        const freeWatches = allOrders.filter(o => o.status === 'Свободен');

        const operatingExpenses = expenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
        const revenue = soldOrders.reduce((sum, o) => sum + (o.sellEUR || 0), 0);
        const watchCosts = soldOrders.reduce((sum, o) => sum + (o.totalEUR || 0), 0);
        const totalExpenses = operatingExpenses + watchCosts;
        const profit = revenue - watchCosts - operatingExpenses;

        return {
            orderCount: soldOrders.length, // Count only sold orders, not inventory
            totalOrders: allOrders.length, // Total including free watches
            freeWatchCount: freeWatches.length, // Inventory count
            revenue,
            expenses: totalExpenses, // Total of operating + watch costs
            operatingExpenses, // Operating expenses only (ads, subscriptions, etc.)
            watchCosts, // Watch purchase costs (sold orders only)
            profit,
            avgProfit: soldOrders.length > 0 ? profit / soldOrders.length : 0
        };
    }

    async getAllTimeStats() {
        // Get all orders from Supabase
        const allOrders = await this.ordersModule.getAllOrders({ includeImageUrls: false, preferLightweight: true });

        // Filter out "Свободен" (Free/Inventory) watches
        const soldOrders = allOrders.filter(o => o.status !== 'Свободен');

        // Get unique months from orders
        const uniqueMonths = new Set(soldOrders.map(o => o.date.substring(0, 7)));

        // Get expenses for each month from Supabase
        const allExpenses = (await Promise.all([...uniqueMonths].map(month => this.expensesModule.getExpenses(month)))).flat();

        const totalRevenue = soldOrders.reduce((sum, o) => sum + (o.sellEUR || 0), 0);
        const totalProfit = soldOrders.reduce((sum, o) => sum + (o.balanceEUR || 0), 0);
        const totalExpenses = allExpenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);

        return {
            totalOrders: soldOrders.length, // Sold orders only
            totalRevenue,
            totalProfit,
            totalExpenses,
            netProfit: totalProfit - totalExpenses,
            avgProfit: soldOrders.length > 0 ? totalProfit / soldOrders.length : 0
        };
    }

    async getReportByOrigin() {
        const allOrders = await this.ordersModule.getAllOrders({ includeImageUrls: false, preferLightweight: true });
        const soldOrders = allOrders.filter(o => o.status !== 'Свободен');
        return this.aggregateBy(soldOrders, 'origin');
    }

    async getReportByVendor() {
        const allOrders = await this.ordersModule.getAllOrders({ includeImageUrls: false, preferLightweight: true });
        const soldOrders = allOrders.filter(o => o.status !== 'Свободен');
        return this.aggregateBy(soldOrders, 'vendor');
    }

    async getReportByMonth() {
        const allOrders = await this.ordersModule.getAllOrders({ includeImageUrls: false, preferLightweight: true });
        const soldOrders = allOrders.filter(o => o.status !== 'Свободен');
        const report = {};

        // Group orders by month
        const ordersByMonth = {};
        soldOrders.forEach(order => {
            const month = order.date.substring(0, 7); // "2024-01"
            if (!ordersByMonth[month]) ordersByMonth[month] = [];
            ordersByMonth[month].push(order);
        });

        const expensesByMonth = new Map();
        await Promise.all(Object.keys(ordersByMonth).map(async (month) => {
            expensesByMonth.set(month, await this.expensesModule.getExpenses(month));
        }));

        // Build report combining orders and expenses
        for (const month of Object.keys(ordersByMonth)) {
            const orders = ordersByMonth[month];
            const expenses = expensesByMonth.get(month) || [];

            report[month] = {
                count: orders.length,
                revenue: orders.reduce((sum, o) => sum + (o.sellEUR || 0), 0),
                profit: orders.reduce((sum, o) => sum + (o.balanceEUR || 0), 0),
                expenses: expenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0)
            };
        }

        return report;
    }

    async getTopClients(limit = 10) {
        const allOrders = await this.ordersModule.getAllOrders({ includeImageUrls: false, preferLightweight: true });
        const soldOrders = allOrders.filter(o => o.status !== 'Свободен');
        const clientStats = this.aggregateBy(soldOrders, 'client');

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
