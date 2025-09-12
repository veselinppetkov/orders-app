import { DebounceUtils } from '../../utils/DebounceUtils.js';

export default class ClientsView {
    constructor(modules, state, eventBus) {
        this.clientsModule = modules.clients;
        this.state = state;
        this.debouncedRefresh = DebounceUtils.debounce(() => this.refresh(), 300);
        this.eventBus = eventBus;
        this.sortBy = 'name';
        this.searchTerm = '';
    }

    async render() {
        try {
            const clients = await this.getFilteredClients();

            return `
                <div class="clients-view">
                    <h2>👥 Клиентски профили</h2>
                    <p style="margin-bottom: 20px; color: #6c757d;">Управлявайте клиенти и проследявайте тяхната история</p>
                    
                    <div class="controls">
                        <button class="btn" id="new-client-btn">➕ Нов клиент</button>
                    </div>
                    
                    <div class="filter-section">
                        <div class="filter-group">
                            <label>Търсене клиент:</label>
                            <input type="text" id="searchClient" placeholder="Име на клиент..." value="${this.searchTerm}">
                        </div>
                        <div class="filter-group">
                            <label>Сортиране:</label>
                            <select id="sortClients">
                                <option value="name" ${this.sortBy === 'name' ? 'selected' : ''}>По име</option>
                                <option value="orders" ${this.sortBy === 'orders' ? 'selected' : ''}>По брой поръчки</option>
                                <option value="revenue" ${this.sortBy === 'revenue' ? 'selected' : ''}>По приходи</option>
                                <option value="lastOrder" ${this.sortBy === 'lastOrder' ? 'selected' : ''}>По последна поръчка</option>
                            </select>
                        </div>
                    </div>
                    
                    <div class="clients-grid">
                        ${clients.map(client => this.renderClientCard(client)).join('')}
                    </div>
                    
                    ${clients.length === 0 ? `
                        <div class="empty-state">
                            <h3>Няма намерени клиенти</h3>
                            <p>Започнете като добавите първия си клиент</p>
                            <button class="btn" onclick="document.getElementById('new-client-btn').click()">➕ Добави клиент</button>
                        </div>
                    ` : ''}
                </div>
            `;

        } catch (error) {
            console.error('❌ Failed to render clients view:', error);
            return `
                <div class="error-state">
                    <h3>❌ Failed to load clients</h3>
                    <p>Error: ${error.message}</p>
                    <button onclick="window.app.ui.currentView.refresh()" class="btn">🔄 Retry</button>
                </div>
            `;
        }
    }

    renderClientCard(client) {
        const stats = client.stats; // Pre-calculated in getFilteredClients

        return `
            <div class="client-card" data-client-id="${client.id}">
                <div class="client-header">
                    <h3>${client.name}</h3>
                    <div class="client-actions">
                        <button class="btn btn-sm" data-action="view" data-id="${client.id}" title="Виж профил">👁️</button>
                        <button class="btn btn-sm" data-action="edit" data-id="${client.id}" title="Редактирай">✏️</button>
                        <button class="btn btn-sm danger" data-action="delete" data-id="${client.id}" title="Изтрий">🗑️</button>
                    </div>
                </div>
                <div class="client-info">
                    <div><strong>Поръчки:</strong> ${stats.totalOrders}</div>
                    <div><strong>Приходи:</strong> ${stats.totalRevenue.toFixed(2)} лв</div>
                    <div><strong>Печалба:</strong> ${stats.totalProfit.toFixed(2)} лв</div>
                    <div><strong>Последна поръчка:</strong> ${stats.lastOrder ? this.formatDate(stats.lastOrder.date) : 'Няма'}</div>
                    ${client.phone ? `<div><strong>Телефон:</strong> ${client.phone}</div>` : ''}
                    ${client.email ? `<div><strong>Email:</strong> ${client.email}</div>` : ''}
                    ${client.preferredSource ? `<div><strong>Източник:</strong> ${client.preferredSource}</div>` : ''}
                </div>
            </div>
        `;
    }

