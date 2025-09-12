// js/modules/OrdersModule.js - UPDATED FOR SUPABASE

export class OrdersModule {
    constructor(state, storage, eventBus, supabase) {
        this.state = state;
        this.storage = storage; // Keep for localStorage backup/compatibility
        this.eventBus = eventBus;
        this.supabase = supabase; // NEW: Supabase service

        // Cache for loaded orders to improve performance
        this.ordersCache = new Map();

        console.log('📦 OrdersModule initialized with Supabase support');
    }

    // CREATE ORDER - Now saves to Supabase
    async create(orderData) {
        try {
            console.log('📝 Creating order in Supabase:', orderData.client);

            // Emit before event for undo/redo
            this.eventBus.emit('order:before-created', orderData);

            // Prepare order data
            const order = this.prepareOrder(orderData);

            // Save to Supabase database
            const savedOrder = await this.supabase.createOrder(order);

            // Update cache
            const orderMonth = this.getOrderMonth(savedOrder.date);
            this.updateOrdersCache(orderMonth, 'add', savedOrder);

            // Also save to localStorage as backup (during transition)
            this.saveToLocalStorageBackup(savedOrder);

            this.eventBus.emit('order:created', {
                order: savedOrder,
                createdInMonth: orderMonth,
                isVisibleInCurrentMonth: orderMonth === this.state.get('currentMonth')
            });

            console.log('✅ Order created successfully in Supabase:', savedOrder.id);
            return savedOrder;

        } catch (error) {
            console.error('❌ Failed to create order in Supabase:', error);

            // Fallback to localStorage
            console.log('🔄 Falling back to localStorage...');
            return this.createInLocalStorage(orderData);
        }
    }

    // UPDATE ORDER - Now updates in Supabase
    async update(orderId, orderData) {
        try {
            console.log('✏️ Updating order in Supabase:', orderId);

            // Find current order for undo/redo
            const currentOrder = await this.findOrderById(orderId);
            this.eventBus.emit('order:before-updated', { id: orderId, newData: orderData });

            // Prepare updated order
            const order = this.prepareOrder({ ...orderData, id: orderId });

            // Update in Supabase
            const updatedOrder = await this.supabase.updateOrder(orderId, order);

            // Update cache
            const newOrderMonth = this.getOrderMonth(updatedOrder.date);
            this.updateOrdersCache(newOrderMonth, 'update', updatedOrder);

            // Backup to localStorage
            this.saveToLocalStorageBackup(updatedOrder);

            this.eventBus.emit('order:updated', {
                order: updatedOrder,
                movedToMonth: newOrderMonth
            });

            console.log('✅ Order updated successfully in Supabase');
            return updatedOrder;

        } catch (error) {
            console.error('❌ Failed to update order in Supabase:', error);

            // Fallback to localStorage
            return this.updateInLocalStorage(orderId, orderData);
        }
    }

    // DELETE ORDER - Now deletes from Supabase
    async delete(orderId) {
        try {
            console.log('🗑️ Deleting order from Supabase:', orderId);

            // Find order for undo/redo
            const orderToDelete = await this.findOrderById(orderId);
            if (orderToDelete) {
                this.eventBus.emit('order:before-deleted', orderToDelete);
            }

            // Delete from Supabase (this also deletes the image)
            await this.supabase.deleteOrder(orderId);

            // Remove from cache
            this.removeFromCache(orderId);

            // Remove from localStorage backup
            this.removeFromLocalStorageBackup(orderId);

            this.eventBus.emit('order:deleted', orderId);

            console.log('✅ Order deleted successfully from Supabase');

        } catch (error) {
            console.error('❌ Failed to delete order from Supabase:', error);

            // Fallback to localStorage
            this.deleteFromLocalStorage(orderId);
        }
    }

