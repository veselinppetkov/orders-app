// js/core/SupabaseService.js - Complete Supabase Integration

export class SupabaseService {
    constructor() {
        // 🚨 REPLACE THESE WITH YOUR ACTUAL VALUES FROM SUPABASE DASHBOARD
        const SUPABASE_URL = 'https://xxpdogtyvnqfmnmphycp.supabase.co';     // https://xxxxxxxxx.supabase.co
        const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh4cGRvZ3R5dm5xZm1ubXBoeWNwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc2OTAyNTksImV4cCI6MjA3MzI2NjI1OX0.lL8ewSJBOav9Rfz7XjFaOwQONhez8T11FU5vM2ITDZ4'; // eyJhbG...long string

        // Initialize Supabase client
        this.supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        this.bucket = 'order-images'; // Storage bucket name

        console.log('🚀 Supabase service initialized');
        this.testConnection();
    }

    // Test database connection
    async testConnection() {
        try {
            const { data, error } = await this.supabase
                .from('settings')
                .select('*')
                .limit(1);

            if (error) throw error;
            console.log('✅ Supabase connection successful');
            return true;
        } catch (error) {
            console.error('❌ Supabase connection failed:', error);
            return false;
        }
    }

    // ========================================
    // ORDERS METHODS
    // ========================================

    async createOrder(orderData) {
        try {
            console.log('📝 Creating order:', orderData.client);

            // Upload image if present
            let imageUrl = null;
            if (orderData.imageData && orderData.imageData.startsWith('data:image')) {
                console.log('📷 Uploading image...');
                imageUrl = await this.uploadImage(orderData.imageData, `order-${Date.now()}`);
            }

            const { data, error } = await this.supabase
                .from('orders')
                .insert({
                    date: orderData.date,
                    client: orderData.client,
                    phone: orderData.phone || '',
                    origin: orderData.origin,
                    vendor: orderData.vendor,
                    model: orderData.model,
                    cost_usd: parseFloat(orderData.costUSD) || 0,
                    shipping_usd: parseFloat(orderData.shippingUSD) || 0,
                    rate: parseFloat(orderData.rate) || 1,
                    extras_bgn: parseFloat(orderData.extrasBGN) || 0,
                    sell_bgn: parseFloat(orderData.sellBGN) || 0,
                    status: orderData.status || 'Очакван',
                    full_set: orderData.fullSet || false,
                    notes: orderData.notes || '',
                    image_url: imageUrl
                })
                .select()
                .single();

            if (error) throw error;

            console.log('✅ Order created successfully:', data.id);
            return this.transformOrderFromDB(data);
        } catch (error) {
            console.error('❌ Create order failed:', error);
            throw error;
        }
    }

    async getOrders(month = null) {
        try {
            console.log('📂 Loading orders for month:', month || 'all');

            let query = this.supabase
                .from('orders')
                .select('*')
                .order('date', { ascending: false });

            // Filter by month if specified
            if (month) {
                const startDate = `${month}-01`;
                // Calculate last day of month properly
                const [year, monthNum] = month.split('-');
                const lastDay = new Date(parseInt(year), parseInt(monthNum), 0).getDate();
                const endDate = `${month}-${lastDay.toString().padStart(2, '0')}`;
                query = query.gte('date', startDate).lte('date', endDate);
            }

            const { data, error } = await query;
            if (error) throw error;

            console.log(`✅ Loaded ${data.length} orders`);
            return data.map(order => this.transformOrderFromDB(order));
        } catch (error) {
            console.error('❌ Get orders failed:', error);
            return [];
        }
    }

    async updateOrder(orderId, orderData) {
        try {
            console.log('✏️ Updating order:', orderId);

            // Handle image update
            let imageUrl = orderData.imageUrl; // Keep existing URL
            if (orderData.imageData && orderData.imageData.startsWith('data:image')) {
                // New image uploaded
                console.log('📷 Uploading new image...');
                imageUrl = await this.uploadImage(orderData.imageData, `order-${orderId}-${Date.now()}`);

                // Delete old image if exists and is different
                if (orderData.imageUrl && orderData.imageUrl !== imageUrl) {
                    await this.deleteImage(orderData.imageUrl);
                }
            }

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
                    extras_bgn: parseFloat(orderData.extrasBGN) || 0,
                    sell_bgn: parseFloat(orderData.sellBGN) || 0,
                    status: orderData.status,
                    full_set: orderData.fullSet,
                    notes: orderData.notes || '',
                    image_url: imageUrl
                })
                .eq('id', orderId)
                .select()
                .single();

