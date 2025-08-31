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
        this.ui = new UIManager(this.modules, this.state, this.eventBus, this.router, this.undoRedo);

        // Initialize router
        this.router.init();

        // Initialize UI
        this.ui.init();

        // Setup global event handlers
        this.setupEventHandlers();

        // Добавяме глобален достъп за debugging
        window.undoRedo = this.undoRedo;

        console.log('Application initialized successfully');
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