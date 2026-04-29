import { CurrencyUtils } from '../utils/CurrencyUtils.js';
import { assertValid, clientSchema } from '../utils/ValidationUtils.js';

// js/modules/ClientsModule.js - REWRITTEN FOR CLEAN ASYNC MANAGEMENT

export class ClientsModule {
    constructor(state, storage, eventBus, supabase) {
        this.state = state;
        this.storage = storage;
        this.eventBus = eventBus;
        this.supabase = supabase;

        // Cache management
        this.cache = {
            clients: new Map(), // id -> client
            clientStats: new Map(), // clientName -> stats
            lastUpdate: 0,
            cacheTimeout: 10 * 60 * 1000, // 10 minutes (longer than orders since clients change less)
            maxCacheSize: 1000 // max clients to cache
        };

        // In-flight request deduplication
        this._inflight = new Map();

        // Operation tracking
        this.pendingOperations = new Set();
        this.optimisticUpdates = new Map(); // tempId -> client

        // Statistics
        this.stats = {
            totalLoads: 0,
            cacheHits: 0,
            cacheMisses: 0,
            supabaseOperations: 0,
            statsCalculations: 0
        };

        this._realtimeChannel = null;
        console.log('👥 ClientsModule initialized with enhanced caching');
        this.setupEventHandlers();
        this.setupRealtimeSubscription();
    }

    setupEventHandlers() {
        this.eventBus.on('data:invalidate', () => this.clearCache());
        this.eventBus.on('order:created', () => this.clearStatsCache());
        this.eventBus.on('order:updated', () => this.clearStatsCache());
        this.eventBus.on('order:deleted', () => this.clearStatsCache());
        this.eventBus.on('storage:health-warning', () => this.reduceCacheSize());
    }

