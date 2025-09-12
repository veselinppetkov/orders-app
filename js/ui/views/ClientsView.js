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

    render() {
        const clients = this.getFilteredClients();

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
                            <option value="name">По име</option>
                            <option value="orders">По брой поръчки</option>
                            <option value="revenue">По приходи</option>
                            <option value="lastOrder">По последна поръчка</option>
                        </select>
                    </div>
                </div>
                
                <div class="clients-grid">
                    ${clients.map(client => this.renderClientCard(client)).join('')}
                </div>
            </div>
        `;
    }

    renderClientCard(client) {
        const stats = this.clientsModule.getClientStats(client.name);

        return `
            <div class="client-card" data-client-id="${client.id}">
                <div class="client-header">
                    <h3>${client.name}</h3>
                    <div class="client-actions">
                        <button class="btn btn-sm" data-action="view" data-id="${client.id}">👁️</button>
                        <button class="btn btn-sm" data-action="edit" data-id="${client.id}">✏️</button>
                        <button class="btn btn-sm danger" data-action="delete" data-id="${client.id}">🗑️</button>
                    </div>
                </div>
                <div class="client-info">
                    <div><strong>Поръчки:</strong> ${stats.totalOrders}</div>
                    <div><strong>Приходи:</strong> ${stats.totalRevenue.toFixed(2)} лв</div>
                    <div><strong>Последна поръчка:</strong> ${stats.lastOrder ? this.formatDate(stats.lastOrder.date) : 'Няма'}</div>
                    ${client.phone ? `<div><strong>Телефон:</strong> ${client.phone}</div>` : ''}
                </div>
            </div>
        `;
    }

    getFilteredClients() {
        let clients = this.clientsModule.getAllClients();

        // Apply search filter
        if (this.searchTerm) {
            clients = clients.filter(c =>
                c.name.toLowerCase().includes(this.searchTerm.toLowerCase())
            );
        }

        // Apply sorting
        clients.sort((a, b) => {
            const aStats = this.clientsModule.getClientStats(a.name);
            const bStats = this.clientsModule.getClientStats(b.name);

            switch (this.sortBy) {
                case 'orders':
                    return bStats.totalOrders - aStats.totalOrders;
                case 'revenue':
                    return bStats.totalRevenue - aStats.totalRevenue;
                case 'lastOrder':
                    const aLast = aStats.lastOrder ? new Date(aStats.lastOrder.date) : new Date(0);
                    const bLast = bStats.lastOrder ? new Date(bStats.lastOrder.date) : new Date(0);
                    return bLast - aLast;
                default:
                    return a.name.localeCompare(b.name);
            }
        });

        return clients;
    }

    attachListeners() {
        // New client button
        document.getElementById('new-client-btn')?.addEventListener('click', () => {
            this.eventBus.emit('modal:open', { type: 'client', mode: 'create' });
        });

        // Search
        document.getElementById('searchClient')?.addEventListener('input', (e) => {
            this.searchTerm = e.target.value;
            this.debouncedRefresh();
        });

        // Sort
        document.getElementById('sortClients')?.addEventListener('change', (e) => {
            this.sortBy = e.target.value;
            this.refresh();
        });

        // Client actions
        document.querySelectorAll('[data-action]').forEach(btn => {
            btn.addEventListener('click', (e) => {
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
                        if (confirm('Сигурни ли сте?')) {
                            this.clientsModule.delete(clientId);
                            this.refresh();
                        }
                        break;
                }
            });
        });
    }

// js/ui/views/ClientsView.js - Replace the refresh() method

    refresh() {
        // Store current focus info before DOM destruction
        const focusedElement = document.activeElement;
        const focusId = focusedElement?.id;
        const selectionStart = focusedElement?.selectionStart;
        const selectionEnd = focusedElement?.selectionEnd;
        const isSearchInput = focusId === 'searchClient';

        // Re-render
        const container = document.getElementById('view-container');
        if (container) {
            container.innerHTML = this.render();
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
        }
    }

    formatDate(dateStr) {
        return new Date(dateStr).toLocaleDateString('bg-BG');
    }
}