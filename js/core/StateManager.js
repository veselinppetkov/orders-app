// js/core/StateManager.js - ПОДОБРЕНА ВЕРСИЯ
export class StateManager {
    constructor() {
        this.state = {
            currentMonth: this.getCurrentMonth(),
            availableMonths: [],
            monthlyData: {},
            clientsData: {},
            inventory: {},
            settings: {
                usdRate: 1.71,
                factoryShipping: 1.5,
                origins: ['OLX', 'Bazar.bg', 'Instagram', 'WhatsApp', 'IG Ads', 'Facebook', 'OLX Romania', 'Viber'],
                vendors: ['Доставчик 1', 'Доставчик 2', 'Доставчик 3', 'AliExpress', 'Local Supplier', 'China Direct']
            }
        };
        this.listeners = new Map();

        console.log('🏗️  StateManager initialized with:', {
            currentMonth: this.state.currentMonth,
            hasDefaultSettings: !!this.state.settings
        });
    }

    getCurrentMonth() {
        const date = new Date();
        return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
    }

    get(key) {
        const value = this.state[key];

        // Debug за monthlyData
        if (key === 'monthlyData' && value) {
            const months = Object.keys(value);
            console.log(`📊 Getting monthlyData: ${months.length} months, current: ${this.state.currentMonth}`);
        }

        return value;
    }

    set(key, value) {
        const oldValue = this.state[key];
        this.state[key] = value;

        // Debug информация
        if (key === 'monthlyData') {
            const months = value ? Object.keys(value) : [];
            console.log(`📝 Setting monthlyData: ${months.length} months`);
        } else if (key === 'currentMonth') {
            console.log(`📅 Setting currentMonth: ${value}`);
        }

        this.notify(key, value, oldValue);
    }

    update(updates) {
        console.log(`🔄 Updating state with keys: [${Object.keys(updates).join(', ')}]`);

        Object.entries(updates).forEach(([key, value]) => {
            this.set(key, value);
        });

        console.log('✅ State update completed');
    }

    subscribe(key, listener) {
        if (!this.listeners.has(key)) {
            this.listeners.set(key, []);
        }
        this.listeners.get(key).push(listener);
        console.log(`👂 Subscribed to "${key}" (${this.listeners.get(key).length} listeners)`);
        return () => this.unsubscribe(key, listener);
    }

    unsubscribe(key, listener) {
        const keyListeners = this.listeners.get(key);
        if (keyListeners) {
            const index = keyListeners.indexOf(listener);
            if (index > -1) {
                keyListeners.splice(index, 1);
                console.log(`🔇 Unsubscribed from "${key}" (${keyListeners.length} listeners remaining)`);
            }
        }
    }

    notify(key, newValue, oldValue) {
        const keyListeners = this.listeners.get(key);
        if (keyListeners && keyListeners.length > 0) {
            console.log(`📢 Notifying ${keyListeners.length} listeners for "${key}"`);
            keyListeners.forEach(listener => {
                try {
                    listener(newValue, oldValue);
                } catch (error) {
                    console.error(`❌ Error in listener for "${key}":`, error);
                }
            });
        }
    }

    getState() {
        return { ...this.state };
    }

    // НОВА ФУНКЦИЯ за debug на състоянието
    debugState() {
        const monthlyData = this.state.monthlyData || {};
        const currentMonth = this.state.currentMonth;

        console.log('🔍 === STATE DEBUG ===');
        console.log('Current month:', currentMonth);
        console.log('Available months in data:', Object.keys(monthlyData));
        console.log('Current month has data:', !!(monthlyData[currentMonth]));

        if (monthlyData[currentMonth]) {
            console.log(`Orders in ${currentMonth}:`, monthlyData[currentMonth].orders?.length || 0);
            console.log(`Expenses in ${currentMonth}:`, monthlyData[currentMonth].expenses?.length || 0);
        }

        console.log('Total clients:', Object.keys(this.state.clientsData || {}).length);
        console.log('Settings present:', !!this.state.settings);
        console.log('===================');
    }
}