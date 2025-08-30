export class InventoryModule {
    constructor(state, storage, eventBus) {
        this.state = state;
        this.storage = storage;
        this.eventBus = eventBus;
        this.initializeInventory();
    }

    initializeInventory() {
        const inventory = this.state.get('inventory');
        if (!inventory || Object.keys(inventory).length === 0) {
            // Начални данни от Excel файла
            const defaultInventory = {
                'box_1': { id: 'box_1', brand: 'Rolex', type: 'стандарт', purchasePrice: 35, sellPrice: 70, stock: 17, ordered: 0 },
                'box_2': { id: 'box_2', brand: 'Omega', type: 'стандарт', purchasePrice: 35, sellPrice: 70, stock: 3, ordered: 0 },
                'box_3': { id: 'box_3', brand: 'Cartier', type: 'премиум', purchasePrice: 80, sellPrice: 160, stock: 0, ordered: 0 },
                'box_4': { id: 'box_4', brand: 'Tag Heuer', type: 'стандарт', purchasePrice: 35, sellPrice: 70, stock: 0, ordered: 0 },
                'box_5': { id: 'box_5', brand: 'Breitling', type: 'стандарт', purchasePrice: 35, sellPrice: 70, stock: 1, ordered: 0 },
                'box_6': { id: 'box_6', brand: 'Patek Philippe', type: 'премиум', purchasePrice: 65, sellPrice: 130, stock: 4, ordered: 0 },
                'box_7': { id: 'box_7', brand: 'Audemars Piguet', type: 'премиум', purchasePrice: 65, sellPrice: 130, stock: 1, ordered: 0 },
                'box_8': { id: 'box_8', brand: 'IWC', type: 'стандарт', purchasePrice: 35, sellPrice: 70, stock: 3, ordered: 0 },
                'box_9': { id: 'box_9', brand: 'Panerai', type: 'премиум', purchasePrice: 55, sellPrice: 110, stock: 0, ordered: 0 },
                'box_10': { id: 'box_10', brand: 'Tudor', type: 'стандарт', purchasePrice: 35, sellPrice: 70, stock: 4, ordered: 0 },
                'box_11': { id: 'box_11', brand: 'Vacheron Constantin', type: 'премиум', purchasePrice: 65, sellPrice: 130, stock: 0, ordered: 0 },
                'box_12': { id: 'box_12', brand: 'Seiko', type: 'стандарт', purchasePrice: 35, sellPrice: 70, stock: 3, ordered: 0 },
                'box_13': { id: 'box_13', brand: 'Citizen', type: 'стандарт', purchasePrice: 35, sellPrice: 70, stock: 4, ordered: 0 },
                'box_14': { id: 'box_14', brand: 'Richard Mille', type: 'премиум', purchasePrice: 95, sellPrice: 190, stock: 1, ordered: 0 },
                'box_15': { id: 'box_15', brand: 'Tissot', type: 'стандарт', purchasePrice: 40, sellPrice: 80, stock: 5, ordered: 0 },
                'box_16': { id: 'box_16', brand: 'Longines', type: 'стандарт', purchasePrice: 45, sellPrice: 90, stock: 2, ordered: 0 },
                'box_17': { id: 'box_17', brand: 'Casio', type: 'стандарт', purchasePrice: 35, sellPrice: 70, stock: 4, ordered: 0 },
                'box_18': { id: 'box_18', brand: 'Hublot', type: 'премиум', purchasePrice: 75, sellPrice: 150, stock: 1, ordered: 0 },
                'box_19': { id: 'box_19', brand: 'Zenith', type: 'стандарт', purchasePrice: 60, sellPrice: 120, stock: 6, ordered: 0 },
                'box_20': { id: 'box_20', brand: 'Universal', type: 'стандарт', purchasePrice: 35, sellPrice: 70, stock: 0, ordered: 0 }
            };

            this.state.set('inventory', defaultInventory);
            this.storage.save('inventory', defaultInventory);
        }
    }

    getAllItems() {
        return Object.values(this.state.get('inventory') || {});
    }

    getItem(id) {
        const inventory = this.state.get('inventory');
        return inventory[id];
    }

    updateStock(id, quantity, operation = 'set') {
        const inventory = this.state.get('inventory');
        const item = inventory[id];

        if (!item) return false;

        switch(operation) {
            case 'add':
                item.stock += quantity;
                break;
            case 'subtract':
                item.stock = Math.max(0, item.stock - quantity);
                break;
            case 'set':
            default:
                item.stock = Math.max(0, quantity);
                break;
        }

        this.storage.save('inventory', inventory);
        this.state.set('inventory', inventory);
        this.eventBus.emit('inventory:updated', item);

        return true;
    }

    updateOrdered(id, quantity) {
        const inventory = this.state.get('inventory');
        const item = inventory[id];

        if (!item) return false;

        item.ordered = Math.max(0, quantity);

        this.storage.save('inventory', inventory);
        this.state.set('inventory', inventory);
        this.eventBus.emit('inventory:updated', item);

        return true;
    }

    createItem(itemData) {
        const inventory = this.state.get('inventory');
        const newItem = {
            id: 'box_' + Date.now(),
            brand: itemData.brand,
            type: itemData.type,
            purchasePrice: parseFloat(itemData.purchasePrice) || 0,
            sellPrice: parseFloat(itemData.sellPrice) || 0,
            stock: parseInt(itemData.stock) || 0,
            ordered: parseInt(itemData.ordered) || 0
        };

        inventory[newItem.id] = newItem;

        this.storage.save('inventory', inventory);
        this.state.set('inventory', inventory);
        this.eventBus.emit('inventory:created', newItem);

        return newItem;
    }

    updateItem(id, itemData) {
        const inventory = this.state.get('inventory');
        const item = inventory[id];

        if (!item) return false;

        Object.assign(item, {
            brand: itemData.brand,
            type: itemData.type,
            purchasePrice: parseFloat(itemData.purchasePrice) || 0,
            sellPrice: parseFloat(itemData.sellPrice) || 0,
            stock: parseInt(itemData.stock) || 0,
            ordered: parseInt(itemData.ordered) || 0
        });

        this.storage.save('inventory', inventory);
        this.state.set('inventory', inventory);
        this.eventBus.emit('inventory:updated', item);

        return true;
    }

    deleteItem(id) {
        const inventory = this.state.get('inventory');

        if (!inventory[id]) return false;

        delete inventory[id];

        this.storage.save('inventory', inventory);
        this.state.set('inventory', inventory);
        this.eventBus.emit('inventory:deleted', id);

        return true;
    }

    getStats() {
        const items = this.getAllItems();

        return {
            totalItems: items.length,
            totalStock: items.reduce((sum, item) => sum + item.stock, 0),
            totalOrdered: items.reduce((sum, item) => sum + item.ordered, 0),
            lowStockItems: items.filter(item => item.stock <= 2 && item.stock > 0),
            outOfStockItems: items.filter(item => item.stock === 0),
            totalValue: items.reduce((sum, item) => sum + (item.stock * item.purchasePrice), 0),
            potentialRevenue: items.reduce((sum, item) => sum + (item.stock * item.sellPrice), 0)
        };
    }

    // Връзка с поръчките
    useBoxForOrder(boxId, orderId) {
        const success = this.updateStock(boxId, 1, 'subtract');
        if (success) {
            this.eventBus.emit('inventory:used', { boxId, orderId });
        }
        return success;
    }

    // Приемане на поръчка
    receiveOrder(boxId, quantity) {
        const inventory = this.state.get('inventory');
        const item = inventory[boxId];

        if (!item) return false;

        item.stock += quantity;
        item.ordered = Math.max(0, item.ordered - quantity);

        this.storage.save('inventory', inventory);
        this.state.set('inventory', inventory);
        this.eventBus.emit('inventory:received', { boxId, quantity });

        return true;
    }
}