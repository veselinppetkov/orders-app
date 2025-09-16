// js/app.js - REWRITTEN FOR CLEAN ASYNC INITIALIZATION

import { SupabaseService } from './core/SupabaseService.js';
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
import { InventoryModule } from "./modules/InventoryModule.js";
import { UIManager } from './ui/UIManager.js';

export class App {
    constructor() {
        this.initializationState = 'not_started'; // not_started, loading, ready, error
        this.modules = {};
        this.retryCount = 0;
        this.maxRetries = 3;

        console.log('🚀 App constructor - preparing for initialization');
    }

    async init() {
        if (this.initializationState === 'loading') {
            console.warn('⚠️ Initialization already in progress');
            return;
        }

        this.initializationState = 'loading';

        try {
            console.log('🚀 Starting clean application initialization...');

            // STEP 1: Initialize core services (synchronous)
            this.initializeCoreServices();

            // STEP 2: Load and validate data (async, with fallbacks)
            await this.loadApplicationData();

            // STEP 3: Initialize business modules (async)
            await this.initializeBusinessModules();

            // STEP 4: Setup UI system (async)
            await this.initializeUserInterface();

            // STEP 5: Setup protection and final configuration
            this.setupApplicationProtection();

            // STEP 6: Mark as ready
            this.initializationState = 'ready';
            this.exposeGlobalReferences();

            console.log('✅ Application initialization completed successfully');

        } catch (error) {
            this.initializationState = 'error';
            console.error('❌ Application initialization failed:', error);
            await this.handleInitializationFailure(error);
        }
    }

    // STEP 1: Core Services (Synchronous)
    initializeCoreServices() {
        console.log('🔧 Initializing core services...');

        try {
            // Core services - order matters
            this.eventBus = new EventBus();
            this.state = new StateManager();
            this.storage = new StorageService();
            this.supabase = new SupabaseService();
            this.router = new Router(this.eventBus);

            console.log('✅ Core services initialized');

        } catch (error) {
            throw new Error(`Core services initialization failed: ${error.message}`);
        }
    }

    // STEP 2: Data Loading (Async with fallbacks)
    async loadApplicationData() {
        console.log('📂 Loading application data...');

        try {
            // Get current month first
            const currentMonth = this.getCurrentMonth();

            // Load settings with Supabase fallback
            const settings = await this.loadSettingsWithFallback();

            // Load local data as primary source during transition
            const localData = this.loadLocalStorageData();

            // Validate and merge data
            const applicationData = {
                currentMonth,
                settings,
                monthlyData: localData.monthlyData || {},
                clientsData: localData.clientsData || {},
                inventory: localData.inventory || {},
                availableMonths: localData.availableMonths || this.generateDefaultMonths(currentMonth)
            };

            // Update state with clean data
            this.state.update(applicationData);

            // Ensure current month structure exists
            this.ensureCurrentMonthStructure(currentMonth);

            console.log('✅ Application data loaded and validated');

        } catch (error) {
            throw new Error(`Data loading failed: ${error.message}`);
        }
    }

    async loadSettingsWithFallback() {
        try {
            console.log('⚙️ Attempting to load settings from Supabase...');

            // Test connection and load settings
            const connected = await this.supabase.testConnection();
            if (connected) {
                // Create temporary settings module for loading
                const tempSettings = new SettingsModule(this.state, this.storage, this.eventBus, this.supabase);
                const settings = await tempSettings.getSettings();

                console.log('✅ Settings loaded from Supabase');
                return { ...settings, source: 'supabase' };
            }

            throw new Error('Supabase connection failed');

        } catch (error) {
            console.warn('⚠️ Supabase unavailable, using localStorage fallback:', error.message);

            // Fallback to localStorage
            const localSettings = localStorage.getItem('orderSystem_settings');
            if (localSettings) {
                try {
                    return { ...JSON.parse(localSettings), source: 'localStorage' };
                } catch (parseError) {
                    console.warn('⚠️ Corrupted localStorage settings, using defaults');
                }
            }

            return { ...this.getDefaultSettings(), source: 'default' };
        }
    }

