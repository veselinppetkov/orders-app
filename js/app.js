// js/app.js - ОБНОВЕНА ВЕРСИЯ С UNDO/REDO
import { StateManager } from './core/StateManager.js';
import { StorageService } from './core/StorageService.js';
import { EventBus } from './core/EventBus.js';
import { Router } from './core/Router.js';
import { UndoRedoManager } from './core/UndoRedoManager.js';
import { OrdersModule } from './modules/OrdersModule.js';
import { ClientsModule } from './modules/ClientsModule.js';
import { ExpensesModule } from './modules/ExpensesModule.js';
import { ReportsModule } from './modules/ReportsModule.js';
import { SettingsModule } from './modules/SettingsModule.js';
import { UIManager } from './ui/UIManager.js';
import { InventoryModule } from "./modules/InventoryModule.js";

export class App {
    constructor() {
        // Core services
        this.state = new StateManager();
        this.storage = new StorageService();
        this.eventBus = new EventBus();
        this.router = new Router(this.eventBus);

        this.unsavedChanges = false;
        this.lastAutoSave = Date.now();
        this.emergencyExportAttempts = 0;

        // Business modules
        this.modules = {
            orders: new OrdersModule(this.state, this.storage, this.eventBus),
            clients: new ClientsModule(this.state, this.storage, this.eventBus),
            inventory: new InventoryModule(this.state, this.storage, this.eventBus),
            expenses: new ExpensesModule(this.state, this.storage, this.eventBus),
            reports: new ReportsModule(this.state, this.eventBus),
            settings: new SettingsModule(this.state, this.storage, this.eventBus)
        };

        // Undo/Redo система (добавена)
        this.undoRedo = new UndoRedoManager(this.state, this.storage, this.eventBus);
    }

    async init() {
        console.log('Initializing Order Management System...');

        // КРИТИЧНО: Зареждаме всички данни ПРЕДИ UIManager
        await this.loadData();

        // Създаваме UIManager СЛЕД зареждане на данните
        this.ui = new UIManager(this.modules, this.state, this.eventBus, this.router, this.undoRedo);  // Добави undoRedo тук

        // Initialize router
        this.router.init();

        // Initialize UI
        this.ui.init();

        // Setup global event handlers
        this.setupEventHandlers();

        // Добавяме глобален достъп за debugging
        window.undoRedo = this.undoRedo;

        console.log('Application initialized successfully');

        this.setupBrowserProtection();
        this.startEmergencyProtection();
        this.setupVisibilityProtection();

        console.log('🔒 Data protection systems activated');
    }

    async loadData() {
        console.log('Loading data from localStorage...');

        // Зареждаме всички данни
        const monthlyDataRaw = localStorage.getItem('orderSystem_monthlyData');
        const clientsDataRaw = localStorage.getItem('orderSystem_clientsData');
        const inventoryRaw = localStorage.getItem('orderSystem_inventory');
        const settingsRaw = localStorage.getItem('orderSystem_settings');
        const currentMonthRaw = localStorage.getItem('orderSystem_currentMonth');

        // Парсваме данните
        const monthlyData = monthlyDataRaw ? JSON.parse(monthlyDataRaw) : {};
        const clientsData = clientsDataRaw ? JSON.parse(clientsDataRaw) : {};
        const inventory = inventoryRaw ? JSON.parse(inventoryRaw) : {};
        const settings = settingsRaw ? JSON.parse(settingsRaw) : this.getDefaultSettings();

        // ВАЖНО: Запазваме текущия месец
        const currentMonth = currentMonthRaw || this.getCurrentMonth();

        console.log('Loaded data:', {
            currentMonth,
            monthlyDataKeys: Object.keys(monthlyData),
            ordersInCurrentMonth: monthlyData[currentMonth]?.orders?.length || 0
        });

        // Обновяваме state
        this.state.update({
            monthlyData,
            clientsData,
            inventory,
            settings,
            currentMonth
        });

        // Запазваме currentMonth ако не е бил запазен
        if (!currentMonthRaw) {
            localStorage.setItem('orderSystem_currentMonth', currentMonth);
        }
    }

    getCurrentMonth() {
        const date = new Date();
        return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
    }

    getDefaultSettings() {
        return {
            usdRate: 1.71,
            factoryShipping: 1.5,
            origins: ['OLX', 'Bazar.bg', 'Instagram', 'WhatsApp', 'IG Ads', 'Facebook', 'OLX Romania', 'Viber'],
            vendors: ['Доставчик 1', 'Доставчик 2', 'Доставчик 3', 'AliExpress', 'Local Supplier', 'China Direct']
        };
    }

