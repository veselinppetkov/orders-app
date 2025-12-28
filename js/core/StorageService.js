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

    // EXPORT settings and UI preferences only (not business data)
    async exportData() {
        try {
            console.log('📤 Starting settings export...');

            const data = {
                settings: this.load('settings') || {},
                currentMonth: localStorage.getItem('orderSystem_currentMonth'),
                availableMonths: JSON.parse(localStorage.getItem('orderSystem_availableMonths') || '[]'),
                exportDate: new Date().toISOString(),
                version: '2.0',
                type: 'settings-only'
            };

            const jsonStr = JSON.stringify(data, null, 2);
            const blob = new Blob([jsonStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = `settings-backup-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            console.log('✅ Settings export completed');
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

                    // Import settings and UI preferences only
                    if (data.settings) {
                        this.save('settings', data.settings);
                    }
                    if (data.currentMonth) {
                        localStorage.setItem('orderSystem_currentMonth', data.currentMonth);
                    }
                    if (data.availableMonths) {
                        localStorage.setItem('orderSystem_availableMonths', JSON.stringify(data.availableMonths));
                    }

                    console.log('✅ Settings import completed');
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

        // For settings-only exports, only require settings field
        if (data.type === 'settings-only') {
            if (!('settings' in data)) {
                throw new Error('Missing required field: settings');
            }
        } else {
            // For legacy exports, warn that business data will be ignored
            console.warn('⚠️ This appears to be a legacy backup file. Only settings will be imported.');
            if (!('settings' in data)) {
                throw new Error('No settings found in import file');
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