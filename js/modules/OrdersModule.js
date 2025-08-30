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

        if (!monthlyData[currentMonth]) {
            monthlyData[currentMonth] = { orders: [], expenses: [] };
        }

        monthlyData[currentMonth].orders.push(order);

        this.storage.save('monthlyData', monthlyData);
        this.state.set('monthlyData', monthlyData);
        this.eventBus.emit('order:created', order);

        return order;
    }

    update(orderId, orderData) {
        const order = this.prepareOrder({ ...orderData, id: orderId });
        const currentMonth = this.state.get('currentMonth');
        const monthlyData = this.state.get('monthlyData');

        const index = monthlyData[currentMonth].orders.findIndex(o => o.id === orderId);
        if (index !== -1) {
            monthlyData[currentMonth].orders[index] = order;
            this.storage.save('monthlyData', monthlyData);
            this.state.set('monthlyData', monthlyData);
            this.eventBus.emit('order:updated', order);
        }

        return order;
    }

    delete(orderId) {
        const currentMonth = this.state.get('currentMonth');
        const monthlyData = this.state.get('monthlyData');

        monthlyData[currentMonth].orders = monthlyData[currentMonth].orders.filter(o => o.id !== orderId);

        this.storage.save('monthlyData', monthlyData);
        this.state.set('monthlyData', monthlyData);
        this.eventBus.emit('order:deleted', orderId);
    }

    getOrders(month = null) {
        const targetMonth = month || this.state.get('currentMonth');
        const monthlyData = this.state.get('monthlyData');
        return monthlyData[targetMonth]?.orders || [];
    }

    getAllOrders() {
        const monthlyData = this.state.get('monthlyData');
        return Object.values(monthlyData).flatMap(m => m.orders || []);
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
            sellBGN: parseFloat(data.sellBGN) || 0, // Ако е празно - 0
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