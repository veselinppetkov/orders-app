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

        // Operation tracking
        this.pendingOperations = new Set();
        this.optimisticUpdates = new Map(); // tempId -> client

        // Statistics
        this.stats = {
            totalLoads: 0,
            cacheHits: 0,
            cacheMisses: 0,
            supabaseOperations: 0,
            fallbackOperations: 0,
            statsCalculations: 0
        };

        console.log('👥 ClientsModule initialized with enhanced caching');
        this.setupEventHandlers();
    }

    setupEventHandlers() {
        // Clear cache when data changes externally
        this.eventBus.on('data:invalidate', () => {
            this.clearCache();
        });

        // Clear client stats when orders change
        this.eventBus.on('order:created', () => {
            this.clearStatsCache();
        });

        this.eventBus.on('order:updated', () => {
            this.clearStatsCache();
        });

        this.eventBus.on('order:deleted', () => {
            this.clearStatsCache();
        });

        // Monitor storage health
        this.eventBus.on('storage:health-warning', () => {
            this.reduceCacheSize();
        });
    }

    // CREATE CLIENT with optimistic updates
    async create(clientData) {
        const operationId = `create_${Date.now()}`;
        this.pendingOperations.add(operationId);

        try {
            // Validate input data
            this.validateClientData(clientData);

            // Check for duplicates
            await this.checkForDuplicates(clientData);

            // Emit before-create event for undo/redo
            this.eventBus.emit('client:before-created', clientData);

            // Create optimistic client for immediate UI feedback
            const optimisticClient = this.createOptimisticClient(clientData);
            this.addOptimisticUpdate(optimisticClient);

            // Emit optimistic creation
            this.eventBus.emit('client:created', {
                client: optimisticClient,
                isOptimistic: true,
                operationId
            });

            try {
                // Attempt Supabase save
                const savedClient = await this.supabase.createClient(clientData);
                this.stats.supabaseOperations++;

                // Replace optimistic with real client
                this.replaceOptimisticClient(optimisticClient.id, savedClient);

                // Update cache
                this.addClientToCache(savedClient);

                // Backup to localStorage
                this.backupToLocalStorage(savedClient);

                // Emit successful creation
                this.eventBus.emit('client:created', {
                    client: savedClient,
                    isOptimistic: false,
                    operationId,
                    source: 'supabase'
                });

                console.log('✅ Client created successfully in Supabase:', savedClient.id);
                return savedClient;

            } catch (supabaseError) {
                console.warn('⚠️ Supabase create failed, falling back to localStorage:', supabaseError.message);

                // Fallback to localStorage
                const localClient = await this.createInLocalStorage(clientData);
                this.stats.fallbackOperations++;

                // Replace optimistic with local client
                this.replaceOptimisticClient(optimisticClient.id, localClient);

                // Update cache
                this.addClientToCache(localClient);

                // Emit fallback creation
                this.eventBus.emit('client:created', {
                    client: localClient,
                    isOptimistic: false,
                    operationId,
                    source: 'localStorage'
                });

                console.log('✅ Client created in localStorage fallback:', localClient.id);
                return localClient;
            }

        } catch (error) {
            // Remove failed optimistic update
            if (this.optimisticUpdates.has(operationId)) {
                this.optimisticUpdates.delete(operationId);
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
            // Validate input data
            this.validateClientData(clientData);

            // Find current client
            const currentClient = await this.getClient(clientId);
            if (!currentClient) {
                throw new Error(`Client not found: ${clientId}`);
            }

            // Check for duplicates (excluding current client)
            await this.checkForDuplicates(clientData, clientId);

            // Emit before-update event for undo/redo
            this.eventBus.emit('client:before-updated', {
                id: clientId,
                currentClient,
                newData: clientData
            });

            try {
                // Update in Supabase
                const savedClient = await this.supabase.updateClient(clientId, clientData);
                this.stats.supabaseOperations++;

                // Update cache
                this.updateClientInCache(savedClient);

                // Clear stats cache for this client
                this.clearStatsForClient(currentClient.name);
                this.clearStatsForClient(savedClient.name); // In case name changed

                // Backup to localStorage
                this.backupToLocalStorage(savedClient);

                // Emit successful update
                this.eventBus.emit('client:updated', {
                    client: savedClient,
                    operationId,
                    source: 'supabase'
                });

                console.log('✅ Client updated successfully in Supabase:', clientId);
                return savedClient;

            } catch (supabaseError) {
                console.warn('⚠️ Supabase update failed, falling back to localStorage:', supabaseError.message);

                // Fallback to localStorage
                const localClient = await this.updateInLocalStorage(clientId, clientData);
                this.stats.fallbackOperations++;

                // Update cache
                this.updateClientInCache(localClient);

                // Clear stats cache
                this.clearStatsForClient(currentClient.name);
                this.clearStatsForClient(localClient.name);

                // Emit fallback update
                this.eventBus.emit('client:updated', {
                    client: localClient,
                    operationId,
                    source: 'localStorage'
                });

                console.log('✅ Client updated in localStorage fallback:', clientId);
                return localClient;
            }

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

            try {
                // Delete from Supabase
                await this.supabase.deleteClient(clientId);
                this.stats.supabaseOperations++;

                // Remove from cache
                this.removeClientFromCache(clientId);

                // Clear stats cache
                this.clearStatsForClient(clientToDelete.name);

                // Remove from localStorage backup
                this.removeFromLocalStorageBackup(clientId);

                // Emit successful deletion
                this.eventBus.emit('client:deleted', {
                    clientId,
                    client: clientToDelete,
                    operationId,
                    source: 'supabase'
                });

                console.log('✅ Client deleted successfully from Supabase:', clientId);

            } catch (supabaseError) {
                console.warn('⚠️ Supabase delete failed, falling back to localStorage:', supabaseError.message);

                // Fallback to localStorage
                await this.deleteFromLocalStorage(clientId);
                this.stats.fallbackOperations++;

                // Remove from cache
                this.removeClientFromCache(clientId);

                // Clear stats cache
                this.clearStatsForClient(clientToDelete.name);

                // Emit fallback deletion
                this.eventBus.emit('client:deleted', {
                    clientId,
                    client: clientToDelete,
                    operationId,
                    source: 'localStorage'
                });

                console.log('✅ Client deleted in localStorage fallback:', clientId);
            }

        } catch (error) {
            this.eventBus.emit('client:delete-failed', { error, clientId, operationId });
            throw error;

        } finally {
            this.pendingOperations.delete(operationId);
        }
    }

    // GET ALL CLIENTS with smart caching
    async getAllClients() {
        this.stats.totalLoads++;

        try {
            // Check cache first
            if (this.isCacheValid()) {
                this.stats.cacheHits++;
                const cachedClients = Array.from(this.cache.clients.values());
                console.log(`📂 Using cached clients: ${cachedClients.length} clients`);
                return this.mergeWithOptimisticUpdates(cachedClients);
            }

            this.stats.cacheMisses++;
            console.log('📂 Loading clients from source...');

            try {
                // Try Supabase first
                const clients = await this.supabase.getClients();
                this.stats.supabaseOperations++;

                // Update cache
                this.updateCache(clients);

                // Backup to localStorage
                this.backupClientsToLocalStorage(clients);

                console.log(`✅ Loaded ${clients.length} clients from Supabase`);
                return this.mergeWithOptimisticUpdates(clients);

            } catch (supabaseError) {
                console.warn('⚠️ Supabase load failed, using localStorage:', supabaseError.message);

                // Fallback to localStorage
                const localClients = this.getClientsFromLocalStorage();
                this.stats.fallbackOperations++;

                // Update cache with local data
                this.updateCache(localClients);

                console.log(`✅ Loaded ${localClients.length} clients from localStorage`);
                return this.mergeWithOptimisticUpdates(localClients);
            }

        } catch (error) {
            console.error('❌ Failed to load clients:', error);
            throw error;
        }
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
            const allClients = await this.getAllClients();
            return allClients.find(c => c.name === name) || null;

        } catch (error) {
            console.error('❌ Failed to get client by name:', error);
            return null;
        }
    }

    // GET CLIENT ORDERS
    async getClientOrders(clientName) {
        try {
            // Get orders from OrdersModule
            if (!window.app?.modules?.orders) {
                console.warn('⚠️ OrdersModule not available');
                return [];
            }

            const allOrders = await window.app.modules.orders.getAllOrders();
            return allOrders.filter(order => order.client === clientName);

        } catch (error) {
            console.error('❌ Failed to get client orders:', error);
            return [];
        }
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
                totalRevenue: orders.reduce((sum, o) => sum + o.sellBGN, 0),
                totalProfit: orders.reduce((sum, o) => sum + o.balanceBGN, 0),
                lastOrder: orders.length > 0 ?
                    orders.sort((a, b) => new Date(b.date) - new Date(a.date))[0] : null,
                firstOrder: orders.length > 0 ?
                    orders.sort((a, b) => new Date(a.date) - new Date(b.date))[0] : null,
                avgOrderValue: orders.length > 0 ?
                    orders.reduce((sum, o) => sum + o.sellBGN, 0) / orders.length : 0
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

    mergeWithOptimisticUpdates(clients) {
        const optimisticClients = Array.from(this.optimisticUpdates.values());

        return [...clients, ...optimisticClients]
            .sort((a, b) => a.name.localeCompare(b.name, 'bg-BG'));
    }

    // VALIDATION AND DUPLICATE CHECKING
    validateClientData(clientData) {
        if (!clientData.name || typeof clientData.name !== 'string') {
            throw new Error('Client name is required');
        }

        if (clientData.name.trim().length === 0) {
            throw new Error('Client name cannot be empty');
        }

        if (clientData.name.length > 100) {
            throw new Error('Client name is too long (max 100 characters)');
        }

        // Validate email format if provided
        if (clientData.email && clientData.email.trim()) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(clientData.email)) {
                throw new Error('Invalid email format');
            }
        }

        // Validate phone format if provided
        if (clientData.phone && clientData.phone.trim()) {
            // Allow various phone formats but require at least 6 digits
            const phoneDigits = clientData.phone.replace(/\D/g, '');
            if (phoneDigits.length < 6) {
                throw new Error('Phone number must contain at least 6 digits');
            }
        }
    }

    async checkForDuplicates(clientData, excludeId = null) {
        try {
            const allClients = await this.getAllClients();

            const duplicate = allClients.find(client =>
                client.id !== excludeId &&
                client.name.toLowerCase().trim() === clientData.name.toLowerCase().trim()
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

    // LOCALSTORAGE OPERATIONS (simplified)
    async createInLocalStorage(clientData) {
        const client = {
            id: 'client_' + Date.now(),
            name: clientData.name,
            phone: clientData.phone || '',
            email: clientData.email || '',
            address: clientData.address || '',
            preferredSource: clientData.preferredSource || '',
            notes: clientData.notes || '',
            createdDate: new Date().toISOString()
        };

        const clientsData = this.state.get('clientsData');
        clientsData[client.id] = client;

        this.storage.save('clientsData', clientsData);
        this.state.set('clientsData', clientsData);

        return client;
    }

    async updateInLocalStorage(clientId, clientData) {
        const clientsData = this.state.get('clientsData');

        if (!clientsData[clientId]) {
            throw new Error(`Client not found in localStorage: ${clientId}`);
        }

        const updatedClient = {
            ...clientsData[clientId],
            name: clientData.name,
            phone: clientData.phone || '',
            email: clientData.email || '',
            address: clientData.address || '',
            preferredSource: clientData.preferredSource || '',
            notes: clientData.notes || ''
        };

        clientsData[clientId] = updatedClient;

        this.storage.save('clientsData', clientsData);
        this.state.set('clientsData', clientsData);

        return updatedClient;
    }

    async deleteFromLocalStorage(clientId) {
        const clientsData = this.state.get('clientsData');

        if (!clientsData[clientId]) {
            throw new Error(`Client not found in localStorage: ${clientId}`);
        }

        delete clientsData[clientId];

        this.storage.save('clientsData', clientsData);
        this.state.set('clientsData', clientsData);
    }

    getClientsFromLocalStorage() {
        const clientsData = this.state.get('clientsData');
        return Object.values(clientsData);
    }

    backupToLocalStorage(client) {
        try {
            const clientsData = this.state.get('clientsData');
            clientsData[client.id] = client;

            this.storage.save('clientsData', clientsData);
            this.state.set('clientsData', clientsData);

        } catch (error) {
            console.warn('⚠️ localStorage backup failed:', error);
        }
    }

    backupClientsToLocalStorage(clients) {
        try {
            const clientsData = {};

            for (const client of clients) {
                clientsData[client.id] = client;
            }

            this.storage.save('clientsData', clientsData);
            this.state.set('clientsData', clientsData);

        } catch (error) {
            console.warn('⚠️ localStorage backup failed:', error);
        }
    }

    removeFromLocalStorageBackup(clientId) {
        try {
            const clientsData = this.state.get('clientsData');
            delete clientsData[clientId];

            this.storage.save('clientsData', clientsData);
            this.state.set('clientsData', clientsData);

        } catch (error) {
            console.warn('⚠️ localStorage backup removal failed:', error);
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

        this.clearCache();
        this.clearStatsCache();
        this.pendingOperations.clear();
        this.optimisticUpdates.clear();

        console.log('✅ ClientsModule destroyed');
    }
}