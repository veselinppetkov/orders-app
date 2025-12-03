// js/modules/OrdersModule.js - REWRITTEN FOR CLEAN ASYNC MANAGEMENT

import { CurrencyUtils } from '../utils/CurrencyUtils.js';

export class OrdersModule {
    constructor(state, storage, eventBus, supabase) {
        this.state = state;
        this.storage = storage;
        this.eventBus = eventBus;
        this.supabase = supabase;

        // Cache management
        this.cache = {
            orders: new Map(), // month -> orders array
            lastUpdate: new Map(), // month -> timestamp
            cacheTimeout: 5 * 60 * 1000, // 5 minutes
            maxCacheSize: 10 // max months to cache
        };

        // Operation tracking
        this.pendingOperations = new Set();
        this.optimisticUpdates = new Map(); // tempId -> order

        // Statistics
        this.stats = {
            totalLoads: 0,
            cacheHits: 0,
            cacheMisses: 0,
            supabaseOperations: 0,
            fallbackOperations: 0
        };

        console.log('📦 OrdersModule initialized with enhanced caching');
        this.setupEventHandlers();
    }

    setupEventHandlers() {
        // Clear cache when data changes externally
        this.eventBus.on('data:invalidate', () => {
            this.clearCache();
        });

        // Monitor storage health
        this.eventBus.on('storage:health-warning', () => {
            this.reduceCacheSize();
        });
    }

    // CREATE ORDER with optimistic updates
    async create(orderData) {
        const operationId = `create_${Date.now()}`;
        this.pendingOperations.add(operationId);

        try {
            // Validate input data
            this.validateOrderData(orderData);

            // Emit before-create event for undo/redo
            this.eventBus.emit('order:before-created', orderData);

            // Create optimistic order for immediate UI feedback
            const optimisticOrder = this.createOptimisticOrder(orderData);
            this.addOptimisticUpdate(optimisticOrder);

            // Emit optimistic creation
            this.eventBus.emit('order:created', {
                order: optimisticOrder,
                isOptimistic: true,
                operationId
            });

            // Attempt Supabase save
            try {
                const savedOrder = await this.supabase.createOrder(orderData);
                this.stats.supabaseOperations++;

                // Replace optimistic with real order
                this.replaceOptimisticOrder(optimisticOrder.id, savedOrder);

                // Update cache
                this.addOrderToCache(savedOrder);

                // Backup to localStorage
                this.backupToLocalStorage(savedOrder);

                // Emit successful creation
                this.eventBus.emit('order:created', {
                    order: savedOrder,
                    isOptimistic: false,
                    operationId,
                    createdInMonth: this.getOrderMonth(savedOrder.date)
                });

                console.log('✅ Order created successfully in Supabase:', savedOrder.id);
                return savedOrder;

            } catch (supabaseError) {
                console.warn('⚠️ Supabase create failed, falling back to localStorage:', supabaseError.message);

                // Fallback to localStorage
                const localOrder = await this.createInLocalStorage(orderData);
                this.stats.fallbackOperations++;

                // Replace optimistic with local order
                this.replaceOptimisticOrder(optimisticOrder.id, localOrder);

                // Update cache
                this.addOrderToCache(localOrder);

                // Emit fallback creation
                this.eventBus.emit('order:created', {
                    order: localOrder,
                    isOptimistic: false,
                    operationId,
                    createdInMonth: this.getOrderMonth(localOrder.date),
                    source: 'localStorage'
                });

                console.log('✅ Order created in localStorage fallback:', localOrder.id);
                return localOrder;
            }

        } catch (error) {
            // Remove failed optimistic update
            if (this.optimisticUpdates.has(operationId)) {
                this.optimisticUpdates.delete(operationId);
            }

            this.eventBus.emit('order:create-failed', { error, orderData, operationId });
            throw error;

        } finally {
            this.pendingOperations.delete(operationId);
        }
    }

