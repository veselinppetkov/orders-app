import {Config} from "../config.js";
import {CurrencyUtils} from "../utils/CurrencyUtils.js";

export class SupabaseService {
    constructor() {
        // Configuration - Replace with your actual values
        this.config = {
            url: Config.SUPABASE_URL,
            anonKey: Config.SUPABASE_ANON_KEY,
            bucket: 'order-images'
        };

        // Connection state
        this.isConnected = false;
        this.connectionTested = false;
        this.lastConnectionTest = 0;
        this.connectionTestInterval = 5 * 60 * 1000; // Test every 5 minutes

        // Retry configuration
        this.retryConfig = {
            maxRetries: 3,
            baseDelay: 1000,
            maxDelay: 10000,
            backoffFactor: 2
        };

        // Rate limiting
        this.requestQueue = [];
        this.activeRequests = 0;
        this.maxConcurrentRequests = 5;

        // Statistics
        this.stats = {
            requestCount: 0,
            successCount: 0,
            errorCount: 0,
            totalResponseTime: 0,
            avgResponseTime: 0
        };

        this.isAuthenticated = false;

        this.initialize();

    }

    async initialize() {
        try {
            // Initialize Supabase client
            if (typeof supabase === 'undefined') {
                console.warn('⚠️ Supabase client not loaded - cloud features disabled');
                return;
            }

            this.supabase = supabase.createClient(this.config.url, this.config.anonKey);

            console.log('🚀 SupabaseService initialized');

            // Check authentication status
            await this.checkAuth();

            // Listen for auth changes
            this.supabase.auth.onAuthStateChange((event, session) => {
                console.log('🔐 Auth state changed:', event);

                if (event === 'SIGNED_OUT') {
                    // Redirect to login
                    window.location.href = 'login.html';
                }

                if (event === 'SIGNED_IN') {
                    this.isAuthenticated = true;
                    console.log('✅ User authenticated');
                }
            });

            // Test connection in background
            this.testConnectionAsync();

        } catch (error) {
            console.error('❌ SupabaseService initialization failed:', error);
        }
    }

    async checkAuth() {
        const { data: { session } } = await this.supabase.auth.getSession();

        if (!session) {
            console.warn('⚠️ No active session - redirecting to login');
            window.location.href = 'login.html';
            return false;
        }

        this.isAuthenticated = true;
        console.log('✅ User is authenticated:', session.user.email);
        return true;
    }

    async signOut() {
        await this.supabase.auth.signOut();
        window.location.href = 'login.html';
    }

    getCurrentUser() {
        return this.supabase.auth.getUser();
    }

    // CONNECTION MANAGEMENT
    async testConnection() {
        const now = Date.now();

        // Use cached result if recent
        if (this.connectionTested && (now - this.lastConnectionTest) < this.connectionTestInterval) {
            return this.isConnected;
        }

        try {
            if (!this.supabase) {
                throw new Error('Supabase client not initialized');
            }

            const startTime = performance.now();

            // Simple connection test
            const { data, error } = await this.supabase
                .from('settings')
                .select('id')
                .limit(1);

            const responseTime = performance.now() - startTime;

            if (error && error.code !== 'PGRST116') { // PGRST116 = no rows, which is OK
                throw error;
            }

            this.isConnected = true;
            this.connectionTested = true;
            this.lastConnectionTest = now;

            console.log(`✅ Supabase connection test passed (${responseTime.toFixed(0)}ms)`);
            return true;

        } catch (error) {
            this.isConnected = false;
            this.connectionTested = true;
            this.lastConnectionTest = now;

            console.warn('⚠️ Supabase connection test failed:', error.message);
            return false;
        }
    }

    async testConnectionAsync() {
        // Non-blocking connection test
        setTimeout(async () => {
            await this.testConnection();
        }, 1000);
    }

