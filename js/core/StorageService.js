// js/core/StorageService.js - REPLACE ENTIRE FILE with enhanced version

export class StorageService {
    constructor(prefix = 'orderSystem_') {
        this.prefix = prefix;
        this.backupPrefix = 'backup_' + prefix;
        this.maxBackups = 5; // Keep 5 rolling backups
        this.autoBackupInterval = 30000; // Auto-backup every 30 seconds
        this.startAutoBackup();
    }

    // ENHANCED SAVE with backup and verification
    save(key, data) {
        try {
            const jsonStr = JSON.stringify(data);
            const fullKey = this.prefix + key;

            // 1. FIRST: Create backup of existing data
            this.createRollingBackup(key);

            // 2. Save new data
            localStorage.setItem(fullKey, jsonStr);

            // 3. VERIFY the save worked
            const verification = localStorage.getItem(fullKey);
            if (!verification || verification !== jsonStr) {
                throw new Error(`Save verification failed for ${key}`);
            }

            // 4. Update last save timestamp
            localStorage.setItem(this.prefix + 'lastSave', Date.now().toString());

            console.log(`✅ Saved ${key} successfully:`, {
                size: jsonStr.length,
                keys: typeof data === 'object' && data ? Object.keys(data).length : 'N/A',
                timestamp: new Date().toISOString()
            });

            return true;
        } catch (error) {
            console.error(`❌ CRITICAL: Save failed for ${key}:`, error);
            this.handleSaveFailure(key, error);
            return false;
        }
    }

    // ROLLING BACKUP SYSTEM
    createRollingBackup(key) {
        try {
            const currentData = localStorage.getItem(this.prefix + key);
            if (!currentData) return; // Nothing to backup

            const timestamp = Date.now();
            const backupKey = `${this.backupPrefix}${key}_${timestamp}`;

            // Save timestamped backup
            localStorage.setItem(backupKey, currentData);
            localStorage.setItem(`${backupKey}_meta`, JSON.stringify({
                originalKey: key,
                timestamp: timestamp,
                date: new Date().toISOString(),
                size: currentData.length
            }));

            // Clean old backups (keep only recent ones)
            this.cleanOldBackups(key);

        } catch (error) {
            console.warn('⚠️ Backup creation failed:', error);
        }
    }

    // CLEAN OLD BACKUPS
    cleanOldBackups(key) {
        try {
            const backupKeys = Object.keys(localStorage)
                .filter(k => k.startsWith(`${this.backupPrefix}${key}_`))
                .filter(k => !k.endsWith('_meta'))
                .sort()
                .reverse(); // Newest first

            // Remove excess backups
            if (backupKeys.length > this.maxBackups) {
                const toDelete = backupKeys.slice(this.maxBackups);
                toDelete.forEach(backupKey => {
                    localStorage.removeItem(backupKey);
                    localStorage.removeItem(backupKey + '_meta');
                });
                console.log(`🧹 Cleaned ${toDelete.length} old backups for ${key}`);
            }
        } catch (error) {
            console.warn('⚠️ Backup cleanup failed:', error);
        }
    }

    // ENHANCED LOAD with auto-recovery
    load(key) {
        try {
            const rawData = localStorage.getItem(this.prefix + key);
            if (!rawData) {
                console.log(`📂 No data found for key: ${key}, checking backups...`);
                return this.tryRecoverFromBackup(key);
            }

            const parsed = JSON.parse(rawData);

            // Verify data integrity
            if (key === 'monthlyData' && parsed) {
                const months = Object.keys(parsed);
                if (months.length === 0) {
                    console.warn(`⚠️ Empty monthlyData detected, attempting recovery...`);
                    return this.tryRecoverFromBackup(key);
                }
            }

            console.log(`📂 Loaded ${key} successfully`);
            return parsed;

        } catch (error) {
            console.error(`❌ Load error for ${key}:`, error);
            console.log(`🔄 Attempting recovery from backup...`);
            return this.tryRecoverFromBackup(key);
        }
    }

    // BACKUP RECOVERY SYSTEM
    tryRecoverFromBackup(key) {
        try {
            const backupKeys = Object.keys(localStorage)
                .filter(k => k.startsWith(`${this.backupPrefix}${key}_`))
                .filter(k => !k.endsWith('_meta'))
                .sort()
                .reverse(); // Try newest backup first

            for (const backupKey of backupKeys) {
                try {
                    const backupData = localStorage.getItem(backupKey);
                    const parsed = JSON.parse(backupData);

                    console.log(`🔄 Recovered data from backup: ${backupKey}`);

                    // Restore the recovered data
                    this.save(key, parsed);

                    // Notify user of recovery
                    this.showRecoveryNotification(key, backupKey);

                    return parsed;
                } catch (backupError) {
                    console.warn(`⚠️ Backup ${backupKey} corrupted:`, backupError);
                    continue; // Try next backup
                }
            }

            console.error(`❌ All backups failed for ${key}`);
            return null;

        } catch (error) {
            console.error(`❌ Recovery failed for ${key}:`, error);
            return null;
        }
    }