            if (error) throw error;

            console.log('✅ Order updated successfully');
            return this.transformOrderFromDB(data);
        } catch (error) {
            console.error('❌ Update order failed:', error);
            throw error;
        }
    }

    async deleteOrder(orderId) {
        try {
            console.log('🗑️ Deleting order:', orderId);

            // Get order to delete associated image
            const { data: order } = await this.supabase
                .from('orders')
                .select('image_url')
                .eq('id', orderId)
                .single();

            // Delete image if exists
            if (order?.image_url) {
                await this.deleteImage(order.image_url);
            }

            // Delete order from database
            const { error } = await this.supabase
                .from('orders')
                .delete()
                .eq('id', orderId);

            if (error) throw error;

            console.log('✅ Order deleted successfully');
            return true;
        } catch (error) {
            console.error('❌ Delete order failed:', error);
            throw error;
        }
    }

    // ========================================
    // IMAGE METHODS
    // ========================================

    async uploadImage(base64Data, filename) {
        try {
            console.log('📤 Uploading image:', filename);

            // Convert base64 to blob
            const response = await fetch(base64Data);
            const blob = await response.blob();

            // Create unique filename with extension
            const extension = blob.type.split('/')[1] || 'jpg';
            const filePath = `${filename}.${extension}`;

            const { data, error } = await this.supabase.storage
                .from(this.bucket)
                .upload(filePath, blob, {
                    cacheControl: '3600',
                    upsert: true // Overwrite if exists
                });

            if (error) throw error;

            // Get public URL
            const { data: { publicUrl } } = this.supabase.storage
                .from(this.bucket)
                .getPublicUrl(filePath);

            console.log('✅ Image uploaded successfully');
            return publicUrl;
        } catch (error) {
            console.error('❌ Image upload failed:', error);
            return null;
        }
    }

    async deleteImage(imageUrl) {
        try {
            if (!imageUrl || !imageUrl.includes(this.bucket)) return;

            // Extract filename from URL
            const urlParts = imageUrl.split('/');
            const filename = urlParts[urlParts.length - 1];

            const { error } = await this.supabase.storage
                .from(this.bucket)
                .remove([filename]);

            if (error) throw error;
            console.log('✅ Image deleted:', filename);
        } catch (error) {
            console.error('❌ Image deletion failed:', error);
        }
    }

    // ========================================
    // CLIENTS METHODS
    // ========================================

    async createClient(clientData) {
        try {
            const { data, error } = await this.supabase
                .from('clients')
                .insert({
                    name: clientData.name,
                    phone: clientData.phone || '',
                    email: clientData.email || '',
                    address: clientData.address || '',
                    preferred_source: clientData.preferredSource || '',
                    notes: clientData.notes || ''
                })
                .select()
                .single();

            if (error) throw error;
            return this.transformClientFromDB(data);
        } catch (error) {
            console.error('❌ Create client failed:', error);
            throw error;
        }
    }

    async getClients() {
        try {
            const { data, error } = await this.supabase
                .from('clients')
                .select('*')
                .order('name');

            if (error) throw error;
            return data.map(client => this.transformClientFromDB(client));
        } catch (error) {
            console.error('❌ Get clients failed:', error);
            return [];
        }
    }

    async updateClient(clientId, clientData) {
        try {
            const dbId = parseInt(clientId.replace('client_', '')); // Remove prefix

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
            return this.transformClientFromDB(data);
        } catch (error) {
            console.error('❌ Update client failed:', error);
            throw error;
        }
    }

    async deleteClient(clientId) {
        try {
            const dbId = parseInt(clientId.replace('client_', ''));

            const { error } = await this.supabase
                .from('clients')
                .delete()
                .eq('id', dbId);

            if (error) throw error;
            return true;
        } catch (error) {
            console.error('❌ Delete client failed:', error);
            throw error;
        }
    }

    // ========================================
    // SETTINGS METHODS
    // ========================================

    async getSettings() {
        try {
            const { data, error } = await this.supabase
                .from('settings')
                .select('data')
                .eq('id', 1)
                .single();

            if (error && error.code !== 'PGRST116') throw error;

            return data?.data || {
                usdRate: 1.71,
                factoryShipping: 1.5,
                origins: ['OLX', 'Bazar.bg', 'Instagram', 'WhatsApp', 'IG Ads', 'Facebook', 'OLX Romania', 'Viber'],
                vendors: ['Доставчик 1', 'Доставчик 2', 'Доставчик 3', 'AliExpress', 'Local Supplier', 'China Direct']
            };
        } catch (error) {
            console.error('❌ Get settings failed:', error);
            return null;
        }
    }

    async saveSettings(settings) {
        try {
            const { data, error } = await this.supabase
                .from('settings')
                .upsert({ id: 1, data: settings })
                .select()
                .single();

            if (error) throw error;
            return data.data;
        } catch (error) {
            console.error('❌ Save settings failed:', error);
            throw error;
        }
    }

    // ========================================
    // TRANSFORM METHODS (Convert DB format to App format)
    // ========================================

    transformOrderFromDB(dbOrder) {
        return {
            id: dbOrder.id,
            date: dbOrder.date,
            client: dbOrder.client,
            phone: dbOrder.phone || '',
            origin: dbOrder.origin,
            vendor: dbOrder.vendor,
            model: dbOrder.model,
            costUSD: parseFloat(dbOrder.cost_usd),
            shippingUSD: parseFloat(dbOrder.shipping_usd),
            rate: parseFloat(dbOrder.rate),
            extrasBGN: parseFloat(dbOrder.extras_bgn),
            sellBGN: parseFloat(dbOrder.sell_bgn),
            totalBGN: parseFloat(dbOrder.total_bgn),
            balanceBGN: parseFloat(dbOrder.balance_bgn),
            status: dbOrder.status,
            fullSet: dbOrder.full_set,
            notes: dbOrder.notes || '',
            imageData: dbOrder.image_url, // URL instead of base64
            imageUrl: dbOrder.image_url
        };
    }

    transformClientFromDB(dbClient) {
        return {
            id: 'client_' + dbClient.id, // Keep compatible with existing code
            name: dbClient.name,
            phone: dbClient.phone || '',
            email: dbClient.email || '',
            address: dbClient.address || '',
            preferredSource: dbClient.preferred_source || '',
            notes: dbClient.notes || '',
            createdDate: dbClient.created_at
        };
    }

    // ========================================
    // MIGRATION HELPER METHODS
    // ========================================

    async migrateFromLocalStorage() {
        try {
            console.log('🚀 Starting localStorage migration...');

            // Get localStorage data
            const monthlyData = JSON.parse(localStorage.getItem('orderSystem_monthlyData') || '{}');
            const clientsData = JSON.parse(localStorage.getItem('orderSystem_clientsData') || '{}');
            const settings = JSON.parse(localStorage.getItem('orderSystem_settings') || '{}');

            let migrated = { orders: 0, clients: 0, settings: 0 };

            // Migrate settings first
            if (Object.keys(settings).length > 0) {
                await this.saveSettings(settings);
                migrated.settings = 1;
                console.log('✅ Settings migrated');
            }

            // Migrate clients
            for (const client of Object.values(clientsData)) {
                try {
                    await this.createClient({
                        name: client.name,
                        phone: client.phone,
                        email: client.email,
                        address: client.address,
                        preferredSource: client.preferredSource,
                        notes: client.notes
                    });
                    migrated.clients++;
                } catch (error) {
                    console.warn('⚠️ Client migration failed:', client.name, error);
                }
            }
            console.log(`✅ ${migrated.clients} clients migrated`);

            // Migrate orders (this will take the longest due to images)
            for (const [month, data] of Object.entries(monthlyData)) {
                if (data.orders && data.orders.length > 0) {
                    console.log(`📦 Migrating ${data.orders.length} orders from ${month}...`);

                    for (const order of data.orders) {
                        try {
                            await this.createOrder(order);
                            migrated.orders++;

                            // Show progress for every 10 orders
                            if (migrated.orders % 10 === 0) {
                                console.log(`📈 Migration progress: ${migrated.orders} orders completed`);
                            }
                        } catch (error) {
                            console.warn('⚠️ Order migration failed:', order.client, error);
                        }
                    }
                }
            }

            console.log(`🎉 Migration completed: ${migrated.orders} orders, ${migrated.clients} clients, ${migrated.settings} settings`);
            return migrated;

        } catch (error) {
            console.error('❌ Migration failed:', error);
            throw error;
        }
    }
}