    // GET ORDERS - Now loads from Supabase
    async getOrders(month = null) {
        const targetMonth = month || this.state.get('currentMonth');

        try {
            // Check cache first
            if (this.ordersCache.has(targetMonth)) {
                const cachedOrders = this.ordersCache.get(targetMonth);
                console.log(`📂 Using cached orders for ${targetMonth}:`, cachedOrders.length);
                return cachedOrders;
            }

            console.log(`📂 Loading orders from Supabase for month: ${targetMonth}`);

            // Load from Supabase
            const orders = await this.supabase.getOrders(targetMonth);

            // Cache the results
            this.ordersCache.set(targetMonth, orders);

            console.log(`✅ Loaded ${orders.length} orders from Supabase for ${targetMonth}`);
            return orders;

        } catch (error) {
            console.error('❌ Failed to load orders from Supabase:', error);

            // Fallback to localStorage
            console.log('🔄 Falling back to localStorage...');
            return this.getOrdersFromLocalStorage(targetMonth);
        }
    }

    // GET ALL ORDERS - Load from Supabase
    async getAllOrders() {
        try {
            console.log('📂 Loading all orders from Supabase...');
            const orders = await this.supabase.getOrders(); // No month filter = all orders
            console.log(`✅ Loaded ${orders.length} total orders from Supabase`);
            return orders;
        } catch (error) {
            console.error('❌ Failed to load all orders from Supabase:', error);
            return this.getAllOrdersFromLocalStorage();
        }
    }

    // FIND ORDER BY ID - Search in Supabase and cache
    async findOrderById(orderId) {
        try {
            // First check all cached months
            for (const [month, orders] of this.ordersCache.entries()) {
                const found = orders.find(o => o.id === orderId);
                if (found) return { order: found, month };
            }

            // If not in cache, load all orders and search
            const allOrders = await this.getAllOrders();
            const order = allOrders.find(o => o.id === orderId);

            if (order) {
                const month = this.getOrderMonth(order.date);
                return { order, month };
            }

            return null;
        } catch (error) {
            console.error('❌ Failed to find order:', error);
            return null;
        }
    }

    // CACHE MANAGEMENT
    updateOrdersCache(month, operation, order) {
        if (!this.ordersCache.has(month)) {
            this.ordersCache.set(month, []);
        }

        const orders = this.ordersCache.get(month);

        switch (operation) {
            case 'add':
                orders.push(order);
                orders.sort((a, b) => b.date.localeCompare(a.date)); // Keep sorted
                break;
            case 'update':
                const updateIndex = orders.findIndex(o => o.id === order.id);
                if (updateIndex !== -1) {
                    orders[updateIndex] = order;
                } else {
                    orders.push(order); // Order moved to this month
                }
                orders.sort((a, b) => b.date.localeCompare(a.date));
                break;
        }
    }

    removeFromCache(orderId) {
        for (const [month, orders] of this.ordersCache.entries()) {
            const index = orders.findIndex(o => o.id === orderId);
            if (index !== -1) {
                orders.splice(index, 1);
                break;
            }
        }
    }

    clearCache() {
        this.ordersCache.clear();
        console.log('🧹 Orders cache cleared');
    }

    // LOCALSTORAGE BACKUP METHODS (for transition period)
    saveToLocalStorageBackup(order) {
        try {
            const monthlyData = this.state.get('monthlyData') || {};
            const orderMonth = this.getOrderMonth(order.date);

            if (!monthlyData[orderMonth]) {
                monthlyData[orderMonth] = { orders: [], expenses: [] };
            }

            // Find and update, or add new
            const existingIndex = monthlyData[orderMonth].orders.findIndex(o => o.id === order.id);
            if (existingIndex !== -1) {
                monthlyData[orderMonth].orders[existingIndex] = order;
            } else {
                monthlyData[orderMonth].orders.push(order);
            }

            this.state.set('monthlyData', monthlyData);
            this.storage.save('monthlyData', monthlyData);

        } catch (error) {
            console.warn('⚠️ localStorage backup failed:', error);
        }
    }

    removeFromLocalStorageBackup(orderId) {
        try {
            const monthlyData = this.state.get('monthlyData') || {};

            for (const [month, data] of Object.entries(monthlyData)) {
                if (data.orders) {
                    data.orders = data.orders.filter(o => o.id !== orderId);
                }
            }

            this.state.set('monthlyData', monthlyData);
            this.storage.save('monthlyData', monthlyData);

        } catch (error) {
            console.warn('⚠️ localStorage backup removal failed:', error);
        }
    }

