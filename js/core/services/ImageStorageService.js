export class ImageStorageService {
    constructor(base) {
        this.base = base;
        this.bucket = base.config.bucket;

        this.fullImageMaxDimension = 1600;
        this.fullImageQuality = 0.82;
        this.thumbnailMaxDimension = 240;
        this.thumbnailQuality = 0.72;
        this.outputMimeType = 'image/webp';
        this.outputExtension = 'webp';

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

            let sourceBlob;
            try {
                const response = await fetch(base64Data);
                sourceBlob = await response.blob();
            } catch (e) {
                throw new Error(`Invalid image data: ${e.message}`);
            }

            const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
            const maxBytes = 10 * 1024 * 1024;
            if (!allowedTypes.includes(sourceBlob.type)) {
                throw new Error(`Unsupported image type: ${sourceBlob.type || 'unknown'}`);
            }
            if (sourceBlob.size > maxBytes) {
                throw new Error(`Image too large: ${(sourceBlob.size / 1024 / 1024).toFixed(1)} MB (max 10 MB)`);
            }

            const safeFilename = this.normalizeFilename(filename);
            const filePath = `${safeFilename}.${this.outputExtension}`;
            const thumbnailPath = this.getThumbnailPath(filePath);
            const { fullBlob, thumbnailBlob } = await this.createImageVariants(sourceBlob);

            const { error: fullError } = await this.client.storage
                .from(this.bucket)
                .upload(filePath, fullBlob, {
                    cacheControl: '31536000',
                    contentType: this.outputMimeType,
                    upsert: true
                });

            if (fullError) throw fullError;

            const { error: thumbnailError } = await this.client.storage
                .from(this.bucket)
                .upload(thumbnailPath, thumbnailBlob, {
                    cacheControl: '31536000',
                    contentType: this.outputMimeType,
                    upsert: true
                });

            if (thumbnailError) {
                try {
                    await this.client.storage.from(this.bucket).remove([filePath]);
                } catch (cleanupError) {
                    console.warn('Failed to cleanup full image after thumbnail upload error:', cleanupError);
                }
                throw thumbnailError;
            }

            this.clearCachedSignedUrl(filePath);
            this.clearCachedSignedUrl(thumbnailPath);
            console.log('Image uploaded successfully:', filePath);
            return filePath;
        });
    }

    normalizeFilename(filename) {
        const fallback = `order-${Date.now()}`;
        const clean = String(filename || fallback)
            .replace(/\.[a-z0-9]+$/i, '')
            .replace(/^\/+/, '')
            .replace(/[^a-zA-Z0-9/_-]/g, '-')
            .replace(/-+/g, '-')
            .replace(/\/+/g, '/')
            .replace(/^\/|\/$/g, '');

        return clean || fallback;
    }

    async createImageVariants(sourceBlob) {
        const image = await this.loadImage(sourceBlob);

        try {
            const fullBlob = await this.resizeImageBlob(
                image,
                this.fullImageMaxDimension,
                this.fullImageQuality
            );
            const thumbnailBlob = await this.resizeImageBlob(
                image,
                this.thumbnailMaxDimension,
                this.thumbnailQuality
            );

            return { fullBlob, thumbnailBlob };
        } finally {
            this.releaseImage(image);
        }
    }

    async loadImage(blob) {
        if (typeof createImageBitmap === 'function') {
            return createImageBitmap(blob, { imageOrientation: 'from-image' });
        }

        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(blob);
            const img = new Image();
            img.onload = () => {
                URL.revokeObjectURL(url);
                resolve(img);
            };
            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('Could not decode image'));
            };
            img.src = url;
        });
    }

    releaseImage(image) {
        if (typeof image?.close === 'function') {
            image.close();
        }
    }

    resizeImageBlob(image, maxDimension, quality) {
        const sourceWidth = image.width || image.naturalWidth;
        const sourceHeight = image.height || image.naturalHeight;
        if (!sourceWidth || !sourceHeight) {
            throw new Error('Invalid image dimensions');
        }

        const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
        const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
        const targetHeight = Math.max(1, Math.round(sourceHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;

        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas is not available');

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(image, 0, 0, targetWidth, targetHeight);

        return new Promise((resolve, reject) => {
            canvas.toBlob((blob) => {
                if (!blob) {
                    reject(new Error('Could not encode image as WebP'));
                    return;
                }
                resolve(blob);
            }, this.outputMimeType, quality);
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

    async getThumbnailUrl(imagePath) {
        if (!imagePath) return null;

        const imageStoragePath = this.getStoragePath(imagePath);
        if (!imageStoragePath) return null;

        if (!this.hasDerivedThumbnail(imageStoragePath)) {
            return this.getImageUrl(imageStoragePath);
        }

        const thumbnailPath = this.getThumbnailPath(imageStoragePath);
        const thumbnailUrl = await this.getImageUrl(thumbnailPath);

        return thumbnailUrl || this.getImageUrl(imageStoragePath);
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

    getThumbnailPath(imageReference) {
        const imagePath = this.getStoragePath(imageReference);
        if (!imagePath) return null;
        if (imagePath.startsWith('thumbnails/')) return imagePath;

        const withoutExtension = imagePath.replace(/\.[^/.]+$/, '');
        return `thumbnails/${withoutExtension}.${this.outputExtension}`;
    }

    hasDerivedThumbnail(imageReference) {
        const imagePath = this.getStoragePath(imageReference);
        return Boolean(imagePath && imagePath.toLowerCase().endsWith(`.${this.outputExtension}`));
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
            const thumbnailPath = this.getThumbnailPath(imagePath);
            const paths = Array.from(new Set([imagePath, thumbnailPath].filter(Boolean)));

            const { error } = await this.client.storage
                .from(this.bucket)
                .remove(paths);

            if (error) throw error;
            paths.forEach(path => this.clearCachedSignedUrl(path));
            console.log('Image deleted:', paths);
        } catch (error) {
            console.warn('Image deletion failed:', error);
        }
    }
}
