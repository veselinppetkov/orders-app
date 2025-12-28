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

    async getMonthlyStats(month = null) {
        const targetMonth = month || this.state.get('currentMonth');

        // Load orders and expenses from Supabase
        const orders = await this.ordersModule.getOrders(targetMonth);
        const expenses = await this.expensesModule.getExpenses(targetMonth);

        const totalExpenses = expenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
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
        // Get all orders from Supabase
        const allOrders = await this.ordersModule.getAllOrders();

        // Get unique months from orders
        const uniqueMonths = new Set(allOrders.map(o => o.date.substring(0, 7)));

        // Get expenses for each month from Supabase
        const allExpenses = [];
        for (const month of uniqueMonths) {
            const monthExpenses = await this.expensesModule.getExpenses(month);
            allExpenses.push(...monthExpenses);
        }

        const totalRevenue = allOrders.reduce((sum, o) => sum + (o.sellEUR || 0), 0);
        const totalProfit = allOrders.reduce((sum, o) => sum + (o.balanceEUR || 0), 0);
        const totalExpenses = allExpenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);

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
        const report = {};

        // Group orders by month
        const ordersByMonth = {};
        allOrders.forEach(order => {
            const month = order.date.substring(0, 7); // "2024-01"
            if (!ordersByMonth[month]) ordersByMonth[month] = [];
            ordersByMonth[month].push(order);
        });

        // Build report combining orders and expenses
        for (const month of Object.keys(ordersByMonth)) {
            const orders = ordersByMonth[month];
            const expenses = await this.expensesModule.getExpenses(month);

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