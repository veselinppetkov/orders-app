// js/modules/InventoryModule.js - FIXED getStats() method

import { CurrencyUtils } from '../utils/CurrencyUtils.js';

export class InventoryModule {
    constructor(state, storage, eventBus, supabase) {  // ✅ FIXED: Added supabase parameter
        this.state = state;
        this.storage = storage;
        this.eventBus = eventBus;
        this.supabase = supabase;  // ✅ FIXED: Use injected SupabaseService
        this.tableName = 'inventory';

        console.log('📦 InventoryModule initialized with SupabaseService');
    }

    // Load inventory from Supabase
    async initializeInventory() {
        try {
            console.log('🔄 Loading inventory from Supabase...');

            // Load from Supabase using SupabaseService method
            const inventory = await this.supabase.getInventory();

            if (Object.keys(inventory).length > 0) {
                console.log(`✅ Loaded ${Object.keys(inventory).length} items from Supabase`);
                this.state.set('inventory', inventory);
                return;
            }

            // Initialize with defaults if empty
            console.log('⚠️ No inventory found, initializing defaults');
            this.initializeDefaultInventory();

        } catch (error) {
            console.error('❌ Failed to load inventory:', error);
            throw error;
        }
    }

    initializeDefaultInventory() {
        console.log('📦 Initializing default inventory (EUR pricing)...');

        // Default inventory with EUR pricing
        const defaultInventory = {
            'box_2': { id: 'box_2', brand: 'Rolex', type: 'стандарт', purchasePrice: 17.90, sellPrice: 35.79, stock: 12, ordered: 0, currency: 'EUR' },
            'box_3': { id: 'box_3', brand: 'OMEGA', type: 'стандарт', purchasePrice: 17.90, sellPrice: 35.79, stock: 4, ordered: 0, currency: 'EUR' },
            'box_4': { id: 'box_4', brand: 'Cartier', type: 'стандарт', purchasePrice: 17.90, sellPrice: 35.79, stock: 4, ordered: 0, currency: 'EUR' },
            'box_5': { id: 'box_5', brand: 'TAG Heuer', type: 'стандарт', purchasePrice: 20.46, sellPrice: 40.91, stock: 7, ordered: 0, currency: 'EUR' },
            'box_6': { id: 'box_6', brand: 'Breitling', type: 'стандарт', purchasePrice: 25.57, sellPrice: 51.14, stock: 3, ordered: 0, currency: 'EUR' },
            'box_7': { id: 'box_7', brand: 'Patek Philippe', type: 'премиум', purchasePrice: 51.14, sellPrice: 102.27, stock: 2, ordered: 0, currency: 'EUR' },
            'box_8': { id: 'box_8', brand: 'Audemars Piguet', type: 'премиум', purchasePrice: 35.79, sellPrice: 71.59, stock: 4, ordered: 0, currency: 'EUR' },
            'box_9': { id: 'box_9', brand: 'IWC', type: 'стандарт', purchasePrice: 17.90, sellPrice: 35.79, stock: 1, ordered: 0, currency: 'EUR' },
            'box_10': { id: 'box_10', brand: 'Panerai', type: 'премиум', purchasePrice: 28.12, sellPrice: 56.25, stock: 2, ordered: 0, currency: 'EUR' },
            'box_11': { id: 'box_11', brand: 'Tudor', type: 'стандарт', purchasePrice: 17.90, sellPrice: 35.79, stock: 0, ordered: 0, currency: 'EUR' },
            'box_12': { id: 'box_12', brand: 'Vacheron Constantin', type: 'стандарт', purchasePrice: 17.90, sellPrice: 35.79, stock: 5, ordered: 0, currency: 'EUR' },
            'box_13': { id: 'box_13', brand: 'Patek Philippe', type: 'стандарт', purchasePrice: 17.90, sellPrice: 35.79, stock: 5, ordered: 0, currency: 'EUR' },
            'box_14': { id: 'box_14', brand: 'Hublot', type: 'стандарт', purchasePrice: 17.90, sellPrice: 35.79, stock: 0, ordered: 0, currency: 'EUR' },
            'box_15': { id: 'box_15', brand: 'SevenFriday', type: 'стандарт', purchasePrice: 20.46, sellPrice: 40.91, stock: 1, ordered: 0, currency: 'EUR' },
            'box_17': { id: 'box_17', brand: 'Longines', type: 'стандарт', purchasePrice: 23.01, sellPrice: 46.02, stock: 0, ordered: 0, currency: 'EUR' },
            'box_18': { id: 'box_18', brand: 'Franck Muller', type: 'премиум', purchasePrice: 28.12, sellPrice: 56.25, stock: 4, ordered: 0, currency: 'EUR' },
            'box_19': { id: 'box_19', brand: 'Hublot', type: 'премиум', purchasePrice: 25.57, sellPrice: 51.14, stock: 1, ordered: 0, currency: 'EUR' }
        };

        this.state.set('inventory', defaultInventory);
    }

