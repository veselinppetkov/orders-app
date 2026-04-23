export class OrdersService {
    constructor(base, images) {
        this.base = base;
        this.images = images;
    }

    get client() { return this.base.client; }

    async createOrder(orderData) {
        return this.base.executeRequest(async () => {
            console.log('📝 Creating order in Supabase:', orderData.client);

            let imageUrl = null;
            if (orderData.imageData && orderData.imageData.startsWith('data:image')) {
                imageUrl = await this.images.uploadImage(orderData.imageData, `order-${Date.now()}`);
            }

            const extrasEUR = parseFloat(orderData.extrasEUR) || 0;
            const sellEUR = parseFloat(orderData.sellEUR) || 0;
            const rate = parseFloat(orderData.rate);

            if (!rate || rate <= 0) {
                console.error('❌ Invalid exchange rate for order creation:', { orderData, rate });
                throw new Error(`Invalid exchange rate: ${orderData.rate}. Cannot create order without valid USD→EUR rate.`);
            }

            const { data, error } = await this.client
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
                    rate: rate,
                    extras_eur: extrasEUR,
                    sell_eur: sellEUR,
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
        return this.base.executeRequest(async () => {
            console.log('📂 Loading orders from Supabase, month:', month || 'all');

            let query = this.client
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

            const transformedOrders = await Promise.all(data.map(o => this.transformOrderFromDB(o)));
            console.log(`✅ Loaded ${transformedOrders.length} orders`);
            return transformedOrders;
        });
    }

    async getRecentlyDelivered(limit = 10) {
        return this.base.executeRequest(async () => {
            console.log(`📂 Loading last ${limit} delivered orders by updated_at`);

            const { data, error } = await this.client
                .from('orders')
                .select('*')
                .eq('status', 'Доставен')
                .order('updated_at', { ascending: false })
                .limit(limit);

            if (error) throw error;

            const transformedOrders = await Promise.all(data.map(o => this.transformOrderFromDB(o)));
            console.log(`✅ Loaded ${transformedOrders.length} recently delivered orders`);
            return transformedOrders;
        });
    }

    async updateOrder(orderId, orderData) {
        return this.base.executeRequest(async () => {
            console.log('✏️ Updating order in Supabase:', orderId);

            let imageUrl = orderData.imageUrl;
            if (orderData.imageData && orderData.imageData.startsWith('data:image')) {
                imageUrl = await this.images.uploadImage(orderData.imageData, `order-${orderId}-${Date.now()}`);
                if (orderData.imageUrl && orderData.imageUrl !== imageUrl) {
                    await this.images.deleteImage(orderData.imageUrl);
                }
            }

            const extrasEUR = parseFloat(orderData.extrasEUR) || 0;
            const sellEUR = parseFloat(orderData.sellEUR) || 0;
            const rate = parseFloat(orderData.rate);

            if (!rate || rate <= 0) {
                console.error('❌ Invalid exchange rate for order update:', { orderId, orderData, rate });
                throw new Error(`Invalid exchange rate: ${orderData.rate}. Cannot update order without valid USD→EUR rate.`);
            }

            const { data, error } = await this.client
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
                    rate: rate,
                    extras_eur: extrasEUR,
                    sell_eur: sellEUR,
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
        return this.base.executeRequest(async () => {
            console.log('🗑️ Deleting order from Supabase:', orderId);

            const { data: order } = await this.client
                .from('orders')
                .select('image_url')
                .eq('id', orderId)
                .single();

            const { error } = await this.client
                .from('orders')
                .delete()
                .eq('id', orderId);

            if (error) throw error;

            if (order?.image_url) {
                await this.images.deleteImage(order.image_url);
            }

            console.log('✅ Order deleted successfully');
            return true;
        });
    }

    async transformOrderFromDB(dbOrder) {
        const costUSD = parseFloat(dbOrder.cost_usd) || 0;
        const shippingUSD = parseFloat(dbOrder.shipping_usd) || 0;
        const rate = parseFloat(dbOrder.rate) || 0;

        const extrasEUR = parseFloat(dbOrder.extras_eur) || 0;
        const sellEUR = parseFloat(dbOrder.sell_eur) || 0;

        const totalEUR = ((costUSD + shippingUSD) * rate) + extrasEUR;
        const balanceEUR = sellEUR - totalEUR;

        const imageUrl = await this.images.getImageUrl(dbOrder.image_url);

        return {
            id: dbOrder.id,
            date: dbOrder.date,
            client: dbOrder.client,
            phone: dbOrder.phone || '',
            origin: dbOrder.origin,
            vendor: dbOrder.vendor,
            model: dbOrder.model,
            costUSD,
            shippingUSD,
            rate,
            extrasEUR: parseFloat(extrasEUR.toFixed(2)),
            sellEUR: parseFloat(sellEUR.toFixed(2)),
            totalEUR: parseFloat(totalEUR.toFixed(2)),
            balanceEUR: parseFloat(balanceEUR.toFixed(2)),
            status: dbOrder.status,
            fullSet: dbOrder.full_set,
            notes: dbOrder.notes || '',
            imageData: imageUrl,
            imageUrl,
            imagePath: dbOrder.image_url
        };
    }
}
