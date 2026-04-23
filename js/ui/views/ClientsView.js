import { DebounceUtils } from '../../utils/DebounceUtils.js';
import { FormatUtils } from '../../utils/FormatUtils.js';

const esc = FormatUtils.escapeHtml;

export default class ClientsView {
    constructor(modules, state, eventBus) {
        this.clientsModule = modules.clients;
        this.state = state;
        this.debouncedRefresh = DebounceUtils.debounce(() => this.refresh(), 300);
        this.eventBus = eventBus;
        this.sortBy = 'name';
        this.searchTerm = '';
        this.page = 1;
        this.pageSize = 30;
    }

    async render() {
        try {
            const { clients, total } = await this.getFilteredClients();
            const totalPages = Math.ceil(total / this.pageSize);

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
                            <input type="text" id="searchClient" placeholder="Име на клиент..." value="${esc(this.searchTerm)}">
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

                    ${total === 0 ? `
                        <div class="empty-state">
                            <h3>Няма намерени клиенти</h3>
                            <p>Започнете като добавите първия си клиент</p>
                            <button class="btn" onclick="document.getElementById('new-client-btn').click()">➕ Добави клиент</button>
                        </div>
                    ` : ''}

                    ${totalPages > 1 ? `
                        <div class="pagination" style="margin-top: 20px; display: flex; gap: 10px; align-items: center; justify-content: center;">
                            <button class="btn" id="prev-page-btn" ${this.page <= 1 ? 'disabled' : ''}>← Предишна</button>
                            <span>Страница ${this.page} от ${totalPages} (${total} клиента)</span>
                            <button class="btn" id="next-page-btn" ${this.page >= totalPages ? 'disabled' : ''}>Следваща →</button>
                        </div>
                    ` : total > 0 ? `<p style="text-align:center;color:#6c757d;margin-top:10px;">${total} клиента</p>` : ''}
                </div>
            `;

        } catch (error) {
            console.error('❌ Failed to render clients view:', error);
            return `
                <div class="error-state">
                    <h3>❌ Failed to load clients</h3>
                    <p>Error: ${esc(error.message)}</p>
                    <button onclick="window.app.ui.currentView.refresh()" class="btn">🔄 Retry</button>
                </div>
            `;
        }
    }

    renderClientCard(client) {
        const stats = client.stats;

        return `
            <div class="client-card" data-client-id="${esc(client.id)}">
                <div class="client-header">
                    <h3>${esc(client.name)}</h3>
                    <div class="client-actions">
                        <button class="btn btn-sm" data-action="view" data-id="${esc(client.id)}" title="Виж профил">👁️</button>
                        <button class="btn btn-sm" data-action="edit" data-id="${esc(client.id)}" title="Редактирай">✏️</button>
                        <button class="btn btn-sm danger" data-action="delete" data-id="${esc(client.id)}" title="Изтрий">🗑️</button>
                    </div>
                </div>
                <div class="client-info">
                    <div><strong>Поръчки:</strong> ${stats.totalOrders}</div>
                    <div><strong>Приходи:</strong> ${stats.totalRevenue.toFixed(2)} €</div>
                    <div><strong>Печалба:</strong> ${stats.totalProfit.toFixed(2)} €</div>
                    <div><strong>Последна поръчка:</strong> ${stats.lastOrder ? this.formatDate(stats.lastOrder.date) : 'Няма'}</div>
                    ${client.phone ? `<div><strong>Телефон:</strong> ${esc(client.phone)}</div>` : ''}
                    ${client.email ? `<div><strong>Email:</strong> ${esc(client.email)}</div>` : ''}
                    ${client.preferredSource ? `<div><strong>Източник:</strong> ${esc(client.preferredSource)}</div>` : ''}
                </div>
            </div>
        `;
    }

    async getFilteredClients() {
        try {
            let clients = await this.clientsModule.getAllClients();

            if (this.searchTerm) {
                const searchLower = this.searchTerm.toLowerCase();
                clients = clients.filter(c =>
                    c.name.toLowerCase().includes(searchLower) ||
                    (c.phone && c.phone.toLowerCase().includes(searchLower)) ||
                    (c.email && c.email.toLowerCase().includes(searchLower))
                );
            }

            // Load all orders once — uses OrdersModule cache, avoids N separate fetches
            const allOrders = window.app?.modules?.orders
                ? await window.app.modules.orders.getAllOrders()
                : [];

            // Compute stats for all clients in a single synchronous pass
            const clientsWithStats = clients.map(client => {
                const clientOrders = allOrders.filter(o => o.client === client.name);
                const sorted = clientOrders.length > 0
                    ? [...clientOrders].sort((a, b) => new Date(b.date) - new Date(a.date))
                    : [];
                const totalRevenue = clientOrders.reduce((sum, o) => sum + (o.sellEUR || 0), 0);
                const stats = {
                    totalOrders: clientOrders.length,
                    totalRevenue,
                    totalProfit: clientOrders.reduce((sum, o) => sum + (o.balanceEUR || 0), 0),
                    lastOrder: sorted[0] || null,
                    firstOrder: sorted[sorted.length - 1] || null,
                    avgOrderValue: clientOrders.length > 0 ? totalRevenue / clientOrders.length : 0
                };
                return { ...client, stats };
            });

            clientsWithStats.sort((a, b) => {
                switch (this.sortBy) {
                    case 'orders':
                        return b.stats.totalOrders - a.stats.totalOrders;
                    case 'revenue':
                        return b.stats.totalRevenue - a.stats.totalRevenue;
                    case 'lastOrder': {
                        const aLast = a.stats.lastOrder ? new Date(a.stats.lastOrder.date) : new Date(0);
                        const bLast = b.stats.lastOrder ? new Date(b.stats.lastOrder.date) : new Date(0);
                        return bLast - aLast;
                    }
                    default:
                        return a.name.localeCompare(b.name, 'bg-BG');
                }
            });

            const total = clientsWithStats.length;
            const start = (this.page - 1) * this.pageSize;
            const paged = clientsWithStats.slice(start, start + this.pageSize);

            return { clients: paged, total };

        } catch (error) {
            console.error('❌ Failed to get filtered clients:', error);
            throw error;
        }
    }

    attachListeners() {
        document.getElementById('new-client-btn')?.addEventListener('click', () => {
            this.eventBus.emit('modal:open', { type: 'client', mode: 'create' });
        });

        document.getElementById('searchClient')?.addEventListener('input', (e) => {
            this.searchTerm = e.target.value;
            this.page = 1;
            this.debouncedRefresh();
        });

        document.getElementById('sortClients')?.addEventListener('change', async (e) => {
            this.sortBy = e.target.value;
            this.page = 1;
            await this.refresh();
        });

        document.getElementById('prev-page-btn')?.addEventListener('click', async () => {
            if (this.page > 1) {
                this.page--;
                await this.refresh();
            }
        });

        document.getElementById('next-page-btn')?.addEventListener('click', async () => {
            this.page++;
            await this.refresh();
        });

        document.querySelectorAll('[data-action]').forEach(btn => {
            btn.addEventListener('click', async (e) => {
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
                                await this.clientsModule.delete(clientId);
                                this.eventBus.emit('notification:show', {
                                    message: 'Клиентът е изтрит успешно!',
                                    type: 'success'
                                });
                                await this.refresh();
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

    async refresh() {
        const focusedElement = document.activeElement;
        const focusId = focusedElement?.id;
        const selectionStart = focusedElement?.selectionStart;
        const selectionEnd = focusedElement?.selectionEnd;
        const isSearchInput = focusId === 'searchClient';

        const container = document.getElementById('view-container');
        if (container) {
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

                if (isSearchInput) {
                    const newSearchInput = document.getElementById('searchClient');
                    if (newSearchInput) {
                        newSearchInput.focus();
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
                        <p>Error: ${esc(error.message)}</p>
                        <button onclick="window.app.ui.currentView.refresh()" class="btn">🔄 Retry</button>
                    </div>
                `;
            }
        }
    }

    formatDate(dateStr) {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        const day = date.getDate().toString().padStart(2, '0');
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const year = date.getFullYear();
        return `${day}.${month}.${year}`;
    }
}
