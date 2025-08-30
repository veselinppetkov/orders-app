export default class InventoryView {
    constructor(modules, state, eventBus) {
        this.inventoryModule = modules.inventory;
        this.state = state;
        this.eventBus = eventBus;
        this.filter = 'all'; // all, low-stock, out-of-stock
        this.searchTerm = '';
    }

    render() {
        const stats = this.inventoryModule.getStats();
        const items = this.getFilteredItems();

        return `
            <div class="inventory-view">
                <h2>📦 Управление на инвентар - Кутии за часовници</h2>
                <p style="margin-bottom: 20px; color: #6c757d;">Следете наличността и управлявайте кутиите</p>
                
                ${this.renderStats(stats)}
                ${this.renderControls()}
                ${this.renderFilters()}
                ${this.renderTable(items)}
            </div>
        `;
    }

    renderStats(stats) {
        return `
            <div class="inventory-stats">
                <div class="stat-card">
                    <div class="stat-label">Общо типове</div>
                    <div class="stat-value">${stats.totalItems}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Общо налични</div>
                    <div class="stat-value">${stats.totalStock} бр.</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Поръчани</div>
                    <div class="stat-value">${stats.totalOrdered} бр.</div>
                </div>
                <div class="stat-card ${stats.lowStockItems.length > 0 ? 'warning' : ''}">
                    <div class="stat-label">Ниска наличност</div>
                    <div class="stat-value">${stats.lowStockItems.length}</div>
                </div>
                <div class="stat-card ${stats.outOfStockItems.length > 0 ? 'danger' : ''}">
                    <div class="stat-label">Изчерпани</div>
                    <div class="stat-value">${stats.outOfStockItems.length}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Стойност на склад</div>
                    <div class="stat-value">${stats.totalValue.toFixed(2)} лв</div>
                </div>
            </div>
        `;
    }

    renderControls() {
        return `
            <div class="controls">
                <button class="btn" id="new-inventory-btn">➕ Добави кутия</button>
                <button class="btn secondary" data-filter="all">Всички</button>
                <button class="btn warning" data-filter="low-stock">Ниска наличност</button>
                <button class="btn danger" data-filter="out-of-stock">Изчерпани</button>
            </div>
        `;
    }

    renderFilters() {
        return `
            <div class="filter-section">
                <div class="filter-group">
                    <label>Търсене:</label>
                    <input type="text" id="searchInventory" placeholder="Бранд, тип..." value="${this.searchTerm}">
                </div>
            </div>
        `;
    }

    renderTable(items) {
        return `
            <div style="overflow-x: auto;">
                <table class="inventory-table">
                    <thead>
                        <tr>
                            <th>Бранд</th>
                            <th>Тип</th>
                            <th>Доставна цена</th>
                            <th>Продажна цена</th>
                            <th>Наличност</th>
                            <th>Поръчани</th>
                            <th>Общо</th>
                            <th>Статус</th>
                            <th>Действия</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${items.map(item => this.renderItemRow(item)).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    renderItemRow(item) {
        const total = item.stock + item.ordered;
        const statusClass = item.stock === 0 ? 'out-of-stock' : item.stock <= 2 ? 'low-stock' : 'in-stock';
        const statusText = item.stock === 0 ? 'Изчерпан' : item.stock <= 2 ? 'Ниска наличност' : 'Наличен';

        return `
            <tr data-item-id="${item.id}">
                <td><strong>${item.brand}</strong></td>
                <td>
                    <span class="badge ${item.type === 'премиум' ? 'premium' : 'standard'}">
                        ${item.type}
                    </span>
                </td>
                <td>${item.purchasePrice.toFixed(2)} лв</td>
                <td>${item.sellPrice.toFixed(2)} лв</td>
                <td>
                    <div class="stock-control">
                        <button class="stock-btn" data-action="decrease" data-id="${item.id}">-</button>
                        <span class="stock-value">${item.stock}</span>
                        <button class="stock-btn" data-action="increase" data-id="${item.id}">+</button>
                    </div>
                </td>
                <td>${item.ordered}</td>
                <td><strong>${total}</strong></td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td>
                    <button class="btn btn-sm" data-action="edit" data-id="${item.id}">✏️</button>
                    <button class="btn btn-sm info" data-action="order" data-id="${item.id}">📦</button>
                    <button class="btn btn-sm danger" data-action="delete" data-id="${item.id}">🗑️</button>
                </td>
            </tr>
        `;
    }

    getFilteredItems() {
        let items = this.inventoryModule.getAllItems();

        // Apply filter
        if (this.filter === 'low-stock') {
            items = items.filter(item => item.stock > 0 && item.stock <= 2);
        } else if (this.filter === 'out-of-stock') {
            items = items.filter(item => item.stock === 0);
        }

        // Apply search
        if (this.searchTerm) {
            const term = this.searchTerm.toLowerCase();
            items = items.filter(item =>
                item.brand.toLowerCase().includes(term) ||
                item.type.toLowerCase().includes(term)
            );
        }

        return items;
    }

    attachListeners() {
        // New item button
        document.getElementById('new-inventory-btn')?.addEventListener('click', () => {
            this.eventBus.emit('modal:open', { type: 'inventory', mode: 'create' });
        });

        // Filter buttons
        document.querySelectorAll('[data-filter]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.filter = e.target.dataset.filter;
                this.refresh();
            });
        });

        // Search
        document.getElementById('searchInventory')?.addEventListener('input', (e) => {
            this.searchTerm = e.target.value;
            this.refresh();
        });

        // Stock controls
        document.querySelectorAll('.stock-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.target.dataset.id;
                const action = e.target.dataset.action;

                if (action === 'increase') {
                    this.inventoryModule.updateStock(id, 1, 'add');
                } else if (action === 'decrease') {
                    this.inventoryModule.updateStock(id, 1, 'subtract');
                }

                this.refresh();
            });
        });

        // Action buttons
        document.querySelectorAll('[data-action]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = e.target.dataset.action;
                const id = e.target.dataset.id;

                switch(action) {
                    case 'edit':
                        this.eventBus.emit('modal:open', { type: 'inventory', mode: 'edit', id });
                        break;
                    case 'order':
                        this.eventBus.emit('modal:open', { type: 'inventory-order', id });
                        break;
                    case 'delete':
                        if (confirm('Сигурни ли сте?')) {
                            this.inventoryModule.deleteItem(id);
                            this.refresh();
                        }
                        break;
                }
            });
        });
    }

    refresh() {
        const container = document.getElementById('view-container');
        if (container) {
            container.innerHTML = this.render();
            this.attachListeners();
        }
    }
}
