import { Config } from '../config.js';  // ✅ Goes up one level to js/config.js

// Initialize Supabase client
const supabase = window.supabase.createClient(Config.SUPABASE_URL, Config.SUPABASE_ANON_KEY);

export class InventoryModule {
    constructor(state, storage, eventBus) {
        this.state = state;
        this.storage = storage;
        this.eventBus = eventBus;
        this.supabase = supabase;
        this.tableName = 'inventory'; // CRITICAL: Match your Supabase table name exactly
    }

    // Initialize and sync from Supabase
    async initializeInventory() {
        try {
            console.log('🔄 Syncing inventory from Supabase...');

            // 1. Try loading from Supabase first
            const { data, error } = await this.supabase
                .from(this.tableName)
                .select('*')
                .order('id', { ascending: true });

            if (error) throw error;

            // 2. Convert array to object with 'box_X' keys for compatibility
            const inventory = {};
            data.forEach(item => {
                // ALWAYS use box_X format for consistency
                const key = `box_${item.id}`;
                inventory[key] = {
                    id: key,
                    dbId: item.id, // ✅ FIXED: Store database ID for updates/deletes
                    brand: item.brand,
                    type: item.type,
                    purchasePrice: parseFloat(item.purchase_price) || 0,
                    sellPrice: parseFloat(item.sell_price) || 0,
                    stock: parseInt(item.stock) || 0,
                    ordered: parseInt(item.ordered) || 0
                };
            });

            if (Object.keys(inventory).length > 0) {
                console.log(`✅ Loaded ${Object.keys(inventory).length} items from Supabase`);
                this.state.set('inventory', inventory);
                this.storage.save('inventory', inventory);
                return;
            }

        } catch (err) {
            console.warn('⚠️ Supabase sync failed, using localStorage:', err.message);
        }

        // 3. Fallback to localStorage if Supabase fails
        const localInventory = this.state.get('inventory');
        if (!localInventory || Object.keys(localInventory).length === 0) {
            console.log('📦 Initializing with default inventory');
            this.initializeDefaultInventory();
        }
    }

