export class SettingsService {
    constructor(base) {
        this.base = base;
    }

    get client() { return this.base.client; }

    async getSettings() {
        return this.base.executeRequest(async () => {
            console.log('⚙️ Loading settings from Supabase');

            const { data, error } = await this.client
                .from('settings')
                .select('data')
                .eq('id', 1)
                .single();

            if (error && error.code !== 'PGRST116') throw error;

            const settings = data?.data || this.getDefaultSettings();
            settings.source = 'supabase';
            console.log('✅ Settings loaded from Supabase');
            return settings;
        });
    }

    async saveSettings(settings) {
        return this.base.executeRequest(async () => {
            console.log('💾 Saving settings to Supabase');

            const { data, error } = await this.client
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
            eurRate: 0.92,
            baseCurrency: 'EUR',
            factoryShipping: 1.5,
            origins: ['OLX', 'Bazar.bg', 'Instagram', 'WhatsApp', 'IG Ads', 'Facebook', 'OLX Romania', 'Viber'],
            vendors: ['Доставчик 1', 'Доставчик 2', 'Доставчик 3', 'AliExpress', 'Local Supplier', 'China Direct']
        };
    }
}