    async getFilteredClients() {
        try {
            // Load all clients from Supabase
            let clients = await this.clientsModule.getAllClients();

            // Apply search filter
            if (this.searchTerm) {
                const searchLower = this.searchTerm.toLowerCase();
                clients = clients.filter(c =>
                    c.name.toLowerCase().includes(searchLower) ||
                    (c.phone && c.phone.toLowerCase().includes(searchLower)) ||
                    (c.email && c.email.toLowerCase().includes(searchLower))
                );
            }

            // Get stats for all clients (batch operation for performance)
            const clientsWithStats = await Promise.all(clients.map(async (client) => {
                const stats = await this.clientsModule.getClientStats(client.name);
                return { ...client, stats };
            }));

            // Apply sorting
            clientsWithStats.sort((a, b) => {
                switch (this.sortBy) {
                    case 'orders':
                        return b.stats.totalOrders - a.stats.totalOrders;
                    case 'revenue':
                        return b.stats.totalRevenue - a.stats.totalRevenue;
                    case 'lastOrder':
                        const aLast = a.stats.lastOrder ? new Date(a.stats.lastOrder.date) : new Date(0);
                        const bLast = b.stats.lastOrder ? new Date(b.stats.lastOrder.date) : new Date(0);
                        return bLast - aLast;
                    default: // name
                        return a.name.localeCompare(b.name, 'bg-BG');
                }
            });

            return clientsWithStats;

        } catch (error) {
            console.error('❌ Failed to get filtered clients:', error);
            throw error;
        }
    }

    attachListeners() {
        // New client button
        document.getElementById('new-client-btn')?.addEventListener('click', () => {
            this.eventBus.emit('modal:open', { type: 'client', mode: 'create' });
        });

        // Search input - DEBOUNCED ASYNC
        document.getElementById('searchClient')?.addEventListener('input', (e) => {
            this.searchTerm = e.target.value;
            this.debouncedRefresh(); // This will call refresh() which is async
        });

        // Sort dropdown - ASYNC
        document.getElementById('sortClients')?.addEventListener('change', async (e) => {
            this.sortBy = e.target.value;
            await this.refresh();
        });

        // Client action buttons - ASYNC WHERE NEEDED
        document.querySelectorAll('[data-action]').forEach(btn => {
            btn.addEventListener('click', async (e) => { // MAKE ASYNC
                const action = e.target.dataset.action;
                const clientId = e.target.dataset.id;

                switch (action) {
                    case 'view':
                        this.eventBus.emit('modal:open', { type: 'clientProfile', id: clientId });
                        break;
                    case 'edit':
                        this.eventBus.emit('modal:open', { type: 'client', mode: 'edit', id: clientId });
                        break;
                    case 'delete':
                        if (confirm('Сигурни ли сте, че искате да изтриете този клиент?')) {
                            try {
                                await this.clientsModule.delete(clientId); // ADD AWAIT
                                this.eventBus.emit('notification:show', {
                                    message: 'Клиентът е изтрит успешно!',
                                    type: 'success'
                                });
                                await this.refresh(); // ADD AWAIT
                            } catch (error) {
                                console.error('❌ Delete client failed:', error);
                                this.eventBus.emit('notification:show', {
                                    message: 'Грешка при изтриване: ' + error.message,
                                    type: 'error'
                                });
                            }
                        }
                        break;
                }
            });
        });
    }

    // COMPLETE ASYNC REFRESH
    async refresh() {
        // Store current focus info before DOM destruction
        const focusedElement = document.activeElement;
        const focusId = focusedElement?.id;
        const selectionStart = focusedElement?.selectionStart;
        const selectionEnd = focusedElement?.selectionEnd;
        const isSearchInput = focusId === 'searchClient';

        // Clear cache to force fresh data
        this.clientsModule.clearCache();

        const container = document.getElementById('view-container');
        if (container) {
            // Show loading state
            container.innerHTML = `
                <div class="loading-state">
                    <h3>👥 Loading clients...</h3>
                    <p>Fetching data from database...</p>
                </div>
            `;

            try {
                const content = await this.render();
                container.innerHTML = content;
                this.attachListeners();

                // Restore focus if it was on search input
                if (isSearchInput) {
                    const newSearchInput = document.getElementById('searchClient');
                    if (newSearchInput) {
                        newSearchInput.focus();
                        // Restore cursor position
                        if (typeof selectionStart === 'number') {
                            newSearchInput.setSelectionRange(selectionStart, selectionEnd);
                        }
                    }
                }
            } catch (error) {
                console.error('❌ Failed to refresh clients view:', error);
                container.innerHTML = `
                    <div class="error-state">
                        <h3>❌ Failed to load clients</h3>
                        <p>Error: ${error.message}</p>
                        <button onclick="window.app.ui.currentView.refresh()" class="btn">🔄 Retry</button>
                    </div>
                `;
            }
        }
    }

    formatDate(dateStr) {
        return new Date(dateStr).toLocaleDateString('bg-BG');
    }
}