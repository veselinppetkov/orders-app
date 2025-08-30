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
    }

    getCurrentMonth() {
        const date = new Date();
        return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
    }

    get(key) {
        return this.state[key];
    }

    set(key, value) {
        const oldValue = this.state[key];
        this.state[key] = value;
        this.notify(key, value, oldValue);
    }

    update(updates) {
        Object.entries(updates).forEach(([key, value]) => {
            this.set(key, value);
        });
    }

    subscribe(key, listener) {
        if (!this.listeners.has(key)) {
            this.listeners.set(key, []);
        }
        this.listeners.get(key).push(listener);
        return () => this.unsubscribe(key, listener);
    }

    unsubscribe(key, listener) {
        const keyListeners = this.listeners.get(key);
        if (keyListeners) {
            const index = keyListeners.indexOf(listener);
            if (index > -1) keyListeners.splice(index, 1);
        }
    }

    notify(key, newValue, oldValue) {
        const keyListeners = this.listeners.get(key);
        if (keyListeners) {
            keyListeners.forEach(listener => listener(newValue, oldValue));
        }
    }

    getState() {
        return { ...this.state };
    }
}