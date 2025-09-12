// js/app.js - COMPLETE ASYNC VERSION with Supabase integration

// ADD this import at the top
import { SupabaseService } from './core/SupabaseService.js';

// Keep all existing imports
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

        // Initialize Supabase service
        this.supabase = new SupabaseService();

        // Business modules - WILL BE INITIALIZED IN init()
        this.modules = {};

        // Undo/Redo system - WILL BE INITIALIZED AFTER MODULES
        this.undoRedo = null;

        // Protection properties
        this.unsavedChanges = false;
        this.lastAutoSave = Date.now();
        this.emergencyExportAttempts = 0;

        console.log('🚀 App constructor completed - ready for async initialization');
    }

    async init() {
        try {
            console.log('🚀 Starting complete async application initialization...');

            // STEP 1: Load data from both sources during transition
            await this.loadData();

            // STEP 2: Initialize business modules WITH proper dependencies
            await this.initializeModules();

            // STEP 3: Initialize Undo/Redo system AFTER modules exist
            this.undoRedo = new UndoRedoManager(this.state, this.storage, this.eventBus);

            // STEP 4: Create UIManager with all dependencies
            this.ui = new UIManager(this.modules, this.state, this.eventBus, this.router, this.undoRedo);

            // STEP 5: Initialize router and UI
            this.router.init();
            await this.ui.init(); // UI init is now async

            // STEP 6: Setup global event handlers and protection
            this.setupEventHandlers();
            this.setupBrowserProtection();
            this.startEmergencyProtection();
            this.setupVisibilityProtection();

            // STEP 7: Add global access for debugging
            window.undoRedo = this.undoRedo;
            window.supabase = this.supabase;

            console.log('✅ Application initialized successfully with complete async support');

        } catch (error) {
            console.error('❌ Critical error during app initialization:', error);
            this.handleInitializationError(error);
        }
    }

    async initializeModules() {
        console.log('🔧 Initializing business modules with async support...');

        // Initialize modules in dependency order
        this.modules = {
            // Core modules (no dependencies)
            orders: new OrdersModule(this.state, this.storage, this.eventBus, this.supabase),
            clients: new ClientsModule(this.state, this.storage, this.eventBus, this.supabase),
            inventory: new InventoryModule(this.state, this.storage, this.eventBus),
            expenses: new ExpensesModule(this.state, this.storage, this.eventBus),
            settings: new SettingsModule(this.state, this.storage, this.eventBus, this.supabase),
        };

        // Reports module DEPENDS ON orders module - initialize after
        this.modules.reports = new ReportsModule(this.state, this.eventBus, this.modules.orders);

        console.log('✅ All business modules initialized with proper dependencies');
    }

    async loadData() {
        console.log('📂 Loading data from localStorage and Supabase...');

        try {
            // PHASE 1: Load from localStorage (existing data)
            const monthlyDataLocal = localStorage.getItem('orderSystem_monthlyData');
            const clientsDataLocal = localStorage.getItem('orderSystem_clientsData');
            const inventoryLocal = localStorage.getItem('orderSystem_inventory');
            const settingsLocal = localStorage.getItem('orderSystem_settings');
            const currentMonthLocal = localStorage.getItem('orderSystem_currentMonth');

            // Parse localStorage data
            const monthlyData = monthlyDataLocal ? JSON.parse(monthlyDataLocal) : {};
            const clientsData = clientsDataLocal ? JSON.parse(clientsDataLocal) : {};
            const inventory = inventoryLocal ? JSON.parse(inventoryLocal) : {};
            const currentMonth = currentMonthLocal || this.getCurrentMonth();

            // PHASE 2: Try to load settings from Supabase
            let settings;
            try {
                console.log('⚙️ Attempting to load settings from Supabase...');

                // Create temporary settings module to test Supabase connection
                const tempSettingsModule = new SettingsModule(this.state, this.storage, this.eventBus, this.supabase);
                settings = await tempSettingsModule.getSettings();

                console.log('✅ Settings loaded from Supabase successfully');
            } catch (error) {
                console.warn('⚠️ Supabase settings failed, using localStorage fallback:', error.message);
                settings = settingsLocal ? JSON.parse(settingsLocal) : this.getDefaultSettings();
            }

            console.log('📊 Data loading summary:', {
                currentMonth,
                monthlyDataKeys: Object.keys(monthlyData),
                ordersInCurrentMonth: monthlyData[currentMonth]?.orders?.length || 0,
                clientsCount: Object.keys(clientsData).length,
                inventoryItems: Object.keys(inventory).length,
                settingsSource: settings ? (settings.loadedFromSupabase ? 'supabase' : 'localStorage') : 'default'
            });

            // Update state with combined data
            this.state.update({
                monthlyData,
                clientsData,
                inventory,
                settings,
                currentMonth
            });

            // Save currentMonth if not saved
            if (!currentMonthLocal) {
                localStorage.setItem('orderSystem_currentMonth', currentMonth);
            }

            console.log('✅ Data loading completed successfully');

        } catch (error) {
            console.error('❌ Critical error during data loading:', error);

            // Fallback to minimal state
            this.state.update({
                monthlyData: {},
                clientsData: {},
                inventory: {},
                settings: this.getDefaultSettings(),
                currentMonth: this.getCurrentMonth()
            });

            throw new Error(`Data loading failed: ${error.message}`);
        }
    }

    handleInitializationError(error) {
        console.error('💥 Application initialization failed:', error);

        // Show critical error message to user
        document.body.innerHTML = `
            <div class="critical-error">
                <h1>🚨 Application Initialization Failed</h1>
                <p><strong>Error:</strong> ${error.message}</p>
                <p>The application encountered a critical error during startup.</p>
                
                <div class="error-actions">
                    <button onclick="window.location.reload()" class="btn danger">
                        🔄 Reload Application
                    </button>
                    <button onclick="window.app.exportEmergencyData()" class="btn warning">
                        📤 Emergency Data Export
                    </button>
                    <button onclick="localStorage.clear(); window.location.reload()" class="btn secondary">
                        🗑️ Clear Data & Restart
                    </button>
                </div>
                
                <details style="margin-top: 20px;">
                    <summary>Technical Details</summary>
                    <pre style="background: #f5f5f5; padding: 10px; margin-top: 10px; font-size: 12px;">${error.stack}</pre>
                </details>
            </div>
        `;
    }

    exportEmergencyData() {
        try {
            const emergencyData = {
                localStorage: { ...localStorage },
                state: this.state ? this.state.getState() : {},
                timestamp: new Date().toISOString(),
                error: 'Emergency export due to initialization failure'
            };

            const dataStr = JSON.stringify(emergencyData, null, 2);
            const blob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = `emergency_backup_${Date.now()}.json`;
            a.click();

            URL.revokeObjectURL(url);

            alert('Emergency data exported successfully!');
        } catch (error) {
            console.error('❌ Emergency export failed:', error);
            alert('Emergency export failed. Please copy your localStorage data manually.');
        }
    }

    // Keep all existing utility methods unchanged...
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

    autoSave() {
        const state = this.state.getState();

        console.log('💾 Auto-saving application state...', {
            currentMonth: state.currentMonth,
            ordersCount: state.monthlyData?.[state.currentMonth]?.orders?.length || 0
        });

        try {
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

            console.log('✅ Auto-save completed successfully');

        } catch (error) {
            console.error('❌ Auto-save failed:', error);
            this.handleSaveFailure(error);
        }
    }

    handleSaveFailure(error) {
        console.error('🚨 Critical save failure:', error);

        // Attempt emergency export
        this.emergencyExportAttempts++;

        if (this.emergencyExportAttempts <= 3) {
            try {
                this.storage.exportData();
                console.log('📤 Emergency export completed due to save failure');
            } catch (exportError) {
                console.error('❌ Emergency export also failed:', exportError);
            }
        }

        // Show user notification
        if (this.ui && this.ui.showNotification) {
            this.ui.showNotification(
                '🚨 Critical: Save failed! Data may be lost. Export recommended immediately!',
                'error'
            );
        }
    }

    // Keep all existing browser protection methods...
    setupBrowserProtection() {
        window.addEventListener('beforeunload', (e) => {
            const health = this.storage.getStorageHealth();
            const lastSave = localStorage.getItem('orderSystem_lastSave');
            const timeSinceLastSave = lastSave ? Date.now() - parseInt(lastSave) : 999999;

            if (this.unsavedChanges ||
                timeSinceLastSave > 5 * 60 * 1000 ||
                health.status === 'error') {

                const message = '⚠️ You have unsaved changes! Data may be lost.';
                e.preventDefault();
                e.returnValue = message;

                this.attemptEmergencyExport();
                return message;
            }
        });

        this.eventBus.on('order:created', () => this.markUnsaved());
        this.eventBus.on('order:updated', () => this.markUnsaved());
        this.eventBus.on('order:deleted', () => this.markUnsaved());
        this.eventBus.on('client:created', () => this.markUnsaved());
        this.eventBus.on('client:updated', () => this.markUnsaved());
        this.eventBus.on('client:deleted', () => this.markUnsaved());

        console.log('🔒 Browser protection activated');
    }

    markUnsaved() {
        this.unsavedChanges = true;
        this.lastAutoSave = Date.now();

        clearTimeout(this.autoSaveTimeout);
        this.autoSaveTimeout = setTimeout(() => {
            this.emergencyAutoSave();
            this.unsavedChanges = false;
        }, 3000);
    }

    emergencyAutoSave() {
        try {
            this.autoSave();
            this.unsavedChanges = false;
            console.log('💾 Emergency auto-save completed');
        } catch (error) {
            console.error('❌ Emergency auto-save failed:', error);
            this.handleSaveFailure(error);
        }
    }

    startEmergencyProtection() {
        // Auto-backup every 10 minutes
        setInterval(() => {
            try {
                this.createEmergencyBackup();
            } catch (error) {
                console.error('❌ Emergency backup failed:', error);
            }
        }, 10 * 60 * 1000);

        // Health check every 30 seconds
        setInterval(() => {
            const health = this.storage.getStorageHealth();
            if (health.status === 'error') {
                this.handleSaveFailure(new Error('Storage health check failed'));
            }
        }, 30 * 1000);
    }

    setupVisibilityProtection() {
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.emergencyAutoSave();
                console.log('🔒 Emergency save on tab hide');
            }
        });

        window.addEventListener('blur', () => {
            this.emergencyAutoSave();
            console.log('🔒 Emergency save on focus loss');
        });
    }

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

            const backupKey = 'emergency_backup_' + Date.now();
            localStorage.setItem(backupKey, JSON.stringify(emergencyData));

            this.cleanEmergencyBackups();
            console.log('🚨 Emergency backup created:', backupKey);

        } catch (error) {
            console.error('❌ Emergency backup creation failed:', error);
        }
    }

    cleanEmergencyBackups() {
        try {
            const emergencyKeys = Object.keys(localStorage)
                .filter(key => key.startsWith('emergency_backup_'))
                .sort()
                .reverse();

            if (emergencyKeys.length > 3) {
                const toDelete = emergencyKeys.slice(3);
                toDelete.forEach(key => localStorage.removeItem(key));
                console.log(`🧹 Cleaned ${toDelete.length} old emergency backups`);
            }
        } catch (error) {
            console.warn('⚠️ Emergency backup cleanup failed:', error);
        }
    }

    attemptEmergencyExport() {
        try {
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

        setTimeout(() => {
            const warning = document.getElementById('critical-warning');
            if (warning) warning.remove();
        }, 30000);
    }

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

    async urgentExport() {
        try {
            await this.storage.exportData();
            localStorage.setItem('lastManualExport', Date.now().toString());

            const warning = document.getElementById('critical-warning');
            if (warning) warning.remove();

            if (this.ui && this.ui.showNotification) {
                this.ui.showNotification('📤 Emergency export completed successfully!', 'success');
            }
        } catch (error) {
            if (this.ui && this.ui.showNotification) {
                this.ui.showNotification('❌ Emergency export failed: ' + error.message, 'error');
            }
            this.showRawData();
        }
    }
}

// Initialize with complete error handling
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', async () => {
        try {
            window.app = new App();
            await window.app.init(); // NOW ASYNC
        } catch (error) {
            console.error('💥 Failed to initialize application:', error);
            if (window.app) {
                window.app.handleInitializationError(error);
            }
        }
    });
} else {
    (async () => {
        try {
            window.app = new App();
            await window.app.init(); // NOW ASYNC
        } catch (error) {
            console.error('💥 Failed to initialize application:', error);
            if (window.app) {
                window.app.handleInitializationError(error);
            }
        }
    })();
}