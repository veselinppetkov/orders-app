// js/core/StateManager.js - REWRITTEN FOR CLEAN STATE MANAGEMENT

export class StateManager {
    constructor() {
        this.state = this.createInitialState();
        this.listeners = new Map();
        this.changeLog = [];
        this.maxLogEntries = 50;
        this.isUpdating = false;

        console.log('🏗️ StateManager initialized with clean state');
    }

    createInitialState() {
        return {
            // Core application state
            currentMonth: this.getCurrentMonth(),
            availableMonths: [],

            // Data containers
            monthlyData: {},
            clientsData: {},
            inventory: {},

            // Configuration
            settings: {
                usdRate: 1.71,
                factoryShipping: 1.5,
                origins: ['OLX', 'Bazar.bg', 'Instagram', 'WhatsApp', 'IG Ads', 'Facebook', 'OLX Romania', 'Viber'],
                vendors: ['Доставчик 1', 'Доставчик 2', 'Доставчик 3', 'AliExpress', 'Local Supplier', 'China Direct']
            },

            // Runtime state
            isLoading: false,
            lastUpdate: Date.now(),
            version: '1.0.0'
        };
    }

    getCurrentMonth() {
        const date = new Date();
        return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
    }

    // GET state value with validation
    get(key) {
        if (!key) {
            console.warn('⚠️ StateManager.get() called without key');
            return undefined;
        }

        const value = this.state[key];

        // Log access for debugging (only in development)
        if (this.isDevelopment() && this.isComplexKey(key)) {
            this.logAccess('get', key, value);
        }

        return value;
    }

    // SET single state value with validation
    set(key, value) {
        if (!key) {
            console.warn('⚠️ StateManager.set() called without key');
            return false;
        }

        if (this.isUpdating) {
            console.warn('⚠️ Recursive state update detected, queuing change');
            setTimeout(() => this.set(key, value), 0);
            return false;
        }

        try {
            this.isUpdating = true;

            const oldValue = this.state[key];

            // Validate the change
            if (!this.validateStateChange(key, value, oldValue)) {
                console.error(`❌ Invalid state change for key: ${key}`);
                return false;
            }

            // Apply the change
            this.state[key] = value;
            this.state.lastUpdate = Date.now();

            // Log the change
            this.logChange('set', key, oldValue, value);

            // Notify listeners
            this.notifyListeners(key, value, oldValue);

            return true;

        } catch (error) {
            console.error('❌ Error in StateManager.set():', error);
            return false;

        } finally {
            this.isUpdating = false;
        }
    }

    // UPDATE multiple state values atomically
    update(updates) {
        if (!updates || typeof updates !== 'object') {
            console.warn('⚠️ StateManager.update() called with invalid updates');
            return false;
        }

        if (this.isUpdating) {
            console.warn('⚠️ Recursive state update detected, queuing updates');
            setTimeout(() => this.update(updates), 0);
            return false;
        }

        try {
            this.isUpdating = true;

            const keys = Object.keys(updates);
            console.log(`🔄 Updating state with keys: [${keys.join(', ')}]`);

            // Validate all changes first
            const validations = keys.map(key => ({
                key,
                newValue: updates[key],
                oldValue: this.state[key],
                valid: this.validateStateChange(key, updates[key], this.state[key])
            }));

            const invalidChanges = validations.filter(v => !v.valid);
            if (invalidChanges.length > 0) {
                console.error('❌ Invalid state changes detected:', invalidChanges.map(v => v.key));
                return false;
            }

            // Apply all changes atomically
            const oldState = { ...this.state };

            Object.entries(updates).forEach(([key, value]) => {
                this.state[key] = value;
            });

            this.state.lastUpdate = Date.now();

            // Log the batch update
            this.logChange('batch_update', keys, oldState, { ...this.state });

            // Notify listeners for each changed key
            validations.forEach(({ key, newValue, oldValue }) => {
                this.notifyListeners(key, newValue, oldValue);
            });

            console.log('✅ State batch update completed successfully');
            return true;

        } catch (error) {
            console.error('❌ Error in StateManager.update():', error);
            return false;

        } finally {
            this.isUpdating = false;
        }
    }

    // SUBSCRIBE to state changes
    subscribe(key, listener) {
        if (!key || typeof listener !== 'function') {
            console.warn('⚠️ Invalid subscription parameters');
            return () => {};
        }

        if (!this.listeners.has(key)) {
            this.listeners.set(key, []);
        }

        const keyListeners = this.listeners.get(key);
        keyListeners.push(listener);

        console.log(`👂 Subscribed to "${key}" (${keyListeners.length} total listeners)`);

        // Return unsubscribe function
        return () => this.unsubscribe(key, listener);
    }

    // UNSUBSCRIBE from state changes
    unsubscribe(key, listener) {
        const keyListeners = this.listeners.get(key);
        if (keyListeners) {
            const index = keyListeners.indexOf(listener);
            if (index > -1) {
                keyListeners.splice(index, 1);
                console.log(`🔇 Unsubscribed from "${key}" (${keyListeners.length} remaining)`);
            }
        }
    }

