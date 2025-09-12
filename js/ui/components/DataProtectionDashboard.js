// js/ui/components/DataProtectionDashboard.js - NEW FILE

export class DataProtectionDashboard {
    constructor(storage, eventBus) {
        this.storage = storage;
        this.eventBus = eventBus;
        this.warningThreshold = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
    }

    // CREATE PROTECTION STATUS WIDGET
    createStatusWidget() {
        const health = this.storage.getStorageHealth();
        const lastExport = localStorage.getItem('lastManualExport');
        const daysSinceExport = lastExport ?
            Math.floor((Date.now() - parseInt(lastExport)) / (24 * 60 * 60 * 1000)) : 999;

        return `
            <div id="data-protection-widget" class="protection-widget ${health.status}">
                <h4>🔒 Data Protection Status</h4>
                <div class="protection-stats">
                    <div class="stat">
                        <span class="label">Storage:</span>
                        <span class="value ${health.status}">${health.usedMB || 0}MB</span>
                    </div>
                    <div class="stat">
                        <span class="label">Backups:</span>
                        <span class="value">${health.backupCount || 0}</span>
                    </div>
                    <div class="stat">
                        <span class="label">Last Export:</span>
                        <span class="value ${daysSinceExport > 7 ? 'warning' : 'good'}">
                            ${daysSinceExport > 999 ? 'Never' : daysSinceExport + ' days ago'}
                        </span>
                    </div>
                </div>
                
                ${daysSinceExport > 7 ? `
                    <div class="protection-alert">
                        ⚠️ Export recommended! Last backup was ${daysSinceExport} days ago.
                        <button class="btn btn-sm urgent-export" onclick="window.app.ui.urgentExport()">
                            📤 Export Now
                        </button>
                    </div>
                ` : ''}
                
                ${health.status === 'warning' || health.status === 'error' ? `
                    <div class="protection-alert error">
                        🚨 ${health.status === 'error' ? 'CRITICAL:' : 'WARNING:'} 
                        ${health.error || 'Storage nearly full!'}
                        <button class="btn btn-sm" onclick="window.app.ui.showBackupManager()">
                            🔧 Manage Backups
                        </button>
                    </div>
                ` : ''}
            </div>
        `;
    }

    // AUTO-EXPORT REMINDER SYSTEM
    checkExportReminder() {
        const lastExport = localStorage.getItem('lastManualExport');
        const daysSinceExport = lastExport ?
            Math.floor((Date.now() - parseInt(lastExport)) / (24 * 60 * 60 * 1000)) : 999;

        if (daysSinceExport >= 7) {
            this.showExportReminder(daysSinceExport);
        }

        // Check every hour
        setTimeout(() => this.checkExportReminder(), 60 * 60 * 1000);
    }

    showExportReminder(days) {
        if (window.app?.ui?.showNotification) {
            window.app.ui.showNotification(
                `🔔 Data backup reminder: Last export was ${days} days ago. Export recommended for safety!`,
                'warning'
            );
        }
    }

    // BACKUP MANAGER MODAL
    createBackupManagerModal() {
        const backups = this.storage.listBackups();
        const health = this.storage.getStorageHealth();

        return `
            <div class="modal">
                <div class="modal-content modal-large">
                    <div class="modal-header">
                        <h2>🔒 Data Protection Manager</h2>
                        <button class="modal-close" onclick="window.app.ui.modals.close()">✕</button>
                    </div>
                    
                    <div class="protection-manager">
                        <div class="health-overview">
                            <h3>Storage Health</h3>
                            <div class="health-stats">
                                <div class="health-item">
                                    <strong>Status:</strong> 
                                    <span class="status-${health.status}">${health.status.toUpperCase()}</span>
                                </div>
                                <div class="health-item">
                                    <strong>Used Space:</strong> ${health.usedMB}MB
                                </div>
                                <div class="health-item">
                                    <strong>Total Backups:</strong> ${health.backupCount}
                                </div>
                                <div class="health-item">
                                    <strong>Last Save:</strong> 
                                    ${health.lastSave ? new Date(parseInt(health.lastSave)).toLocaleString() : 'Unknown'}
                                </div>
                            </div>
                        </div>

                        <div class="backup-actions">
                            <h3>Protection Actions</h3>
                            <div class="action-buttons">
                                <button class="btn success" onclick="window.app.ui.urgentExport()">
                                    📤 Export All Data
                                </button>
                                <button class="btn info" onclick="window.app.ui.forceBackup()">
                                    💾 Force Backup Now
                                </button>
                                <button class="btn warning" onclick="window.app.ui.cleanupStorage()">
                                    🧹 Cleanup Storage
                                </button>
                                <button class="btn secondary" onclick="window.app.ui.testRecovery()">
                                    🔄 Test Recovery
                                </button>
                            </div>
                        </div>

                        <div class="backup-history">
                            <h3>Backup History</h3>
                            ${Object.keys(backups).length > 0 ? `
                                ${Object.entries(backups).map(([key, backupList]) => `
                                    <div class="backup-group">
                                        <h4>${key}</h4>
                                        <div class="backup-list">
                                            ${backupList.slice(0, 3).map(backup => `
                                                <div class="backup-item">
                                                    <span class="backup-date">${new Date(backup.timestamp).toLocaleString()}</span>
                                                    <span class="backup-size">${(backup.size / 1024).toFixed(1)}KB</span>
                                                    <button class="btn btn-sm" onclick="window.app.ui.restoreFromBackup('${key}', ${backup.timestamp})">
                                                        🔄 Restore
                                                    </button>
                                                </div>
                                            `).join('')}
                                        </div>
                                    </div>
                                `).join('')}
                            ` : '<p>No backups found</p>'}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
}