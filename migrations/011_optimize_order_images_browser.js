/**
 * Browser Console Script: Optimize Order Images
 * =============================================
 * Run inside the loaded, authenticated app.
 *
 * Usage:
 * 1. Open the app and sign in.
 * 2. Open DevTools Console.
 * 3. Paste this file.
 * 4. Dry run: await optimizeOrderImages()
 * 5. Real run: await optimizeOrderImages({ dryRun: false })
 */

async function optimizeOrderImages(options = {}) {
    const {
        dryRun = true,
        concurrency = 1,
        deleteOriginals = true,
        limit = null
    } = options;

    const app = window.app;
    const service = app?.supabase;
    const imageService = service?.images;
    const client = service?.supabase || service?.base?.client || service?.client;

    if (!app || !service || !imageService || !client) {
        throw new Error('App/Supabase/ImageStorageService is not available. Load the app and sign in first.');
    }

    const bucket = imageService.bucket;
    const results = {
        dryRun,
        checked: 0,
        skipped: 0,
        optimized: 0,
        failed: 0,
        failures: []
    };

    console.log('='.repeat(70));
    console.log('ORDER IMAGE OPTIMIZATION');
    console.log('Dry run:', dryRun);
    console.log('Concurrency:', concurrency);
    console.log('Delete originals:', deleteOriginals);
    console.log('='.repeat(70));

    const { data: orders, error } = await client
        .from('orders')
        .select('id, image_url')
        .not('image_url', 'is', null)
        .order('id', { ascending: true });

    if (error) throw error;

    let candidates = orders.filter(order => {
        const imagePath = imageService.getStoragePath(order.image_url);
        if (!imagePath) return false;
        if (imagePath.startsWith('optimized/')) return false;
        return true;
    });

    if (limit) candidates = candidates.slice(0, limit);
    console.log(`Found ${orders.length} orders with images, ${candidates.length} candidates.`);

    if (dryRun) {
        candidates.forEach(order => {
            const imagePath = imageService.getStoragePath(order.image_url);
            console.log(`[DRY] order ${order.id}: ${imagePath} -> ${getOptimizedPath(imageService, imagePath, order.id)}`);
        });
        results.checked = candidates.length;
        return results;
    }

    let nextIndex = 0;
    const workerCount = Math.max(1, Math.min(Number(concurrency) || 1, 2));
    const workers = Array.from({ length: workerCount }, async () => {
        while (nextIndex < candidates.length) {
            const order = candidates[nextIndex++];
            results.checked++;

            try {
                await optimizeOneOrderImage({ client, imageService, bucket, order, deleteOriginals });
                results.optimized++;
                console.log(`[OK] ${results.optimized}/${candidates.length} order ${order.id}`);
            } catch (err) {
                results.failed++;
                results.failures.push({
                    orderId: order.id,
                    imageUrl: order.image_url,
                    error: err.message
                });
                console.warn(`[FAIL] order ${order.id}:`, err);
            }
        }
    });

    await Promise.all(workers);

    app.modules?.orders?.clearCache?.();
    console.table(results.failures);
    console.log('Done:', results);
    return results;
}

async function optimizeOneOrderImage({ client, imageService, bucket, order, deleteOriginals }) {
    const oldPath = imageService.getStoragePath(order.image_url);
    if (!oldPath) throw new Error('Missing image path');

    const newPath = getOptimizedPath(imageService, oldPath, order.id);
    const thumbnailPath = imageService.getThumbnailPath(newPath);

    const signedUrl = await imageService.getImageUrl(oldPath);
    if (!signedUrl) throw new Error('Could not create signed URL for source image');

    const response = await fetch(signedUrl);
    if (!response.ok) throw new Error(`Could not download source image (${response.status})`);

    const sourceBlob = await response.blob();
    const { fullBlob, thumbnailBlob } = await imageService.createImageVariants(sourceBlob);

    const uploadedPaths = [];
    try {
        await uploadBlob(client, bucket, newPath, fullBlob);
        uploadedPaths.push(newPath);

        await uploadBlob(client, bucket, thumbnailPath, thumbnailBlob);
        uploadedPaths.push(thumbnailPath);

        const { error: updateError } = await client
            .from('orders')
            .update({ image_url: newPath })
            .eq('id', order.id);

        if (updateError) throw updateError;

        imageService.clearCachedSignedUrl(oldPath);
        imageService.clearCachedSignedUrl(newPath);
        imageService.clearCachedSignedUrl(thumbnailPath);

        if (deleteOriginals && oldPath !== newPath) {
            await imageService.deleteImage(oldPath);
        }
    } catch (error) {
        if (uploadedPaths.length) {
            await client.storage.from(bucket).remove(uploadedPaths);
            uploadedPaths.forEach(path => imageService.clearCachedSignedUrl(path));
        }
        throw error;
    }
}

async function uploadBlob(client, bucket, path, blob) {
    const { error } = await client.storage
        .from(bucket)
        .upload(path, blob, {
            cacheControl: '31536000',
            contentType: 'image/webp',
            upsert: true
        });

    if (error) throw error;
}

function getOptimizedPath(imageService, oldPath, orderId) {
    const normalized = imageService
        .normalizeFilename(oldPath)
        .replace(/^optimized\//, '')
        .replace(/\//g, '-');

    return `optimized/order-${orderId}-${normalized}.webp`;
}

window.optimizeOrderImages = optimizeOrderImages;
