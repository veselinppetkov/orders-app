// js/core/StorageService.js - PROPERLY SIMPLIFIED (backup system removed)

export class StorageService {
    constructor(prefix = 'orderSystem_') {
        this.prefix = prefix;
        this.operationCount = 0;
        this.lastOperationTime = Date.now();

        // Basic health monitoring
        this.isHealthy = true;
        this.failureCount = 0;
        this.maxFailures = 5;

        console.log('💾 StorageService initialized (simplified)');
    }

    // SAVE data with error handling
    save(key, data) {
        if (!key || data === undefined) {
            console.error('❌ Invalid save parameters:', { key, dataType: typeof data });
            return false;
        }

        const fullKey = this.prefix + key;
        const startTime = performance.now();

        try {
            // Prepare data for storage
            const storageData = this.prepareForStorage(data);

            // Attempt to save
            localStorage.setItem(fullKey, storageData);

            // Verify the save worked
            const verification = localStorage.getItem(fullKey);
            if (!verification) {
                throw new Error('Save verification failed');
            }

            this.updateStats('save', performance.now() - startTime);
            this.recordSuccess();

            console.log(`✅ Saved ${key} successfully`);
            return true;

        } catch (error) {
            this.recordFailure(error);
            console.error(`❌ Save failed for ${key}:`, error);
            return false;
        }
    }

    // LOAD data with validation
    load(key) {
        if (!key) {
            console.error('❌ Load called without key');
            return null;
        }

        const fullKey = this.prefix + key;

        try {
            const rawData = localStorage.getItem(fullKey);

            if (rawData === null) {
                console.log(`📂 No data found for key: ${key}`);
                return null;
            }

            const parsedData = this.parseStoredData(rawData);
            console.log(`📂 Loaded ${key} successfully`);
            return parsedData;

        } catch (error) {
            console.error(`❌ Load error for ${key}:`, error);
            this.recordFailure(error);
            return null;
        }
    }

    // DELETE data
    delete(key) {
        if (!key) return false;

        try {
            const fullKey = this.prefix + key;
            localStorage.removeItem(fullKey);
            console.log(`🗑️ Deleted ${key}`);
            return true;

        } catch (error) {
            console.error(`❌ Delete failed for ${key}:`, error);
            return false;
        }
    }

    // DATA PREPARATION
    prepareForStorage(data) {
        return typeof data === 'string' ? data : JSON.stringify(data);
    }

    parseStoredData(rawData) {
        try {
            return JSON.parse(rawData);
        } catch {
            // If JSON parsing fails, return as string
            return rawData;
        }
    }

    // HEALTH MONITORING (simplified)
    recordSuccess() {
        this.failureCount = Math.max(0, this.failureCount - 1);
        this.isHealthy = this.failureCount < this.maxFailures;
    }

    recordFailure(error) {
        this.failureCount++;
        this.isHealthy = this.failureCount < this.maxFailures;

        if (!this.isHealthy) {
            console.error('❌ Storage marked as unhealthy');
        }
    }

    updateStats(operation, duration) {
        this.operationCount++;
        this.lastOperationTime = Date.now();

        if (duration > 100) {
            console.warn(`⚠️ Slow storage ${operation}: ${duration.toFixed(2)}ms`);
        }
    }

    // EXPORT/IMPORT (basic functionality)
    async exportData() {
        try {
            console.log('📤 Starting data export...');

            const data = {
                monthlyData: this.load('monthlyData') || {},
                clientsData: this.load('clientsData') || {},
                inventory: this.load('inventory') || {},
                settings: this.load('settings') || {},
                exportDate: new Date().toISOString(),
                version: '2.0'
            };

            // Calculate totals for user info
            data.totalOrders = Object.values(data.monthlyData)
                .reduce((sum, month) => sum + (month.orders?.length || 0), 0);
            data.totalClients = Object.keys(data.clientsData).length;

            const jsonStr = JSON.stringify(data, null, 2);
            const blob = new Blob([jsonStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = `orders-backup-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            console.log('✅ Data export completed');
            return true;

        } catch (error) {
            console.error('❌ Export failed:', error);
            throw error;
        }
    }

    async importData(file) {
        return new Promise((resolve, reject) => {
            if (!file) {
                reject(new Error('No file provided'));
                return;
            }

            const reader = new FileReader();

            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    this.validateImportData(data);

                    // Import data (overwrites existing)
                    if (data.monthlyData) this.save('monthlyData', data.monthlyData);
                    if (data.clientsData) this.save('clientsData', data.clientsData);
                    if (data.inventory) this.save('inventory', data.inventory);
                    if (data.settings) this.save('settings', data.settings);

                    console.log('✅ Data import completed');
                    resolve(data);

                } catch (error) {
                    console.error('❌ Import failed:', error);
                    reject(error);
                }
            };

            reader.onerror = () => {
                reject(new Error('File reading failed'));
            };

            reader.readAsText(file);
        });
    }

    validateImportData(data) {
        if (!data || typeof data !== 'object') {
            throw new Error('Invalid import data format');
        }

        const requiredFields = ['monthlyData', 'clientsData', 'settings'];
        for (const field of requiredFields) {
            if (!(field in data)) {
                throw new Error(`Missing required field: ${field}`);
            }
        }
    }

    // UTILITIES
    listKeys() {
        return Object.keys(localStorage)
            .filter(key => key.startsWith(this.prefix))
            .map(key => key.replace(this.prefix, ''));
    }

    getStorageSize() {
        return JSON.stringify(localStorage).length;
    }

    // DEBUGGING
    debugStorage() {
        console.group('🔍 STORAGE DEBUG');
        console.log('Available keys:', this.listKeys());
        console.log('Total size:', `${(this.getStorageSize() / 1024).toFixed(1)}KB`);
        console.log('Operations performed:', this.operationCount);
        console.log('Is healthy:', this.isHealthy);
        console.groupEnd();
    }
}