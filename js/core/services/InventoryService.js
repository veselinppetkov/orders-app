export class InventoryService {
    constructor(base) {
        this.base = base;
    }

    get client() { return this.base.client; }

    async getInventory() {
        return this.base.executeRequest(async () => {
            console.log('Loading inventory from Supabase');

            const { data, error } = await this.client
                .from('inventory')
                .select('*')
                .order('brand');

            if (error) throw error;

            const inventory = {};
            data.forEach(item => {
                const inventoryId = `box_${item.id}`;
                const transformed = this.transformInventoryFromDB(item);
                inventory[inventoryId] = {
                    id: inventoryId,
                    ...transformed,
                    dbId: item.id
                };
            });

            console.log(`Loaded ${Object.keys(inventory).length} inventory items`);
            return inventory;
        });
    }

    async createInventoryItem(itemData) {
        return this.base.executeRequest(async () => {
            console.log('Creating inventory item:', itemData.brand);

            const purchasePriceEUR = parseFloat(itemData.purchasePrice) || 0;
            const sellPriceEUR = parseFloat(itemData.sellPrice) || 0;

            const { data, error } = await this.client
                .from('inventory')
                .insert([{
                    brand: itemData.brand,
                    type: itemData.type || '\u0441\u0442\u0430\u043d\u0434\u0430\u0440\u0442',
                    purchase_price: 0,
                    sell_price: 0,
                    purchase_price_eur: purchasePriceEUR,
                    sell_price_eur: sellPriceEUR,
                    stock: parseInt(itemData.stock) || 0,
                    ordered: parseInt(itemData.ordered) || 0
                }])
                .select()
                .single();

            if (error) throw error;

            const inventoryId = `box_${data.id}`;
            const transformed = this.transformInventoryFromDB(data);
            return { ...transformed, id: inventoryId, dbId: data.id };
        });
    }

    async updateInventoryItem(itemId, itemData) {
        return this.base.executeRequest(async () => {
            console.log('Updating inventory item:', itemId);

            const purchasePriceEUR = parseFloat(itemData.purchasePrice) || 0;
            const sellPriceEUR = parseFloat(itemData.sellPrice) || 0;
            const updatePayload = {
                brand: itemData.brand,
                type: itemData.type || '\u0441\u0442\u0430\u043d\u0434\u0430\u0440\u0442',
                purchase_price: 0,
                sell_price: 0,
                purchase_price_eur: purchasePriceEUR,
                sell_price_eur: sellPriceEUR,
                stock: parseInt(itemData.stock) || 0,
                ordered: parseInt(itemData.ordered) || 0
            };

            const { error, count } = await this.client
                .from('inventory')
                .update(updatePayload, { count: 'exact' })
                .eq('id', itemId);

            if (error) throw error;
            if (count === 0) throw new Error(`Inventory item not found or not editable: ${itemId}`);

            const inventoryId = `box_${itemId}`;
            const transformed = this.transformInventoryFromDB({ id: itemId, ...updatePayload });
            return { ...transformed, id: inventoryId, dbId: itemId };
        });
    }

    async deleteInventoryItem(itemId) {
        return this.base.executeRequest(async () => {
            console.log('Deleting inventory item:', itemId);

            const { error } = await this.client
                .from('inventory')
                .delete()
                .eq('id', itemId);

            if (error) throw error;
            console.log('Inventory item deleted successfully');
            return true;
        });
    }

    transformInventoryFromDB(dbItem) {
        const purchasePriceEUR = parseFloat(dbItem.purchase_price_eur) || 0;
        const sellPriceEUR = parseFloat(dbItem.sell_price_eur) || 0;

        return {
            brand: dbItem.brand,
            type: dbItem.type,
            purchasePrice: purchasePriceEUR,
            sellPrice: sellPriceEUR,
            purchasePriceEUR,
            sellPriceEUR,
            stock: parseInt(dbItem.stock) || 0,
            ordered: parseInt(dbItem.ordered) || 0,
            currency: 'EUR'
        };
    }
}
