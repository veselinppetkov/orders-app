// js/modules/OrdersModule.js - ПОПРАВЕНА ВЕРСИЯ
export class OrdersModule {
    constructor(state, storage, eventBus) {
        this.state = state;
        this.storage = storage;
        this.eventBus = eventBus;
    }

    create(orderData) {
        const order = this.prepareOrder(orderData);
        const currentMonth = this.state.get('currentMonth');
        const monthlyData = this.state.get('monthlyData');

        // ПОПРАВКА: Осигури че месецът съществува преди добавяне
        this.ensureMonthExists(currentMonth, monthlyData);

        monthlyData[currentMonth].orders.push(order);

        this.storage.save('monthlyData', monthlyData);
        this.state.set('monthlyData', monthlyData);
        this.eventBus.emit('order:created', order);

        console.log(`Order created for ${currentMonth}:`, order.client);
        return order;
    }

    update(orderId, orderData) {
        const order = this.prepareOrder({ ...orderData, id: orderId });
        const currentMonth = this.state.get('currentMonth');
        const monthlyData = this.state.get('monthlyData');

        // ПОПРАВКА: Осигури че месецът съществува
        this.ensureMonthExists(currentMonth, monthlyData);

        const index = monthlyData[currentMonth].orders.findIndex(o => o.id === orderId);
        if (index !== -1) {
            monthlyData[currentMonth].orders[index] = order;
            this.storage.save('monthlyData', monthlyData);
            this.state.set('monthlyData', monthlyData);
            this.eventBus.emit('order:updated', order);

            console.log(`Order ${orderId} updated in ${currentMonth}`);
        }

        return order;
    }

    delete(orderId) {
        const currentMonth = this.state.get('currentMonth');
        const monthlyData = this.state.get('monthlyData');

        if (monthlyData[currentMonth] && monthlyData[currentMonth].orders) {
            monthlyData[currentMonth].orders = monthlyData[currentMonth].orders.filter(o => o.id !== orderId);

            this.storage.save('monthlyData', monthlyData);
            this.state.set('monthlyData', monthlyData);
            this.eventBus.emit('order:deleted', orderId);

            console.log(`Order ${orderId} deleted from ${currentMonth}`);
        }
    }

    // НОВА ФУНКЦИЯ - осигурява че месецът съществува
    ensureMonthExists(month, monthlyData) {
        if (!monthlyData[month]) {
            console.log(`Creating month structure for orders: ${month}`);
            monthlyData[month] = { orders: [], expenses: [] };
        }
        if (!monthlyData[month].orders) {
            monthlyData[month].orders = [];
        }
        if (!monthlyData[month].expenses) {
            monthlyData[month].expenses = [];
        }
    }

    getOrders(month = null) {
        const targetMonth = month || this.state.get('currentMonth');
        const monthlyData = this.state.get('monthlyData');

        // ПОПРАВКА: Осигури че месецът съществува
        this.ensureMonthExists(targetMonth, monthlyData);

        const orders = monthlyData[targetMonth]?.orders || [];
        console.log(`Getting orders for ${targetMonth}:`, orders.length);
        return orders;
    }

    getAllOrders() {
        const monthlyData = this.state.get('monthlyData');
        const allOrders = Object.values(monthlyData).flatMap(m => m.orders || []);
        console.log(`Total orders across all months:`, allOrders.length);
        return allOrders;
    }

    prepareOrder(data) {
        const settings = this.state.get('settings');
        const order = {
            id: data.id || Date.now(),
            date: data.date,
            client: data.client,
            phone: data.phone || '',
            origin: data.origin,
            vendor: data.vendor,
            model: data.model,
            costUSD: parseFloat(data.costUSD) || 0,
            shippingUSD: parseFloat(data.shippingUSD) || settings.factoryShipping,
            rate: settings.usdRate,
            extrasBGN: parseFloat(data.extrasBGN) || 0,
            sellBGN: parseFloat(data.sellBGN) || 0,
            status: data.status || 'Очакван',
            fullSet: data.fullSet || false,
            notes: data.notes || '',
            imageData: data.imageData || null
        };

        order.totalBGN = ((order.costUSD + order.shippingUSD) * order.rate) + order.extrasBGN;
        order.balanceBGN = order.sellBGN - Math.ceil(order.totalBGN);

        return order;
    }

    filterOrders(filters) {
        let orders = this.getOrders();

        if (filters.status && filters.status !== 'all') {
            orders = orders.filter(o => this.getStatusClass(o.status) === filters.status);
        }

        if (filters.search) {
            const term = filters.search.toLowerCase();
            orders = orders.filter(o =>
                o.client.toLowerCase().includes(term) ||
                o.phone.toLowerCase().includes(term) ||
                o.model.toLowerCase().includes(term)
            );
        }

        if (filters.origin) {
            orders = orders.filter(o => o.origin === filters.origin);
        }

        if (filters.vendor) {
            orders = orders.filter(o => o.vendor === filters.vendor);
        }

        return orders;
    }

    getStatusClass(status) {
        const statusMap = {
            'Доставен': 'delivered',
            'Очакван': 'pending',
            'Свободен': 'free'
        };
        return statusMap[status] || 'other';
    }
}