    setupRealtimeSubscription() {
        try {
            const client = this.supabase?.supabase;
            if (!client?.channel) return;

            this._realtimeChannel = client
                .channel('clients-realtime')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' }, (payload) => {
                    console.log('🔴 Realtime clients change:', payload.eventType);
                    this.clearCache();
                    this.clearStatsCache();
                    this.eventBus.emit('clients:realtime-change', { event: payload.eventType, record: payload.new || payload.old });
                })
                .subscribe((status) => {
                    if (status === 'SUBSCRIBED') console.log('✅ Clients realtime subscribed');
                    if (status === 'CHANNEL_ERROR') console.warn('⚠️ Clients realtime channel error');
                });
        } catch (e) {
            console.warn('⚠️ Could not set up clients realtime:', e.message);
        }
    }

    // CREATE CLIENT with optimistic updates
    async create(clientData) {
        const operationId = `create_${Date.now()}`;
        let optimisticClient = null;
        this.pendingOperations.add(operationId);

        try {
            const normalizedData = this.normalizeClientData(clientData);

            // Validate input data
            this.validateClientData(normalizedData);

            // Check for duplicates
            await this.checkForDuplicates(normalizedData);

            // Emit before-create event for undo/redo
            this.eventBus.emit('client:before-created', normalizedData);

            // Create optimistic client for immediate UI feedback
            optimisticClient = this.createOptimisticClient(normalizedData);
            this.addOptimisticUpdate(optimisticClient);

            // Emit optimistic creation
            this.eventBus.emit('client:created', {
                client: optimisticClient,
                isOptimistic: true,
                operationId
            });

            // Attempt Supabase save
            const savedClient = await this.supabase.createClient(normalizedData);
            this.stats.supabaseOperations++;

            // Replace optimistic with real client
            this.replaceOptimisticClient(optimisticClient.id, savedClient);

            // Update cache
            this.addClientToCache(savedClient);

            // Emit successful creation
            this.eventBus.emit('client:created', {
                client: savedClient,
                isOptimistic: false,
                operationId,
                source: 'supabase'
            });

            console.log('✅ Client created:', savedClient.id);
            return savedClient;

        } catch (error) {
            // Remove failed optimistic update
            if (optimisticClient) {
                this.removeOptimisticUpdate(optimisticClient.id);
            }

            this.eventBus.emit('client:create-failed', { error, clientData, operationId });
            throw error;

        } finally {
            this.pendingOperations.delete(operationId);
        }
    }

    // UPDATE CLIENT with proper cache management
    async update(clientId, clientData) {
        const operationId = `update_${clientId}_${Date.now()}`;
        this.pendingOperations.add(operationId);

        try {
            const normalizedData = this.normalizeClientData(clientData);

            // Validate input data
            this.validateClientData(normalizedData);

            // Find current client
            const currentClient = await this.getClient(clientId);
            if (!currentClient) {
                throw new Error(`Client not found: ${clientId}`);
            }

            // Check for duplicates (excluding current client)
            await this.checkForDuplicates(normalizedData, clientId);

            // Emit before-update event for undo/redo
            this.eventBus.emit('client:before-updated', {
                id: clientId,
                currentClient,
                newData: normalizedData
            });

            // Update in Supabase
            const savedClient = await this.supabase.updateClient(clientId, normalizedData);
            this.stats.supabaseOperations++;

            // Update cache
            this.updateClientInCache(savedClient);

            // Clear stats cache for this client
            this.clearStatsForClient(currentClient.name);
            this.clearStatsForClient(savedClient.name); // In case name changed

            // Emit successful update
            this.eventBus.emit('client:updated', {
                client: savedClient,
                operationId,
                source: 'supabase'
            });

            console.log('✅ Client updated:', clientId);
            return savedClient;

        } catch (error) {
            this.eventBus.emit('client:update-failed', { error, clientId, clientData, operationId });
            throw error;

        } finally {
            this.pendingOperations.delete(operationId);
        }
    }

    // DELETE CLIENT with proper cleanup
    async delete(clientId) {
        const operationId = `delete_${clientId}_${Date.now()}`;
        this.pendingOperations.add(operationId);

        try {
            // Find client before deletion
            const clientToDelete = await this.getClient(clientId);
            if (!clientToDelete) {
                throw new Error(`Client not found: ${clientId}`);
            }

            // Check if client has orders
            const hasOrders = await this.clientHasOrders(clientToDelete.name);
            if (hasOrders) {
                throw new Error(`Cannot delete client "${clientToDelete.name}" - they have existing orders`);
            }

            // Emit before-delete event for undo/redo
            this.eventBus.emit('client:before-deleted', clientToDelete);

            // Delete from Supabase
            await this.supabase.deleteClient(clientId);
            this.stats.supabaseOperations++;

            // Remove from cache
            this.removeClientFromCache(clientId);

            // Clear stats cache
            this.clearStatsForClient(clientToDelete.name);

            // Emit successful deletion
            this.eventBus.emit('client:deleted', {
                clientId,
                client: clientToDelete,
                operationId,
                source: 'supabase'
            });

            console.log('✅ Client deleted:', clientId);

        } catch (error) {
            this.eventBus.emit('client:delete-failed', { error, clientId, operationId });
            throw error;

        } finally {
            this.pendingOperations.delete(operationId);
        }
    }

    // GET ALL CLIENTS with smart caching + in-flight deduplication
    async getAllClients() {
        const KEY = '__all__';
        this.stats.totalLoads++;

        if (this._inflight.has(KEY)) {
            this.stats.cacheHits++;
            return this._inflight.get(KEY);
        }

        if (this.isCacheValid()) {
            this.stats.cacheHits++;
            return this.mergeWithOptimisticUpdates(Array.from(this.cache.clients.values()));
        }

        this.stats.cacheMisses++;

        const promise = this.supabase.getClients()
            .then(clients => {
                this.stats.supabaseOperations++;
                this.updateCache(clients);
                this._inflight.delete(KEY);
                return this.mergeWithOptimisticUpdates(clients);
            })
            .catch(err => {
                this._inflight.delete(KEY);
                throw err;
            });

        this._inflight.set(KEY, promise);
        return promise;
    }

    // GET SINGLE CLIENT
    async getClient(clientId) {
        try {
            // Check optimistic updates first
            for (const [tempId, client] of this.optimisticUpdates.entries()) {
                if (client.id === clientId) {
                    return client;
                }
            }

            // Check cache
            if (this.cache.clients.has(clientId)) {
                return this.cache.clients.get(clientId);
            }

            // Load all clients and find the one we need
            const allClients = await this.getAllClients();
            return allClients.find(c => c.id === clientId) || null;

        } catch (error) {
            console.error('❌ Failed to get client:', error);
            return null;
        }
    }

    // GET CLIENT BY NAME
    async getClientByName(name) {
        try {
            const normalizedName = typeof name === 'string' ? name.trim().toLowerCase() : '';
            if (!normalizedName) return null;

            const allClients = await this.getAllClients();
            return allClients.find(c => c.name.toLowerCase().trim() === normalizedName) || null;

        } catch (error) {
            console.error('❌ Failed to get client by name:', error);
            return null;
        }
    }

    // GET CLIENT ORDERS
    async getClientOrders(clientName, options = {}) {
        try {
            // Get orders from OrdersModule
            if (!window.app?.modules?.orders) {
                console.warn('⚠️ OrdersModule not available');
                return [];
            }

            const allOrders = await window.app.modules.orders.getAllOrders({
                includeImageUrls: options.includeImageUrls === true,
                preferLightweight: options.includeImageUrls !== true
            });
            return allOrders.filter(order => order.client === clientName);

        } catch (error) {
            console.error('❌ Failed to get client orders:', error);
            return [];
        }
    }

    getOrderEurMetrics(order) {
        const sellEUR = order.sellEUR || 0;
        const balanceEUR = order.balanceEUR || 0;

        return { sellEUR, balanceEUR };
    }

    // GET CLIENT STATISTICS with caching
    async getClientStats(clientName) {
        try {
            // Check stats cache first
            if (this.cache.clientStats.has(clientName)) {
                return this.cache.clientStats.get(clientName);
            }

            this.stats.statsCalculations++;

            // Calculate stats
            const orders = await this.getClientOrders(clientName);

            const stats = {
                totalOrders: orders.length,
                // Use EUR exclusively (orders are validated and converted by SupabaseService)
                totalRevenue: orders.reduce((sum, o) => sum + (o.sellEUR || 0), 0),
                totalProfit: orders.reduce((sum, o) => sum + (o.balanceEUR || 0), 0),
                lastOrder: orders.length > 0 ?
                    orders.sort((a, b) => new Date(b.date) - new Date(a.date))[0] : null,
                firstOrder: orders.length > 0 ?
                    orders.sort((a, b) => new Date(a.date) - new Date(b.date))[0] : null,
                avgOrderValue: orders.length > 0 ?
                    orders.reduce((sum, o) => sum + (o.sellEUR || 0), 0) / orders.length : 0
            };

            // Cache the stats
            this.cache.clientStats.set(clientName, stats);

            return stats;

        } catch (error) {
            console.error('❌ Failed to get client stats:', error);
            return {
                totalOrders: 0,
                totalRevenue: 0,
                totalProfit: 0,
                lastOrder: null,
                firstOrder: null,
                avgOrderValue: 0
            };
        }
    }

    // CHECK if client has orders
    async clientHasOrders(clientName) {
        try {
            const orders = await this.getClientOrders(clientName);
            return orders.length > 0;

        } catch (error) {
            console.error('❌ Failed to check client orders:', error);
            return false; // Assume no orders on error to allow deletion
        }
    }

    // CACHE MANAGEMENT
    isCacheValid() {
        const age = Date.now() - this.cache.lastUpdate;
        return this.cache.clients.size > 0 && age < this.cache.cacheTimeout;
    }

    updateCache(clients) {
        // Clear old cache
        this.cache.clients.clear();

        // Add all clients to cache
        for (const client of clients) {
            this.cache.clients.set(client.id, client);
        }

        this.cache.lastUpdate = Date.now();

        console.log(`💾 Cached ${clients.length} clients`);
    }

    addClientToCache(client) {
        this.cache.clients.set(client.id, client);
    }

    updateClientInCache(client) {
        this.cache.clients.set(client.id, client);
    }

    removeClientFromCache(clientId) {
        this.cache.clients.delete(clientId);
    }

    clearCache() {
        this.cache.clients.clear();
        this.cache.lastUpdate = 0;
        console.log('🧹 Clients cache cleared');
    }

    clearStatsCache() {
        this.cache.clientStats.clear();
        console.log('🧹 Client stats cache cleared');
    }

    clearStatsForClient(clientName) {
        this.cache.clientStats.delete(clientName);
    }

    reduceCacheSize() {
        // Not applicable for clients cache since we cache all clients
        this.clearStatsCache(); // But we can clear stats cache to save memory
        console.log('📉 Reduced client stats cache');
    }

    // OPTIMISTIC UPDATES
    createOptimisticClient(clientData) {
        const optimisticClient = {
            id: 'temp_client_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            name: clientData.name,
            phone: clientData.phone || '',
            email: clientData.email || '',
            address: clientData.address || '',
            preferredSource: clientData.preferredSource || '',
            notes: clientData.notes || '',
            createdDate: new Date().toISOString(),
            _isOptimistic: true
        };

        return optimisticClient;
    }

    addOptimisticUpdate(client) {
        this.optimisticUpdates.set(client.id, client);
    }

    replaceOptimisticClient(tempId, realClient) {
        this.optimisticUpdates.delete(tempId);

        // Update cache if temp client was cached
        if (this.cache.clients.has(tempId)) {
            this.cache.clients.delete(tempId);
            this.cache.clients.set(realClient.id, realClient);
        }
    }

    removeOptimisticUpdate(tempId) {
        this.optimisticUpdates.delete(tempId);
        this.cache.clients.delete(tempId);
    }

    mergeWithOptimisticUpdates(clients) {
        const optimisticClients = Array.from(this.optimisticUpdates.values());

        return [...clients, ...optimisticClients]
            .sort((a, b) => a.name.localeCompare(b.name, 'bg-BG'));
    }

    // VALIDATION AND DUPLICATE CHECKING
    normalizeClientData(clientData = {}) {
        const trimString = (value) => typeof value === 'string' ? value.trim() : '';

        return {
            name: trimString(clientData.name),
            phone: trimString(clientData.phone),
            email: trimString(clientData.email),
            address: trimString(clientData.address),
            preferredSource: trimString(clientData.preferredSource),
            notes: trimString(clientData.notes)
        };
    }

    validateClientData(clientData) {
        assertValid(clientData, clientSchema);
    }

    async checkForDuplicates(clientData, excludeId = null) {
        try {
            const allClients = await this.getAllClients();
            const clientName = clientData.name.toLowerCase().trim();

            const duplicate = allClients.find(client =>
                client.id !== excludeId &&
                client.name.toLowerCase().trim() === clientName
            );

            if (duplicate) {
                throw new Error(`A client with the name "${clientData.name}" already exists`);
            }

        } catch (error) {
            if (error.message.includes('already exists')) {
                throw error; // Re-throw duplicate errors
            }
            // Ignore other errors during duplicate check
            console.warn('⚠️ Could not check for duplicates:', error.message);
        }
    }

    // STATISTICS AND DEBUGGING
    getStatistics() {
        const cacheHitRate = this.stats.totalLoads > 0 ?
            (this.stats.cacheHits / this.stats.totalLoads * 100).toFixed(1) + '%' : '0%';

        return {
            ...this.stats,
            cacheHitRate,
            cachedClients: this.cache.clients.size,
            cachedStats: this.cache.clientStats.size,
            pendingOperations: this.pendingOperations.size,
            optimisticUpdates: this.optimisticUpdates.size
        };
    }

    debugClients() {
        const stats = this.getStatistics();

        console.group('🔍 CLIENTS MODULE DEBUG');
        console.log('Statistics:', stats);
        console.log('Cache state:', {
            clients: this.cache.clients.size,
            stats: this.cache.clientStats.size,
            lastUpdate: new Date(this.cache.lastUpdate).toLocaleString()
        });
        console.log('Pending operations:', Array.from(this.pendingOperations));
        console.log('Optimistic updates:', Array.from(this.optimisticUpdates.keys()));
        console.groupEnd();
    }

    // CLEANUP
    destroy() {
        console.log('🗑️ Destroying ClientsModule...');

        if (this._realtimeChannel) {
            try { this.supabase?.supabase?.removeChannel(this._realtimeChannel); } catch (_) {}
            this._realtimeChannel = null;
        }
        this.clearCache();
        this.clearStatsCache();
        this._inflight.clear();
        this.pendingOperations.clear();
        this.optimisticUpdates.clear();

        console.log('✅ ClientsModule destroyed');
    }
}
