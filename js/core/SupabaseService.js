// js/core/SupabaseService.js - FIXED: Inventory ID handling
// Key fix: Spread transformedItem FIRST, then override id with inventoryId

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { CurrencyUtils } from '../utils/CurrencyUtils.js';

export class SupabaseService {
    constructor() {
        this.supabaseUrl = 'https://aqqbeusnpbfvlgpcgsoh.supabase.co';
        this.supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxcWJldXNucGJmdmxncGNnc29oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDgxOTg4ODcsImV4cCI6MjA2Mzc3NDg4N30.8lE7lBMzBV1LUEY-TCvlvTLPT0_xE_GMahOKZ0VLtGU';
        
        this.supabase = createClient(this.supabaseUrl, this.supabaseKey);
        
        // Request management
        this.requestQueue = [];
        this.activeRequests = 0;
        this.maxConcurrentRequests = 3;
        this.retryAttempts = 3;
        this.retryDelay = 1000;
        
        // Statistics
        this.stats = {
            requestCount: 0,
            successCount: 0,
            errorCount: 0,
            totalResponseTime: 0,
            avgResponseTime: 0
        };
        
        console.log('🔌 SupabaseService initialized');
    }

    // ============================================
    // REQUEST MANAGEMENT
    // ============================================

    async executeRequest(requestFn) {
        await this.waitForSlot();
        
        this.activeRequests++;
        const startTime = performance.now();
        
        let lastError;
        
        for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
            try {
                const result = await requestFn();
                const responseTime = performance.now() - startTime;
                
                this.updateStats(true, responseTime);
                this.activeRequests--;
                this.processQueue();
                
                return result;
                
            } catch (error) {
                lastError = error;
                console.warn(`⚠️ Request attempt ${attempt} failed:`, error.message);
                
                if (attempt < this.retryAttempts && !this.isNonRetryableError(error)) {
                    await new Promise(resolve => setTimeout(resolve, this.retryDelay * attempt));
                } else {
                    this.updateStats(false, performance.now() - startTime);
                    this.activeRequests--;
                    this.processQueue();
                }
            }
        }