    loadLocalStorageData() {
        console.log('💾 Loading localStorage data...');

        const data = {};

        try {
            // Load each data type safely
            const keys = ['monthlyData', 'clientsData', 'inventory', 'availableMonths'];

            for (const key of keys) {
                const stored = localStorage.getItem(`orderSystem_${key}`);
                if (stored) {
                    try {
                        data[key] = JSON.parse(stored);
                    } catch (parseError) {
                        console.warn(`⚠️ Corrupted localStorage data for ${key}, using empty`);
                        data[key] = key === 'availableMonths' ? [] : {};
                    }
                } else {
                    data[key] = key === 'availableMonths' ? [] : {};
                }
            }

            console.log('✅ localStorage data loaded');
            return data;

        } catch (error) {
            console.error('❌ localStorage loading failed:', error);
            return { monthlyData: {}, clientsData: {}, inventory: {}, availableMonths: [] };
        }
    }

    // STEP 3: Business Modules (Async)
    async initializeBusinessModules() {
        console.log('🔧 Initializing business modules...');

        try {
            // Initialize in dependency order
            this.modules = {
                orders: new OrdersModule(this.state, this.storage, this.eventBus, this.supabase),
                clients: new ClientsModule(this.state, this.storage, this.eventBus, this.supabase),
                inventory: new InventoryModule(this.state, this.storage, this.eventBus, this.supabase), // Add supabase
                expenses: new ExpensesModule(this.state, this.storage, this.eventBus, this.supabase), // Add supabase
                settings: new SettingsModule(this.state, this.storage, this.eventBus, this.supabase)
            };

            // Reports module depends on orders module
            this.modules.reports = new ReportsModule(this.state, this.eventBus, this.modules.orders);

            // Initialize undo/redo after modules exist
            this.undoRedo = new UndoRedoManager(this.state, this.storage, this.eventBus);

            console.log('✅ Business modules initialized');

        } catch (error) {
            throw new Error(`Business modules initialization failed: ${error.message}`);
        }
    }

    // STEP 4: User Interface (Async)
    async initializeUserInterface() {
        console.log('🎨 Initializing user interface...');

        try {
            // Create UI manager with all dependencies
            this.ui = new UIManager(
                this.modules,
                this.state,
                this.eventBus,
                this.router,
                this.undoRedo
            );

            // Initialize router first
            this.router.init();

            // Initialize UI (async)
            await this.ui.init();

            console.log('✅ User interface initialized');

        } catch (error) {
            throw new Error(`UI initialization failed: ${error.message}`);
        }
    }

    // STEP 5: Protection Systems

    setupApplicationProtection() {
        console.log('🔒 Setting up application protection...');

        try {
            this.setupDataProtection();
            this.setupBrowserProtection();
            this.setupEventHandlers();

            console.log('✅ Protection systems active');

        } catch (error) {
            console.warn('⚠️ Some protection systems failed to initialize:', error);
        }
    }

    setupDataProtection() {
        // KEEP: Auto-save on critical events (this is not backup system)
        const autoSaveEvents = [
            'order:created', 'order:updated', 'order:deleted',
            'client:created', 'client:updated', 'client:deleted',
            'inventory:updated', 'expense:created', 'expense:updated', 'expense:deleted',
            'settings:updated'
        ];

        autoSaveEvents.forEach(event => {
            this.eventBus.on(event, () => this.performAutoSave());
        });

        // KEEP: Periodic auto-save (this is not backup system)
        setInterval(() => this.performAutoSave(), 30000);
    }

