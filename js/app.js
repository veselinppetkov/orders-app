import { StateManager } from './core/StateManager.js';
import { StorageService } from './core/StorageService.js';
import { EventBus } from './core/EventBus.js';
import { Router } from './core/Router.js';
import { OrdersModule } from './modules/OrdersModule.js';
import { ClientsModule } from './modules/ClientsModule.js';
import { ExpensesModule } from './modules/ExpensesModule.js';
import { ReportsModule } from './modules/ReportsModule.js';
import { SettingsModule } from './modules/SettingsModule.js';
import { UIManager } from './ui/UIManager.js';
import {InventoryModule} from "./modules/InventoryModule.js";

export class App {
    constructor() {
        // Core services
        this.state = new StateManager();
        this.storage = new StorageService();
        this.eventBus = new EventBus();
        this.router = new Router(this.eventBus);

        // Business modules
        this.modules = {
            orders: new OrdersModule(this.state, this.storage, this.eventBus),
            clients: new ClientsModule(this.state, this.storage, this.eventBus),
            inventory: new InventoryModule(this.state, this.storage, this.eventBus),
            expenses: new ExpensesModule(this.state, this.storage, this.eventBus),
            reports: new ReportsModule(this.state, this.eventBus),
            settings: new SettingsModule(this.state, this.storage, this.eventBus)
        };

        // UI Manager
        this.ui = new UIManager(this.modules, this.state, this.eventBus, this.router);
    }

    async init() {
        console.log('Initializing Order Management System...');

        // Load saved data FIRST
        await this.loadData();

        // Initialize router AFTER data is loaded
        this.router.init();

        // Initialize UI AFTER everything else
        this.ui.init();

        // Setup global event handlers
        this.setupEventHandlers();

        console.log('Application initialized successfully');
    }

    async loadData() {
        // Директно четене без load метода
        const monthlyDataRaw = localStorage.getItem('orderSystem_monthlyData');
        const clientsDataRaw = localStorage.getItem('orderSystem_clientsData');
        const settingsRaw = localStorage.getItem('orderSystem_settings');

        const monthlyData = monthlyDataRaw ? JSON.parse(monthlyDataRaw) : {};
        const clientsData = clientsDataRaw ? JSON.parse(clientsDataRaw) : {};
        const settings = settingsRaw ? JSON.parse(settingsRaw) : this.state.get('settings');

        console.log('Direct load check:', {
            augustOrders: monthlyData['2025-08']?.orders?.length || 0
        });

        this.state.update({
            monthlyData,
            clientsData,
            settings
        });
    }

    setupEventHandlers() {
        // Auto-save on data changes
        this.eventBus.on('order:created', () => this.autoSave());
        this.eventBus.on('order:updated', () => this.autoSave());
        this.eventBus.on('order:deleted', () => this.autoSave());
        this.eventBus.on('client:created', () => this.autoSave());
        this.eventBus.on('client:updated', () => this.autoSave());
        this.eventBus.on('client:deleted', () => this.autoSave());

        // Handle keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                this.autoSave();
                this.ui.showNotification('Данните са запазени', 'success');
            }
        });
    }

    autoSave() {
        this.storage.save('monthlyData', this.state.get('monthlyData'));
        this.storage.save('clientsData', this.state.get('clientsData'));
        this.storage.save('settings', this.state.get('settings'));
    }

}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.app = new App();
        window.app.init();
    });
} else {
    window.app = new App();
    window.app.init();
}

