export class ClientsModule {
    constructor(state, storage, eventBus) {
        this.state = state;
        this.storage = storage;
        this.eventBus = eventBus;
    }

    create(clientData) {
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

    update(clientId, clientData) {
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
        }
    }

    delete(clientId) {
        const clientsData = this.state.get('clientsData');
        const client = clientsData[clientId];
        delete clientsData[clientId];

        this.storage.save('clientsData', clientsData);
        this.state.set('clientsData', clientsData);
        this.eventBus.emit('client:deleted', client);
    }

    getClient(clientId) {
        const clientsData = this.state.get('clientsData');
        return clientsData[clientId];
    }

    getClientByName(name) {
        const clientsData = this.state.get('clientsData');
        return Object.values(clientsData).find(c => c.name === name);
    }

    getAllClients() {
        return Object.values(this.state.get('clientsData'));
    }

    getClientOrders(clientName) {
        const monthlyData = this.state.get('monthlyData');
        const allOrders = [];

        Object.values(monthlyData).forEach(month => {
            if (month.orders) {
                allOrders.push(...month.orders.filter(order => order.client === clientName));
            }
        });

        return allOrders;
    }

    getClientStats(clientName) {
        const orders = this.getClientOrders(clientName);
        return {
            totalOrders: orders.length,
            totalRevenue: orders.reduce((sum, o) => sum + o.sellBGN, 0),
            totalProfit: orders.reduce((sum, o) => sum + o.balanceBGN, 0),
            lastOrder: orders.length > 0 ?
                orders.sort((a, b) => new Date(b.date) - new Date(a.date))[0] : null
        };
    }
}