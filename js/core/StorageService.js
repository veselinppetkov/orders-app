// js/core/StorageService.js - REWRITTEN FOR CLEAN STORAGE MANAGEMENT

export class StorageService {
    constructor(prefix = 'orderSystem_') {
        this.prefix = prefix;
        this.backupPrefix = 'backup_' + prefix;
        this.maxBackups = 3; // Reduced from 5 to prevent storage bloat
        this.compressionThreshold = 50000; // Compress data larger than 50KB
        this.lastOperationTime = Date.now();
        this.operationCount = 0;

        // Health monitoring
        this.failureCount = 0;
        this.maxFailures = 5;
        this.isHealthy = true;

        this.initializeStorage();
        console.log('💾 StorageService initialized with enhanced capabilities');
    }

    initializeStorage() {
        try {
            // Test localStorage availability
            this.testStorageAvailability();

            // Clean up old or corrupted data
            this.performStartupCleanup();

            // Set up periodic maintenance
            this.scheduleMaintenanceTasks();

        } catch (error) {
            console.error('❌ Storage initialization failed:', error);
            this.isHealthy = false;
        }
    }

    testStorageAvailability() {
        const testKey = this.prefix + 'test_' + Date.now();
        const testValue = 'storage_test';

        try {
            localStorage.setItem(testKey, testValue);
            const retrieved = localStorage.getItem(testKey);
            localStorage.removeItem(testKey);

            if (retrieved !== testValue) {
                throw new Error('localStorage read/write mismatch');
            }

            console.log('✅ localStorage is available and functional');

        } catch (error) {
            console.error('❌ localStorage is not available:', error);
            throw new Error('localStorage not available: ' + error.message);
        }
    }

    // SAVE data with validation, compression, and backup
    save(key, data) {
        if (!this.isHealthy) {
            console.warn('⚠️ Storage is unhealthy, attempting save anyway');
        }

        if (!key || data === undefined) {
            console.error('❌ Invalid save parameters:', { key, dataType: typeof data });
            return false;
        }

        const fullKey = this.prefix + key;
        const startTime = performance.now();

        try {
            // Validate data before saving
            this.validateData(key, data);

            // Create backup of existing data first
            this.createBackup(key);

            // Prepare data for storage
            const storageData = this.prepareForStorage(data);

            // Attempt to save
            localStorage.setItem(fullKey, storageData);

            // Verify the save worked
            const verification = localStorage.getItem(fullKey);
            if (!verification) {
                throw new Error('Save verification failed - data not found after save');
            }

            // Update operation tracking
            this.updateOperationStats('save', performance.now() - startTime);

            // Update health status
            this.recordSuccess();

            console.log(`✅ Saved ${key} successfully (${storageData.length} bytes)`);
            return true;

        } catch (error) {
            this.recordFailure(error);
            console.error(`❌ Save failed for ${key}:`, error);

            // Attempt recovery if save failed
            this.attemptSaveRecovery(key, data, error);
            return false;
        }
    }

    // LOAD data with validation and error recovery
    load(key) {
        if (!key) {
            console.error('❌ Load called without key');
            return null;
        }

        const fullKey = this.prefix + key;
        const startTime = performance.now();

        try {
            const rawData = localStorage.getItem(fullKey);

            if (rawData === null) {
                console.log(`📂 No data found for key: ${key}`);
                return null;
            }

            // Parse and validate data
            const parsedData = this.parseStoredData(rawData);
            const validatedData = this.validateLoadedData(key, parsedData);

            // Update operation tracking
            this.updateOperationStats('load', performance.now() - startTime);

            console.log(`📂 Loaded ${key} successfully`);
            return validatedData;

        } catch (error) {
            console.error(`❌ Load error for ${key}:`, error);

            // Attempt recovery from backup
            return this.attemptLoadRecovery(key, error);
        }
    }

