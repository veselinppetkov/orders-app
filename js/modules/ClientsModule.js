export class ClientsModule {
    constructor(state, storage, eventBus, supabase) {
        this.state = state;
        this.storage = storage; // Keep for backup during transition
        this.eventBus = eventBus;
        this.supabase = supabase;

        // Cache for performance
        this.clientsCache = null;

        console.log('👥 ClientsModule initialized with Supabase support');
    }

    async create(clientData) {
        try {
            console.log('📝 Creating client in Supabase:', clientData.name);

            this.eventBus.emit('client:before-created', clientData);

            // Create in Supabase
            const client = await this.supabase.createClient(clientData);

            // Update cache
            if (this.clientsCache) {
                this.clientsCache[client.id] = client;
            }

            // Backup to localStorage
            this.saveToLocalStorageBackup(client);

            this.eventBus.emit('client:created', client);
            return client;

        } catch (error) {
            console.error('❌ Failed to create client in Supabase:', error);
            return this.createInLocalStorage(clientData);
        }
    }

    async update(clientId, clientData) {
        try {
            console.log('✏️ Updating client in Supabase:', clientId);

            this.eventBus.emit('client:before-updated', { id: clientId, newData: clientData });

            const client = await this.supabase.updateClient(clientId, clientData);

            // Update cache
            if (this.clientsCache) {
                this.clientsCache[client.id] = client;
            }

            this.saveToLocalStorageBackup(client);
            this.eventBus.emit('client:updated', client);
            return client;

        } catch (error) {
            console.error('❌ Failed to update client in Supabase:', error);
            return this.updateInLocalStorage(clientId, clientData);
        }
    }

    async delete(clientId) {
        try {
            console.log('🗑️ Deleting client from Supabase:', clientId);

            const client = await this.getClient(clientId);
            if (client) {
                this.eventBus.emit('client:before-deleted', client);
            }

            await this.supabase.deleteClient(clientId);

            // Remove from cache
            if (this.clientsCache) {
                delete this.clientsCache[clientId];
            }

            this.removeFromLocalStorageBackup(clientId);
            this.eventBus.emit('client:deleted', client);

        } catch (error) {
            console.error('❌ Failed to delete client from Supabase:', error);
            this.deleteFromLocalStorage(clientId);
        }
    }

    async getClient(clientId) {
        // Check cache first
        if (this.clientsCache && this.clientsCache[clientId]) {
            return this.clientsCache[clientId];
        }

        try {
            const clients = await this.getAllClients();
            return clients.find(c => c.id === clientId);
        } catch (error) {
            console.error('❌ Failed to get client:', error);
            return this.getClientFromLocalStorage(clientId);
        }
    }

    async getClientByName(name) {
        try {
            const clients = await this.getAllClients();
            return clients.find(c => c.name === name);
        } catch (error) {
            console.error('❌ Failed to get client by name:', error);
            return this.getClientByNameFromLocalStorage(name);
        }
    }

    async getAllClients() {
        // Return cache if available and fresh
        if (this.clientsCache) {
            return Object.values(this.clientsCache);
        }

        try {
            console.log('📂 Loading all clients from Supabase...');
            const clients = await this.supabase.getClients();

            // Build cache
            this.clientsCache = {};
            clients.forEach(client => {
                this.clientsCache[client.id] = client;
            });

            console.log(`✅ Loaded ${clients.length} clients from Supabase`);
            return clients;

        } catch (error) {
            console.error('❌ Failed to load clients from Supabase:', error);
            return this.getAllClientsFromLocalStorage();
        }
    }

    async getClientOrders(clientName) {
        try {
            // Get all orders from OrdersModule
            const allOrders = await window.app.modules.orders.getAllOrders();
            return allOrders.filter(order => order.client === clientName);
        } catch (error) {
            console.error('❌ Failed to get client orders:', error);
            return [];
        }
    }

    async getClientStats(clientName) {
        const orders = await this.getClientOrders(clientName);
        return {
            totalOrders: orders.length,
            totalRevenue: orders.reduce((sum, o) => sum + o.sellBGN, 0),
            totalProfit: orders.reduce((sum, o) => sum + o.balanceBGN, 0),
            lastOrder: orders.length > 0 ?
                orders.sort((a, b) => new Date(b.date) - new Date(a.date))[0] : null
        };
    }

    clearCache() {
        this.clientsCache = null;
        console.log('🧹 Clients cache cleared');
    }

    // FALLBACK METHODS (localStorage)
    createInLocalStorage(clientData) {
        console.log('📝 Creating client in localStorage (fallback)');
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
        this.eventBus.emit('client:created', client);

        return client;
    }

    updateInLocalStorage(clientId, clientData) {
        const clientsData = this.state.get('clientsData');
        if (clientsData[clientId]) {
            clientsData[clientId] = {
                ...clientsData[clientId],
                ...clientData,
                id: clientId
            };

            this.storage.save('clientsData', clientsData);
            this.state.set('clientsData', clientsData);
            this.eventBus.emit('client:updated', clientsData[clientId]);
            return clientsData[clientId];
        }
    }

    deleteFromLocalStorage(clientId) {
        const clientsData = this.state.get('clientsData');
        const client = clientsData[clientId];
        delete clientsData[clientId];

        this.storage.save('clientsData', clientsData);
        this.state.set('clientsData', clientsData);
        this.eventBus.emit('client:deleted', client);
    }

    getClientFromLocalStorage(clientId) {
        const clientsData = this.state.get('clientsData');
        return clientsData[clientId];
    }

    getClientByNameFromLocalStorage(name) {
        const clientsData = this.state.get('clientsData');
        return Object.values(clientsData).find(c => c.name === name);
    }

    getAllClientsFromLocalStorage() {
        return Object.values(this.state.get('clientsData'));
    }

    // BACKUP METHODS
    saveToLocalStorageBackup(client) {
        try {
            const clientsData = this.state.get('clientsData');
            clientsData[client.id] = client;
            this.state.set('clientsData', clientsData);
            this.storage.save('clientsData', clientsData);
        } catch (error) {
            console.warn('⚠️ localStorage backup failed for client:', error);
        }
    }

    removeFromLocalStorageBackup(clientId) {
        try {
            const clientsData = this.state.get('clientsData');
            delete clientsData[clientId];
            this.state.set('clientsData', clientsData);
            this.storage.save('clientsData', clientsData);
        } catch (error) {
            console.warn('⚠️ localStorage backup removal failed:', error);
        }
    }
}