import { CurrencyUtils } from '../../utils/CurrencyUtils.js';

export class OrdersService {
    constructor(base, images) {
        this.base = base;
        this.images = images;
    }

    get client() { return this.base.client; }

    async createOrder(orderData) {
        return this.base.executeRequest(async () => {
            console.log('Creating order in Supabase:', orderData.client);

            let imageUrl = null;
            if (orderData.imageData && orderData.imageData.startsWith('data:image')) {
                imageUrl = await this.images.uploadImage(orderData.imageData, `order-${Date.now()}`);
            }

            const extrasEUR = parseFloat(orderData.extrasEUR) || 0;
            const sellEUR = parseFloat(orderData.sellEUR) || 0;
            const rate = CurrencyUtils.normalizeUSDtoEURRate(orderData.rate);

            if (!rate || rate <= 0) {
                console.error('Invalid exchange rate for order creation:', { orderData, rate });
                throw new Error(`Invalid exchange rate: ${orderData.rate}. Cannot create order without valid USD->EUR rate.`);
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
                    rate,
                    extras_eur: extrasEUR,
                    sell_eur: sellEUR,
                    status: orderData.status || '\u041e\u0447\u0430\u043a\u0432\u0430\u043d',
                    full_set: orderData.fullSet || false,
                    notes: orderData.notes || '',
                    image_url: imageUrl
                }])
                .select()
                .single();

            if (error) throw error;

            const transformedOrder = await this.transformOrderFromDB(data);
            console.log('Order created successfully:', transformedOrder.id);
            return transformedOrder;
        });
    }

    async getOrders(month = null, options = {}) {
        return this.base.executeRequest(async () => {
            const includeImageUrls = options.includeImageUrls !== false;
            const status = options.status || null;
            console.log('Loading orders from Supabase, month:', month || 'all', status ? `status: ${status}` : '');

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

            if (status) {
                query = query.eq('status', status);
            }

            const { data, error } = await query;
            if (error) throw error;

            const transformedOrders = await Promise.all(
                data.map(o => this.transformOrderFromDB(o, { includeImageUrls }))
            );
            console.log(`Loaded ${transformedOrders.length} orders`);
            return transformedOrders;
        });
    }

    async getRecentlyDelivered(limit = 10) {
        return this.base.executeRequest(async () => {
            console.log(`Loading last ${limit} delivered orders by updated_at`);

            const { data, error } = await this.client
                .from('orders')
                .select('*')
                .eq('status', '\u0414\u043e\u0441\u0442\u0430\u0432\u0435\u043d')
                .order('updated_at', { ascending: false })
                .limit(limit);

            if (error) throw error;

            const transformedOrders = await Promise.all(data.map(o => this.transformOrderFromDB(o)));
            console.log(`Loaded ${transformedOrders.length} recently delivered orders`);
            return transformedOrders;
        });
    }

    async updateOrder(orderId, orderData) {
        return this.base.executeRequest(async () => {
            console.log('Updating order in Supabase:', orderId);

            const previousImagePath = orderData.previousImagePath || orderData.imagePath || orderData.imageUrl || null;
            let imageUrl = orderData.imagePath || orderData.imageUrl || null;
            let uploadedImagePath = null;

            try {
                if (orderData.removeImage) {
                    imageUrl = null;
                }

                if (orderData.imageData && orderData.imageData.startsWith('data:image')) {
                    uploadedImagePath = await this.images.uploadImage(orderData.imageData, `order-${orderId}-${Date.now()}`);
                    imageUrl = uploadedImagePath;
                }

                const extrasEUR = parseFloat(orderData.extrasEUR) || 0;
                const sellEUR = parseFloat(orderData.sellEUR) || 0;
                const rate = CurrencyUtils.normalizeUSDtoEURRate(orderData.rate);

                if (!rate || rate <= 0) {
                    console.error('Invalid exchange rate for order update:', { orderId, orderData, rate });
                    throw new Error(`Invalid exchange rate: ${orderData.rate}. Cannot update order without valid USD->EUR rate.`);
                }

                const updatePayload = {
                    date: orderData.date,
                    client: orderData.client,
                    phone: orderData.phone || '',
                    origin: orderData.origin,
                    vendor: orderData.vendor,
                    model: orderData.model,
                    cost_usd: parseFloat(orderData.costUSD) || 0,
                    shipping_usd: parseFloat(orderData.shippingUSD) || 0,
                    rate,
                    extras_eur: extrasEUR,
                    sell_eur: sellEUR,
                    status: orderData.status,
                    full_set: orderData.fullSet,
                    notes: orderData.notes || '',
                    image_url: imageUrl
                };

                const { error, count } = await this.client
                    .from('orders')
                    .update(updatePayload, { count: 'exact' })
                    .eq('id', orderId);

                if (error) throw error;
                if (count === 0) {
                    throw new Error(`Order not found or not editable: ${orderId}`);
                }

                const shouldDeletePreviousImage = previousImagePath &&
                    previousImagePath !== imageUrl &&
                    (orderData.removeImage || uploadedImagePath);

                if (shouldDeletePreviousImage) {
                    try {
                        await this.images.deleteImage(previousImagePath);
                    } catch (e) {
                        console.warn('Orphaned old image (delete failed):', previousImagePath, e);
                    }
                }

                const transformedOrder = await this.transformOrderFromDB({
                    id: orderId,
                    ...updatePayload
                });
                console.log('Order updated successfully');
                return transformedOrder;
            } catch (error) {
                if (uploadedImagePath) {
                    try {
                        await this.images.deleteImage(uploadedImagePath);
                    } catch (cleanupError) {
                        console.warn('New image cleanup failed after order update error:', uploadedImagePath, cleanupError);
                    }
                }
                throw error;
            }
        });
    }

    async deleteOrder(orderId) {
        return this.base.executeRequest(async () => {
            console.log('Deleting order from Supabase:', orderId);

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

            console.log('Order deleted successfully');
            return true;
        });
    }

    async transformOrderFromDB(dbOrder, options = {}) {
        const costUSD = parseFloat(dbOrder.cost_usd) || 0;
        const shippingUSD = parseFloat(dbOrder.shipping_usd) || 0;
        const storedRate = parseFloat(dbOrder.rate) || 0;
        const rate = CurrencyUtils.normalizeUSDtoEURRate(storedRate);

        const extrasEUR = parseFloat(dbOrder.extras_eur) || 0;
        const sellEUR = parseFloat(dbOrder.sell_eur) || 0;

        const totalEUR = CurrencyUtils.roundEUR(((costUSD + shippingUSD) * rate) + extrasEUR);
        const balanceEUR = CurrencyUtils.roundEUR(sellEUR - totalEUR);

        const includeImageUrls = options.includeImageUrls !== false;
        const displayImageUrl = includeImageUrls
            ? await this.images.getThumbnailUrl(dbOrder.image_url)
            : null;

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
            storedRate,
            extrasEUR: parseFloat(extrasEUR.toFixed(2)),
            sellEUR: parseFloat(sellEUR.toFixed(2)),
            totalEUR,
            balanceEUR,
            status: dbOrder.status,
            fullSet: dbOrder.full_set,
            notes: dbOrder.notes || '',
            imageData: displayImageUrl,
            imageUrl: displayImageUrl,
            imagePath: dbOrder.image_url
        };
    }
}