    // AUTO-BACKUP SYSTEM
    startAutoBackup() {
        // Auto-backup critical data every 30 seconds
        setInterval(() => {
            try {
                const criticalKeys = ['monthlyData', 'clientsData', 'settings'];
                criticalKeys.forEach(key => {
                    const data = this.load(key);
                    if (data) {
                        this.createRollingBackup(key);
                    }
                });
                console.log(`🔄 Auto-backup completed: ${new Date().toLocaleTimeString()}`);
            } catch (error) {
                console.error('❌ Auto-backup failed:', error);
            }
        }, this.autoBackupInterval);

        console.log(`🔄 Auto-backup started (every ${this.autoBackupInterval/1000}s)`);
    }

    // FAILURE HANDLING
    handleSaveFailure(key, error) {
        // Try to free up space by removing old data
        if (error.message.includes('quota') || error.name === 'QuotaExceededError') {
            console.log('💾 Storage quota exceeded, attempting cleanup...');
            this.emergencyCleanup();

            // Show critical alert
            if (window.app?.ui?.showNotification) {
                window.app.ui.showNotification(
                    '⚠️ CRITICAL: Storage full! Data export recommended immediately!',
                    'error'
                );
            }
        }
    }

    // EMERGENCY CLEANUP
    emergencyCleanup() {
        try {
            // Remove old backups beyond minimum
            const allKeys = Object.keys(localStorage);
            const backupKeys = allKeys.filter(k => k.startsWith(this.backupPrefix));

            // Remove oldest 50% of backups
            const toDelete = backupKeys.slice(Math.floor(backupKeys.length / 2));
            toDelete.forEach(key => localStorage.removeItem(key));

            console.log(`🧹 Emergency cleanup: removed ${toDelete.length} old backups`);
        } catch (error) {
            console.error('❌ Emergency cleanup failed:', error);
        }
    }

    // STORAGE HEALTH CHECK
    getStorageHealth() {
        try {
            const used = JSON.stringify(localStorage).length;
            const testKey = 'storage_test_' + Date.now();

            // Test write ability
            try {
                localStorage.setItem(testKey, 'test');
                localStorage.removeItem(testKey);
            } catch (e) {
                return { status: 'error', used, error: 'Cannot write to localStorage' };
            }

            return {
                status: used > 4 * 1024 * 1024 ? 'warning' : 'good', // 4MB warning
                used: used,
                usedMB: (used / (1024 * 1024)).toFixed(2),
                lastSave: localStorage.getItem(this.prefix + 'lastSave'),
                backupCount: Object.keys(localStorage).filter(k => k.startsWith(this.backupPrefix)).length
            };
        } catch (error) {
            return { status: 'error', error: error.message };
        }
    }

    // RECOVERY NOTIFICATION
    showRecoveryNotification(key, backupKey) {
        if (window.app?.ui?.showNotification) {
            const timestamp = backupKey.split('_').pop();
            const date = new Date(parseInt(timestamp)).toLocaleString();
            window.app.ui.showNotification(
                `🔄 Data recovered from backup created at ${date}`,
                'info'
            );
        }
    }

    // LIST ALL BACKUPS
    listBackups() {
        const backups = {};
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith(this.backupPrefix) && key.endsWith('_meta')) {
                try {
                    const meta = JSON.parse(localStorage.getItem(key));
                    const originalKey = meta.originalKey;
                    if (!backups[originalKey]) backups[originalKey] = [];
                    backups[originalKey].push(meta);
                } catch (e) {
                    console.warn('Invalid backup meta:', key);
                }
            }
        });

        // Sort by timestamp
        Object.keys(backups).forEach(key => {
            backups[key].sort((a, b) => b.timestamp - a.timestamp);
        });

        return backups;
    }

    // EXISTING METHODS (keep unchanged)
    remove(key) {
        localStorage.removeItem(this.prefix + key);
        console.log(`🗑️ Removed ${key}`);
    }

    clear() {
        const keysToRemove = Object.keys(localStorage)
            .filter(key => key.startsWith(this.prefix));
        keysToRemove.forEach(key => localStorage.removeItem(key));
        console.log(`🧹 Cleared ${keysToRemove.length} keys`);
    }

    // ENHANCED EXPORT with backup metadata
    async exportData() {
        try {
            const monthlyData = this.load('monthlyData') || {};
            const clientsData = this.load('clientsData') || {};
            const settings = this.load('settings') || {};
            const inventory = this.load('inventory') || {};
            const health = this.getStorageHealth();
            const backupInfo = this.listBackups();

            const data = {
                monthlyData,
                clientsData,
                settings,
                inventory,
                exportDate: new Date().toISOString(),
                version: '2.0', // Enhanced version
                storageHealth: health,
                backupInfo: backupInfo,
                totalOrders: Object.values(monthlyData).reduce((sum, month) => sum + (month.orders?.length || 0), 0)
            };

            const jsonStr = JSON.stringify(data, null, 2);
            const blob = new Blob([jsonStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = `orders-enhanced-backup-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            console.log('✅ Enhanced export completed with backup metadata');
            return true;
        } catch (error) {
            console.error('❌ Export failed:', error);
            throw error;
        }
    }
}