    // NOTIFY listeners of state changes
    notifyListeners(key, newValue, oldValue) {
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

    // VALIDATE state changes
    validateStateChange(key, newValue, oldValue) {
        try {
            // Type validation
            switch (key) {
                case 'currentMonth':
                    return typeof newValue === 'string' && /^\d{4}-\d{2}$/.test(newValue);

                case 'availableMonths':
                    return Array.isArray(newValue) && newValue.every(m =>
                        m && typeof m.key === 'string' && typeof m.name === 'string'
                    );

                case 'monthlyData':
                case 'clientsData':
                case 'inventory':
                    return typeof newValue === 'object' && newValue !== null;

                case 'settings':
                    return typeof newValue === 'object' && newValue !== null &&
                        typeof newValue.usdRate === 'number' &&
                        typeof newValue.factoryShipping === 'number' &&
                        Array.isArray(newValue.origins) &&
                        Array.isArray(newValue.vendors);

                case 'isLoading':
                    return typeof newValue === 'boolean';

                default:
                    return true; // Allow unknown keys for extensibility
            }

        } catch (error) {
            console.error(`❌ Validation error for key "${key}":`, error);
            return false;
        }
    }

    // GET complete state (read-only copy)
    getState() {
        return JSON.parse(JSON.stringify(this.state));
    }

    // RESET state to initial values
    reset() {
        const oldState = { ...this.state };
        this.state = this.createInitialState();
        this.state.lastUpdate = Date.now();

        this.logChange('reset', 'ALL', oldState, this.state);

        // Notify all listeners
        this.listeners.forEach((listeners, key) => {
            const newValue = this.state[key];
            const oldValue = oldState[key];
            this.notifyListeners(key, newValue, oldValue);
        });

        console.log('🔄 State reset to initial values');
    }

    // LOGGING and debugging
    logChange(operation, key, oldValue, newValue) {
        const logEntry = {
            timestamp: Date.now(),
            operation,
            key,
            oldValue: this.summarizeValue(oldValue),
            newValue: this.summarizeValue(newValue)
        };

        this.changeLog.push(logEntry);

        // Trim log if too long
        if (this.changeLog.length > this.maxLogEntries) {
            this.changeLog.shift();
        }

        // Log in development
        if (this.isDevelopment() && this.isImportantChange(key)) {
            console.log(`📝 State ${operation}:`, {
                key,
                old: logEntry.oldValue,
                new: logEntry.newValue
            });
        }
    }

    logAccess(operation, key, value) {
        if (this.isComplexKey(key)) {
            const summary = this.summarizeValue(value);
            console.log(`📂 State ${operation}: ${key} =`, summary);
        }
    }

    summarizeValue(value) {
        if (value === null || value === undefined) {
            return value;
        }

        if (Array.isArray(value)) {
            return `Array(${value.length})`;
        }

        if (typeof value === 'object') {
            const keys = Object.keys(value);
            if (keys.length === 0) return '{}';
            if (keys.length <= 3) return `{${keys.join(', ')}}`;
            return `{${keys.slice(0, 3).join(', ')}... +${keys.length - 3}}`;
        }

        if (typeof value === 'string' && value.length > 50) {
            return `"${value.substring(0, 47)}..."`;
        }

        return value;
    }

    isComplexKey(key) {
        return ['monthlyData', 'clientsData', 'inventory', 'availableMonths'].includes(key);
    }

    isImportantChange(key) {
        return ['currentMonth', 'monthlyData', 'clientsData', 'settings'].includes(key);
    }

    isDevelopment() {
        return window.location.hostname === 'localhost' ||
            window.location.hostname === '127.0.0.1' ||
            window.location.hostname.endsWith('.local');
    }

    // DEBUG methods
    getChangeLog() {
        return [...this.changeLog];
    }

    getListenerCounts() {
        const counts = {};
        this.listeners.forEach((listeners, key) => {
            counts[key] = listeners.length;
        });
        return counts;
    }

    debugState() {
        const monthlyData = this.state.monthlyData || {};
        const currentMonth = this.state.currentMonth;

        console.group('🔍 STATE DEBUG');
        console.log('Current month:', currentMonth);
        console.log('Available months:', Object.keys(monthlyData));
        console.log('Current month has data:', !!(monthlyData[currentMonth]));

        if (monthlyData[currentMonth]) {
            console.log(`Orders in ${currentMonth}:`, monthlyData[currentMonth].orders?.length || 0);
            console.log(`Expenses in ${currentMonth}:`, monthlyData[currentMonth].expenses?.length || 0);
        }

        console.log('Total clients:', Object.keys(this.state.clientsData || {}).length);
        console.log('Inventory items:', Object.keys(this.state.inventory || {}).length);
        console.log('Settings source:', this.state.settings?.source || 'unknown');
        console.log('Last update:', new Date(this.state.lastUpdate).toLocaleString());
        console.log('Listener counts:', this.getListenerCounts());
        console.groupEnd();
    }

    // CLEANUP
    destroy() {
        this.listeners.clear();
        this.changeLog = [];
        this.state = null;
        console.log('🗑️ StateManager destroyed');
    }
}