        throw lastError;
    }

    async waitForSlot() {
        if (this.activeRequests < this.maxConcurrentRequests) {
            return;
        }

        return new Promise((resolve) => {
            this.requestQueue.push(resolve);
        });
    }

    processQueue() {
        if (this.requestQueue.length > 0 && this.activeRequests < this.maxConcurrentRequests) {
            const next = this.requestQueue.shift();
            next();
        }
    }

    isNonRetryableError(error) {
        const nonRetryableCodes = [
            'PGRST301', // Permission denied
            'PGRST204', // Invalid JSON
            '42P01',    // Table doesn't exist
            '23505'     // Unique constraint violation
        ];

        return nonRetryableCodes.includes(error.code) ||
            error.message.includes('permission') ||
            error.message.includes('authentication');
    }

    updateStats(success, responseTime) {
        this.stats.requestCount++;

        if (success) {
            this.stats.successCount++;
            this.stats.totalResponseTime += responseTime;
            this.stats.avgResponseTime = this.stats.totalResponseTime / this.stats.successCount;
        } else {
            this.stats.errorCount++;
        }
    }

    // ============================================
    // ORDERS OPERATIONS
    // ============================================

    async createOrder(orderData) {
        return this.executeRequest(async () => {
            console.log('📝 Creating order in Supabase:', orderData.client);

            // Handle image upload first if present
            let imageUrl = null;
            if (orderData.imageData && orderData.imageData.startsWith('data:image')) {
                imageUrl = await this.uploadImage(orderData.imageData, `order-${Date.now()}`);
            }

            // System is EUR-only: normalize any legacy BGN input
            const extrasEUR = orderData.extrasEUR ? parseFloat(orderData.extrasEUR) : CurrencyUtils.convertBGNtoEUR(parseFloat(orderData.extrasBGN) || 0);
            const sellEUR = orderData.sellEUR ? parseFloat(orderData.sellEUR) : CurrencyUtils.convertBGNtoEUR(parseFloat(orderData.sellBGN) || 0);
            const extrasBGN = CurrencyUtils.convertEURtoBGN(extrasEUR);
            const sellBGN = CurrencyUtils.convertEURtoBGN(sellEUR);

            const { data, error } = await this.supabase
                .from('orders')
                .insert([{
                    date: orderData.date,
                    client: orderData.client,
                    phone: orderData.phone || '',
                    origin: orderData.origin,
                    vendor: orderData.vendor,
                    model: orderData.model,
                    cost_usd: parseFloat(orderData.costUSD) || 0,
                    shipping_usd: parseFloat(orderData.shippingUSD) || 0,
                    rate: parseFloat(orderData.rate) || 1,
                    extras_bgn: extrasBGN,
                    sell_bgn: sellBGN,
                    extras_eur: extrasEUR,
                    sell_eur: sellEUR,
                    currency: 'EUR',
                    status: orderData.status || 'Очакван',
                    full_set: orderData.fullSet || false,
                    notes: orderData.notes || '',
                    image_url: imageUrl
                }])
                .select()
                .single();

            if (error) throw error;

            const transformedOrder = await this.transformOrderFromDB(data);
            console.log('✅ Order created successfully:', transformedOrder.id);
            return transformedOrder;
        });
    }

    async getOrders(month = null) {
        return this.executeRequest(async () => {
            console.log('📂 Loading orders from Supabase, month:', month || 'all');

            let query = this.supabase
                .from('orders')
                .select('*')
                .order('date', { ascending: false });

            if (month) {
                const [year, monthNum] = month.split('-');
                const startDate = `${year}-${monthNum}-01`;
                const lastDay = new Date(parseInt(year), parseInt(monthNum), 0).getDate();
                const endDate = `${year}-${monthNum}-${lastDay.toString().padStart(2, '0')}`;

                query = query.gte('date', startDate).lte('date', endDate);
            }

            const { data, error } = await query;
            if (error) throw error;

            const transformedOrders = await Promise.all(
                data.map(order => this.transformOrderFromDB(order))
            );
            console.log(`✅ Loaded ${transformedOrders.length} orders`);
            return transformedOrders;
        });
    }

    async updateOrder(orderId, orderData) {
        return this.executeRequest(async () => {
            console.log('✏️ Updating order in Supabase:', orderId);

            let imageUrl = orderData.imageUrl;
            if (orderData.imageData && orderData.imageData.startsWith('data:image')) {
                imageUrl = await this.uploadImage(orderData.imageData, `order-${orderId}-${Date.now()}`);

                if (orderData.imageUrl && orderData.imageUrl !== imageUrl) {
                    await this.deleteImage(orderData.imageUrl);
                }
            }

            const extrasEUR = orderData.extrasEUR ? parseFloat(orderData.extrasEUR) : CurrencyUtils.convertBGNtoEUR(parseFloat(orderData.extrasBGN) || 0);
            const sellEUR = orderData.sellEUR ? parseFloat(orderData.sellEUR) : CurrencyUtils.convertBGNtoEUR(parseFloat(orderData.sellBGN) || 0);
            const extrasBGN = CurrencyUtils.convertEURtoBGN(extrasEUR);
            const sellBGN = CurrencyUtils.convertEURtoBGN(sellEUR);

            const { data, error } = await this.supabase
                .from('orders')
                .update({
                    date: orderData.date,
                    client: orderData.client,
                    phone: orderData.phone || '',
                    origin: orderData.origin,
                    vendor: orderData.vendor,
                    model: orderData.model,
                    cost_usd: parseFloat(orderData.costUSD) || 0,
                    shipping_usd: parseFloat(orderData.shippingUSD) || 0,
                    rate: parseFloat(orderData.rate) || 1,
                    extras_bgn: extrasBGN,
                    sell_bgn: sellBGN,
                    extras_eur: extrasEUR,
                    sell_eur: sellEUR,
                    currency: 'EUR',
                    status: orderData.status,
                    full_set: orderData.fullSet,
                    notes: orderData.notes || '',
                    image_url: imageUrl
                })
                .eq('id', orderId)
                .select()
                .single();

            if (error) throw error;

            const transformedOrder = await this.transformOrderFromDB(data);
            console.log('✅ Order updated successfully');
            return transformedOrder;
        });
    }

    async deleteOrder(orderId) {
        return this.executeRequest(async () => {
            console.log('🗑️ Deleting order from Supabase:', orderId);

            const { data: order } = await this.supabase
                .from('orders')
                .select('image_url')
                .eq('id', orderId)
                .single();

            const { error } = await this.supabase
                .from('orders')
                .delete()
                .eq('id', orderId);

            if (error) throw error;

            if (order?.image_url) {
                await this.deleteImage(order.image_url);
            }

            console.log('✅ Order deleted successfully');
            return true;
        });
    }

    // ============================================
    // CLIENTS OPERATIONS
    // ============================================

    async createClient(clientData) {
        return this.executeRequest(async () => {
            console.log('📝 Creating client in Supabase:', clientData.name);

            const { data, error } = await this.supabase
                .from('clients')
                .insert([{
                    name: clientData.name,
                    phone: clientData.phone || '',
                    email: clientData.email || '',
                    address: clientData.address || '',
                    preferred_source: clientData.preferredSource || '',
                    notes: clientData.notes || ''
                }])
                .select()
                .single();

            if (error) throw error;

            const transformedClient = this.transformClientFromDB(data);
            console.log('✅ Client created successfully');
            return transformedClient;
        });
    }

    async getClients() {
        return this.executeRequest(async () => {
            console.log('📂 Loading clients from Supabase');

            const { data, error } = await this.supabase
                .from('clients')
                .select('*')
                .order('name');

            if (error) throw error;

            const transformedClients = data.map(client => this.transformClientFromDB(client));
            console.log(`✅ Loaded ${transformedClients.length} clients`);
            return transformedClients;
        });
    }

    async updateClient(clientId, clientData) {
        return this.executeRequest(async () => {
            console.log('✏️ Updating client in Supabase:', clientId);

            const dbId = this.extractDbId(clientId);

            const { data, error } = await this.supabase
                .from('clients')
                .update({
                    name: clientData.name,
                    phone: clientData.phone || '',
                    email: clientData.email || '',
                    address: clientData.address || '',
                    preferred_source: clientData.preferredSource || '',
                    notes: clientData.notes || ''
                })
                .eq('id', dbId)
                .select()
                .single();

            if (error) throw error;

            const transformedClient = this.transformClientFromDB(data);
            console.log('✅ Client updated successfully');
            return transformedClient;
        });
    }

    async deleteClient(clientId) {
        return this.executeRequest(async () => {
            const dbId = this.extractDbId(clientId);

            const { error } = await this.supabase
                .from('clients')
                .delete()
                .eq('id', dbId);

            if (error) throw error;

            console.log('✅ Client deleted successfully');
            return true;
        });
    }

    // ============================================
    // SETTINGS OPERATIONS
    // ============================================

    async getSettings() {
        return this.executeRequest(async () => {
            console.log('⚙️ Loading settings from Supabase');

            const { data, error } = await this.supabase
                .from('settings')
                .select('data')
                .eq('id', 1)
                .single();

            if (error && error.code !== 'PGRST116') {
                throw error;
            }

            const settings = data?.data || this.getDefaultSettings();
            settings.source = 'supabase';

            console.log('✅ Settings loaded from Supabase');
            return settings;
        });
    }

    async saveSettings(settings) {
        return this.executeRequest(async () => {
            console.log('💾 Saving settings to Supabase');

            const { data, error } = await this.supabase
                .from('settings')
                .upsert({ id: 1, data: settings })
                .select()
                .single();

            if (error) throw error;

            console.log('✅ Settings saved to Supabase');
            return data.data;
        });
    }

    getDefaultSettings() {
        return {
            usdRate: 1.71,
            eurRate: 0.92,
            factoryShipping: 1.5,
            baseCurrency: 'EUR',
            conversionRate: 1.95583,
            origins: ['OLX', 'Bazar.bg', 'Instagram', 'WhatsApp', 'IG Ads', 'Facebook', 'OLX Romania', 'Viber'],
            vendors: ['Доставчик 1', 'Доставчик 2', 'Доставчик 3', 'AliExpress', 'Local Supplier', 'China Direct']
        };
    }

    // ============================================
    // EXPENSES OPERATIONS
    // ============================================

    async createExpense(expenseData) {
        return this.executeRequest(async () => {
            console.log('💰 Creating expense in Supabase:', expenseData.category || expenseData.name);

            const amountEUR = parseFloat(expenseData.amount) || 0;
            const amountBGN = CurrencyUtils.convertEURtoBGN(amountEUR);

            const { data, error } = await this.supabase
                .from('expenses')
                .insert([{
                    month_key: expenseData.month,
                    name: expenseData.category || expenseData.name,
                    amount: amountBGN,
                    amount_eur: amountEUR,
                    currency: 'EUR',
                    note: expenseData.description || expenseData.note || ''
                }])
                .select()
                .single();

            if (error) throw error;

            return this.transformExpenseFromDB(data);
        });
    }

    async getExpenses(month = null) {
        return this.executeRequest(async () => {
            console.log('💰 Loading expenses from Supabase', month ? `for ${month}` : '(all)');

            let query = this.supabase
                .from('expenses')
                .select('*')
                .order('created_at', { ascending: false });

            if (month) {
                query = query.eq('month_key', month);
            }

            const { data, error } = await query;
            if (error) throw error;

            return data.map(exp => {
                const amountBGN = parseFloat(exp.amount) || 0;
                const amountEUR = exp.amount_eur
                    ? parseFloat(exp.amount_eur)
                    : parseFloat((amountBGN / 1.95583).toFixed(2));

                return {
                    id: exp.id,
                    month: exp.month_key,
                    name: exp.name || 'Без име',
                    category: exp.name || 'Без име',
                    amount: amountEUR,
                    amountEUR: amountEUR,
                    amountBGN: amountBGN,
                    description: exp.note || '',
                    note: exp.note || '',
                    currency: exp.currency || 'EUR'
                };
            });
        });
    }

    async updateExpense(expenseId, expenseData) {
        return this.executeRequest(async () => {
            console.log('💰 Updating expense in Supabase:', expenseId);

            const amountEUR = parseFloat(expenseData.amount) || 0;
            const amountBGN = CurrencyUtils.convertEURtoBGN(amountEUR);

            const { data, error } = await this.supabase
                .from('expenses')
                .update({
                    name: expenseData.category || expenseData.name,
                    amount: amountBGN,
                    amount_eur: amountEUR,
                    currency: 'EUR',
                    note: expenseData.description || expenseData.note || ''
                })
                .eq('id', expenseId)
                .select()
                .single();

            if (error) throw error;

            return this.transformExpenseFromDB(data);
        });
    }

    async deleteExpense(expenseId) {
        return this.executeRequest(async () => {
            console.log('🗑️ Deleting expense:', expenseId);

            const { error } = await this.supabase
                .from('expenses')
                .delete()
                .eq('id', expenseId);

            if (error) throw error;

            console.log('✅ Expense deleted successfully');
            return true;
        });
    }

    // ============================================
    // INVENTORY OPERATIONS - ✅ FIXED ID HANDLING
    // ============================================

    async getInventory() {
        return this.executeRequest(async () => {
            console.log('📦 Loading inventory from Supabase');

            const { data, error } = await this.supabase
                .from('inventory')
                .select('*')
                .order('brand');

            if (error) throw error;

            const inventory = {};
            data.forEach(item => {
                const inventoryId = `box_${item.id}`;
                const transformedItem = this.transformInventoryFromDB(item);
                
                // ✅ FIX: Spread transformedItem FIRST, then override id
                inventory[inventoryId] = {
                    ...transformedItem,     // Spread first (contains id: 8)
                    id: inventoryId,        // Override with correct format
                    dbId: item.id           // Keep DB ID for updates
                };
            });

            console.log(`✅ Loaded ${Object.keys(inventory).length} inventory items`);
            return inventory;
        });
    }

    async createInventoryItem(itemData) {
        return this.executeRequest(async () => {
            console.log('📦 Creating inventory item:', itemData.brand);

            const purchasePriceEUR = parseFloat(itemData.purchasePrice) || 0;
            const sellPriceEUR = parseFloat(itemData.sellPrice) || 0;
            const purchasePriceBGN = CurrencyUtils.convertEURtoBGN(purchasePriceEUR);
            const sellPriceBGN = CurrencyUtils.convertEURtoBGN(sellPriceEUR);

            const { data, error } = await this.supabase
                .from('inventory')
                .insert([{
                    brand: itemData.brand,
                    type: itemData.type || 'стандарт',
                    purchase_price: purchasePriceBGN,
                    sell_price: sellPriceBGN,
                    purchase_price_eur: purchasePriceEUR,
                    sell_price_eur: sellPriceEUR,
                    stock: parseInt(itemData.stock) || 0,
                    ordered: parseInt(itemData.ordered) || 0,
                    currency: 'EUR'
                }])
                .select()
                .single();

            if (error) throw error;

            const inventoryId = `box_${data.id}`;
            const transformedItem = this.transformInventoryFromDB(data);
            
            // ✅ FIX: Spread transformedItem FIRST, then override id
            return {
                ...transformedItem,     // Spread first
                id: inventoryId,        // Override with correct format
                dbId: data.id           // Keep DB ID for updates
            };
        });
    }

    async updateInventoryItem(itemId, itemData) {
        return this.executeRequest(async () => {
            console.log('📦 Updating inventory item:', itemId);

            const purchasePriceEUR = parseFloat(itemData.purchasePrice) || 0;
            const sellPriceEUR = parseFloat(itemData.sellPrice) || 0;
            const purchasePriceBGN = CurrencyUtils.convertEURtoBGN(purchasePriceEUR);
            const sellPriceBGN = CurrencyUtils.convertEURtoBGN(sellPriceEUR);

            const { data, error } = await this.supabase
                .from('inventory')
                .update({
                    brand: itemData.brand,
                    type: itemData.type || 'стандарт',
                    purchase_price: purchasePriceBGN,
                    sell_price: sellPriceBGN,
                    purchase_price_eur: purchasePriceEUR,
                    sell_price_eur: sellPriceEUR,
                    stock: parseInt(itemData.stock) || 0,
                    ordered: parseInt(itemData.ordered) || 0,
                    currency: 'EUR'
                })
                .eq('id', itemId)
                .select()
                .single();

            if (error) throw error;

            const inventoryId = `box_${data.id}`;
            const transformedItem = this.transformInventoryFromDB(data);
            
            // ✅ FIX: Spread transformedItem FIRST, then override id
            return {
                ...transformedItem,     // Spread first
                id: inventoryId,        // Override with correct format
                dbId: data.id           // Keep DB ID for updates
            };
        });
    }

    async deleteInventoryItem(itemId) {
        return this.executeRequest(async () => {
            console.log('🗑️ Deleting inventory item:', itemId);

            const { error } = await this.supabase
                .from('inventory')
                .delete()
                .eq('id', itemId);

            if (error) throw error;

            console.log('✅ Inventory item deleted successfully');
            return true;
        });
    }

    // ============================================
    // IMAGE OPERATIONS
    // ============================================

    async uploadImage(base64Data, fileName) {
        try {
            const base64Content = base64Data.split(',')[1];
            const mimeType = base64Data.match(/data:(.*?);base64/)?.[1] || 'image/jpeg';
            const extension = mimeType.split('/')[1] || 'jpg';
            
            const byteCharacters = atob(base64Content);
            const byteArray = new Uint8Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteArray[i] = byteCharacters.charCodeAt(i);
            }
            const blob = new Blob([byteArray], { type: mimeType });

            const filePath = `orders/${fileName}.${extension}`;

            const { data, error } = await this.supabase.storage
                .from('order-images')
                .upload(filePath, blob, {
                    contentType: mimeType,
                    upsert: true
                });

            if (error) throw error;

            console.log('✅ Image uploaded:', filePath);
            return filePath;

        } catch (error) {
            console.error('❌ Image upload failed:', error);
            throw error;
        }
    }

    async getImageUrl(imagePath) {
        if (!imagePath) return null;

        try {
            const { data, error } = await this.supabase.storage
                .from('order-images')
                .createSignedUrl(imagePath, 3600);

            if (error) throw error;

            return data.signedUrl;
        } catch (error) {
            console.warn('⚠️ Failed to get signed URL:', error.message);
            return null;
        }
    }

    async deleteImage(imagePath) {
        if (!imagePath) return;

        try {
            const { error } = await this.supabase.storage
                .from('order-images')
                .remove([imagePath]);

            if (error) throw error;

            console.log('✅ Image deleted:', imagePath);
        } catch (error) {
            console.warn('⚠️ Failed to delete image:', error.message);
        }
    }

    // ============================================
    // TRANSFORMERS
    // ============================================

    async transformOrderFromDB(dbOrder) {
        const costUSD = parseFloat(dbOrder.cost_usd) || 0;
        const shippingUSD = parseFloat(dbOrder.shipping_usd) || 0;
        const rate = parseFloat(dbOrder.rate) || 1;

        // EUR fields (primary)
        const extrasEUR = dbOrder.extras_eur 
            ? parseFloat(dbOrder.extras_eur) 
            : CurrencyUtils.convertBGNtoEUR(parseFloat(dbOrder.extras_bgn) || 0);
        const sellEUR = dbOrder.sell_eur 
            ? parseFloat(dbOrder.sell_eur) 
            : CurrencyUtils.convertBGNtoEUR(parseFloat(dbOrder.sell_bgn) || 0);

        // BGN fields (for backward compatibility)
        const extrasBGN = dbOrder.extras_bgn 
            ? parseFloat(dbOrder.extras_bgn) 
            : CurrencyUtils.convertEURtoBGN(extrasEUR);
        const sellBGN = dbOrder.sell_bgn 
            ? parseFloat(dbOrder.sell_bgn) 
            : CurrencyUtils.convertEURtoBGN(sellEUR);

        // Calculate totals in EUR
        const baseEUR = (costUSD + shippingUSD) * rate;
        const totalEUR = baseEUR + extrasEUR;
        const balanceEUR = sellEUR - totalEUR;

        // BGN totals for backward compatibility
        const totalBGN = CurrencyUtils.convertEURtoBGN(totalEUR);
        const balanceBGN = CurrencyUtils.convertEURtoBGN(balanceEUR);

        // Generate signed URL for image
        const imageUrl = await this.getImageUrl(dbOrder.image_url);

        return {
            id: dbOrder.id,
            date: dbOrder.date,
            client: dbOrder.client,
            phone: dbOrder.phone || '',
            origin: dbOrder.origin,
            vendor: dbOrder.vendor,
            model: dbOrder.model,
            costUSD: costUSD,
            shippingUSD: shippingUSD,
            rate: rate,
            // BGN fields (legacy)
            extrasBGN: parseFloat(extrasBGN.toFixed(2)),
            sellBGN: parseFloat(sellBGN.toFixed(2)),
            totalBGN: parseFloat(totalBGN.toFixed(2)),
            balanceBGN: parseFloat(balanceBGN.toFixed(2)),
            // EUR fields (primary)
            extrasEUR: parseFloat(extrasEUR.toFixed(2)),
            sellEUR: parseFloat(sellEUR.toFixed(2)),
            totalEUR: parseFloat(totalEUR.toFixed(2)),
            balanceEUR: parseFloat(balanceEUR.toFixed(2)),
            // Metadata
            currency: 'EUR',
            status: dbOrder.status,
            fullSet: dbOrder.full_set,
            notes: dbOrder.notes || '',
            imageData: imageUrl,
            imageUrl: imageUrl,
            imagePath: dbOrder.image_url
        };
    }

    transformClientFromDB(dbClient) {
        return {
            id: 'client_' + dbClient.id,
            name: dbClient.name,
            phone: dbClient.phone || '',
            email: dbClient.email || '',
            address: dbClient.address || '',
            preferredSource: dbClient.preferred_source || '',
            notes: dbClient.notes || '',
            dbId: dbClient.id
        };
    }

    transformExpenseFromDB(dbExpense) {
        const amountBGN = parseFloat(dbExpense.amount) || 0;
        const amountEUR = dbExpense.amount_eur
            ? parseFloat(dbExpense.amount_eur)
            : CurrencyUtils.convertBGNtoEUR(amountBGN);

        if (amountBGN > 50 && Math.abs(amountEUR - amountBGN) < 1) {
            console.warn(`⚠️ Expense ${dbExpense.id} has unconverted EUR value: ${amountEUR} EUR ≈ ${amountBGN} BGN`);
        }

        return {
            id: dbExpense.id,
            month: dbExpense.month_key,
            category: dbExpense.name || 'Без име',
            name: dbExpense.name || 'Без име',
            amount: amountEUR,
            amountBGN: amountBGN,
            amountEUR: amountEUR,
            description: dbExpense.note || '',
            note: dbExpense.note || '',
            isDefault: dbExpense.is_default || false,
            currency: dbExpense.currency || 'EUR'
        };
    }

    transformInventoryFromDB(dbItem) {
        const purchasePriceBGN = parseFloat(dbItem.purchase_price) || 0;
        const sellPriceBGN = parseFloat(dbItem.sell_price) || 0;

        const purchasePriceEUR = dbItem.purchase_price_eur
            ? parseFloat(dbItem.purchase_price_eur)
            : CurrencyUtils.convertBGNtoEUR(purchasePriceBGN);
        const sellPriceEUR = dbItem.sell_price_eur
            ? parseFloat(dbItem.sell_price_eur)
            : CurrencyUtils.convertBGNtoEUR(sellPriceBGN);

        return {
            id: dbItem.id,  // Note: This gets overridden in getInventory/create/update
            brand: dbItem.brand,
            type: dbItem.type || 'стандарт',
            purchasePrice: purchasePriceEUR,
            purchasePriceBGN: purchasePriceBGN,
            purchasePriceEUR: purchasePriceEUR,
            sellPrice: sellPriceEUR,
            sellPriceBGN: sellPriceBGN,
            sellPriceEUR: sellPriceEUR,
            stock: parseInt(dbItem.stock) || 0,
            ordered: parseInt(dbItem.ordered) || 0,
            currency: dbItem.currency || 'EUR'
        };
    }

    // ============================================
    // UTILITIES
    // ============================================

    extractDbId(prefixedId) {
        if (typeof prefixedId === 'number') return prefixedId;
        if (typeof prefixedId === 'string') {
            const match = prefixedId.match(/_(\d+)$/);
            return match ? parseInt(match[1]) : parseInt(prefixedId);
        }
        return prefixedId;
    }

    getStats() {
        return { ...this.stats };
    }
}