    getAllItems() {
        return Object.values(this.state.get('inventory') || {});
    }

    getItem(id) {
        const inventory = this.state.get('inventory');
        return inventory[id];
    }

    // Create inventory item in Supabase
    async createItem(itemData) {
        // Validate required fields
        if (!itemData.brand?.trim()) {
            throw new Error('Brand is required');
        }

        try {
            const savedItem = await this.supabase.createInventoryItem({
                brand: itemData.brand.trim(),
                type: itemData.type || 'стандарт',
                purchasePrice: parseFloat(itemData.purchasePrice) || 0,
                sellPrice: parseFloat(itemData.sellPrice) || 0,
                stock: parseInt(itemData.stock) || 0,
                ordered: parseInt(itemData.ordered) || 0
            });

            console.log('✅ Item created in Supabase:', savedItem.brand);

            // Update local state with Supabase-generated item
            const inventory = { ...(this.state.get('inventory') || {}) };
            inventory[savedItem.id] = savedItem;
            this.state.set('inventory', inventory);
            this.eventBus.emit('inventory:created', savedItem);

            return savedItem;

        } catch (error) {
            console.error('❌ Failed to create item:', error);
            throw error;
        }
    }

    // Update inventory item in Supabase
    async updateItem(id, itemData) {
        const inventory = { ...this.state.get('inventory') };
        const item = inventory[id];

        if (!item) {
            throw new Error(`Item not found: ${id}`);
        }

        if (!item.dbId) {
            throw new Error(`Cannot update item without database ID: ${id}`);
        }

        try {
            const updatedItem = await this.supabase.updateInventoryItem(item.dbId, {
                brand: itemData.brand,
                type: itemData.type,
                purchasePrice: parseFloat(itemData.purchasePrice) || 0,
                sellPrice: parseFloat(itemData.sellPrice) || 0,
                stock: parseInt(itemData.stock) || 0,
                ordered: parseInt(itemData.ordered) || 0
            });

            console.log('✅ Item updated in Supabase:', updatedItem.brand);

            // Update local state with Supabase response
            inventory[id] = updatedItem;
            this.state.set('inventory', inventory);
            this.eventBus.emit('inventory:updated', updatedItem);

            return true;

        } catch (error) {
            console.error('❌ Failed to update item:', error);
            throw error;
        }
    }

    // Delete inventory item from Supabase
    async deleteItem(id) {
        const inventory = { ...this.state.get('inventory') };
        const item = inventory[id];

        if (!item) {
            throw new Error(`Item not found: ${id}`);
        }

        if (!item.dbId) {
            throw new Error(`Cannot delete item without database ID: ${id}`);
        }

        try {
            await this.supabase.deleteInventoryItem(item.dbId);
            console.log('✅ Item deleted from Supabase:', item.brand);

            // Update local state
            delete inventory[id];
            this.state.set('inventory', inventory);
            this.eventBus.emit('inventory:deleted', id);

            return true;

        } catch (error) {
            console.error('❌ Failed to delete item:', error);
            throw error;
        }
    }

