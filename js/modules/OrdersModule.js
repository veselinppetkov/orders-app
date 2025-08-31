// js/modules/OrdersModule.js - ПОПРАВЕНА ВЕРСИЯ С ПРАВИЛНО UNDO/REDO
export class OrdersModule {
    constructor(state, storage, eventBus) {
        this.state = state;
        this.storage = storage;
        this.eventBus = eventBus;
    }

    create(orderData) {
        const order = this.prepareOrder(orderData);
        const orderMonth = this.getOrderMonth(order.date);
        const monthlyData = this.state.get('monthlyData');

        // ВАЖНО: Запазваме състоянието ПРЕДИ промяната
        this.eventBus.emit('order:before-created', order);

        // Осигури че месецът съществува преди добавяне
        this.ensureMonthExists(orderMonth, monthlyData);

        monthlyData[orderMonth].orders.push(order);

        this.storage.save('monthlyData', monthlyData);
        this.state.set('monthlyData', monthlyData);

        // Това е за други listeners (UI refresh и т.н.)
        this.eventBus.emit('order:created', order);

        console.log(`Order created for ${orderMonth}:`, order.client);
        return order;
    }

    update(orderId, orderData) {
        const order = this.prepareOrder({ ...orderData, id: orderId });
        const newOrderMonth = this.getOrderMonth(order.date);
        const monthlyData = this.state.get('monthlyData');

        // ВАЖНО: Запазваме състоянието ПРЕДИ промяната
        this.eventBus.emit('order:before-updated', { id: orderId, newData: order });

        // Намираме в кой месец е поръчката сега
        let currentOrderMonth = null;
        let orderIndex = -1;

        // Търсим поръчката във всички месеци
        for (const [month, data] of Object.entries(monthlyData)) {
            if (data.orders) {
                const index = data.orders.findIndex(o => o.id === orderId);
                if (index !== -1) {
                    currentOrderMonth = month;
                    orderIndex = index;
                    break;
                }
            }
        }

        if (currentOrderMonth === null) {
            console.error(`Order with ID ${orderId} not found in any month`);
            return null;
        }

        // Ако месецът е променен, премести поръчката
        if (currentOrderMonth !== newOrderMonth) {
            console.log(`Moving order from ${currentOrderMonth} to ${newOrderMonth}`);

            // Премахни от стария месец
            monthlyData[currentOrderMonth].orders.splice(orderIndex, 1);

            // Осигури че новия месец съществува
            this.ensureMonthExists(newOrderMonth, monthlyData);

            // Добави в новия месец
            monthlyData[newOrderMonth].orders.push(order);
        } else {
            // Само обнови поръчката в същия месец
            monthlyData[currentOrderMonth].orders[orderIndex] = order;
        }

        this.storage.save('monthlyData', monthlyData);
        this.state.set('monthlyData', monthlyData);
        this.eventBus.emit('order:updated', order);

        console.log(`Order ${orderId} updated in ${newOrderMonth}`);
        return order;
    }

    delete(orderId) {
        const monthlyData = this.state.get('monthlyData');

        // ВАЖНО: Намираме поръчката и запазваме състоянието ПРЕДИ изтриването
        let orderToDelete = null;
        for (const [month, data] of Object.entries(monthlyData)) {
            if (data.orders) {
                const order = data.orders.find(o => o.id === orderId);
                if (order) {
                    orderToDelete = order;
                    break;
                }
            }
        }

        if (orderToDelete) {
            // Запазваме състоянието ПРЕДИ изтриването
            this.eventBus.emit('order:before-deleted', orderToDelete);
        }

        let deleted = false;

        // Търсим поръчката във всички месеци
        for (const [month, data] of Object.entries(monthlyData)) {
            if (data.orders) {
                const initialLength = data.orders.length;
                data.orders = data.orders.filter(o => o.id !== orderId);

                if (data.orders.length < initialLength) {
                    deleted = true;
                    console.log(`Order ${orderId} deleted from ${month}`);
                    break;
                }
            }
        }

        if (deleted) {
            this.storage.save('monthlyData', monthlyData);
            this.state.set('monthlyData', monthlyData);
            this.eventBus.emit('order:deleted', orderId);
        } else {
            console.warn(`Order ${orderId} not found for deletion`);
        }
    }

    // НОВА ФУНКЦИЯ - извлича месеца от датата на поръчката
    getOrderMonth(date) {
        const orderDate = new Date(date);
        const year = orderDate.getFullYear();
        const month = (orderDate.getMonth() + 1).toString().padStart(2, '0');
        return `${year}-${month}`;
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

        // Осигури че месецът съществува
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

    // НОВА ФУНКЦИЯ - намира поръчка по ID във всички месеци
    findOrderById(orderId) {
        const monthlyData = this.state.get('monthlyData');

        for (const [month, data] of Object.entries(monthlyData)) {
            if (data.orders) {
                const order = data.orders.find(o => o.id === orderId);
                if (order) {
                    return { order, month };
                }
            }
        }

        return null;
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