    // UPDATE ORDER with proper cache management
    async update(orderId, orderData) {
        const operationId = `update_${orderId}_${Date.now()}`;
        this.pendingOperations.add(operationId);

        try {
            // Validate input data
            this.validateOrderData(orderData);

            // Find current order for comparison
            const currentOrder = await this.findOrderById(orderId);
            if (!currentOrder) {
                throw new Error(`Order not found: ${orderId}`);
            }

            // Emit before-update event for undo/redo
            this.eventBus.emit('order:before-updated', {
                id: orderId,
                currentOrder: currentOrder.order,
                newData: orderData
            });

            // Prepare updated order
            const updatedOrder = this.prepareOrder({ ...orderData, id: orderId });
            const newMonth = this.getOrderMonth(updatedOrder.date);
            const oldMonth = currentOrder.month;

            try {
                // Update in Supabase
                const savedOrder = await this.supabase.updateOrder(orderId, updatedOrder);
                this.stats.supabaseOperations++;

                // Update cache
                this.updateOrderInCache(savedOrder, oldMonth, newMonth);

                // Backup to localStorage
                this.backupToLocalStorage(savedOrder);

                // Emit successful update
                this.eventBus.emit('order:updated', {
                    order: savedOrder,
                    operationId,
                    movedToMonth: newMonth !== oldMonth ? newMonth : null,
                    source: 'supabase'
                });

                console.log('✅ Order updated successfully in Supabase:', orderId);
                return savedOrder;

            } catch (supabaseError) {
                console.warn('⚠️ Supabase update failed, falling back to localStorage:', supabaseError.message);

                // Fallback to localStorage
                const localOrder = await this.updateInLocalStorage(orderId, orderData);
                this.stats.fallbackOperations++;

                // Update cache
                this.updateOrderInCache(localOrder, oldMonth, newMonth);

                // Emit fallback update
                this.eventBus.emit('order:updated', {
                    order: localOrder,
                    operationId,
                    movedToMonth: newMonth !== oldMonth ? newMonth : null,
                    source: 'localStorage'
                });

                console.log('✅ Order updated in localStorage fallback:', orderId);
                return localOrder;
            }

        } catch (error) {
            this.eventBus.emit('order:update-failed', { error, orderId, orderData, operationId });
            throw error;

        } finally {
            this.pendingOperations.delete(operationId);
        }
    }

    // DELETE ORDER with proper cleanup
    async delete(orderId) {
        const operationId = `delete_${orderId}_${Date.now()}`;
        this.pendingOperations.add(operationId);

        try {
            // Find order before deletion
            const orderToDelete = await this.findOrderById(orderId);
            if (!orderToDelete) {
                throw new Error(`Order not found: ${orderId}`);
            }

            // Emit before-delete event for undo/redo
            this.eventBus.emit('order:before-deleted', orderToDelete.order);

            try {
                // Delete from Supabase (includes image cleanup)
                await this.supabase.deleteOrder(orderId);
                this.stats.supabaseOperations++;

                // Remove from cache
                this.removeOrderFromCache(orderId, orderToDelete.month);

                // Emit successful deletion
                this.eventBus.emit('order:deleted', {
                    orderId,
                    order: orderToDelete.order,
                    operationId,
                    source: 'supabase'
                });

                console.log('✅ Order deleted successfully from Supabase:', orderId);

            } catch (supabaseError) {
                console.warn('⚠️ Supabase delete failed, falling back to localStorage:', supabaseError.message);

                // Fallback to localStorage
                await this.deleteFromLocalStorage(orderId);
                this.stats.fallbackOperations++;

                // Remove from cache
                this.removeOrderFromCache(orderId, orderToDelete.month);

                // Emit fallback deletion
                this.eventBus.emit('order:deleted', {
                    orderId,
                    order: orderToDelete.order,
                    operationId,
                    source: 'localStorage'
                });

                console.log('✅ Order deleted in localStorage fallback:', orderId);
            }

        } catch (error) {
            this.eventBus.emit('order:delete-failed', { error, orderId, operationId });
            throw error;

        } finally {
            this.pendingOperations.delete(operationId);
        }
    }

