// js/app.js - UPDATED VERSION with Supabase integration

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

        // ADD: Initialize Supabase service
        this.supabase = new SupabaseService();

        // Business modules - PASS supabase to modules that need it
        this.modules = {
            orders: new OrdersModule(this.state, this.storage, this.eventBus, this.supabase), // ADD supabase param
            clients: new ClientsModule(this.state, this.storage, this.eventBus, this.supabase), // ADD supabase param
            inventory: new InventoryModule(this.state, this.storage, this.eventBus),
            expenses: new ExpensesModule(this.state, this.storage, this.eventBus),
            reports: new ReportsModule(this.state, this.eventBus),
            settings: new SettingsModule(this.state, this.storage, this.eventBus, this.supabase) // ADD supabase param
        };

        // Undo/Redo система
        this.undoRedo = new UndoRedoManager(this.state, this.storage, this.eventBus);

        // ADD protection properties (keep existing)
        this.unsavedChanges = false;
        this.lastAutoSave = Date.now();
        this.emergencyExportAttempts = 0;
    }

    async init() {
        console.log('Initializing Order Management System with Supabase...');

        // MODIFIED: Load data from both sources during transition
        await this.loadData();

        // Create UIManager
        this.ui = new UIManager(this.modules, this.state, this.eventBus, this.router, this.undoRedo);

        // Initialize router and UI
        this.router.init();
        this.ui.init();

        // Setup global event handlers
        this.setupEventHandlers();
        this.setupBrowserProtection(); // Keep existing protection
        this.startEmergencyProtection();
        this.setupVisibilityProtection();

        // Add global access for debugging
        window.undoRedo = this.undoRedo;
        window.supabase = this.supabase; // ADD: Global access to supabase

        console.log('Application initialized successfully with Supabase integration');
    }

    async loadData() {
        console.log('Loading data from localStorage and Supabase...');

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

        // PHASE 2: Load settings from Supabase (they might be different/updated)
        let settings;
        try {
            settings = await this.supabase.getSettings();
            console.log('✅ Settings loaded from Supabase');
        } catch (error) {
            console.warn('⚠️ Supabase settings failed, using localStorage:', error);
            settings = settingsLocal ? JSON.parse(settingsLocal) : this.getDefaultSettings();
        }

        console.log('Loaded data summary:', {
            currentMonth,
            monthlyDataKeys: Object.keys(monthlyData),
            ordersInCurrentMonth: monthlyData[currentMonth]?.orders?.length || 0,
            clientsCount: Object.keys(clientsData).length,
            settingsSource: settings ? 'supabase' : 'localStorage'
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
    }

    // Keep all existing methods unchanged...
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

    // Keep all your existing methods (setupEventHandlers, autoSave, protection methods, etc.)
    // ... rest of existing methods remain exactly the same ...

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

    // Keep all existing browser protection methods exactly as they are...
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

    // ... include all your other existing methods (markUnsaved, emergencyAutoSave, etc.)
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
            this.handleCriticalStorageFailure();
        }
    }

    startEmergencyProtection() {
        setInterval(() => {
            try {
                this.createEmergencyBackup();
            } catch (error) {
                console.error('❌ Emergency backup failed:', error);
            }
        }, 10 * 60 * 1000);

        setInterval(() => {
            const health = this.storage.getStorageHealth();
            if (health.status === 'error') {
                this.handleCriticalStorageFailure();
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

    handleCriticalStorageFailure() {
        this.emergencyExportAttempts++;

        if (this.emergencyExportAttempts <= 3) {
            try {
                this.storage.exportData();
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

    urgentExport() {
        try {
            this.storage.exportData();
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