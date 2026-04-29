// js/modules/OrdersModule.js - REWRITTEN FOR CLEAN ASYNC MANAGEMENT

import { CurrencyUtils } from '../utils/CurrencyUtils.js';
import { assertValid, coerceNumbers, orderSchema, ORDER_NUMERIC_FIELDS } from '../utils/ValidationUtils.js';

export class OrdersModule {
    constructor(state, storage, eventBus, supabase) {
        this.state = state;
        this.storage = storage;
        this.eventBus = eventBus;
        this.supabase = supabase;

        // Cache management
        this.cache = {
            orders: new Map(), // month -> orders array  ('__all__' for all-months)
            lastUpdate: new Map(), // month -> timestamp
            cacheTimeout: 5 * 60 * 1000, // 5 minutes
            maxCacheSize: 12 // max cache entries (10 months + '__all__' + buffer)
        };

        // In-flight request deduplication: key -> Promise
        this._inflight = new Map();

        // Operation tracking
        this.pendingOperations = new Set();
        this.optimisticUpdates = new Map(); // tempId -> order

        // Statistics
        this.stats = {
            totalLoads: 0,
            cacheHits: 0,
            cacheMisses: 0,
            supabaseOperations: 0
        };

        this._realtimeChannel = null;
        console.log('📦 OrdersModule initialized with enhanced caching');
        this.setupEventHandlers();
        this.setupRealtimeSubscription();
    }

    setupEventHandlers() {
        this.eventBus.on('data:invalidate', () => this.clearCache());
        this.eventBus.on('storage:health-warning', () => this.reduceCacheSize());
    }