    // GET ORDERS with smart caching
    async getOrders(month = null) {
        const targetMonth = month || this.state.get('currentMonth');
        this.stats.totalLoads++;

        try {
            // Check cache first
            if (this.isCacheValid(targetMonth)) {
                this.stats.cacheHits++;
                const cachedOrders = this.cache.orders.get(targetMonth);
                console.log(`📂 Using cached orders for ${targetMonth}: ${cachedOrders.length} orders`);
                return this.mergeWithOptimisticUpdates(cachedOrders, targetMonth);
            }

            this.stats.cacheMisses++;
            console.log(`📂 Loading orders from source for month: ${targetMonth}`);

            try {
                // Try Supabase first
                const orders = await this.supabase.getOrders(targetMonth);
                this.stats.supabaseOperations++;

                // Update cache
                this.updateCache(targetMonth, orders);

                console.log(`✅ Loaded ${orders.length} orders from Supabase for ${targetMonth}`);
                return this.mergeWithOptimisticUpdates(orders, targetMonth);

            } catch (supabaseError) {
                console.warn('⚠️ Supabase load failed, using localStorage:', supabaseError.message);

                // Fallback to localStorage
                const localOrders = this.getOrdersFromLocalStorage(targetMonth);
                this.stats.fallbackOperations++;

                // Update cache with local data
                this.updateCache(targetMonth, localOrders);

                console.log(`✅ Loaded ${localOrders.length} orders from localStorage for ${targetMonth}`);
                return this.mergeWithOptimisticUpdates(localOrders, targetMonth);
            }

        } catch (error) {
            console.error('❌ Failed to load orders:', error);
            throw error;
        }
    }

    // GET ALL ORDERS across months
    async getAllOrders() {
        try {
            console.log('📂 Loading all orders...');

            try {
                // Try Supabase first
                const orders = await this.supabase.getOrders(); // No month filter
                this.stats.supabaseOperations++;

                console.log(`✅ Loaded ${orders.length} total orders from Supabase`);
                return orders;

            } catch (supabaseError) {
                console.warn('⚠️ Supabase load failed, using localStorage:', supabaseError.message);

                // Fallback to localStorage
                const localOrders = this.getAllOrdersFromLocalStorage();
                this.stats.fallbackOperations++;

                console.log(`✅ Loaded ${localOrders.length} total orders from localStorage`);
                return localOrders;
            }

        } catch (error) {
            console.error('❌ Failed to load all orders:', error);
            return [];
        }
    }

