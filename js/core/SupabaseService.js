import { BaseService } from './services/BaseService.js';
import { ImageStorageService } from './services/ImageStorageService.js';
import { OrdersService } from './services/OrdersService.js';
import { ClientsService } from './services/ClientsService.js';
import { ExpensesService } from './services/ExpensesService.js';
import { InventoryService } from './services/InventoryService.js';
import { SettingsService } from './services/SettingsService.js';

/**
 * Facade exposing the original SupabaseService API while delegating to
 * per-entity services. Consumers keep calling `app.supabase.<method>` unchanged.
 */
export class SupabaseService {
    constructor() {
        this.base = new BaseService();
        this.images = new ImageStorageService(this.base);
        this.orders = new OrdersService(this.base, this.images);
        this.clients = new ClientsService(this.base);
        this.expenses = new ExpensesService(this.base);
        this.inventory = new InventoryService(this.base);
        this.settings = new SettingsService(this.base);
    }

    // Auth / connection
    get isAuthenticated() { return this.base.isAuthenticated; }
    get isConnected() { return this.base.isConnected; }
    get supabase() { return this.base.client; }
    get config() { return this.base.config; }
    checkAuth() { return this.base.checkAuth(); }
    signOut() { return this.base.signOut(); }
    getCurrentUser() { return this.base.getCurrentUser(); }
    testConnection() { return this.base.testConnection(); }

    // Orders
    createOrder(data) { return this.orders.createOrder(data); }
    getOrders(month, options) { return this.orders.getOrders(month, options); }
    getRecentlyDelivered(limit) { return this.orders.getRecentlyDelivered(limit); }
    updateOrder(id, data) { return this.orders.updateOrder(id, data); }
    deleteOrder(id) { return this.orders.deleteOrder(id); }

    // Clients
    createClient(data) { return this.clients.createClient(data); }
    getClients() { return this.clients.getClients(); }
    updateClient(id, data) { return this.clients.updateClient(id, data); }
    deleteClient(id) { return this.clients.deleteClient(id); }

    // Expenses
    createExpense(data) { return this.expenses.createExpense(data); }
    getExpenses(month) { return this.expenses.getExpenses(month); }
    updateExpense(id, data) { return this.expenses.updateExpense(id, data); }
    deleteExpense(id) { return this.expenses.deleteExpense(id); }

    // Inventory
    getInventory() { return this.inventory.getInventory(); }
    createInventoryItem(data) { return this.inventory.createInventoryItem(data); }
    updateInventoryItem(id, data) { return this.inventory.updateInventoryItem(id, data); }
    deleteInventoryItem(id) { return this.inventory.deleteInventoryItem(id); }

    // Settings
    getSettings() { return this.settings.getSettings(); }
    saveSettings(data) { return this.settings.saveSettings(data); }
    getDefaultSettings() { return this.settings.getDefaultSettings(); }

    // Images (public for compatibility)
    uploadImage(data, filename) { return this.images.uploadImage(data, filename); }
    getImageUrl(path) { return this.images.getImageUrl(path); }
    getThumbnailUrl(path) { return this.images.getThumbnailUrl(path); }
    deleteImage(url) { return this.images.deleteImage(url); }

    // Health / stats / debug
    getConnectionStatus() { return this.base.getConnectionStatus(); }
    getStatistics() { return this.base.getStatistics(); }
    healthCheck() { return this.base.healthCheck(); }

    debugSupabase() {
        const status = this.base.getConnectionStatus();
        const stats = this.base.getStatistics();
        console.group('🔍 SUPABASE DEBUG');
        console.log('Connection:', status);
        console.log('Statistics:', stats);
        console.log('Config:', {
            url: this.base.config.url,
            bucket: this.base.config.bucket,
            hasClient: !!this.base.client
        });
        console.groupEnd();
    }

    destroy() {
        this.base.destroy();
        console.log('✅ SupabaseService destroyed');
    }
}
