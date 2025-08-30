export class SettingsModule {
    constructor(state, storage, eventBus) {
        this.state = state;
        this.storage = storage;
        this.eventBus = eventBus;
    }

    getSettings() {
        return this.state.get('settings');
    }

    updateSettings(settings) {
        const currentSettings = this.state.get('settings');
        const updatedSettings = { ...currentSettings, ...settings };

        this.storage.save('settings', updatedSettings);
        this.state.set('settings', updatedSettings);
        this.eventBus.emit('settings:updated', updatedSettings);

        return updatedSettings;
    }

    updateUsdRate(rate) {
        return this.updateSettings({ usdRate: parseFloat(rate) });
    }

    updateShipping(shipping) {
        return this.updateSettings({ factoryShipping: parseFloat(shipping) });
    }

    updateOrigins(origins) {
        const originsList = Array.isArray(origins) ? origins : origins.split('\n').filter(s => s.trim());
        return this.updateSettings({ origins: originsList });
    }

    updateVendors(vendors) {
        const vendorsList = Array.isArray(vendors) ? vendors : vendors.split('\n').filter(s => s.trim());
        return this.updateSettings({ vendors: vendorsList });
    }
}