    // Update stock in Supabase
    async updateStock(id, quantity, operation = 'set') {
        const currentInventory = this.state.get('inventory');
        const item = currentInventory[id];

        if (!item) {
            throw new Error(`Item ${id} not found in inventory`);
        }

        if (!item.dbId) {
            throw new Error(`Cannot update stock for item without database ID: ${id}`);
        }

        // Emit 'before-' event for undo/redo system
        this.eventBus.emit('inventory:before-updated', item);

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

        console.log(`📦 Updating stock for ${item.brand}: ${item.stock} → ${newStock} (${operation})`);

        try {
            const updatedItem = await this.supabase.updateInventoryItem(item.dbId, {
                brand: item.brand,
                type: item.type,
                purchasePrice: item.purchasePrice,
                sellPrice: item.sellPrice,
                stock: newStock,
                ordered: item.ordered
            });

            console.log('✅ Stock updated in Supabase:', updatedItem.brand, 'stock:', updatedItem.stock);

            // Update state
            const freshInventory = { ...this.state.get('inventory') };
            freshInventory[id] = updatedItem;
            this.state.set('inventory', freshInventory);
            this.eventBus.emit('inventory:updated', updatedItem);

            return true;

        } catch (error) {
            console.error('❌ Failed to update stock:', error);
            throw error;
        }
    }

    // Update ordered quantity in Supabase
    async updateOrdered(id, quantity) {
        const currentInventory = this.state.get('inventory');
        const item = currentInventory[id];

        if (!item) {
            throw new Error(`Item ${id} not found in inventory`);
        }

        if (!item.dbId) {
            throw new Error(`Cannot update ordered quantity for item without database ID: ${id}`);
        }

        // Emit 'before-' event for undo/redo system
        this.eventBus.emit('inventory:before-updated', item);

        const newOrdered = Math.max(0, quantity);

        console.log(`📦 Updating ordered for ${item.brand}: ${item.ordered} → ${newOrdered}`);

        try {
            const updatedItem = await this.supabase.updateInventoryItem(item.dbId, {
                brand: item.brand,
                type: item.type,
                purchasePrice: item.purchasePrice,
                sellPrice: item.sellPrice,
                stock: item.stock,
                ordered: newOrdered
            });

            console.log('✅ Ordered quantity updated in Supabase:', updatedItem.brand);

            // Update state
            const freshInventory = { ...this.state.get('inventory') };
            freshInventory[id] = updatedItem;
            this.state.set('inventory', freshInventory);
            this.eventBus.emit('inventory:updated', updatedItem);

            return true;

        } catch (error) {
            console.error('❌ Failed to update ordered quantity:', error);
            throw error;
        }
    }

    // ✅ CRITICAL FIX: Return arrays instead of counts for InventoryView compatibility
    getStats() {
        const items = this.getAllItems();

        // Calculate arrays for filtering
        const lowStockItems = items.filter(item => item.stock > 0 && item.stock <= 2);
        const outOfStockItems = items.filter(item => item.stock === 0);
        const standardItems = items.filter(item => item.type === 'стандарт');
        const premiumItems = items.filter(item => item.type === 'премиум');

        // Calculate totals
        const totalStock = items.reduce((sum, item) => sum + (item.stock || 0), 0);
        const totalOrdered = items.reduce((sum, item) => sum + (item.ordered || 0), 0);
        const totalValue = items.reduce((sum, item) => sum + (item.stock * item.purchasePrice), 0);
        const potentialRevenue = items.reduce((sum, item) => sum + (item.stock * item.sellPrice), 0);

        return {
            // Counts
            totalItems: items.length,
            totalStock,
            totalOrdered,
            totalValue,
            potentialRevenue,
            standardItems: standardItems.length,
            premiumItems: premiumItems.length,

            // ✅ FIXED: Return actual arrays, not just counts
            lowStockItems,      // Array of items with stock 1-2
            outOfStockItems,    // Array of items with stock 0

            // Legacy compatibility (keep these as numbers for backward compatibility)
            outOfStock: outOfStockItems.length,
            lowStock: lowStockItems.length
        };
    }

    searchItems(query) {
        if (!query) return this.getAllItems();

        const lowerQuery = query.toLowerCase();
        return this.getAllItems().filter(item =>
            item.brand.toLowerCase().includes(lowerQuery) ||
            item.type.toLowerCase().includes(lowerQuery)
        );
    }

    filterByType(type) {
        if (!type || type === 'all') return this.getAllItems();
        return this.getAllItems().filter(item => item.type === type);
    }
}