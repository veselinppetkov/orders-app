export default class InventoryView {
    constructor(modules, state, eventBus) {
        this.inventoryModule = modules.inventory;
        this.state = state;
        this.eventBus = eventBus;
        this.filter = 'all'; // all, low-stock, out-of-stock
        this.searchTerm = '';
    }

    async render() {
        try {
            // INVENTORY IS STILL LOCAL (not migrated to Supabase yet)
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
                    
                    ${items.length === 0 ? `
                        <div class="empty-state">
                            <h3>Няма намерени продукти</h3>
                            <p>Променете филтрите или добавете нови кутии</p>
                            <button class="btn" onclick="document.getElementById('new-inventory-btn').click()">➕ Добави кутия</button>
                        </div>
                    ` : ''}
                </div>
            `;

        } catch (error) {
            console.error('❌ Failed to render inventory view:', error);
            return `
                <div class="error-state">
                    <h3>❌ Failed to load inventory</h3>
                    <p>Error: ${error.message}</p>
                    <button onclick="window.app.ui.currentView.refresh()" class="btn">🔄 Retry</button>
                </div>
            `;
        }
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
                <div class="stat-card">
                    <div class="stat-label">Потенциални приходи</div>
                    <div class="stat-value">${stats.potentialRevenue.toFixed(2)} лв</div>
                </div>
            </div>
        `;
    }

    renderControls() {
        return `
            <div class="controls">
                <button class="btn" id="new-inventory-btn">➕ Добави кутия</button>
                <button class="btn secondary" data-filter="all">Всички (${this.inventoryModule.getAllItems().length})</button>
                <button class="btn warning" data-filter="low-stock">Ниска наличност (${this.inventoryModule.getStats().lowStockItems.length})</button>
                <button class="btn danger" data-filter="out-of-stock">Изчерпани (${this.inventoryModule.getStats().outOfStockItems.length})</button>
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
                <div class="filter-group">
                    <label>Филтър:</label>
                    <select id="typeFilter">
                        <option value="">Всички типове</option>
                        <option value="стандарт">Стандарт</option>
                        <option value="премиум">Премиум</option>
                    </select>
                </div>
                <div class="filter-group">
                    <label>Сортиране:</label>
                    <select id="sortInventory">
                        <option value="brand">По бранд</option>
                        <option value="stock">По наличност</option>
                        <option value="value">По стойност</option>
                        <option value="type">По тип</option>
                    </select>
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
                            <th>Стойност</th>
                            <th>Статус</th>
                            <th>Действия</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${items.map(item => this.renderItemRow(item)).join('')}
                    </tbody>
                    ${items.length > 0 ? `
                        <tfoot>
                            <tr class="total-row">
                                <td colspan="4"><strong>ОБЩО</strong></td>
                                <td><strong>${items.reduce((sum, item) => sum + item.stock, 0)}</strong></td>
                                <td><strong>${items.reduce((sum, item) => sum + item.ordered, 0)}</strong></td>
                                <td><strong>${items.reduce((sum, item) => sum + item.stock + item.ordered, 0)}</strong></td>
                                <td><strong>${items.reduce((sum, item) => sum + (item.stock * item.purchasePrice), 0).toFixed(2)} лв</strong></td>
                                <td colspan="2"></td>
                            </tr>
                        </tfoot>
                    ` : ''}
                </table>
            </div>
        `;
    }

    renderItemRow(item) {
        const total = item.stock + item.ordered;
        const statusClass = item.stock === 0 ? 'out-of-stock' : item.stock <= 2 ? 'low-stock' : 'in-stock';
        const statusText = item.stock === 0 ? 'Изчерпан' : item.stock <= 2 ? 'Ниска наличност' : 'Наличен';
        const itemValue = item.stock * item.purchasePrice;

        return `
            <tr data-item-id="${item.id}" class="${statusClass}">
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
                <td>
                    <div class="ordered-control">
                        <input type="number" class="ordered-input" data-id="${item.id}" value="${item.ordered}" min="0" max="999">
                    </div>
                </td>
                <td><strong>${total}</strong></td>
                <td><strong>${itemValue.toFixed(2)} лв</strong></td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td>
                    <div class="action-buttons">
                        <button class="btn btn-sm" data-action="edit" data-id="${item.id}" title="Редактиране">✏️</button>
                        <button class="btn btn-sm danger" data-action="delete" data-id="${item.id}" title="Изтриване">🗑️</button>
                    </div>
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

        // Apply type filter
        const typeFilter = document.getElementById('typeFilter')?.value;
        if (typeFilter) {
            items = items.filter(item => item.type === typeFilter);
        }

        // Apply sorting
        const sortBy = document.getElementById('sortInventory')?.value || 'brand';
        items.sort((a, b) => {
            switch (sortBy) {
                case 'stock':
                    return b.stock - a.stock;
                case 'value':
                    return (b.stock * b.purchasePrice) - (a.stock * a.purchasePrice);
                case 'type':
                    return a.type.localeCompare(b.type);
                default: // brand
                    return a.brand.localeCompare(b.brand);
            }
        });

        return items;
    }

    attachListeners() {
        // New item button
        document.getElementById('new-inventory-btn')?.addEventListener('click', () => {
            this.eventBus.emit('modal:open', { type: 'inventory', mode: 'create' });
        });

        // Filter buttons
        document.querySelectorAll('[data-filter]').forEach(btn => {
            btn.addEventListener('click', async (e) => { // MAKE ASYNC
                this.filter = e.target.dataset.filter;

                // Update button states
                document.querySelectorAll('[data-filter]').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');

                await this.refresh(); // ADD AWAIT
            });
        });

        // Search input
        document.getElementById('searchInventory')?.addEventListener('input', async (e) => { // MAKE ASYNC
            this.searchTerm = e.target.value;
            await this.refresh(); // ADD AWAIT
        });

        // Type and sort filters
        document.getElementById('typeFilter')?.addEventListener('change', async () => {
            await this.refresh();
        });

        document.getElementById('sortInventory')?.addEventListener('change', async () => {
            await this.refresh();
        });

        // Stock controls
        document.querySelectorAll('.stock-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => { // MAKE ASYNC
                const id = e.target.dataset.id;
                const action = e.target.dataset.action;

                try {
                    if (action === 'increase') {
                        await this.inventoryModule.updateStock(id, 1, 'add');
                    } else if (action === 'decrease') {
                        await this.inventoryModule.updateStock(id, 1, 'subtract');
                    }

                    await this.refresh(); // ADD AWAIT

                } catch (error) {
                    console.error('❌ Stock update failed:', error);
                    this.eventBus.emit('notification:show', {
                        message: 'Грешка при обновяване на наличността',
                        type: 'error'
                    });
                }
            });
        });

        // Ordered quantity inputs
        document.querySelectorAll('.ordered-input').forEach(input => {
            input.addEventListener('change', async (e) => { // MAKE ASYNC
                const id = e.target.dataset.id;
                const newValue = parseInt(e.target.value) || 0;

                try {
                    await this.inventoryModule.updateOrdered(id, newValue);
                    this.eventBus.emit('notification:show', {
                        message: 'Поръчаното количество е обновено',
                        type: 'success'
                    });
                    await this.refresh(); // ADD AWAIT

                } catch (error) {
                    console.error('❌ Ordered update failed:', error);
                    this.eventBus.emit('notification:show', {
                        message: 'Грешка при обновяване',
                        type: 'error'
                    });
                }
            });
        });

        // Action buttons
        document.querySelectorAll('[data-action]').forEach(btn => {
            btn.addEventListener('click', async (e) => { // MAKE ASYNC
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
                        if (confirm('Сигурни ли сте, че искате да изтриете този продукт?')) {
                            try {
                                await this.inventoryModule.deleteItem(id);
                                this.eventBus.emit('notification:show', {
                                    message: 'Продуктът е изтрит успешно',
                                    type: 'success'
                                });
                                await this.refresh(); // ADD AWAIT
                            } catch (error) {
                                console.error('❌ Delete failed:', error);
                                this.eventBus.emit('notification:show', {
                                    message: 'Грешка при изтриване',
                                    type: 'error'
                                });
                            }
                        }
                        break;
                }
            });
        });

        // Bulk order button
        document.getElementById('bulk-order-btn')?.addEventListener('click', () => {
            const stats = this.inventoryModule.getStats();
            const lowStockItems = stats.lowStockItems;
            const outOfStockItems = stats.outOfStockItems;

            if (lowStockItems.length === 0 && outOfStockItems.length === 0) {
                this.eventBus.emit('notification:show', {
                    message: 'Няма продукти с ниска наличност за поръчване',
                    type: 'info'
                });
                return;
            }

            // Generate bulk order suggestion
            let orderSuggestion = 'Препоръчителна поръчка:\n\n';

            outOfStockItems.forEach(item => {
                orderSuggestion += `${item.brand} (${item.type}): 5 бр. (изчерпан)\n`;
            });

            lowStockItems.forEach(item => {
                orderSuggestion += `${item.brand} (${item.type}): ${5 - item.stock} бр. (само ${item.stock} налични)\n`;
            });

            alert(orderSuggestion);
        });
    }

    // ASYNC REFRESH METHOD
    async refresh() {
        const container = document.getElementById('view-container');
        if (container) {
            // Show loading state
            container.innerHTML = `
                <div class="loading-state">
                    <h3>📦 Loading inventory...</h3>
                    <p>Calculating stock levels...</p>
                </div>
            `;

            try {
                const content = await this.render();
                container.innerHTML = content;
                this.attachListeners();
            } catch (error) {
                console.error('❌ Failed to refresh inventory view:', error);
                container.innerHTML = `
                    <div class="error-state">
                        <h3>❌ Failed to load inventory</h3>
                        <p>Error: ${error.message}</p>
                        <button onclick="window.app.ui.currentView.refresh()" class="btn">🔄 Retry</button>
                    </div>
                `;
            }
        }
    }
}