    // BACKUP system - simplified and efficient
    createBackup(key) {
        if (!key) return;

        try {
            const fullKey = this.prefix + key;
            const currentData = localStorage.getItem(fullKey);

            if (!currentData) {
                return; // Nothing to backup
            }

            const timestamp = Date.now();
            const backupKey = `${this.backupPrefix}${key}_${timestamp}`;

            // Store backup with metadata
            const backupData = {
                data: currentData,
                originalKey: key,
                timestamp: timestamp,
                size: currentData.length
            };

            localStorage.setItem(backupKey, JSON.stringify(backupData));

            // Clean old backups to prevent storage bloat
            this.cleanOldBackups(key);

        } catch (error) {
            console.warn('⚠️ Backup creation failed:', error);
            // Don't fail the main operation if backup fails
        }
    }

    cleanOldBackups(key) {
        try {
            const backupKeys = this.getBackupKeys(key);

            if (backupKeys.length > this.maxBackups) {
                const toDelete = backupKeys
                    .sort() // Sort by timestamp (embedded in key)
                    .slice(0, backupKeys.length - this.maxBackups);

                toDelete.forEach(backupKey => {
                    localStorage.removeItem(backupKey);
                });

                console.log(`🧹 Cleaned ${toDelete.length} old backups for ${key}`);
            }

        } catch (error) {
            console.warn('⚠️ Backup cleanup failed:', error);
        }
    }

    getBackupKeys(key) {
        const pattern = `${this.backupPrefix}${key}_`;
        return Object.keys(localStorage)
            .filter(k => k.startsWith(pattern))
            .sort(); // Sort by timestamp
    }

    // RECOVERY methods
    attemptLoadRecovery(key, originalError) {
        console.log(`🔄 Attempting recovery for ${key}...`);

        try {
            const backupKeys = this.getBackupKeys(key);

            if (backupKeys.length === 0) {
                console.error(`❌ No backups available for ${key}`);
                return null;
            }

            // Try backups from newest to oldest
            for (const backupKey of backupKeys.reverse()) {
                try {
                    const backupRaw = localStorage.getItem(backupKey);
                    const backup = JSON.parse(backupRaw);
                    const recoveredData = this.parseStoredData(backup.data);

                    console.log(`✅ Recovered ${key} from backup: ${backupKey}`);

                    // Restore the recovered data to main storage
                    this.save(key, recoveredData);

                    return recoveredData;

                } catch (backupError) {
                    console.warn(`⚠️ Backup ${backupKey} is corrupted:`, backupError);
                    continue; // Try next backup
                }
            }

            console.error(`❌ All backups failed for ${key}`);
            return null;

        } catch (error) {
            console.error(`❌ Recovery process failed for ${key}:`, error);
            return null;
        }
    }

    attemptSaveRecovery(key, data, originalError) {
        console.log(`🔄 Attempting save recovery for ${key}...`);

        try {
            // If quota exceeded, try cleanup and retry
            if (this.isQuotaError(originalError)) {
                console.log('💾 Storage quota exceeded, attempting cleanup...');

                this.performEmergencyCleanup();

                // Retry save after cleanup
                setTimeout(() => {
                    this.save(key, data);
                }, 1000);

                return true;
            }

            return false;

        } catch (error) {
            console.error('❌ Save recovery failed:', error);
            return false;
        }
    }

    // DATA preparation and validation
    validateData(key, data) {
        if (data === null || data === undefined) {
            throw new Error(`Invalid data for key ${key}: ${data}`);
        }

        // Type-specific validation
        switch (key) {
            case 'monthlyData':
                if (typeof data !== 'object') {
                    throw new Error('monthlyData must be an object');
                }
                break;

            case 'clientsData':
                if (typeof data !== 'object') {
                    throw new Error('clientsData must be an object');
                }
                break;

            case 'settings':
                if (typeof data !== 'object' || !data.usdRate) {
                    throw new Error('settings must be a valid settings object');
                }
                break;
        }
    }

    prepareForStorage(data) {
        const jsonString = JSON.stringify(data);

        // Compress large data
        if (jsonString.length > this.compressionThreshold) {
            console.log(`📦 Compressing large data (${jsonString.length} bytes)`);
            // Simple compression marker - in real app you'd use actual compression
            return JSON.stringify({
                _compressed: true,
                _originalSize: jsonString.length,
                data: jsonString
            });
        }

        return jsonString;
    }

    parseStoredData(rawData) {
        const parsed = JSON.parse(rawData);

        // Handle compressed data
        if (parsed._compressed) {
            console.log(`📦 Decompressing data (${parsed._originalSize} bytes)`);
            return JSON.parse(parsed.data);
        }

        return parsed;
    }

