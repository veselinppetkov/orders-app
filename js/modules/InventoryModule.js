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

    // ✅ FIXED: Use SupabaseService.getInventory() method
    async initializeInventory() {
        try {
            console.log('🔄 Syncing inventory from Supabase...');

            // 1. Try loading from Supabase using SupabaseService method
            const inventory = await this.supabase.getInventory();

            if (Object.keys(inventory).length > 0) {
                console.log(`✅ Loaded ${Object.keys(inventory).length} items from Supabase`);
                this.state.set('inventory', inventory);
                this.storage.save('inventory', inventory);
                return;
            }

        } catch (err) {
            console.warn('⚠️ Supabase sync failed, using localStorage:', err.message);
        }

        // 2. Fallback to localStorage
        const localInventory = this.storage.load('inventory');
        if (localInventory && Object.keys(localInventory).length > 0) {
            console.log('✅ Loaded inventory from localStorage');
            this.state.set('inventory', localInventory);
            return;
        }

        // 3. Last resort: Initialize with defaults
        console.log('⚠️ No inventory found, initializing defaults');
        this.initializeDefaultInventory();
    }

    initializeDefaultInventory() {
        console.log('📦 Initializing default inventory (EUR pricing)...');

        // Converted to EUR using official rate: 1 EUR = 1.95583 BGN
        const defaultInventory = {
            'box_2': { id: 'box_2', brand: 'Rolex', type: 'стандарт', purchasePrice: 17.90, purchasePriceBGN: 35, sellPrice: 35.79, sellPriceBGN: 70, stock: 12, ordered: 0, currency: 'EUR' },
            'box_3': { id: 'box_3', brand: 'OMEGA', type: 'стандарт', purchasePrice: 17.90, purchasePriceBGN: 35, sellPrice: 35.79, sellPriceBGN: 70, stock: 4, ordered: 0, currency: 'EUR' },
            'box_4': { id: 'box_4', brand: 'Cartier', type: 'стандарт', purchasePrice: 17.90, purchasePriceBGN: 35, sellPrice: 35.79, sellPriceBGN: 70, stock: 4, ordered: 0, currency: 'EUR' },
            'box_5': { id: 'box_5', brand: 'TAG Heuer', type: 'стандарт', purchasePrice: 20.46, purchasePriceBGN: 40, sellPrice: 40.91, sellPriceBGN: 80, stock: 7, ordered: 0, currency: 'EUR' },
            'box_6': { id: 'box_6', brand: 'Breitling', type: 'стандарт', purchasePrice: 25.57, purchasePriceBGN: 50, sellPrice: 51.14, sellPriceBGN: 100, stock: 3, ordered: 0, currency: 'EUR' },
            'box_7': { id: 'box_7', brand: 'Patek Philippe', type: 'премиум', purchasePrice: 51.14, purchasePriceBGN: 100, sellPrice: 102.27, sellPriceBGN: 200, stock: 2, ordered: 0, currency: 'EUR' },
            'box_8': { id: 'box_8', brand: 'Audemars Piguet', type: 'премиум', purchasePrice: 35.79, purchasePriceBGN: 70, sellPrice: 71.59, sellPriceBGN: 140, stock: 4, ordered: 0, currency: 'EUR' },
            'box_9': { id: 'box_9', brand: 'IWC', type: 'стандарт', purchasePrice: 17.90, purchasePriceBGN: 35, sellPrice: 35.79, sellPriceBGN: 70, stock: 1, ordered: 0, currency: 'EUR' },
            'box_10': { id: 'box_10', brand: 'Panerai', type: 'премиум', purchasePrice: 28.12, purchasePriceBGN: 55, sellPrice: 56.25, sellPriceBGN: 110, stock: 2, ordered: 0, currency: 'EUR' },
            'box_11': { id: 'box_11', brand: 'Tudor', type: 'стандарт', purchasePrice: 17.90, purchasePriceBGN: 35, sellPrice: 35.79, sellPriceBGN: 70, stock: 0, ordered: 0, currency: 'EUR' },
            'box_12': { id: 'box_12', brand: 'Vacheron Constantin', type: 'стандарт', purchasePrice: 17.90, purchasePriceBGN: 35, sellPrice: 35.79, sellPriceBGN: 70, stock: 5, ordered: 0, currency: 'EUR' },
            'box_13': { id: 'box_13', brand: 'Patek Philippe', type: 'стандарт', purchasePrice: 17.90, purchasePriceBGN: 35, sellPrice: 35.79, sellPriceBGN: 70, stock: 5, ordered: 0, currency: 'EUR' },
            'box_14': { id: 'box_14', brand: 'Hublot', type: 'стандарт', purchasePrice: 17.90, purchasePriceBGN: 35, sellPrice: 35.79, sellPriceBGN: 70, stock: 0, ordered: 0, currency: 'EUR' },
            'box_15': { id: 'box_15', brand: 'SevenFriday', type: 'стандарт', purchasePrice: 20.46, purchasePriceBGN: 40, sellPrice: 40.91, sellPriceBGN: 80, stock: 1, ordered: 0, currency: 'EUR' },
            'box_17': { id: 'box_17', brand: 'Longines', type: 'стандарт', purchasePrice: 23.01, purchasePriceBGN: 45, sellPrice: 46.02, sellPriceBGN: 90, stock: 0, ordered: 0, currency: 'EUR' },
            'box_18': { id: 'box_18', brand: 'Franck Muller', type: 'премиум', purchasePrice: 28.12, purchasePriceBGN: 55, sellPrice: 56.25, sellPriceBGN: 110, stock: 4, ordered: 0, currency: 'EUR' },
            'box_19': { id: 'box_19', brand: 'Hublot', type: 'премиум', purchasePrice: 25.57, purchasePriceBGN: 50, sellPrice: 51.14, sellPriceBGN: 100, stock: 1, ordered: 0, currency: 'EUR' }
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

    // ✅ FIXED: Use SupabaseService.createInventoryItem()
    async createItem(itemData) {
        const inventory = { ...(this.state.get('inventory') || {}) };  // Clone to ensure state change detection

        // Validate required fields
        if (!itemData.brand?.trim()) {
            throw new Error('Brand is required');
        }

        // Try Supabase first
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
            inventory[savedItem.id] = savedItem;
            this.storage.save('inventory', inventory);
            this.state.set('inventory', inventory);
            this.eventBus.emit('inventory:created', savedItem);

            return savedItem;

        } catch (err) {
            console.warn('⚠️ Supabase failed, creating in localStorage only:', err.message);

            // Fallback: Create with temporary ID
            const tempId = `box_temp_${Date.now()}`;
            const newItem = {
                id: tempId,
                brand: itemData.brand.trim(),
                type: itemData.type || 'стандарт',
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
    }

    // ✅ FIXED: Use SupabaseService.updateInventoryItem()
    async updateItem(id, itemData) {
        const inventory = { ...this.state.get('inventory') };  // Clone to ensure state change detection
        const item = inventory[id];

        if (!item) return false;

        // Try Supabase first if we have a database ID
        if (item.dbId) {
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
                this.storage.save('inventory', inventory);
                this.state.set('inventory', inventory);
                this.eventBus.emit('inventory:updated', updatedItem);

                return true;

            } catch (err) {
                console.warn('⚠️ Supabase update failed, updating localStorage only:', err.message);
            }
        }

        // Fallback: Update localStorage only
        const updates = {
            brand: itemData.brand,
            type: itemData.type,
            purchasePrice: parseFloat(itemData.purchasePrice) || 0,
            sellPrice: parseFloat(itemData.sellPrice) || 0,
            stock: parseInt(itemData.stock) || 0,
            ordered: parseInt(itemData.ordered) || 0
        };

        Object.assign(item, updates);
        this.storage.save('inventory', inventory);
        this.state.set('inventory', inventory);
        this.eventBus.emit('inventory:updated', item);

        return true;
    }

    // ✅ FIXED: Use SupabaseService.deleteInventoryItem()
    async deleteItem(id) {
        const inventory = { ...this.state.get('inventory') };  // Clone to ensure state change detection
        const item = inventory[id];

        if (!item) return false;

        // Try Supabase first if we have a database ID
        if (item.dbId) {
            try {
                await this.supabase.deleteInventoryItem(item.dbId);
                console.log('✅ Item deleted from Supabase:', item.brand);

            } catch (err) {
                console.warn('⚠️ Supabase delete failed, removing from localStorage only:', err.message);
            }
        }

        // Update local state
        delete inventory[id];
        this.storage.save('inventory', inventory);
        this.state.set('inventory', inventory);
        this.eventBus.emit('inventory:deleted', id);

        return true;
    }

    // ✅ FIXED: Use SupabaseService.updateInventoryItem() for stock changes
    async updateStock(id, quantity, operation = 'set') {
        // Get fresh state at the start
        const currentInventory = this.state.get('inventory');
        const item = currentInventory[id];

        if (!item) {
            console.warn(`⚠️ Item ${id} not found in inventory`);
            return false;
        }

        // Emit 'before-' event for undo/redo system BEFORE making changes
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

        // Try Supabase first if we have database ID
        if (item.dbId) {
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

                // Get FRESH state after async operation to avoid overwriting concurrent changes
                const freshInventory = { ...this.state.get('inventory') };
                freshInventory[id] = updatedItem;

                // Update state and storage atomically
                this.state.set('inventory', freshInventory);
                this.storage.save('inventory', freshInventory);
                this.eventBus.emit('inventory:updated', updatedItem);

                return true;

            } catch (err) {
                console.warn('⚠️ Supabase stock update failed, updating localStorage only:', err.message);
            }
        }

        // Fallback: Update local state only (no dbId or Supabase failed)
        const updatedItem = { ...item, stock: newStock };

        // Get FRESH state to avoid overwriting concurrent changes
        const freshInventory = { ...this.state.get('inventory') };
        freshInventory[id] = updatedItem;

        // Update state and storage atomically
        this.state.set('inventory', freshInventory);
        this.storage.save('inventory', freshInventory);
        this.eventBus.emit('inventory:updated', updatedItem);

        console.log('✅ Stock updated locally:', updatedItem.brand, 'stock:', updatedItem.stock);
        return true;
    }

    // ✅ FIXED: Use SupabaseService.updateInventoryItem() for ordered changes
    async updateOrdered(id, quantity) {
        // Get fresh state at the start
        const currentInventory = this.state.get('inventory');
        const item = currentInventory[id];

        if (!item) {
            console.warn(`⚠️ Item ${id} not found in inventory`);
            return false;
        }

        // Emit 'before-' event for undo/redo system BEFORE making changes
        this.eventBus.emit('inventory:before-updated', item);

        const newOrdered = Math.max(0, quantity);

        console.log(`📦 Updating ordered for ${item.brand}: ${item.ordered} → ${newOrdered}`);

        // Try Supabase first if we have database ID
        if (item.dbId) {
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

                // Get FRESH state after async operation
                const freshInventory = { ...this.state.get('inventory') };
                freshInventory[id] = updatedItem;

                // Update state and storage atomically
                this.state.set('inventory', freshInventory);
                this.storage.save('inventory', freshInventory);
                this.eventBus.emit('inventory:updated', updatedItem);

                return true;

            } catch (err) {
                console.warn('⚠️ Supabase update failed, updating localStorage only:', err.message);
            }
        }

        // Fallback: Update local state only (no dbId or Supabase failed)
        const updatedItem = { ...item, ordered: newOrdered };

        // Get FRESH state to avoid overwriting concurrent changes
        const freshInventory = { ...this.state.get('inventory') };
        freshInventory[id] = updatedItem;

        // Update state and storage atomically
        this.state.set('inventory', freshInventory);
        this.storage.save('inventory', freshInventory);
        this.eventBus.emit('inventory:updated', updatedItem);

        console.log('✅ Ordered updated locally:', updatedItem.brand);
        return true;
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