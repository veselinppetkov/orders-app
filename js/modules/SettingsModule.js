export class SettingsModule {
    constructor(state, storage, eventBus, supabase) {
        this.state = state;
        this.storage = storage;
        this.eventBus = eventBus;
        this.supabase = supabase;

        console.log('⚙️ SettingsModule initialized with Supabase support');
    }

    async getSettings() {
        try {
            // Try Supabase first
            const settings = await this.supabase.getSettings();

            // Update local state with Supabase data
            this.state.set('settings', settings);
            this.storage.save('settings', settings); // Backup

            return settings;

        } catch (error) {
            console.warn('⚠️ Failed to get settings from Supabase, using local:', error);
            return this.state.get('settings');
        }
    }

    async updateSettings(settings) {
        try {
            console.log('💾 SettingsModule.updateSettings() called with:', settings);

            // Save to Supabase
            console.log('🚀 Calling supabase.saveSettings...');
            const savedSettings = await this.supabase.saveSettings(settings);
            console.log('✅ Supabase.saveSettings returned:', savedSettings);

            // Update local state
            console.log('📝 Updating local state and storage...');
            this.storage.save('settings', savedSettings);
            this.state.set('settings', savedSettings);

            console.log('📢 Emitting settings:updated event...');
            this.eventBus.emit('settings:updated', savedSettings);
            console.log('✅ SettingsModule.updateSettings completed');

            return savedSettings;

        } catch (error) {
            console.error('❌ Failed to save settings to Supabase:', error);
            console.error('Stack trace:', error.stack);

            // Fallback to localStorage
            const currentSettings = this.state.get('settings');
            const updatedSettings = { ...currentSettings, ...settings };

            this.storage.save('settings', updatedSettings);
            this.state.set('settings', updatedSettings);
            this.eventBus.emit('settings:updated', updatedSettings);

            return updatedSettings;
        }
    }

    async updateUsdRate(rate) {
        return this.updateSettings({ usdRate: parseFloat(rate) });
    }

    async updateEurRate(rate) {
        return this.updateSettings({ eurRate: parseFloat(rate) });
    }

    async updateShipping(shipping) {
        return this.updateSettings({ factoryShipping: parseFloat(shipping) });
    }

    async updateOrigins(origins) {
        const originsList = Array.isArray(origins) ? origins : origins.split('\n').filter(s => s.trim());
        return this.updateSettings({ origins: originsList });
    }

    async updateVendors(vendors) {
        const vendorsList = Array.isArray(vendors) ? vendors : vendors.split('\n').filter(s => s.trim());
        return this.updateSettings({ vendors: vendorsList });
    }
}