    validateLoadedData(key, data) {
        if (data === null || data === undefined) {
            throw new Error(`Loaded data is null for key: ${key}`);
        }

        // Perform basic structure validation
        switch (key) {
            case 'monthlyData':
                if (typeof data !== 'object') {
                    throw new Error('Invalid monthlyData structure');
                }
                break;

            case 'clientsData':
                if (typeof data !== 'object') {
                    throw new Error('Invalid clientsData structure');
                }
                break;
        }

        return data;
    }

    // UTILITY methods
    remove(key) {
        if (!key) return false;

        try {
            const fullKey = this.prefix + key;
            localStorage.removeItem(fullKey);

            // Also remove backups for this key
            const backupKeys = this.getBackupKeys(key);
            backupKeys.forEach(backupKey => {
                localStorage.removeItem(backupKey);
            });

            console.log(`🗑️ Removed ${key} and ${backupKeys.length} backups`);
            return true;

        } catch (error) {
            console.error(`❌ Remove failed for ${key}:`, error);
            return false;
        }
    }

    clear() {
        try {
            const keysToRemove = Object.keys(localStorage)
                .filter(key => key.startsWith(this.prefix) || key.startsWith(this.backupPrefix));

            keysToRemove.forEach(key => localStorage.removeItem(key));

            console.log(`🧹 Cleared ${keysToRemove.length} storage keys`);
            return true;

        } catch (error) {
            console.error('❌ Clear failed:', error);
            return false;
        }
    }

    // MAINTENANCE and health
    performStartupCleanup() {
        try {
            // Remove very old backups (older than 7 days)
            const cutoffTime = Date.now() - (7 * 24 * 60 * 60 * 1000);
            const allKeys = Object.keys(localStorage);
            let cleanedCount = 0;

            allKeys.forEach(key => {
                if (key.startsWith(this.backupPrefix)) {
                    const timestampMatch = key.match(/_(\d+)$/);
                    if (timestampMatch) {
                        const timestamp = parseInt(timestampMatch[1]);
                        if (timestamp < cutoffTime) {
                            localStorage.removeItem(key);
                            cleanedCount++;
                        }
                    }
                }
            });

            if (cleanedCount > 0) {
                console.log(`🧹 Startup cleanup: removed ${cleanedCount} old backups`);
            }

        } catch (error) {
            console.warn('⚠️ Startup cleanup failed:', error);
        }
    }

    performEmergencyCleanup() {
        try {
            console.log('🚨 Performing emergency storage cleanup...');

            // Remove oldest 50% of backups
            const allBackupKeys = Object.keys(localStorage)
                .filter(key => key.startsWith(this.backupPrefix))
                .sort(); // Sort by timestamp

            const toDelete = allBackupKeys.slice(0, Math.floor(allBackupKeys.length / 2));
            toDelete.forEach(key => localStorage.removeItem(key));

            console.log(`🧹 Emergency cleanup: removed ${toDelete.length} backups`);

        } catch (error) {
            console.error('❌ Emergency cleanup failed:', error);
        }
    }

    scheduleMaintenanceTasks() {
        // Periodic cleanup every 30 minutes
        setInterval(() => {
            this.performRoutineMaintenance();
        }, 30 * 60 * 1000);

        console.log('⏰ Scheduled maintenance tasks');
    }

    performRoutineMaintenance() {
        try {
            console.log('🔧 Performing routine storage maintenance...');

            // Clean old backups for each key
            const dataKeys = ['monthlyData', 'clientsData', 'inventory', 'settings'];
            dataKeys.forEach(key => {
                this.cleanOldBackups(key);
            });

            // Check storage health
            this.checkStorageHealth();

        } catch (error) {
            console.error('❌ Routine maintenance failed:', error);
        }
    }

    // HEALTH monitoring
    recordSuccess() {
        this.failureCount = 0;
        this.isHealthy = true;
    }

    recordFailure(error) {
        this.failureCount++;

        if (this.failureCount >= this.maxFailures) {
            this.isHealthy = false;
            console.error('🚨 Storage marked as unhealthy due to repeated failures');
        }
    }