    // FIND ORDER BY ID with cache lookup
    async findOrderById(orderId) {
        try {
            // Check optimistic updates first
            for (const [tempId, order] of this.optimisticUpdates.entries()) {
                if (order.id === orderId) {
                    return { order, month: this.getOrderMonth(order.date) };
                }
            }

            // Check cache across all months
            for (const [month, orders] of this.cache.orders.entries()) {
                const found = orders.find(o => o.id === orderId);
                if (found) {
                    return { order: found, month };
                }
            }

            // Not in cache, search all orders
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

    // FILTER ORDERS with optimizations
    async filterOrders(filters) {
        try {
            const targetMonth = this.state.get('currentMonth');
            let orders = await this.getOrders(targetMonth);

            // Apply filters efficiently
            if (filters.status && filters.status !== 'all') {
                orders = orders.filter(o => o.status === filters.status);
            }

            if (filters.search) {
                const searchTerm = filters.search.toLowerCase();
                orders = orders.filter(o =>
                    o.client.toLowerCase().includes(searchTerm) ||
                    o.phone.toLowerCase().includes(searchTerm) ||
                    o.model.toLowerCase().includes(searchTerm)
                );
            }

            if (filters.origin) {
                orders = orders.filter(o => o.origin === filters.origin);
            }

            if (filters.vendor) {
                orders = orders.filter(o => o.vendor === filters.vendor);
            }

            // Sort by date (newest first)
            orders.sort((a, b) => new Date(a.date) - new Date(b.date));

            return orders;

        } catch (error) {
            console.error('❌ Failed to filter orders:', error);
            return [];
        }
    }

    // CACHE MANAGEMENT
    isCacheValid(month) {
        if (!this.cache.orders.has(month)) {
            return false;
        }

        const lastUpdate = this.cache.lastUpdate.get(month);
        if (!lastUpdate) {
            return false;
        }

        const age = Date.now() - lastUpdate;
        return age < this.cache.cacheTimeout;
    }

    updateCache(month, orders) {
        // Manage cache size
        if (this.cache.orders.size >= this.cache.maxCacheSize) {
            this.evictOldestCache();
        }

        this.cache.orders.set(month, [...orders]);
        this.cache.lastUpdate.set(month, Date.now());

        console.log(`💾 Cached ${orders.length} orders for ${month}`);
    }

    evictOldestCache() {
        // Remove oldest cache entry
        const oldestMonth = Array.from(this.cache.lastUpdate.entries())
            .sort((a, b) => a[1] - b[1])[0]?.[0];

        if (oldestMonth) {
            this.cache.orders.delete(oldestMonth);
            this.cache.lastUpdate.delete(oldestMonth);
            console.log(`🗑️ Evicted cache for ${oldestMonth}`);
        }
    }

    addOrderToCache(order) {
        const month = this.getOrderMonth(order.date);
        if (this.cache.orders.has(month)) {
            const orders = this.cache.orders.get(month);
            orders.push(order);
            orders.sort((a, b) => new Date(b.date) - new Date(a.date));
        }
    }

    updateOrderInCache(order, oldMonth, newMonth) {
        // Remove from old month cache
        if (oldMonth && this.cache.orders.has(oldMonth)) {
            const oldOrders = this.cache.orders.get(oldMonth);
            const index = oldOrders.findIndex(o => o.id === order.id);
            if (index !== -1) {
                oldOrders.splice(index, 1);
            }
        }

        // Add to new month cache
        if (newMonth && this.cache.orders.has(newMonth)) {
            const newOrders = this.cache.orders.get(newMonth);
            newOrders.push(order);
            newOrders.sort((a, b) => new Date(b.date) - new Date(a.date));
        }
    }

    removeOrderFromCache(orderId, month) {
        if (this.cache.orders.has(month)) {
            const orders = this.cache.orders.get(month);
            const index = orders.findIndex(o => o.id === orderId);
            if (index !== -1) {
                orders.splice(index, 1);
            }
        }
    }

    clearCache() {
        this.cache.orders.clear();
        this.cache.lastUpdate.clear();
        console.log('🧹 Orders cache cleared');
    }

    reduceCacheSize() {
        // Reduce cache size when storage is low
        const targetSize = Math.floor(this.cache.maxCacheSize / 2);
        while (this.cache.orders.size > targetSize) {
            this.evictOldestCache();
        }
        console.log(`📉 Reduced cache size to ${this.cache.orders.size} entries`);
    }

    // OPTIMISTIC UPDATES
    createOptimisticOrder(orderData) {
        const optimisticOrder = this.prepareOrder(orderData);
        optimisticOrder.id = 'temp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        optimisticOrder._isOptimistic = true;
        return optimisticOrder;
    }

    addOptimisticUpdate(order) {
        this.optimisticUpdates.set(order.id, order);
    }

    replaceOptimisticOrder(tempId, realOrder) {
        this.optimisticUpdates.delete(tempId);

        // Update any cached data that might reference the temp ID
        for (const [month, orders] of this.cache.orders.entries()) {
            const index = orders.findIndex(o => o.id === tempId);
            if (index !== -1) {
                orders[index] = realOrder;
            }
        }
    }

    mergeWithOptimisticUpdates(orders, month) {
        // Add any optimistic updates for this month
        const optimisticForMonth = Array.from(this.optimisticUpdates.values())
            .filter(order => this.getOrderMonth(order.date) === month);

        return [...orders, ...optimisticForMonth]
            .sort((a, b) => new Date(b.date) - new Date(a.date));
    }

    // LOCALSTORAGE OPERATIONS (simplified)
    async createInLocalStorage(orderData) {
        const order = this.prepareOrder(orderData);
        const month = this.getOrderMonth(order.date);

        const monthlyData = this.state.get('monthlyData');
        this.ensureMonthExists(month, monthlyData);

        monthlyData[month].orders.push(order);

        this.storage.save('monthlyData', monthlyData);
        this.state.set('monthlyData', monthlyData);

        return order;
    }

    async updateInLocalStorage(orderId, orderData) {
        const order = this.prepareOrder({ ...orderData, id: orderId });
        const newMonth = this.getOrderMonth(order.date);
        const monthlyData = this.state.get('monthlyData');

        // Find and update/move order
        for (const [month, data] of Object.entries(monthlyData)) {
            if (data.orders) {
                const index = data.orders.findIndex(o => o.id === orderId);
                if (index !== -1) {
                    if (month === newMonth) {
                        data.orders[index] = order;
                    } else {
                        data.orders.splice(index, 1);
                        this.ensureMonthExists(newMonth, monthlyData);
                        monthlyData[newMonth].orders.push(order);
                    }
                    break;
                }
            }
        }

        this.storage.save('monthlyData', monthlyData);
        this.state.set('monthlyData', monthlyData);

        return order;
    }

    async deleteFromLocalStorage(orderId) {
        const monthlyData = this.state.get('monthlyData');

        for (const [month, data] of Object.entries(monthlyData)) {
            if (data.orders) {
                const initialLength = data.orders.length;
                data.orders = data.orders.filter(o => o.id !== orderId);

                if (data.orders.length < initialLength) {
                    this.storage.save('monthlyData', monthlyData);
                    this.state.set('monthlyData', monthlyData);
                    break;
                }
            }
        }
    }

    getOrdersFromLocalStorage(month) {
        const monthlyData = this.state.get('monthlyData');
        this.ensureMonthExists(month, monthlyData);
        return monthlyData[month]?.orders || [];
    }

    getAllOrdersFromLocalStorage() {
        const monthlyData = this.state.get('monthlyData');
        return Object.values(monthlyData).flatMap(m => m.orders || []);
    }

    // UTILITY METHODS
    validateOrderData(orderData) {
        const required = ['date', 'client', 'origin', 'vendor', 'model'];

        for (const field of required) {
            if (!orderData[field]) {
                throw new Error(`Missing required field: ${field}`);
            }
        }

        // Validate date format
        if (!/^\d{4}-\d{2}-\d{2}$/.test(orderData.date)) {
            throw new Error('Invalid date format');
        }

        const numericFields = ['costUSD', 'shippingUSD', 'extrasEUR', 'sellEUR'];
        for (const field of numericFields) {
            if (orderData[field] === '' || orderData[field] === null || orderData[field] === undefined) {
                orderData[field] = 0; // 👉 празно = 0
            } else if (isNaN(parseFloat(orderData[field]))) {
                throw new Error(`Invalid numeric value for ${field}`);
            }
        }
    }

    // js/modules/OrdersModule.js - Fix prepareOrder method

// js/modules/OrdersModule.js - Replace prepareOrder with async version and unify logic

// UNIFIED ASYNC ORDER PREPARATION (used by create, update, duplicate)
    async prepareOrder(data) {
        // FIXED: Ensure settings are loaded before calculation
        let settings = this.state.get('settings');

        // If settings not loaded or invalid, load them first
        if (!settings || (!settings.usdRate && !settings.eurRate) || !settings.factoryShipping) {
            try {
                // Use the settings module to get fresh settings
                const settingsModule = this.state.get('modules')?.settings;
                if (settingsModule) {
                    settings = await settingsModule.getSettings();
                } else {
                    // Fallback to default values (EUR as primary)
                    settings = {
                        eurRate: 0.92,
                        usdRate: 1.71, // Legacy
                        factoryShipping: 1.5,
                        baseCurrency: 'EUR',
                        conversionRate: 1.95583
                    };
                }
            } catch (error) {
                console.warn('⚠️ Failed to load settings, using defaults:', error);
                settings = {
                    eurRate: 0.92,
                    usdRate: 1.71,
                    factoryShipping: 1.5,
                    baseCurrency: 'EUR',
                    conversionRate: 1.95583
                };
            }
        }

        // Currency is fully migrated to EUR
        const currency = 'EUR';

        // Calculate USD costs
        const costUSD = parseFloat(data.costUSD) || 0;
        const shippingUSD = (data.shippingUSD !== '' && data.shippingUSD !== undefined && data.shippingUSD !== null)
            ? parseFloat(data.shippingUSD) || 0
            : parseFloat(settings.factoryShipping) || 0;

        const rate = parseFloat(settings.eurRate) || 0.92;

        // Normalize amounts: accept legacy BGN input but convert to EUR immediately
        const extrasEUR = parseFloat(data.extrasEUR) || CurrencyUtils.convertBGNtoEUR(parseFloat(data.extrasBGN) || 0);
        const sellEUR = parseFloat(data.sellEUR) || CurrencyUtils.convertBGNtoEUR(parseFloat(data.sellBGN) || 0);

        // BGN values for backward compatibility (calculated from EUR)
        const extrasBGN = CurrencyUtils.convertEURtoBGN(extrasEUR);
        const sellBGN = CurrencyUtils.convertEURtoBGN(sellEUR);

        // Prepare order with guaranteed settings
        const order = {
            id: data.id || Date.now(),
            date: data.date,
            client: data.client,
            phone: data.phone || '',
            origin: data.origin,
            vendor: data.vendor,
            model: data.model,
            costUSD: costUSD,
            shippingUSD: shippingUSD,
            rate: rate,
            // BGN fields (legacy/historical)
            extrasBGN: extrasBGN,
            sellBGN: sellBGN,
            // EUR fields (primary)
            extrasEUR: extrasEUR,
            sellEUR: sellEUR,
            // Metadata
            currency: currency,
            status: data.status || 'Очакван',
            fullSet: data.fullSet || false,
            notes: data.notes || '',
            imageData: data.imageData || null
        };

        // Calculate derived fields (EUR primary)
        order.totalEUR = ((costUSD + shippingUSD) * rate) + extrasEUR;
        order.balanceEUR = sellEUR - order.totalEUR;

        // Backward-compatible BGN values derived from EUR
        order.totalBGN = CurrencyUtils.convertEURtoBGN(order.totalEUR);
        order.balanceBGN = CurrencyUtils.convertEURtoBGN(order.balanceEUR);

        return order;
    }

// UPDATED CREATE METHOD - now uses async prepareOrder
    async create(orderData) {
        const operationId = `create_${Date.now()}`;
        this.pendingOperations.add(operationId);

        try {
            // Validate input data
            this.validateOrderData(orderData);

            // Emit before-create event for undo/redo
            this.eventBus.emit('order:before-created', orderData);

            // FIXED: Use async order preparation (same as update logic)
            const preparedOrder = await this.prepareOrder(orderData);

            try {
                // Create in Supabase first
                const savedOrder = await this.supabase.createOrder(preparedOrder);
                this.stats.supabaseOperations++;

                // Update cache
                this.addOrderToCache(savedOrder);

                // Emit successful creation
                this.eventBus.emit('order:created', {
                    order: savedOrder,
                    operationId,
                    createdInMonth: this.getOrderMonth(savedOrder.date),
                    source: 'supabase'
                });

                console.log('✅ Order created successfully in Supabase:', savedOrder.id);
                return savedOrder;

            } catch (supabaseError) {
                console.warn('⚠️ Supabase create failed, falling back to localStorage:', supabaseError.message);

                // Fallback to localStorage with same prepared order
                const localOrder = await this.createInLocalStorage(preparedOrder);
                this.stats.fallbackOperations++;

                // Update cache
                this.addOrderToCache(localOrder);

                // Emit fallback creation
                this.eventBus.emit('order:created', {
                    order: localOrder,
                    operationId,
                    createdInMonth: this.getOrderMonth(localOrder.date),
                    source: 'localStorage'
                });

                console.log('✅ Order created in localStorage fallback:', localOrder.id);
                return localOrder;
            }

        } catch (error) {
            this.eventBus.emit('order:create-failed', { error, orderData, operationId });
            throw error;

        } finally {
            this.pendingOperations.delete(operationId);
        }
    }

// UPDATED UPDATE METHOD - now uses unified async prepareOrder
    async update(orderId, orderData) {
        const operationId = `update_${orderId}_${Date.now()}`;
        this.pendingOperations.add(operationId);

        try {
            // Validate input data
            this.validateOrderData(orderData);

            // Find current order for comparison
            const currentOrder = await this.findOrderById(orderId);
            if (!currentOrder) {
                throw new Error(`Order not found: ${orderId}`);
            }

            // Emit before-update event
            this.eventBus.emit('order:before-updated', {
                id: orderId,
                currentOrder: currentOrder.order,
                newData: orderData
            });

            // UNIFIED: Use same async preparation logic as create
            const updatedOrder = await this.prepareOrder({ ...orderData, id: orderId });
            const newMonth = this.getOrderMonth(updatedOrder.date);
            const oldMonth = currentOrder.month;

            try {
                // Update in Supabase
                const savedOrder = await this.supabase.updateOrder(orderId, updatedOrder);
                this.stats.supabaseOperations++;

                // Update cache
                this.updateOrderInCache(savedOrder, oldMonth, newMonth);

                // Emit successful update
                this.eventBus.emit('order:updated', {
                    order: savedOrder,
                    operationId,
                    movedToMonth: newMonth !== oldMonth ? newMonth : null,
                    source: 'supabase'
                });

                console.log('✅ Order updated successfully in Supabase:', orderId);
                return savedOrder;

            } catch (supabaseError) {
                console.warn('⚠️ Supabase update failed, falling back to localStorage:', supabaseError.message);

                // Fallback with same prepared order
                const localOrder = await this.updateInLocalStorage(orderId, updatedOrder);
                this.stats.fallbackOperations++;

                // Update cache
                this.updateOrderInCache(localOrder, oldMonth, newMonth);

                // Emit fallback update
                this.eventBus.emit('order:updated', {
                    order: localOrder,
                    operationId,
                    movedToMonth: newMonth !== oldMonth ? newMonth : null,
                    source: 'localStorage'
                });

                console.log('✅ Order updated in localStorage fallback:', orderId);
                return localOrder;
            }

        } catch (error) {
            this.eventBus.emit('order:update-failed', { error, orderId, orderData, operationId });
            throw error;

        } finally {
            this.pendingOperations.delete(operationId);
        }
    }

// UPDATED LOCAL STORAGE METHODS - now work with pre-prepared orders
    async createInLocalStorage(preparedOrder) {
        const month = this.getOrderMonth(preparedOrder.date);

        const monthlyData = this.state.get('monthlyData');
        this.ensureMonthExists(month, monthlyData);

        monthlyData[month].orders.push(preparedOrder);

        this.storage.save('monthlyData', monthlyData);
        this.state.set('monthlyData', monthlyData);

        return preparedOrder;
    }

    async updateInLocalStorage(orderId, preparedOrder) {
        const newMonth = this.getOrderMonth(preparedOrder.date);
        const monthlyData = this.state.get('monthlyData');

        // Find and update/move order
        for (const [month, data] of Object.entries(monthlyData)) {
            if (data.orders) {
                const index = data.orders.findIndex(o => o.id === orderId);
                if (index !== -1) {
                    if (month === newMonth) {
                        data.orders[index] = preparedOrder;
                    } else {
                        data.orders.splice(index, 1);
                        this.ensureMonthExists(newMonth, monthlyData);
                        monthlyData[newMonth].orders.push(preparedOrder);
                    }
                    break;
                }
            }
        }

        this.storage.save('monthlyData', monthlyData);
        this.state.set('monthlyData', monthlyData);

        return preparedOrder;
    }

// OPTIONAL: Add method to recalculate order with fresh settings
    recalculateOrder(order) {
        const settings = this.state.get('settings') || {};
        const rate = parseFloat(settings.eurRate) || order.rate || 0.92;

        const updatedOrder = { ...order, rate };
        const extrasEUR = order.extrasEUR ?? CurrencyUtils.convertBGNtoEUR(order.extrasBGN || 0);
        const sellEUR = order.sellEUR ?? CurrencyUtils.convertBGNtoEUR(order.sellBGN || 0);

        updatedOrder.totalEUR = ((updatedOrder.costUSD + updatedOrder.shippingUSD) * rate) + extrasEUR;
        updatedOrder.balanceEUR = sellEUR - updatedOrder.totalEUR;
        updatedOrder.totalBGN = CurrencyUtils.convertEURtoBGN(updatedOrder.totalEUR);
        updatedOrder.balanceBGN = CurrencyUtils.convertEURtoBGN(updatedOrder.balanceEUR);

        return updatedOrder;
    }

    getOrderMonth(date) {
        const orderDate = new Date(date);
        const year = orderDate.getFullYear();
        const month = (orderDate.getMonth() + 1).toString().padStart(2, '0');
        return `${year}-${month}`;
    }

    ensureMonthExists(month, monthlyData) {
        if (!monthlyData[month]) {
            monthlyData[month] = { orders: [], expenses: [] };
        }
        if (!monthlyData[month].orders) {
            monthlyData[month].orders = [];
        }
        if (!monthlyData[month].expenses) {
            monthlyData[month].expenses = [];
        }
    }

    getStatusClass(status) {
        const statusMap = {
            'Доставен': 'delivered',
            'Очакван': 'pending',
            'Свободен': 'free',
            'Други': 'other'
        };
        return statusMap[status] || 'other';
    }

    // STATISTICS AND DEBUGGING
    getStatistics() {
        const cacheHitRate = this.stats.totalLoads > 0 ?
            (this.stats.cacheHits / this.stats.totalLoads * 100).toFixed(1) + '%' : '0%';

        return {
            ...this.stats,
            cacheHitRate,
            cachedMonths: this.cache.orders.size,
            pendingOperations: this.pendingOperations.size,
            optimisticUpdates: this.optimisticUpdates.size
        };
    }

    debugOrders() {
        const stats = this.getStatistics();

        console.group('🔍 ORDERS MODULE DEBUG');
        console.log('Statistics:', stats);
        console.log('Cache state:', {
            months: Array.from(this.cache.orders.keys()),
            sizes: Array.from(this.cache.orders.entries()).map(([k, v]) => [k, v.length])
        });
        console.log('Pending operations:', Array.from(this.pendingOperations));
        console.log('Optimistic updates:', Array.from(this.optimisticUpdates.keys()));
        console.groupEnd();
    }

    // CLEANUP
    destroy() {
        console.log('🗑️ Destroying OrdersModule...');

        this.clearCache();
        this.pendingOperations.clear();
        this.optimisticUpdates.clear();

        console.log('✅ OrdersModule destroyed');
    }
}