    // REQUEST EXECUTION with retry logic
    async executeRequest(operation, maxRetries = this.retryConfig.maxRetries) {
        let lastError;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                // Rate limiting
                await this.waitForSlot();

                const startTime = performance.now();
                this.activeRequests++;

                // Execute the operation
                const result = await operation();

                // Update statistics
                const responseTime = performance.now() - startTime;
                this.updateStats(true, responseTime);

                return result;

            } catch (error) {
                lastError = error;

                // Update statistics
                this.updateStats(false, 0);

                // Don't retry on certain errors
                if (this.isNonRetryableError(error)) {
                    throw error;
                }

                // Wait before retry (exponential backoff)
                if (attempt < maxRetries) {
                    const delay = Math.min(
                        this.retryConfig.baseDelay * Math.pow(this.retryConfig.backoffFactor, attempt),
                        this.retryConfig.maxDelay
                    );

                    console.warn(`⚠️ Request failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms:`, error.message);
                    await this.sleep(delay);
                }

            } finally {
                this.activeRequests--;
                this.processQueue();
            }
        }

        throw lastError;
    }

    async waitForSlot() {
        if (this.activeRequests < this.maxConcurrentRequests) {
            return;
        }

        // Add to queue and wait
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
        // Don't retry on authentication, permission, or validation errors
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

    // ORDERS OPERATIONS
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

            // Apply month filter if specified
            if (month) {
                const [year, monthNum] = month.split('-');
                const startDate = `${year}-${monthNum}-01`;

                // Calculate last day of month
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

            // Handle image update
            let imageUrl = orderData.imageUrl; // Keep existing
            if (orderData.imageData && orderData.imageData.startsWith('data:image')) {
                // Upload new image
                imageUrl = await this.uploadImage(orderData.imageData, `order-${orderId}-${Date.now()}`);

                // Clean up old image if different
                if (orderData.imageUrl && orderData.imageUrl !== imageUrl) {
                    await this.deleteImage(orderData.imageUrl);
                }
            }

            // System is EUR-only: normalize any legacy BGN input
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

            // Get order to delete associated image
            const { data: order } = await this.supabase
                .from('orders')
                .select('image_url')
                .eq('id', orderId)
                .single();

            // Delete the order record
            const { error } = await this.supabase
                .from('orders')
                .delete()
                .eq('id', orderId);

            if (error) throw error;

            // Delete associated image if exists
            if (order?.image_url) {
                await this.deleteImage(order.image_url);
            }

            console.log('✅ Order deleted successfully');
            return true;
        });
    }

    // CLIENTS OPERATIONS
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

    // SETTINGS OPERATIONS
    async getSettings() {
        return this.executeRequest(async () => {
            console.log('⚙️ Loading settings from Supabase');

            const { data, error } = await this.supabase
                .from('settings')
                .select('data')
                .eq('id', 1)
                .single();

            if (error && error.code !== 'PGRST116') { // PGRST116 = no rows
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

    // Add to SupabaseService class

// ============================================
// EXPENSES - Matching YOUR schema
// ============================================

// In SupabaseService.js, update these methods:

    async createExpense(expenseData) {
        return this.executeRequest(async () => {
            console.log('💰 Creating expense in Supabase:', expenseData.category || expenseData.name);

            // Incoming amount is now in EUR (from UI)
            const amountEUR = parseFloat(expenseData.amount) || 0;

            // Convert to BGN for backward compatibility
            const amountBGN = CurrencyUtils.convertEURtoBGN(amountEUR);

            const { data, error } = await this.supabase
                .from('expenses')
                .insert([{
                    month_key: expenseData.month,
                    name: expenseData.category || expenseData.name,
                    amount: amountBGN,  // Store BGN for backward compatibility
                    amount_eur: amountEUR,  // Store EUR as primary
                    currency: 'EUR',
                    note: expenseData.description || expenseData.note || ''
                }])
                .select()
                .single();

            if (error) throw error;

            // Return transformed data
            return this.transformExpenseFromDB(data);
        });
    }

    async getExpenses(month = null) {
        return this.executeRequest(async () => {
            console.log('📂 Loading expenses from Supabase', month ? `for ${month}` : '(all)');

            let query = this.supabase
                .from('expenses')
                .select('*')
                .order('created_at', { ascending: false });

            if (month) {
                query = query.eq('month_key', month);
            }

            const { data, error } = await query;
            if (error) throw error;

            // Transform using the EUR field (use transformExpenseFromDB for consistency)
            return data.map(exp => this.transformExpenseFromDB(exp));
        });
    }

    async updateExpense(expenseId, expenseData) {
        return this.executeRequest(async () => {
            console.log('✏️ Updating expense:', expenseId);

            // Convert EUR to BGN for storage (backward compatibility)
            const amountEUR = parseFloat(expenseData.amount) || 0;
            const amountBGN = CurrencyUtils.convertEURtoBGN(amountEUR);

            const { data, error } = await this.supabase
                .from('expenses')
                .update({
                    name: expenseData.category || expenseData.name,
                    amount: amountBGN,  // Store BGN for backward compatibility
                    amount_eur: amountEUR,  // Store EUR as primary
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
            return true;
        });
    }

// ============================================
// INVENTORY - Matching YOUR schema
// ============================================

    async getInventory() {
        return this.executeRequest(async () => {
            console.log('📦 Loading inventory from Supabase');

            const { data, error } = await this.supabase
                .from('inventory')
                .select('*')
                .order('brand');

            if (error) throw error;

            // Convert to object format for compatibility
            // Your app expects: { "box_123": {...}, "box_456": {...} }
            // We'll use "box_" + database ID as the key
            const inventory = {};
            data.forEach(item => {
                const inventoryId = `box_${item.id}`; // Create compatible ID
                const transformedItem = this.transformInventoryFromDB(item);
                inventory[inventoryId] = {
                    id: inventoryId,
                    ...transformedItem,
                    dbId: item.id  // Keep real DB ID for updates
                };
            });

            console.log(`✅ Loaded ${Object.keys(inventory).length} inventory items`);
            return inventory;
        });
    }

    async createInventoryItem(itemData) {
        return this.executeRequest(async () => {
            console.log('📦 Creating inventory item:', itemData.brand);

            // Incoming prices are in EUR (from UI)
            const purchasePriceEUR = parseFloat(itemData.purchasePrice) || 0;
            const sellPriceEUR = parseFloat(itemData.sellPrice) || 0;

            // Convert to BGN for backward compatibility
            const purchasePriceBGN = CurrencyUtils.convertEURtoBGN(purchasePriceEUR);
            const sellPriceBGN = CurrencyUtils.convertEURtoBGN(sellPriceEUR);

            // Don't send ID - let database auto-generate it
            const { data, error } = await this.supabase
                .from('inventory')
                .insert([{
                    brand: itemData.brand,
                    type: itemData.type || 'стандарт',
                    purchase_price: purchasePriceBGN,  // Store BGN for backward compatibility
                    sell_price: sellPriceBGN,  // Store BGN for backward compatibility
                    purchase_price_eur: purchasePriceEUR,  // Store EUR as primary
                    sell_price_eur: sellPriceEUR,  // Store EUR as primary
                    stock: parseInt(itemData.stock) || 0,
                    ordered: parseInt(itemData.ordered) || 0,
                    currency: 'EUR'
                }])
                .select()
                .single();

            if (error) throw error;

            // Return with compatible ID format and transformed data
            const inventoryId = `box_${data.id}`;
            const transformedItem = this.transformInventoryFromDB(data);
            return {
                id: inventoryId,
                ...transformedItem,
                dbId: data.id
            };
        });
    }

  async updateInventoryItem(itemId, itemData) {
        return this.executeRequest(async () => {
            console.log('📦 Updating inventory item:', itemId);

            // Incoming prices are in EUR (from UI)
            const purchasePriceEUR = parseFloat(itemData.purchasePrice) || 0;
            const sellPriceEUR = parseFloat(itemData.sellPrice) || 0;

            // Convert to BGN for backward compatibility
            const purchasePriceBGN = CurrencyUtils.convertEURtoBGN(purchasePriceEUR);
            const sellPriceBGN = CurrencyUtils.convertEURtoBGN(sellPriceEUR);

            const { data, error } = await this.supabase
                .from('inventory')
                .update({
                    brand: itemData.brand,
                    type: itemData.type || 'стандарт',
                    purchase_price: purchasePriceBGN,  // Store BGN for backward compatibility
                    sell_price: sellPriceBGN,  // Store BGN for backward compatibility
                    purchase_price_eur: purchasePriceEUR,  // Store EUR as primary
                    sell_price_eur: sellPriceEUR,  // Store EUR as primary
                    stock: parseInt(itemData.stock) || 0,
                    ordered: parseInt(itemData.ordered) || 0,
                    currency: 'EUR'
                })
                .eq('id', itemId)
                .select()
                .single();

            if (error) throw error;

            // Return with compatible ID format and transformed data
            const inventoryId = `box_${data.id}`;
            const transformedItem = this.transformInventoryFromDB(data);
            return {
                id: inventoryId,
                ...transformedItem,
                dbId: data.id
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

// TRANSFORMERS
    transformExpenseFromDB(dbExpense) {
        // Use EUR field if available, otherwise convert from BGN
        const amountBGN = parseFloat(dbExpense.amount) || 0;
        const amountEUR = dbExpense.amount_eur
            ? parseFloat(dbExpense.amount_eur)
            : CurrencyUtils.convertBGNtoEUR(amountBGN);

        // Validate: Check if EUR value is suspiciously close to BGN (no conversion)
        if (amountBGN > 50 && Math.abs(amountEUR - amountBGN) < 1) {
            console.warn(`⚠️ Expense ${dbExpense.id} has unconverted EUR value: ${amountEUR} EUR ≈ ${amountBGN} BGN`);
        }

        return {
            id: dbExpense.id,
            month: dbExpense.month,
            category: dbExpense.category,
            amount: amountEUR,  // Always use EUR
            amountBGN: amountBGN,  // Keep BGN for reference
            amountEUR: amountEUR,  // Explicit EUR field
            description: dbExpense.description || '',
            isDefault: dbExpense.is_default || false,
            currency: dbExpense.currency || 'BGN'
        };
    }

    transformInventoryFromDB(dbItem) {
        // Use EUR fields if available, otherwise convert from BGN
        const purchasePriceBGN = parseFloat(dbItem.purchase_price) || 0;
        const sellPriceBGN = parseFloat(dbItem.sell_price) || 0;

        const purchasePriceEUR = dbItem.purchase_price_eur
            ? parseFloat(dbItem.purchase_price_eur)
            : CurrencyUtils.convertBGNtoEUR(purchasePriceBGN);

        const sellPriceEUR = dbItem.sell_price_eur
            ? parseFloat(dbItem.sell_price_eur)
            : CurrencyUtils.convertBGNtoEUR(sellPriceBGN);

        // Validate: Check if EUR values are suspiciously close to BGN (no conversion)
        if (purchasePriceBGN > 10 && Math.abs(purchasePriceEUR - purchasePriceBGN) < 1) {
            console.warn(`⚠️ Inventory ${dbItem.id} (${dbItem.brand}) has unconverted purchase price: ${purchasePriceEUR} EUR ≈ ${purchasePriceBGN} BGN`);
        }
        if (sellPriceBGN > 10 && Math.abs(sellPriceEUR - sellPriceBGN) < 1) {
            console.warn(`⚠️ Inventory ${dbItem.id} (${dbItem.brand}) has unconverted sell price: ${sellPriceEUR} EUR ≈ ${sellPriceBGN} BGN`);
        }

        return {
            id: dbItem.id,
            brand: dbItem.brand,
            type: dbItem.type,
            purchasePrice: purchasePriceEUR,  // Always use EUR
            sellPrice: sellPriceEUR,  // Always use EUR
            purchasePriceBGN: purchasePriceBGN,  // Keep BGN for reference
            sellPriceBGN: sellPriceBGN,  // Keep BGN for reference
            purchasePriceEUR: purchasePriceEUR,  // Explicit EUR field
            sellPriceEUR: sellPriceEUR,  // Explicit EUR field
            stock: parseInt(dbItem.stock) || 0,
            ordered: parseInt(dbItem.ordered) || 0,
            currency: dbItem.currency || 'BGN'
        };
    }

    // IMAGE OPERATIONS
    async uploadImage(base64Data, filename) {
        return this.executeRequest(async () => {
            console.log('📤 Uploading image:', filename);

            // Convert base64 to blob
            const response = await fetch(base64Data);
            const blob = await response.blob();

            // Create unique filename
            const extension = blob.type.split('/')[1] || 'jpg';
            const filePath = `${filename}.${extension}`;

            const { data, error } = await this.supabase.storage
                .from(this.config.bucket)
                .upload(filePath, blob, {
                    cacheControl: '3600',
                    upsert: true
                });

            if (error) throw error;

            console.log('✅ Image uploaded successfully:', filePath);
            return filePath;  // Return path, not URL
        });
    }

    async getImageUrl(imagePath) {
        if (!imagePath) return null;

        try {
            // If it's already a full URL (legacy data), return as-is
            if (imagePath.startsWith('http')) {
                return imagePath;
            }

            // Generate a signed URL valid for 1 hour
            const { data, error } = await this.supabase.storage
                .from(this.config.bucket)
                .createSignedUrl(imagePath, 3600);

            if (error) {
                console.warn('⚠️ Cannot generate signed URL for:', imagePath, error);
                return null;
            }

            console.log('🔗 Generated signed URL for image');
            return data.signedUrl;
        } catch (error) {
            console.error('❌ Error in getImageUrl:', error);
            return null;
        }
    }

    async deleteImage(imageUrl) {
        if (!imageUrl || !imageUrl.includes(this.config.bucket)) {
            return; // Not our image
        }

        try {
            // Extract filename from URL
            const urlParts = imageUrl.split('/');
            const filename = urlParts[urlParts.length - 1];

            const { error } = await this.supabase.storage
                .from(this.config.bucket)
                .remove([filename]);

            if (error) throw error;

            console.log('✅ Image deleted:', filename);

        } catch (error) {
            console.warn('⚠️ Image deletion failed:', error);
            // Don't fail the operation if image deletion fails
        }
    }

    // DATA TRANSFORMATION

    /**
     * Validate and ensure proper EUR conversion
     * Always returns a properly converted EUR value
     * @param {number} eurValue - EUR value from database (may be incorrect/missing)
     * @param {number} bgnValue - BGN value from database (source of truth)
     * @returns {number} Validated EUR value
     */
    validateAndConvertEUR(eurValue, bgnValue) {
        const bgnNum = parseFloat(bgnValue) || 0;

        // If no EUR value exists, convert from BGN
        if (!eurValue || eurValue === 0) {
            return CurrencyUtils.convertBGNtoEUR(bgnNum);
        }

        const eurNum = parseFloat(eurValue);

        // Validate: Check if EUR value matches expected conversion
        const expectedEUR = CurrencyUtils.convertBGNtoEUR(bgnNum);
        const tolerance = 0.02; // 2% tolerance for rounding differences

        // If EUR value is suspiciously close to BGN value (no conversion applied)
        if (Math.abs(eurNum - bgnNum) < 1 && bgnNum > 100) {
            console.warn(`⚠️ Suspicious EUR value detected: EUR=${eurNum}, BGN=${bgnNum}. Converting from BGN.`);
            return expectedEUR;
        }

        // If EUR value deviates significantly from expected
        if (expectedEUR > 0 && Math.abs(eurNum - expectedEUR) / expectedEUR > tolerance) {
            console.warn(`⚠️ EUR value mismatch: stored=${eurNum}, expected=${expectedEUR.toFixed(2)}. Using stored value.`);
        }

        // Use the stored EUR value (assumed correct after warnings)
        return eurNum;
    }

    async transformOrderFromDB(dbOrder) {
        // Parse all values explicitly
        const costUSD = parseFloat(dbOrder.cost_usd) || 0;
        const shippingUSD = parseFloat(dbOrder.shipping_usd) || 0;
        const rate = parseFloat(dbOrder.rate) || 0;
        const extrasBGN = parseFloat(dbOrder.extras_bgn) || 0;
        const sellBGN = parseFloat(dbOrder.sell_bgn) || 0;

        // Calculate derived fields in EUR with validation (uses validateAndConvertEUR method)
        const extrasEUR = this.validateAndConvertEUR(dbOrder.extras_eur, extrasBGN);
        const sellEUR = this.validateAndConvertEUR(dbOrder.sell_eur, sellBGN);

        // CRITICAL FIX: Handle historical USD→BGN rates vs new USD→EUR rates
        // Historical orders have rates > 1.5 (USD→BGN, e.g., 1.7-1.8)
        // New orders have rates < 1.5 (USD→EUR, e.g., 0.85-0.95)
        let totalEUR, totalBGN;

        if (rate > 1.5) {
            // Historical order: rate is USD→BGN, need to convert BGN→EUR
            // Calculate total in BGN using old rate
            totalBGN = ((costUSD + shippingUSD) * rate) + extrasBGN;
            // Convert BGN→EUR using official rate
            totalEUR = CurrencyUtils.convertBGNtoEUR(totalBGN);
            console.log(`🕰️ Historical order ${dbOrder.id}: USD ${(costUSD + shippingUSD).toFixed(2)} * rate ${rate} (BGN) = ${totalBGN.toFixed(2)} BGN → ${totalEUR.toFixed(2)} EUR`);
        } else {
            // New order: rate is USD→EUR, use directly
            totalEUR = ((costUSD + shippingUSD) * rate) + extrasEUR;
            totalBGN = CurrencyUtils.convertEURtoBGN(totalEUR);
        }

        const balanceEUR = sellEUR - totalEUR;

        // BGN values for backward compatibility
        const balanceBGN = CurrencyUtils.convertEURtoBGN(balanceEUR);

        // System currency is now EUR
        const currency = 'EUR';

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
            // BGN fields (legacy/historical - for reference only)
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
            currency: currency,
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
            id: 'client_' + dbClient.id, // Maintain compatibility
            name: dbClient.name,
            phone: dbClient.phone || '',
            email: dbClient.email || '',
            address: dbClient.address || '',
            preferredSource: dbClient.preferred_source || '',
            notes: dbClient.notes || '',
            createdDate: dbClient.created_at
        };
    }

    // UTILITY METHODS
    extractDbId(clientId) {
        // Extract database ID from client_123 format
        if (typeof clientId === 'string' && clientId.startsWith('client_')) {
            return parseInt(clientId.replace('client_', ''));
        }
        return parseInt(clientId);
    }

    getDefaultSettings() {
        return {
            // EUR is now the primary currency
            eurRate: 0.92, // USD to EUR exchange rate (market rate, configurable)
            baseCurrency: 'EUR',
            conversionRate: 1.95583, // Official BGN to EUR conversion rate (fixed by EU)

            // Legacy BGN settings (kept for historical data)
            usdRate: 1.71, // Legacy USD to BGN rate

            // Other settings
            factoryShipping: 1.5,
            origins: ['OLX', 'Bazar.bg', 'Instagram', 'WhatsApp', 'IG Ads', 'Facebook', 'OLX Romania', 'Viber'],
            vendors: ['Доставчик 1', 'Доставчик 2', 'Доставчик 3', 'AliExpress', 'Local Supplier', 'China Direct']
        };
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // STATUS AND DEBUGGING
    getConnectionStatus() {
        return {
            isConnected: this.isConnected,
            lastTest: this.lastConnectionTest,
            testAge: Date.now() - this.lastConnectionTest,
            nextTest: this.lastConnectionTest + this.connectionTestInterval
        };
    }

    getStatistics() {
        return {
            ...this.stats,
            successRate: this.stats.requestCount > 0 ?
                (this.stats.successCount / this.stats.requestCount * 100).toFixed(1) + '%' : '0%',
            activeRequests: this.activeRequests,
            queueLength: this.requestQueue.length
        };
    }

    debugSupabase() {
        const status = this.getConnectionStatus();
        const stats = this.getStatistics();

        console.group('🔍 SUPABASE DEBUG');
        console.log('Connection:', status);
        console.log('Statistics:', stats);
        console.log('Config:', {
            url: this.config.url,
            bucket: this.config.bucket,
            hasClient: !!this.supabase
        });
        console.groupEnd();
    }

    // HEALTH CHECK
    async healthCheck() {
        try {
            const connected = await this.testConnection();
            const stats = this.getStatistics();

            let status = 'healthy';
            const issues = [];

            if (!connected) {
                status = 'disconnected';
                issues.push('No connection to Supabase');
            }

            if (stats.successRate < 80 && this.stats.requestCount > 10) {
                status = 'degraded';
                issues.push(`Low success rate: ${stats.successRate}`);
            }

            if (this.activeRequests >= this.maxConcurrentRequests) {
                status = 'overloaded';
                issues.push('Request queue full');
            }

            return {
                status,
                connected,
                issues,
                stats,
                timestamp: Date.now()
            };

        } catch (error) {
            return {
                status: 'error',
                connected: false,
                issues: [error.message],
                timestamp: Date.now()
            };
        }
    }

    // CLEANUP
    destroy() {
        console.log('🗑️ Destroying SupabaseService...');

        // Clear queues
        this.requestQueue = [];

        // Reset state
        this.isConnected = false;
        this.connectionTested = false;

        console.log('✅ SupabaseService destroyed');
    }
}