    setupRealtimeSubscription() {
        try {
            const client = this.supabase?.supabase;
            if (!client?.channel) return;

            this._realtimeChannel = client
                .channel('orders-realtime')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
                    console.log('🔴 Realtime orders change:', payload.eventType);
                    // Invalidate all cache so next read picks up the change
                    this.clearCache();
                    this.eventBus.emit('orders:realtime-change', { event: payload.eventType, record: payload.new || payload.old });
                })
                .subscribe((status) => {
                    if (status === 'SUBSCRIBED') console.log('✅ Orders realtime subscribed');
                    if (status === 'CHANNEL_ERROR') console.warn('⚠️ Orders realtime channel error');
                });
        } catch (e) {
            console.warn('⚠️ Could not set up orders realtime:', e.message);
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

            console.log('✅ Order deleted:', orderId);

        } catch (error) {
            this.eventBus.emit('order:delete-failed', { error, orderId, operationId });
            throw error;

        } finally {
            this.pendingOperations.delete(operationId);
        }
    }

    // GET ORDERS with smart caching + in-flight deduplication
    async getOrders(month = null) {
        const targetMonth = month || this.state.get('currentMonth');
        this.stats.totalLoads++;

        // Return in-flight request if one is already pending for this month
        if (this._inflight.has(targetMonth)) {
            this.stats.cacheHits++;
            return this._inflight.get(targetMonth);
        }

        // Check cache first
        if (this.isCacheValid(targetMonth)) {
            this.stats.cacheHits++;
            const cachedOrders = this.cache.orders.get(targetMonth);
            return this.mergeWithOptimisticUpdates(cachedOrders, targetMonth);
        }

        this.stats.cacheMisses++;

        const promise = this.supabase.getOrders(targetMonth)
            .then(orders => {
                this.stats.supabaseOperations++;
                this.updateCache(targetMonth, orders);
                this._inflight.delete(targetMonth);
                return this.mergeWithOptimisticUpdates(orders, targetMonth);
            })
            .catch(err => {
                this._inflight.delete(targetMonth);
                throw err;
            });

        this._inflight.set(targetMonth, promise);
        return promise;
    }

    // GET ALL ORDERS across months — cached + deduplicated
    async getAllOrders(options = {}) {
        const includeImageUrls = options.includeImageUrls === true;
        const status = options.status || null;
        const ALL_KEY = this.getAllOrdersCacheKey({ includeImageUrls, status });

        if (!includeImageUrls) {
            const imageKey = this.getAllOrdersCacheKey({ includeImageUrls: true, status });
            if (this.isCacheValid(imageKey)) {
                this.stats.cacheHits++;
                return this.cache.orders.get(imageKey);
            }
        }

        if (this._inflight.has(ALL_KEY)) {
            this.stats.cacheHits++;
            return this._inflight.get(ALL_KEY);
        }

        if (this.isCacheValid(ALL_KEY)) {
            this.stats.cacheHits++;
            return this.cache.orders.get(ALL_KEY);
        }

        this.stats.cacheMisses++;

        const promise = this.supabase.getOrders(null, { includeImageUrls, status })
            .then(orders => {
                this.stats.supabaseOperations++;
                this.updateCache(ALL_KEY, orders);
                this._inflight.delete(ALL_KEY);
                return orders;
            })
            .catch(err => {
                this._inflight.delete(ALL_KEY);
                throw err;
            });

        this._inflight.set(ALL_KEY, promise);
        return promise;
    }

    // GET RECENTLY DELIVERED - bypasses cache, sorts by updated_at
    async getRecentlyDelivered(limit = 10) {
        try {
            console.log(`📦 Getting last ${limit} recently delivered orders`);
            const orders = await this.supabase.getRecentlyDelivered(limit);
            this.stats.supabaseOperations++;
            return orders;
        } catch (error) {
            console.error('❌ Failed to get recently delivered orders:', error);
            throw error;
        }
    }

    async getFullImageUrl(orderOrPath) {
        const imagePath = typeof orderOrPath === 'string'
            ? orderOrPath
            : (orderOrPath?.imagePath || null);

        if (!imagePath) return null;
        return this.supabase.getImageUrl(imagePath);
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
            // Get orders - if showAllMonths is true, use getAllOrders(), otherwise get current month
            const needsImageUrls = filters.status === 'Свободен';
            const statusFilter = filters.status && filters.status !== 'all'
                ? filters.status
                : null;
            let orders = filters.showAllMonths
                ? await this.getAllOrders({ includeImageUrls: needsImageUrls, status: statusFilter })
                : await this.getOrders(this.state.get('currentMonth'));

            // Apply filters efficiently
            if (!filters.showAllMonths && statusFilter) {
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

    getAllOrdersCacheKey({ includeImageUrls = false, status = null } = {}) {
        const statusPart = status ? `:status:${encodeURIComponent(status)}` : '';
        const imagePart = includeImageUrls ? ':images' : '';
        return `__all__${statusPart}${imagePart}`;
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
        // All-orders caches are stale after any mutation
        this.invalidateAllOrdersCache();
    }

    updateOrderInCache(order, oldMonth, newMonth) {
        if (oldMonth && this.cache.orders.has(oldMonth)) {
            const oldOrders = this.cache.orders.get(oldMonth);
            const index = oldOrders.findIndex(o => o.id === order.id);
            if (index !== -1) oldOrders.splice(index, 1);
        }
        if (newMonth && this.cache.orders.has(newMonth)) {
            const newOrders = this.cache.orders.get(newMonth);
            newOrders.push(order);
            newOrders.sort((a, b) => new Date(b.date) - new Date(a.date));
        }
        this.invalidateAllOrdersCache();
    }

    removeOrderFromCache(orderId, month) {
        if (this.cache.orders.has(month)) {
            const orders = this.cache.orders.get(month);
            const index = orders.findIndex(o => o.id === orderId);
            if (index !== -1) orders.splice(index, 1);
        }
        this.invalidateAllOrdersCache();
    }

    invalidateAllOrdersCache() {
        for (const key of Array.from(this.cache.orders.keys())) {
            if (key.startsWith('__all__')) {
                this.cache.orders.delete(key);
                this.cache.lastUpdate.delete(key);
            }
        }

        for (const key of Array.from(this._inflight.keys())) {
            if (key.startsWith('__all__')) {
                this._inflight.delete(key);
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

    // UTILITY METHODS
    // Validates via the central ValidationUtils schema and coerces empty numeric
    // fields to 0 in-place (preserves the legacy behaviour expected by prepareOrder).
    validateOrderData(orderData) {
        assertValid(orderData, orderSchema);
        const coerced = coerceNumbers(orderData, ORDER_NUMERIC_FIELDS);
        for (const f of ORDER_NUMERIC_FIELDS) orderData[f] = coerced[f];
    }

    // js/modules/OrdersModule.js - Fix prepareOrder method

// js/modules/OrdersModule.js - Replace prepareOrder with async version and unify logic

// UNIFIED ASYNC ORDER PREPARATION (used by create, update, duplicate)
    async prepareOrder(data) {
        console.log('🔧 prepareOrder() called');
        console.log('📞 Call stack:', new Error().stack);

        // FIXED: Ensure settings are loaded before calculation
        let settings = this.state.get('settings');

        // If settings not loaded or invalid, load them first
        // ✅ FIX: Check for eurRate specifically (required for current system)
        // ✅ FIX: Check for undefined/null explicitly, not falsy (0 is valid for factoryShipping)
        if (!settings ||
            !settings.eurRate ||
            settings.factoryShipping === undefined ||
            settings.factoryShipping === null) {
            try {
                console.log('⚠️ Settings incomplete, reloading from Supabase...');
                // Load settings directly from Supabase
                settings = await this.supabase.getSettings();
                // Update state so future calls can use cached settings
                this.state.set('settings', settings);
                console.log('✅ Loaded settings for order calculation:', settings);
            } catch (error) {
                console.error('❌ Failed to load settings from Supabase, using defaults:', error);
                settings = {
                    eurRate: 0.92,
                    usdRate: 1.71, // Legacy
                    factoryShipping: 1.5,
                    baseCurrency: 'EUR',
                    conversionRate: 1.95583
                };
            }
        }

        console.log('💰 Using settings for order:', { eurRate: settings.eurRate, factoryShipping: settings.factoryShipping });

        // Calculate USD costs
        const costUSD = parseFloat(data.costUSD) || 0;
        const shippingUSD = (data.shippingUSD !== '' && data.shippingUSD !== undefined && data.shippingUSD !== null)
            ? parseFloat(data.shippingUSD) || 0
            : parseFloat(settings.factoryShipping) || 0;

        const rate = parseFloat(settings.eurRate);

        // Validate exchange rate
        if (!rate || isNaN(rate) || rate <= 0) {
            console.error('❌ Invalid exchange rate:', { eurRate: settings.eurRate, parsed: rate, settings });
            throw new Error(`Invalid USD→EUR exchange rate: ${settings.eurRate}. Please check Settings page.`);
        }

        console.log(`💱 Using exchange rate: 1 USD = ${rate} EUR (from settings)`);

        // Use EUR values directly (no BGN conversion)
        const extrasEUR = parseFloat(data.extrasEUR) || 0;
        const sellEUR = parseFloat(data.sellEUR) || 0;

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
            extrasEUR: extrasEUR,
            sellEUR: sellEUR,
            status: data.status || 'Очакван',
            fullSet: data.fullSet || false,
            notes: data.notes || '',
            imageData: data.imageData || null,
            imageUrl: data.imageUrl || null,
            imagePath: data.imagePath || null,
            previousImagePath: data.previousImagePath || data.imagePath || null,
            removeImage: data.removeImage || false
        };

        // Calculate derived fields (EUR only)
        order.totalEUR = ((costUSD + shippingUSD) * rate) + extrasEUR;
        order.balanceEUR = sellEUR - order.totalEUR;

        // Log calculation for debugging
        console.log(`📊 Order cost calculation:
  - Cost: $${costUSD} USD
  - Shipping: $${shippingUSD} USD
  - Subtotal: $${costUSD + shippingUSD} USD
  - Exchange rate: ${rate}
  - USD→EUR: $${costUSD + shippingUSD} × ${rate} = €${((costUSD + shippingUSD) * rate).toFixed(2)}
  - Extras: €${extrasEUR}
  - Total: €${order.totalEUR.toFixed(2)}
  - Sell price: €${sellEUR}
  - Profit: €${order.balanceEUR.toFixed(2)}`);

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

            // Create in Supabase
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

            console.log('✅ Order created:', savedOrder.id);
            return savedOrder;

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

            console.log('✅ Order updated:', orderId);
            return savedOrder;

        } catch (error) {
            this.eventBus.emit('order:update-failed', { error, orderId, orderData, operationId });
            throw error;

        } finally {
            this.pendingOperations.delete(operationId);
        }
    }

// OPTIONAL: Add method to recalculate order with fresh settings
    recalculateOrder(order) {
        const settings = this.state.get('settings') || {};
        const rate = parseFloat(settings.eurRate) || order.rate;

        if (!rate) {
            console.warn('⚠️ No exchange rate available for recalculation, using order stored rate');
        }

        const updatedOrder = { ...order, rate };
        const extrasEUR = order.extrasEUR || 0;
        const sellEUR = order.sellEUR || 0;

        updatedOrder.totalEUR = ((updatedOrder.costUSD + updatedOrder.shippingUSD) * rate) + extrasEUR;
        updatedOrder.balanceEUR = sellEUR - updatedOrder.totalEUR;

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

        if (this._realtimeChannel) {
            try { this.supabase?.supabase?.removeChannel(this._realtimeChannel); } catch (_) {}
            this._realtimeChannel = null;
        }
        this.clearCache();
        this._inflight.clear();
        this.pendingOperations.clear();
        this.optimisticUpdates.clear();

        console.log('✅ OrdersModule destroyed');
    }
}