    initializeDefaultInventory() {
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

    getAllItems() {
        return Object.values(this.state.get('inventory') || {});
    }

    getItem(id) {
        const inventory = this.state.get('inventory');
        return inventory[id];
    }

    // ✅ FIXED: Use database ID for matching
    async updateStock(id, quantity, operation = 'set') {
        const inventory = this.state.get('inventory');
        const item = inventory[id];

        if (!item) return false;

        let newStock;
        switch(operation) {
            case 'add':
                newStock = item.stock + quantity;
                break;
            case 'subtract':
                newStock = Math.max(0, item.stock - quantity);
                break;
            case 'set':
            default:
                newStock = Math.max(0, quantity);
                break;
        }

        // Update Supabase using database ID if available
        if (item.dbId) {
            try {
                const { error } = await this.supabase
                    .from(this.tableName)
                    .update({ stock: newStock })
                    .eq('id', item.dbId); // ✅ FIXED: Match by database ID

                if (error) throw error;
                console.log(`✅ Stock updated in Supabase: ${item.brand} → ${newStock}`);
            } catch (err) {
                console.warn('⚠️ Supabase update failed, using localStorage only:', err.message);
            }
        } else {
            console.warn('⚠️ No database ID for item, skipping Supabase update:', item.brand);
        }

        // Update local state
        item.stock = newStock;
        this.storage.save('inventory', inventory);
        this.state.set('inventory', inventory);
        this.eventBus.emit('inventory:updated', item);

        return true;
    }

    // ✅ FIXED: Use database ID for matching
    async updateOrdered(id, quantity) {
        const inventory = this.state.get('inventory');
        const item = inventory[id];

        if (!item) return false;

        const newOrdered = Math.max(0, quantity);

        // Update Supabase using database ID if available
        if (item.dbId) {
            try {
                const { error } = await this.supabase
                    .from(this.tableName)
                    .update({ ordered: newOrdered })
                    .eq('id', item.dbId); // ✅ FIXED: Match by database ID

                if (error) throw error;
                console.log(`✅ Ordered updated in Supabase: ${item.brand} → ${newOrdered}`);
            } catch (err) {
                console.warn('⚠️ Supabase update failed:', err.message);
            }
        }

        // Update local state
        item.ordered = newOrdered;
        this.storage.save('inventory', inventory);
        this.state.set('inventory', inventory);
        this.eventBus.emit('inventory:updated', item);

        return true;
    }

    // ✅ FIXED: Store returned database ID
    async createItem(itemData) {
        const inventory = this.state.get('inventory');
        let newItem = {
            id: 'box_temp_' + Date.now(), // Temporary ID
            brand: itemData.brand,
            type: itemData.type,
            purchasePrice: parseFloat(itemData.purchasePrice) || 0,
            sellPrice: parseFloat(itemData.sellPrice) || 0,
            stock: parseInt(itemData.stock) || 0,
            ordered: parseInt(itemData.ordered) || 0
        };

        // Insert into Supabase
        try {
            const { data, error } = await this.supabase
                .from(this.tableName)
                .insert([{
                    brand: newItem.brand,
                    type: newItem.type,
                    purchase_price: newItem.purchasePrice,
                    sell_price: newItem.sellPrice,
                    stock: newItem.stock,
                    ordered: newItem.ordered
                }])
                .select()
                .single();

            if (error) throw error;
            console.log('✅ Item created in Supabase:', data);

            // ✅ FIXED: Use server-generated ID
            newItem.id = `box_${data.id}`;
            newItem.dbId = data.id;
        } catch (err) {
            console.warn('⚠️ Supabase insert failed, using localStorage only:', err.message);
            // Keep temporary ID if Supabase fails
        }

        // Update local state
        inventory[newItem.id] = newItem;
        this.storage.save('inventory', inventory);
        this.state.set('inventory', inventory);
        this.eventBus.emit('inventory:created', newItem);

        return newItem;
    }

    // ✅ FIXED: Use database ID for matching
    async updateItem(id, itemData) {
        const inventory = this.state.get('inventory');
        const item = inventory[id];

        if (!item) return false;

        const updates = {
            brand: itemData.brand,
            type: itemData.type,
            purchasePrice: parseFloat(itemData.purchasePrice) || 0,
            sellPrice: parseFloat(itemData.sellPrice) || 0,
            stock: parseInt(itemData.stock) || 0,
            ordered: parseInt(itemData.ordered) || 0
        };

        // Update Supabase using database ID if available
        if (item.dbId) {
            try {
                const { error } = await this.supabase
                    .from(this.tableName)
                    .update({
                        brand: updates.brand,
                        type: updates.type,
                        purchase_price: updates.purchasePrice,
                        sell_price: updates.sellPrice,
                        stock: updates.stock,
                        ordered: updates.ordered
                    })
                    .eq('id', item.dbId); // ✅ FIXED: Match by database ID

                if (error) throw error;
                console.log('✅ Item updated in Supabase:', updates.brand);
            } catch (err) {
                console.warn('⚠️ Supabase update failed:', err.message);
            }
        }

        // Update local state
        Object.assign(item, updates);
        this.storage.save('inventory', inventory);
        this.state.set('inventory', inventory);
        this.eventBus.emit('inventory:updated', item);

        return true;
    }

    // ✅ FIXED: Use database ID for matching
    async deleteItem(id) {
        const inventory = this.state.get('inventory');
        const item = inventory[id];

        if (!item) return false;

        // Delete from Supabase using database ID if available
        if (item.dbId) {
            try {
                const { error } = await this.supabase
                    .from(this.tableName)
                    .delete()
                    .eq('id', item.dbId); // ✅ FIXED: Match by database ID

                if (error) throw error;
                console.log('✅ Item deleted from Supabase:', item.brand);
            } catch (err) {
                console.warn('⚠️ Supabase delete failed:', err.message);
            }
        }

        // Update local state
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

    async useBoxForOrder(boxId, orderId) {
        const success = await this.updateStock(boxId, 1, 'subtract');
        if (success) {
            this.eventBus.emit('inventory:used', { boxId, orderId });
        }
        return success;
    }

    // ✅ FIXED: Use database ID for matching
    async receiveOrder(boxId, quantity) {
        const inventory = this.state.get('inventory');
        const item = inventory[boxId];

        if (!item) return false;

        const newStock = item.stock + quantity;
        const newOrdered = Math.max(0, item.ordered - quantity);

        // Update Supabase using database ID if available
        if (item.dbId) {
            try {
                const { error } = await this.supabase
                    .from(this.tableName)
                    .update({
                        stock: newStock,
                        ordered: newOrdered
                    })
                    .eq('id', item.dbId); // ✅ FIXED: Match by database ID

                if (error) throw error;
                console.log('✅ Order received in Supabase:', item.brand);
            } catch (err) {
                console.warn('⚠️ Supabase update failed:', err.message);
            }
        }

        // Update local state
        item.stock = newStock;
        item.ordered = newOrdered;
        this.storage.save('inventory', inventory);
        this.state.set('inventory', inventory);
        this.eventBus.emit('inventory:received', { boxId, quantity });

        return true;
    }
}