    // FALLBACK METHODS (localStorage operations)
    createInLocalStorage(orderData) {
        console.log('📝 Creating order in localStorage (fallback)');
        const order = this.prepareOrder(orderData);
        const orderMonth = this.getOrderMonth(order.date);
        const currentDisplayMonth = this.state.get('currentMonth');
        const monthlyData = this.state.get('monthlyData');

        this.ensureMonthExists(orderMonth, monthlyData);
        monthlyData[orderMonth].orders.push(order);

        this.storage.save('monthlyData', monthlyData);
        this.state.set('monthlyData', monthlyData);

        this.eventBus.emit('order:created', {
            order,
            createdInMonth: orderMonth,
            isVisibleInCurrentMonth: orderMonth === currentDisplayMonth
        });

        return order;
    }

    updateInLocalStorage(orderId, orderData) {
        console.log('✏️ Updating order in localStorage (fallback)');
        const order = this.prepareOrder({ ...orderData, id: orderId });
        const newOrderMonth = this.getOrderMonth(order.date);
        const monthlyData = this.state.get('monthlyData');

        // Find and update/move order
        let found = false;
        for (const [month, data] of Object.entries(monthlyData)) {
            if (data.orders) {
                const index = data.orders.findIndex(o => o.id === orderId);
                if (index !== -1) {
                    if (month === newOrderMonth) {
                        // Same month, just update
                        data.orders[index] = order;
                    } else {
                        // Different month, move order
                        data.orders.splice(index, 1);
                        this.ensureMonthExists(newOrderMonth, monthlyData);
                        monthlyData[newOrderMonth].orders.push(order);
                    }
                    found = true;
                    break;
                }
            }
        }

        if (found) {
            this.storage.save('monthlyData', monthlyData);
            this.state.set('monthlyData', monthlyData);
            this.eventBus.emit('order:updated', { order, movedToMonth: newOrderMonth });
        }

        return order;
    }

    deleteFromLocalStorage(orderId) {
        console.log('🗑️ Deleting order from localStorage (fallback)');
        const monthlyData = this.state.get('monthlyData');

        for (const [month, data] of Object.entries(monthlyData)) {
            if (data.orders) {
                const initialLength = data.orders.length;
                data.orders = data.orders.filter(o => o.id !== orderId);

                if (data.orders.length < initialLength) {
                    this.storage.save('monthlyData', monthlyData);
                    this.state.set('monthlyData', monthlyData);
                    this.eventBus.emit('order:deleted', orderId);
                    break;
                }
            }
        }
    }

    getOrdersFromLocalStorage(month) {
        const monthlyData = this.state.get('monthlyData');
        this.ensureMonthExists(month, monthlyData);
        const orders = monthlyData[month]?.orders || [];
        console.log(`Getting orders from localStorage for ${month}:`, orders.length);
        return orders;
    }

    getAllOrdersFromLocalStorage() {
        const monthlyData = this.state.get('monthlyData');
        const allOrders = Object.values(monthlyData).flatMap(m => m.orders || []);
        console.log(`Total orders from localStorage:`, allOrders.length);
        return allOrders;
    }

    // UTILITY METHODS (unchanged)
    getOrderMonth(date) {
        const orderDate = new Date(date);
        const year = orderDate.getFullYear();
        const month = (orderDate.getMonth() + 1).toString().padStart(2, '0');
        return `${year}-${month}`;
    }

    ensureMonthExists(month, monthlyData) {
        if (!monthlyData[month]) {
            console.log(`Creating month structure: ${month}`);
            monthlyData[month] = { orders: [], expenses: [] };
        }
        if (!monthlyData[month].orders) {
            monthlyData[month].orders = [];
        }
        if (!monthlyData[month].expenses) {
            monthlyData[month].expenses = [];
        }
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

    // FILTER ORDERS - Now works with async data
    async filterOrders(filters) {
        let orders = await this.getOrders(); // Now async

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

        // Sort by date (newest first)
        orders.sort((a, b) => a.date.localeCompare(b.date));

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

    // MIGRATION HELPER - Migrate existing localStorage data to Supabase
    async migrateToSupabase() {
        try {
            console.log('🚀 Starting migration to Supabase...');

            if (!this.supabase) {
                throw new Error('Supabase service not available');
            }

            return await this.supabase.migrateFromLocalStorage();

        } catch (error) {
            console.error('❌ Migration to Supabase failed:', error);
            throw error;
        }
    }
}