export class ImageStorageService {
    constructor(base) {
        this.base = base;
        this.bucket = base.config.bucket;

        this.signedUrlTtlSeconds = 3600;
        this.signedUrlCacheSkewMs = 5 * 60 * 1000;
        this.signedUrlCache = new Map();
        this.inflightSignedUrls = new Map();
        this.signedUrlQueue = [];
        this.activeSignedUrlRequests = 0;
        this.maxConcurrentSignedUrlRequests = 2;
    }

    get client() { return this.base.client; }

    async uploadImage(base64Data, filename) {
        return this.base.executeRequest(async () => {
            console.log('Uploading image:', filename);

            let blob;
            try {
                const response = await fetch(base64Data);
                blob = await response.blob();
            } catch (e) {
                throw new Error(`Invalid image data: ${e.message}`);
            }

            const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
            const maxBytes = 10 * 1024 * 1024;
            if (!allowedTypes.includes(blob.type)) {
                throw new Error(`Unsupported image type: ${blob.type || 'unknown'}`);
            }
            if (blob.size > maxBytes) {
                throw new Error(`Image too large: ${(blob.size / 1024 / 1024).toFixed(1)} MB (max 10 MB)`);
            }

            const extension = blob.type.split('/')[1] || 'jpg';
            const filePath = `${filename}.${extension}`;

            const { error } = await this.client.storage
                .from(this.bucket)
                .upload(filePath, blob, { cacheControl: '3600', upsert: true });

            if (error) throw error;

            this.clearCachedSignedUrl(filePath);
            console.log('Image uploaded successfully:', filePath);
            return filePath;
        });
    }

    async getImageUrl(imagePath) {
        if (!imagePath) return null;

        try {
            if (imagePath.startsWith('http')) return imagePath;

            const cachedUrl = this.getCachedSignedUrl(imagePath);
            if (cachedUrl) return cachedUrl;

            if (this.inflightSignedUrls.has(imagePath)) {
                return this.inflightSignedUrls.get(imagePath);
            }

            const promise = this.enqueueSignedUrlRequest(() => this.createSignedUrlWithRetry(imagePath))
                .finally(() => this.inflightSignedUrls.delete(imagePath));

            this.inflightSignedUrls.set(imagePath, promise);
            return promise;
        } catch (error) {
            console.error('Error in getImageUrl:', error);
            return null;
        }
    }

    getCachedSignedUrl(imagePath) {
        const cached = this.signedUrlCache.get(imagePath);
        if (!cached) return null;

        if (cached.expiresAt <= Date.now()) {
            this.signedUrlCache.delete(imagePath);
            return null;
        }

        return cached.url;
    }

    clearCachedSignedUrl(imagePath) {
        if (!imagePath) return;
        this.signedUrlCache.delete(imagePath);
        this.inflightSignedUrls.delete(imagePath);
    }

    enqueueSignedUrlRequest(task) {
        return new Promise((resolve, reject) => {
            this.signedUrlQueue.push({ task, resolve, reject });
            this.processSignedUrlQueue();
        });
    }

    processSignedUrlQueue() {
        while (
            this.activeSignedUrlRequests < this.maxConcurrentSignedUrlRequests &&
            this.signedUrlQueue.length > 0
        ) {
            const { task, resolve, reject } = this.signedUrlQueue.shift();
            this.activeSignedUrlRequests++;

            task()
                .then(resolve)
                .catch(reject)
                .finally(() => {
                    this.activeSignedUrlRequests--;
                    this.processSignedUrlQueue();
                });
        }
    }

    async createSignedUrlWithRetry(imagePath) {
        const maxAttempts = 3;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            const { data, error } = await this.client.storage
                .from(this.bucket)
                .createSignedUrl(imagePath, this.signedUrlTtlSeconds);

            if (error) {
                if (attempt < maxAttempts && this.isRetryableSignedUrlError(error)) {
                    await this.sleep(500 * attempt);
                    continue;
                }

                console.warn('Cannot generate signed URL for:', imagePath, error);
                return null;
            }

            if (!data?.signedUrl) return null;

            this.signedUrlCache.set(imagePath, {
                url: data.signedUrl,
                expiresAt: Date.now() + (this.signedUrlTtlSeconds * 1000) - this.signedUrlCacheSkewMs
            });

            return data.signedUrl;
        }

        return null;
    }

    isRetryableSignedUrlError(error) {
        const message = String(error?.message || '').toLowerCase();
        return message.includes('maximum number of connections') ||
            message.includes('too many connections') ||
            message.includes('try again later') ||
            error?.statusCode === '503' ||
            error?.statusCode === 503;
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    getStoragePath(imageReference) {
        if (!imageReference) return null;

        if (!imageReference.startsWith('http')) {
            return imageReference.split('?')[0].replace(/^\/+/, '');
        }

        try {
            const url = new URL(imageReference);
            const pathParts = decodeURIComponent(url.pathname).split('/').filter(Boolean);
            const bucketIndex = pathParts.lastIndexOf(this.bucket);

            if (bucketIndex === -1 || bucketIndex === pathParts.length - 1) {
                return null;
            }

            return pathParts.slice(bucketIndex + 1).join('/');
        } catch (error) {
            console.warn('Could not parse image reference:', imageReference, error);
            return null;
        }
    }

    async deleteImage(imageReference) {
        const imagePath = this.getStoragePath(imageReference);
        if (!imagePath) return;

        try {
            const { error } = await this.client.storage
                .from(this.bucket)
                .remove([imagePath]);

            if (error) throw error;
            this.clearCachedSignedUrl(imagePath);
            console.log('Image deleted:', imagePath);
        } catch (error) {
            console.warn('Image deletion failed:', error);
        }
    }
}
