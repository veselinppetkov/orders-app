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

    async deleteImage(imageUrl) {
        if (!imageUrl || !imageUrl.includes(this.bucket)) return;

        try {
            const urlParts = imageUrl.split('/');
            const filename = urlParts[urlParts.length - 1];

            const { error } = await this.client.storage
                .from(this.bucket)
                .remove([filename]);

            if (error) throw error;
            console.log('✅ Image deleted:', filename);
        } catch (error) {
            console.warn('⚠️ Image deletion failed:', error);
        }
    }
}
