export class ImageStorageService {
    constructor(base) {
        this.base = base;
        this.bucket = base.config.bucket;
    }

    get client() { return this.base.client; }

    async uploadImage(base64Data, filename) {
        return this.base.executeRequest(async () => {
            console.log('📤 Uploading image:', filename);

            const response = await fetch(base64Data);
            const blob = await response.blob();
            const extension = blob.type.split('/')[1] || 'jpg';
            const filePath = `${filename}.${extension}`;

            const { error } = await this.client.storage
                .from(this.bucket)
                .upload(filePath, blob, { cacheControl: '3600', upsert: true });

            if (error) throw error;

            console.log('✅ Image uploaded successfully:', filePath);
            return filePath;
        });
    }

    async getImageUrl(imagePath) {
        if (!imagePath) return null;

        try {
            if (imagePath.startsWith('http')) return imagePath;

            const { data, error } = await this.client.storage
                .from(this.bucket)
                .createSignedUrl(imagePath, 3600);

            if (error) {
                console.warn('⚠️ Cannot generate signed URL for:', imagePath, error);
                return null;
            }

            return data.signedUrl;
        } catch (error) {
            console.error('❌ Error in getImageUrl:', error);
            return null;
        }
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
            console.warn('⚠️ Could not parse image reference:', imageReference, error);
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
            console.log('✅ Image deleted:', imagePath);
        } catch (error) {
            console.warn('⚠️ Image deletion failed:', error);
        }
    }
}