    setupEventHandlers() {
        const autoSaveEvents = [
            'order:created', 'order:updated', 'order:deleted',
            'client:created', 'client:updated', 'client:deleted',
            'inventory:created', 'inventory:updated', 'inventory:deleted',
            'expense:created', 'expense:updated', 'expense:deleted',
            'settings:updated'
        ];

        autoSaveEvents.forEach(event => {
            this.eventBus.on(event, () => this.autoSave());
        });

        document.addEventListener('keydown', (e) => {
            // Ctrl+S за запазване
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                this.autoSave();
                this.ui.showNotification('Данните са запазени', 'success');
            }
        });

        window.addEventListener('beforeunload', () => {
            this.autoSave();
        });
    }

    setupBrowserProtection() {
        // Warn before closing tab/browser with unsaved changes
        window.addEventListener('beforeunload', (e) => {
            const health = this.storage.getStorageHealth();
            const lastSave = localStorage.getItem('orderSystem_lastSave');
            const timeSinceLastSave = lastSave ? Date.now() - parseInt(lastSave) : 999999;

            // Show warning if:
            // 1. Unsaved changes exist, OR
            // 2. No save in last 5 minutes, OR
            // 3. Storage health is critical
            if (this.unsavedChanges ||
                timeSinceLastSave > 5 * 60 * 1000 ||
                health.status === 'error') {

                const message = '⚠️ You have unsaved changes! Data may be lost.';
                e.preventDefault();
                e.returnValue = message;

                // Attempt emergency export
                this.attemptEmergencyExport();

                return message;
            }
        });

        // Track unsaved changes
        this.eventBus.on('order:created', () => this.markUnsaved());
        this.eventBus.on('order:updated', () => this.markUnsaved());
        this.eventBus.on('order:deleted', () => this.markUnsaved());
        this.eventBus.on('client:created', () => this.markUnsaved());
        this.eventBus.on('client:updated', () => this.markUnsaved());
        this.eventBus.on('client:deleted', () => this.markUnsaved());

        console.log('🔒 Browser protection activated');
    }

    // EMERGENCY EXPORT SYSTEM
    startEmergencyProtection() {
        // Auto-export every 10 minutes as emergency backup
        setInterval(() => {
            try {
                this.createEmergencyBackup();
            } catch (error) {
                console.error('❌ Emergency backup failed:', error);
            }
        }, 10 * 60 * 1000); // 10 minutes

        // Monitor for critical storage issues
        setInterval(() => {
            const health = this.storage.getStorageHealth();
            if (health.status === 'error') {
                this.handleCriticalStorageFailure();
            }
        }, 30 * 1000); // Every 30 seconds
    }

    // PAGE VISIBILITY PROTECTION - Save when tab becomes hidden
    setupVisibilityProtection() {
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                // Tab is hidden - emergency save
                this.emergencyAutoSave();
                console.log('🔒 Emergency save on tab hide');
            }
        });

        // Save on focus loss (clicking outside browser)
        window.addEventListener('blur', () => {
            this.emergencyAutoSave();
            console.log('🔒 Emergency save on focus loss');
        });
    }

    // MARK DATA AS UNSAVED
    markUnsaved() {
        this.unsavedChanges = true;
        this.lastAutoSave = Date.now();

        // Auto-save after 3 seconds of no activity
        clearTimeout(this.autoSaveTimeout);
        this.autoSaveTimeout = setTimeout(() => {
            this.emergencyAutoSave();
            this.unsavedChanges = false;
        }, 3000);
    }

    // EMERGENCY AUTO-SAVE
    emergencyAutoSave() {
        try {
            this.autoSave();
            this.unsavedChanges = false;
            console.log('💾 Emergency auto-save completed');
        } catch (error) {
            console.error('❌ Emergency auto-save failed:', error);
            this.handleCriticalStorageFailure();
        }
    }

    // CREATE EMERGENCY BACKUP
    createEmergencyBackup() {
        try {
            const state = this.state.getState();
            const emergencyData = {
                monthlyData: state.monthlyData || {},
                clientsData: state.clientsData || {},
                settings: state.settings || {},
                inventory: state.inventory || {},
                timestamp: Date.now(),
                type: 'emergency_auto_backup'
            };

            // Store in separate emergency backup slot
            const backupKey = 'emergency_backup_' + Date.now();
            localStorage.setItem(backupKey, JSON.stringify(emergencyData));

            // Keep only last 3 emergency backups
            this.cleanEmergencyBackups();

            console.log('🚨 Emergency backup created:', backupKey);
        } catch (error) {
            console.error('❌ Emergency backup creation failed:', error);
        }
    }

    // CLEAN OLD EMERGENCY BACKUPS
    cleanEmergencyBackups() {
        try {
            const emergencyKeys = Object.keys(localStorage)
                .filter(key => key.startsWith('emergency_backup_'))
                .sort()
                .reverse(); // Newest first

            // Keep only 3 most recent
            if (emergencyKeys.length > 3) {
                const toDelete = emergencyKeys.slice(3);
                toDelete.forEach(key => localStorage.removeItem(key));
                console.log(`🧹 Cleaned ${toDelete.length} old emergency backups`);
            }
        } catch (error) {
            console.warn('⚠️ Emergency backup cleanup failed:', error);
        }
    }

    // CRITICAL STORAGE FAILURE HANDLER
    handleCriticalStorageFailure() {
        this.emergencyExportAttempts++;

        if (this.emergencyExportAttempts <= 3) { // Max 3 attempts
            try {
                // Attempt immediate export
                this.storage.exportData();

                // Show critical warning
                this.showCriticalWarning();

                console.log('🚨 Critical storage failure - emergency export attempted');
            } catch (error) {
                console.error('❌ Critical failure export failed:', error);

                if (this.emergencyExportAttempts >= 3) {
                    this.showFinalWarning();
                }
            }
        }
    }

    // EMERGENCY EXPORT ON TAB CLOSE
    attemptEmergencyExport() {
        try {
            // Synchronous emergency save to localStorage backup
            const state = this.state.getState();
            const emergencyData = {
                ...state,
                emergencyTimestamp: Date.now(),
                reason: 'tab_close_protection'
            };

            localStorage.setItem('EMERGENCY_BACKUP_TAB_CLOSE', JSON.stringify(emergencyData));
            console.log('🚨 Emergency tab-close backup saved');
        } catch (error) {
            console.error('❌ Tab-close emergency backup failed:', error);
        }
    }

    // SHOW CRITICAL WARNING MODAL
    showCriticalWarning() {
        const warningHtml = `
            <div class="critical-warning" id="critical-warning">
                <h3>🚨 CRITICAL: Data Protection Alert</h3>
                <p>Storage issues detected! Your data is at risk.</p>
                <p><strong>Immediate action required:</strong></p>
                <div class="actions">
                    <button class="btn" onclick="window.app.urgentExport()">Export Data Now</button>
                    <button class="btn" onclick="document.getElementById('critical-warning').remove()">Dismiss</button>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', warningHtml);

        // Auto-remove after 30 seconds
        setTimeout(() => {
            const warning = document.getElementById('critical-warning');
            if (warning) warning.remove();
        }, 30000);
    }

    // FINAL WARNING (ALL ATTEMPTS FAILED)
    showFinalWarning() {
        const warningHtml = `
            <div class="critical-warning" id="final-warning">
                <h3>💀 FINAL WARNING: Data Loss Imminent</h3>
                <p>All automatic protection systems have failed!</p>
                <p><strong>COPY YOUR DATA MANUALLY NOW</strong></p>
                <div class="actions">
                    <button class="btn" onclick="window.app.showRawData()">Show Raw Data</button>
                    <button class="btn" onclick="window.location.reload()">Reload App</button>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', warningHtml);
    }

    // SHOW RAW DATA (LAST RESORT)
    showRawData() {
        const state = this.state.getState();
        const rawData = JSON.stringify(state, null, 2);

        const textarea = document.createElement('textarea');
        textarea.value = rawData;
        textarea.style.cssText = `
            position: fixed; top: 10px; left: 10px; 
            width: 80%; height: 80%; 
            z-index: 10002; background: white; 
            border: 2px solid red; font-family: monospace;
        `;

        document.body.appendChild(textarea);
        textarea.select();

        alert('EMERGENCY: Raw data displayed. COPY ALL TEXT and save to file manually!');
    }

    // URGENT EXPORT (PUBLIC METHOD)
    urgentExport() {
        try {
            this.storage.exportData();
            localStorage.setItem('lastManualExport', Date.now().toString());

            // Remove warning if exists
            const warning = document.getElementById('critical-warning');
            if (warning) warning.remove();

            if (this.ui && this.ui.showNotification) {
                this.ui.showNotification('📤 Emergency export completed successfully!', 'success');
            }
        } catch (error) {
            if (this.ui && this.ui.showNotification) {
                this.ui.showNotification('❌ Emergency export failed: ' + error.message, 'error');
            }
            this.showRawData(); // Last resort
        }
    }

    autoSave() {
        const state = this.state.getState();

        console.log('Auto-saving...', {
            currentMonth: state.currentMonth,
            ordersCount: state.monthlyData?.[state.currentMonth]?.orders?.length || 0
        });

        if (state.monthlyData) {
            this.storage.save('monthlyData', state.monthlyData);
        }
        if (state.clientsData) {
            this.storage.save('clientsData', state.clientsData);
        }
        if (state.inventory) {
            this.storage.save('inventory', state.inventory);
        }
        if (state.settings) {
            this.storage.save('settings', state.settings);
        }
        if (state.currentMonth) {
            localStorage.setItem('orderSystem_currentMonth', state.currentMonth);
        }
        if (state.availableMonths) {
            localStorage.setItem('orderSystem_availableMonths', JSON.stringify(state.availableMonths));
        }
    }
}

// Initialize
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.app = new App();
        window.app.init();
    });
} else {
    window.app = new App();
    window.app.init();
}