    setupBrowserProtection() {
        // Save before page unload
        window.addEventListener('beforeunload', (e) => {
            this.performAutoSave();

            // Show warning if critical changes pending
            if (this.hasPendingChanges()) {
                const message = '⚠️ You have unsaved changes that may be lost.';
                e.preventDefault();
                e.returnValue = message;
                return message;
            }
        });

        // Save on visibility change
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.performAutoSave();
            }
        });
    }

    setupEventHandlers() {
        // Global keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Ctrl+S for manual save
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                this.performAutoSave();
                this.ui.showNotification('Data saved manually', 'success');
            }
        });
    }

    // Utility Methods
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

    generateDefaultMonths(currentMonth) {
        const months = [];
        const currentDate = new Date();

        // Generate 6 months: 3 past, current, 2 future
        for (let i = -3; i <= 2; i++) {
            const date = new Date(currentDate.getFullYear(), currentDate.getMonth() + i, 1);
            const key = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
            const monthNames = ['Януари', 'Февруари', 'Март', 'Април', 'Май', 'Юни',
                'Юли', 'Август', 'Септември', 'Октомври', 'Ноември', 'Декември'];

            months.push({
                key,
                name: `${monthNames[date.getMonth()]} ${date.getFullYear()}`
            });
        }

        return months;
    }

    ensureCurrentMonthStructure(currentMonth) {
        const monthlyData = this.state.get('monthlyData');

        if (!monthlyData[currentMonth]) {
            monthlyData[currentMonth] = {
                orders: [],
                expenses: []
            };

            this.state.set('monthlyData', monthlyData);

            // Initialize default expenses for new month
            this.modules.expenses?.initializeMonth(currentMonth);
        }
    }

    performAutoSave() {
        try {
            const state = this.state.getState();

            // Save critical data to localStorage
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
            if (state.availableMonths) {
                localStorage.setItem('orderSystem_availableMonths', JSON.stringify(state.availableMonths));
            }
            if (state.currentMonth) {
                localStorage.setItem('orderSystem_currentMonth', state.currentMonth);
            }

            this.lastAutoSave = Date.now();

        } catch (error) {
            console.error('❌ Auto-save failed:', error);
            this.handleSaveFailure(error);
        }
    }

    hasPendingChanges() {
        // Check if there are unsaved changes
        const lastSave = localStorage.getItem('orderSystem_lastSave');
        const timeSinceLastSave = lastSave ? Date.now() - parseInt(lastSave) : Infinity;

        return timeSinceLastSave > 10000; // 10 seconds
    }

    handleSaveFailure(error) {
        console.error('🚨 Critical save failure:', error);

        // Attempt emergency export
        try {
            this.storage.exportData();
            console.log('📤 Emergency export completed');
        } catch (exportError) {
            console.error('❌ Emergency export failed:', exportError);
        }
    }

    exposeGlobalReferences() {
        // Expose for debugging and development
        window.app = this;
        window.undoRedo = this.undoRedo;
        window.supabase = this.supabase;

        console.log('🔍 Global references exposed for debugging');
    }

    // Error Handling
    async handleInitializationFailure(error) {
        console.error('💥 Handling initialization failure:', error);

        this.retryCount++;

        if (this.retryCount <= this.maxRetries) {
            console.log(`🔄 Retrying initialization (${this.retryCount}/${this.maxRetries})...`);

            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, 1000 * this.retryCount));

            return this.init();
        }

        // Show critical error UI
        this.showCriticalErrorUI(error);
    }

    showCriticalErrorUI(error) {
        document.body.innerHTML = `
            <div class="critical-error">
                <h1>🚨 Application Failed to Start</h1>
                <p><strong>Error:</strong> ${error.message}</p>
                <p>The application encountered a critical error during startup.</p>
                
                <div class="error-actions">
                    <button onclick="window.location.reload()" class="btn">
                        🔄 Reload Application
                    </button>
                    <button onclick="window.app?.exportEmergencyData()" class="btn">
                        📤 Export Emergency Backup
                    </button>
                    <button onclick="localStorage.clear(); window.location.reload()" class="btn">
                        🗑️ Clear Data & Restart
                    </button>
                </div>
                
                <details style="margin-top: 20px;">
                    <summary>Technical Details</summary>
                    <pre style="background: #f5f5f5; padding: 10px; margin-top: 10px; font-size: 12px; white-space: pre-wrap;">${error.stack}</pre>
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
                error: 'Emergency export due to initialization failure',
                initializationState: this.initializationState,
                retryCount: this.retryCount
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
            alert('Emergency export failed. Please manually copy localStorage data.');
        }
    }
}

// Safe initialization with comprehensive error handling
async function initializeApplication() {
    try {
        window.app = new App();
        await window.app.init();

    } catch (error) {
        console.error('💥 Failed to initialize application:', error);

        // Last resort: show error and attempt recovery
        if (window.app) {
            window.app.handleInitializationFailure(error);
        } else {
            // Create minimal error display
            document.body.innerHTML = `
                <div style="padding: 20px; text-align: center; color: red;">
                    <h1>Critical Error</h1>
                    <p>Application failed to start: ${error.message}</p>
                    <button onclick="window.location.reload()">Reload</button>
                </div>
            `;
        }
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApplication);
} else {
    initializeApplication();
}