    updateOperationStats(operation, duration) {
        this.operationCount++;
        this.lastOperationTime = Date.now();

        if (duration > 100) {
            console.warn(`⚠️ Slow storage ${operation}: ${duration.toFixed(2)}ms`);
        }
    }

    checkStorageHealth() {
        try {
            const health = this.getStorageHealth();

            if (health.status === 'warning' || health.status === 'error') {
                console.warn('⚠️ Storage health check:', health);
            }

            return health;

        } catch (error) {
            console.error('❌ Health check failed:', error);
            return { status: 'error', error: error.message };
        }
    }

    getStorageHealth() {
        try {
            // Calculate used storage
            const used = JSON.stringify(localStorage).length;
            const usedMB = (used / (1024 * 1024)).toFixed(2);

            // Count backups
            const backupCount = Object.keys(localStorage)
                .filter(key => key.startsWith(this.backupPrefix)).length;

            // Determine status
            let status = 'good';
            if (used > 8 * 1024 * 1024) { // 8MB
                status = 'error';
            } else if (used > 4 * 1024 * 1024) { // 4MB
                status = 'warning';
            }

            if (!this.isHealthy) {
                status = 'error';
            }

            return {
                status,
                used,
                usedMB,
                backupCount,
                failureCount: this.failureCount,
                isHealthy: this.isHealthy,
                lastOperation: this.lastOperationTime,
                operationCount: this.operationCount
            };

        } catch (error) {
            return {
                status: 'error',
                error: error.message
            };
        }
    }

    // EXPORT and import
    async exportData() {
        try {
            console.log('📤 Starting data export...');

            const data = {
                monthlyData: this.load('monthlyData') || {},
                clientsData: this.load('clientsData') || {},
                inventory: this.load('inventory') || {},
                settings: this.load('settings') || {},

                // Export metadata
                exportDate: new Date().toISOString(),
                version: '2.0',
                storageHealth: this.getStorageHealth(),

                // Statistics
                operationCount: this.operationCount,
                lastOperation: this.lastOperationTime
            };

            // Calculate totals
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

            console.log('✅ Data export completed successfully');
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

                    // Validate import data
                    this.validateImportData(data);

                    // Create backup before import
                    this.createFullBackup();

                    // Import data
                    if (data.monthlyData) this.save('monthlyData', data.monthlyData);
                    if (data.clientsData) this.save('clientsData', data.clientsData);
                    if (data.inventory) this.save('inventory', data.inventory);
                    if (data.settings) this.save('settings', data.settings);

                    console.log('✅ Data import completed successfully');
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

        // Check for required fields
        const requiredFields = ['monthlyData', 'clientsData', 'settings'];
        for (const field of requiredFields) {
            if (!(field in data)) {
                throw new Error(`Missing required field: ${field}`);
            }
        }
    }

    createFullBackup() {
        const timestamp = Date.now();
        const backupKey = `${this.backupPrefix}full_${timestamp}`;

        const fullBackup = {
            monthlyData: this.load('monthlyData'),
            clientsData: this.load('clientsData'),
            inventory: this.load('inventory'),
            settings: this.load('settings'),
            timestamp,
            type: 'full_backup'
        };

        localStorage.setItem(backupKey, JSON.stringify(fullBackup));
        console.log('💾 Created full backup before import');
    }

    // UTILITY helpers
    isQuotaError(error) {
        return error.name === 'QuotaExceededError' ||
            error.message.includes('quota') ||
            error.message.includes('storage');
    }

    getStorageSize() {
        return JSON.stringify(localStorage).length;
    }

    listKeys() {
        return Object.keys(localStorage)
            .filter(key => key.startsWith(this.prefix))
            .map(key => key.replace(this.prefix, ''));
    }

    // DEBUGGING
    debugStorage() {
        const health = this.getStorageHealth();

        console.group('🔍 STORAGE DEBUG');
        console.log('Health:', health);
        console.log('Available keys:', this.listKeys());
        console.log('Backup keys:', Object.keys(localStorage).filter(k => k.startsWith(this.backupPrefix)).length);
        console.log('Total size:', `${health.usedMB}MB`);
        console.log('Operations performed:', this.operationCount);
        console.groupEnd();
    }
}