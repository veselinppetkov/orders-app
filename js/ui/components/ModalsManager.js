import { CurrencyUtils } from '../../utils/CurrencyUtils.js';

export class ModalsManager {
    constructor(modules, state, eventBus) {
        this.modules = modules;
        this.state = state;
        this.eventBus = eventBus;
        this.currentModal = null;
        this.tempImageData = null;

        this.initContainer();
        this.attachGlobalListeners();
    }

    initContainer() {
        if (!document.getElementById('modal-container')) {
            const container = document.createElement('div');
            container.id = 'modal-container';
            document.body.appendChild(container);
        }
    }

    attachGlobalListeners() {
        // Listen for modal open requests
        this.eventBus.on('modal:open', (data) => this.open(data));

        // Close modal on ESC
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.currentModal) {
                this.close();
            }
        });

        // Handle paste for images
        document.addEventListener('paste', (e) => {
            if (this.currentModal && (this.currentModal.type === 'order')) {
                this.handleImagePaste(e);
            }
        });
    }

    async open(data) {
        this.currentModal = data;
        const container = document.getElementById('modal-container');

        // Show loading state
        container.innerHTML = `
            <div class="modal">
                <div class="modal-content">
                    <div class="loading-state">
                        <h3>Loading...</h3>
                    </div>
                </div>
            </div>
        `;
        container.querySelector('.modal').classList.add('active');

        try {
            let modalContent = '';
            switch(data.type) {
                case 'order':
                    modalContent = await this.renderOrderModal(data);
                    break;
                case 'client':
                    modalContent = await this.renderClientModal(data);
                    break;
                case 'inventory':
                    modalContent = this.renderInventoryModal(data);
                    break;
                case 'expense':
                    modalContent = await this.renderExpenseModal(data);  // FIXED
                    break;
                case 'image':
                    modalContent = this.renderImageModal(data);
                    break;
                case 'clientProfile':
                    modalContent = await this.renderClientProfileModal(data);
                    break;
                default:
                    this.close();
                    return;
            }

            container.innerHTML = modalContent;
            container.querySelector('.modal').classList.add('active');
            this.attachModalListeners();

        } catch (error) {
            console.error('❌ Failed to open modal:', error);
            container.innerHTML = `
                <div class="modal">
                    <div class="modal-content">
                        <div class="error-state">
                            <h3>❌ Failed to load modal</h3>
                            <p>Error: ${error.message}</p>
                            <button onclick="window.app.ui.modals.close()" class="btn">Close</button>
                        </div>
                    </div>
                </div>
            `;
        }
    }

    close() {
        const container = document.getElementById('modal-container');
        const modal = container.querySelector('.modal');
        if (modal) {
            modal.classList.remove('active');
            setTimeout(() => {
                container.innerHTML = '';
                this.currentModal = null;
                this.tempImageData = null;
            }, 300);
        }
    }

    async renderOrderModal(data) {
        const isEdit = data.mode === 'edit';
        const isDuplicate = data.mode === 'duplicate';

        // Get order data for edit/duplicate
        let order = null;
        if (isEdit || isDuplicate) {
            const result = await this.modules.orders.findOrderById(data.id);
            order = result?.order || null;
        }

        // For duplicate, reset certain fields
        const formData = isDuplicate && order ? {
            ...order,
            id: null,
            status: 'Очакван',
            notes: '',
            imageData: null
        } : order;

        const settings = await this.modules.settings.getSettings();
        const clients = await this.modules.clients.getAllClients();

        return `
        <div class="modal">
            <div class="modal-content">
                <div class="modal-header">
                    <h2>${isEdit ? '✏️ Редактиране на поръчка' :
            isDuplicate ? '📋 Дублиране на поръчка' :
                '➕ Нова поръчка'}</h2>
                    <button class="modal-close" onclick="window.app.ui.modals.close()">✕</button>
                </div>
                
                <form id="order-form" class="modal-form">
                    <div class="form-row">
                        <div class="form-group">
                            <label>Дата:</label>
                            <input type="date" id="orderDate" value="${formData?.date || new Date().toISOString().split('T')[0]}" required>
                        </div>
                        <div class="form-group">
                            <label>Клиент:</label>
                            <div class="input-with-button">
                                <input type="text" id="orderClient" list="clients-list" value="${formData?.client || ''}" required placeholder="Изберете или въведете клиент">
                                <datalist id="clients-list">
                                    ${clients.map(c => `<option value="${c.name}">`).join('')}
                                </datalist>
                                <button type="button" class="input-addon-btn" onclick="window.app.ui.modals.quickAddClient()">+</button>
                            </div>
                            <div id="client-hint" class="hint-text"></div>
                        </div>
                    </div>
                    
                    <div class="form-row">
                        <div class="form-group">
                            <label>Телефон:</label>
                            <input type="tel" id="orderPhone" value="${formData?.phone || ''}">
                        </div>
                        <div class="form-group">
                            <label>Източник:</label>
                            <select id="orderOrigin" required>
                                ${settings.origins.map(o => `
                                    <option value="${o}" ${formData?.origin === o ? 'selected' : ''}>${o}</option>
                                `).join('')}
                            </select>
                        </div>
                    </div>
                    
                    <div class="form-row">
                        <div class="form-group">
                            <label>Доставчик:</label>
                            <select id="orderVendor" required>
                                ${settings.vendors.map(v => `
                                    <option value="${v}" ${formData?.vendor === v ? 'selected' : ''}>${v}</option>
                                `).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Модел:</label>
                            <input type="text" id="orderModel" value="${formData?.model || ''}" required placeholder="Описание на модела">
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label>Снимка на модела:</label>
                        <div class="image-upload-area">
                            <input type="file" id="orderImage" accept="image/*" style="display: none;">
                            <button type="button" class="btn btn-upload" onclick="document.getElementById('orderImage').click()">
                                📷 Избери снимка
                            </button>
                            <div class="hint-text">Или поставете снимка с Ctrl+V</div>
                            <div id="image-preview" class="image-preview">
                                ${formData?.imageData ? `
                                    <img src="${formData.imageData}" class="preview-img">
                                    <button type="button" class="remove-img-btn" onclick="window.app.ui.modals.removeImage()">✕</button>
                                ` : '<div class="no-image">Няма избрана снимка</div>'}
                            </div>
                        </div>
                    </div>
                    
                    <div class="form-row">
                        <div class="form-group">
                            <label>Доставна цена (USD):</label>
                            <input type="number" id="orderCostUSD" value="${formData?.costUSD || ''}" step="0.01" required>
                        </div>
                        <div class="form-group">
                            <label>Доставка (USD):</label>
                            <input type="number" id="orderShippingUSD" value="${formData?.shippingUSD || settings.factoryShipping}" step="0.01">
                        </div>
                    </div>
                    
                    <div class="form-row">
                        <div class="form-group">
                            <label>Доп. разходи (€):</label>
                            <input type="number" id="orderExtrasEUR" value="${formData?.extrasEUR || ''}" step="0.01" placeholder="0.00">
                            <small style="color:#6c757d;">Допълнителни разходи в евро</small>
                        </div>
                        <div class="form-group">
                            <label>Продажна цена (€):</label>
                            <input type="number" id="orderSellEUR" value="${formData?.sellEUR || ''}" step="0.01" placeholder="0.00">
                            <small style="color:#6c757d;">Крайна цена за клиента в евро</small>
                        </div>
                    </div>
                    
                    <div class="form-row">
                        <div class="form-group">
                            <label>Статус:</label>
                            <select id="orderStatus">
                                <option value="Очакван" ${formData?.status === 'Очакван' ? 'selected' : ''}>Очакван</option>
                                <option value="Доставен" ${formData?.status === 'Доставен' ? 'selected' : ''}>Доставен</option>
                                <option value="Свободен" ${formData?.status === 'Свободен' ? 'selected' : ''}>Свободен</option>
                                <option value="Други" ${formData?.status === 'Други' ? 'selected' : ''}>Други</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="checkbox-label">
                                <input type="checkbox" id="orderFullSet" ${formData?.fullSet ? 'checked' : ''}>
                                Пълен сет
                            </label>
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label>Бележки:</label>
                        <textarea id="orderNotes" rows="3">${formData?.notes || ''}</textarea>
                    </div>
                    
                    <div class="form-actions">
                        <button type="button" class="btn secondary" onclick="window.app.ui.modals.close()">Отказ</button>
                        <button type="submit" class="btn primary">
                            ${isEdit ? 'Запази промените' :
            isDuplicate ? 'Създай копие' :
                'Добави поръчка'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;
    }

    async renderClientModal(data) {
        const isEdit = data.mode === 'edit';
        const client = isEdit ? await this.modules.clients.getClient(data.id) : null;
        const settings = await this.modules.settings.getSettings();

        return `
            <div class="modal">
                <div class="modal-content">
                    <div class="modal-header">
                        <h2>${isEdit ? '✏️ Редактиране на клиент' : '👤 Нов клиент'}</h2>
                        <button class="modal-close" onclick="window.app.ui.modals.close()">✕</button>
                    </div>
                    
                    <form id="client-form" class="modal-form">
                        <div class="form-group">
                            <label>Име на клиента:</label>
                            <input type="text" id="clientName" value="${client?.name || ''}" required>
                        </div>
                        
                        <div class="form-row">
                            <div class="form-group">
                                <label>Телефон:</label>
                                <input type="tel" id="clientPhone" value="${client?.phone || ''}">
                            </div>
                            <div class="form-group">
                                <label>Email:</label>
                                <input type="email" id="clientEmail" value="${client?.email || ''}">
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <label>Адрес:</label>
                            <textarea id="clientAddress" rows="2">${client?.address || ''}</textarea>
                        </div>
                        
                        <div class="form-group">
                            <label>Предпочитан източник:</label>
                            <select id="clientPreferredSource">
                                <option value="">Няма предпочитание</option>
                                ${settings.origins.map(o => `
                                    <option value="${o}" ${client?.preferredSource === o ? 'selected' : ''}>${o}</option>
                                `).join('')}
                            </select>
                        </div>
                        
                        <div class="form-group">
                            <label>Бележки:</label>
                            <textarea id="clientNotes" rows="3" placeholder="Предпочитания, специални условия...">${client?.notes || ''}</textarea>
                        </div>
                        
                        <div class="form-actions">
                            <button type="button" class="btn secondary" onclick="window.app.ui.modals.close()">Отказ</button>
                            <button type="submit" class="btn primary">
                                ${isEdit ? 'Запази промените' : 'Създай клиент'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;
    }

// Fix for ModalsManager.js - Replace renderExpenseModal method

    async renderExpenseModal(data) {
        const isEdit = data.mode === 'edit';

        // FIX: Make this async and await the getExpenses call
        let expense = null;
        if (isEdit) {
            const expenses = await this.modules.expenses.getExpenses();
            expense = expenses.find(e => e.id === data.id);
        }

        return `
        <div class="modal">
            <div class="modal-content">
                <div class="modal-header">
                    <h2>${isEdit ? '✏️ Редактиране на разход' : '💰 Нов разход'}</h2>
                    <button class="modal-close" onclick="window.app.ui.modals.close()">✕</button>
                </div>
                
                <form id="expense-form" class="modal-form">
                    <div class="form-group">
                        <label>Име на разхода:</label>
                        <input type="text" id="expenseName" value="${expense?.name || ''}" required>
                    </div>
                    
                    <div class="form-group">
                        <label>Сума (€):</label>
                        <input type="number" id="expenseAmount" value="${expense?.amount || ''}" step="0.01" placeholder="0.00" required>
                        <small style="color:#6c757d;">Размер на разхода в евро</small>
                    </div>
                    
                    <div class="form-group">
                        <label>Бележка:</label>
                        <textarea id="expenseNote" rows="3">${expense?.note || ''}</textarea>
                    </div>
                    
                    <div class="form-actions">
                        <button type="button" class="btn secondary" onclick="window.app.ui.modals.close()">Отказ</button>
                        <button type="submit" class="btn primary">
                            ${isEdit ? 'Запази промените' : 'Добави разход'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;
    }

    renderInventoryModal(data) {
        const isEdit = data.mode === 'edit';
        const item = isEdit ? this.modules.inventory.getItem(data.id) : null;

        return `
        <div class="modal">
            <div class="modal-content">
                <div class="modal-header">
                    <h2>${isEdit ? '✏️ Редактиране на кутия' : '📦 Нова кутия'}</h2>
                    <button class="modal-close" onclick="window.app.ui.modals.close()">✕</button>
                </div>
                
                <form id="inventory-form" class="modal-form">
                    <div class="form-group">
                        <label>Бранд:</label>
                        <input type="text" id="itemBrand" value="${item?.brand || ''}" required>
                    </div>
                    
                    <div class="form-group">
                        <label>Тип:</label>
                        <select id="itemType" required>
                            <option value="стандарт" ${item?.type === 'стандарт' ? 'selected' : ''}>Стандарт</option>
                            <option value="премиум" ${item?.type === 'премиум' ? 'selected' : ''}>Премиум</option>
                        </select>
                    </div>
                    
                    <div class="form-row">
                        <div class="form-group">
                            <label>Доставна цена (€):</label>
                            <input type="number" id="itemPurchasePrice" value="${item?.purchasePrice || ''}" step="0.01" placeholder="0.00" required>
                            <small style="color:#6c757d;">Цена на закупуване в евро</small>
                        </div>
                        <div class="form-group">
                            <label>Продажна цена (€):</label>
                            <input type="number" id="itemSellPrice" value="${item?.sellPrice || ''}" step="0.01" placeholder="0.00" required>
                            <small style="color:#6c757d;">Препоръчана цена за клиенти в евро</small>
                        </div>
                    </div>
                    
                    <div class="form-row">
                        <div class="form-group">
                            <label>Наличност (бр.):</label>
                            <input type="number" id="itemStock" value="${item?.stock || 0}" min="0" required>
                        </div>
                        <div class="form-group">
                            <label>Поръчани (бр.):</label>
                            <input type="number" id="itemOrdered" value="${item?.ordered || 0}" min="0">
                        </div>
                    </div>
                    
                    <div class="form-actions">
                        <button type="button" class="btn secondary" onclick="window.app.ui.modals.close()">Отказ</button>
                        <button type="submit" class="btn primary">
                            ${isEdit ? 'Запази' : 'Добави'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;
    }

    renderImageModal(data) {
        return `
        <div class="modal">
            <div class="modal-content modal-image">
                <div class="modal-header">
                    <h2>📷 ${data.title || 'Снимка на модел'}</h2>
                    <button class="modal-close" onclick="window.app.ui.modals.close()">✕</button>
                </div>
                <div class="modal-image-body">
                    <img src="${data.imageSrc}" alt="${data.title}" class="full-image">
                    <p class="image-caption">${data.caption || ''}</p>
                </div>
            </div>
        </div>
    `;
    }

    async renderClientProfileModal(data) {
        const client = await this.modules.clients.getClient(data.id);
        const stats = await this.modules.clients.getClientStats(client.name);
        const orders = await this.modules.clients.getClientOrders(client.name);

        return `
            <div class="modal">
                <div class="modal-content modal-large">
                    <div class="modal-header">
                        <h2>👤 ${client.name}</h2>
                        <button class="modal-close" onclick="window.app.ui.modals.close()">✕</button>
                    </div>
                    
                    <div class="client-profile">
                        <div class="profile-info">
                            <p><strong>Телефон:</strong> ${client.phone || 'Няма'}</p>
                            <p><strong>Email:</strong> ${client.email || 'Няма'}</p>
                            <p><strong>Адрес:</strong> ${client.address || 'Няма'}</p>
                            <p><strong>Предпочитан източник:</strong> ${client.preferredSource || 'Няма'}</p>
                            <p><strong>Бележки:</strong> ${client.notes || 'Няма'}</p>
                        </div>
                        
                        <div class="profile-stats">
                            <div class="stat-card">
                                <div class="stat-label">Общо поръчки</div>
                                <div class="stat-value">${stats.totalOrders}</div>
                            </div>
                            <div class="stat-card">
                                <div class="stat-label">Общ приход</div>
                                <div class="stat-value">${stats.totalRevenue.toFixed(2)} €</div>
                            </div>
                            <div class="stat-card">
                                <div class="stat-label">Обща печалба</div>
                                <div class="stat-value">${stats.totalProfit.toFixed(2)} €</div>
                            </div>
                        </div>
                        
                        <h3>История на поръчки:</h3>
                        ${orders.length > 0 ? `
                            <table class="orders-history">
                                <thead>
                                    <tr>
                                        <th>Дата</th>
                                        <th>Модел</th>
                                        <th>Сума</th>
                                        <th>Статус</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${orders.map(o => `
                                        <tr>
                                            <td>${new Date(o.date).toLocaleDateString('bg-BG')}</td>
                                            <td class="image-cell">
                                                ${o.imageData ?
            `<img src="${o.imageData}" 
                                                         class="model-image" 
                                                         alt="${o.model}" 
                                                         title="${o.model}"
                                                         onclick="window.app.ui.modals.open({
                                                             type: 'image',
                                                             imageSrc: '${o.imageData}',
                                                             title: '${o.model}',
                                                             caption: 'Клиент: ${o.client} | Дата: ${new Date(o.date).toLocaleDateString('bg-BG')}'
                                                         })">` :
            `<div class="no-image-placeholder">${o.model}</div>`
        }
                                            </td>
                                            <td>${(o.sellEUR || 0).toFixed(2)} €</td>
                                            <td><span class="status-badge ${this.modules.orders.getStatusClass(o.status)}">${o.status}</span></td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        ` : '<p>Няма поръчки</p>'}
                    </div>
                    
                    <div class="form-actions">
                        <button type="button" class="btn secondary" onclick="window.app.ui.modals.close()">Затвори</button>
                        <button type="button" class="btn primary" onclick="window.app.ui.modals.editClient('${client.id}')">
                            Редактирай клиента
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    attachModalListeners() {
        // Order form
        const orderForm = document.getElementById('order-form');
        if (orderForm) {
            orderForm.addEventListener('submit', async (e) => {
                await this.handleOrderSubmit(e);
            });

            // Client field change
            document.getElementById('orderClient')?.addEventListener('input', async (e) => {
                await this.updateClientHint(e.target.value);
            });

            // Image upload
            document.getElementById('orderImage')?.addEventListener('change', (e) => {
                this.handleImageUpload(e.target.files[0]);
            });
        }

        // Client form
        const clientForm = document.getElementById('client-form');
        if (clientForm) {
            clientForm.addEventListener('submit', async (e) => {
                await this.handleClientSubmit(e);
            });
        }

        // Expense form
        const expenseForm = document.getElementById('expense-form');
        if (expenseForm) {
            expenseForm.addEventListener('submit', async (e) => {
                await this.handleExpenseSubmit(e);
            });
        }

        // Inventory form
        const inventoryForm = document.getElementById('inventory-form');
        if (inventoryForm) {
            inventoryForm.addEventListener('submit', async (e) => {
                await this.handleInventorySubmit(e);
            });
        }
    }

// js/ui/components/ModalsManager.js - Fix handleOrderSubmit method

    async handleOrderSubmit(e) {
        e.preventDefault();

        // Get existing image data for edit mode
        let existingImageData = null;
        if (this.currentModal.mode === 'edit') {
            const result = await this.modules.orders.findOrderById(this.currentModal.id);
            existingImageData = result?.order?.imageData || null;
        }

        // FIXED: Ensure all form values are properly captured (no undefined/null values)
        const orderData = {
            date: document.getElementById('orderDate').value,
            client: document.getElementById('orderClient').value,
            phone: document.getElementById('orderPhone').value || '',
            origin: document.getElementById('orderOrigin').value,
            vendor: document.getElementById('orderVendor').value,
            model: document.getElementById('orderModel').value,
            // FIXED: Always capture exact form values (don't let them be undefined)
            costUSD: document.getElementById('orderCostUSD').value || '0',
            shippingUSD: document.getElementById('orderShippingUSD').value || '0',
            extrasEUR: document.getElementById('orderExtrasEUR').value || '0',
            sellEUR: document.getElementById('orderSellEUR').value || '0',
            status: document.getElementById('orderStatus').value,
            fullSet: document.getElementById('orderFullSet').checked,
            notes: document.getElementById('orderNotes').value || '',
            imageData: this.tempImageData || existingImageData
        };

        try {
            let result;
            if (this.currentModal.mode === 'edit') {
                result = await this.modules.orders.update(this.currentModal.id, orderData);
                this.eventBus.emit('notification:show', { message: 'Поръчката е актуализирана!', type: 'success' });
            } else {
                result = await this.modules.orders.create(orderData);
                const message = this.currentModal.mode === 'duplicate' ?
                    'Копието на поръчката е създадено!' : 'Поръчката е добавена!';
                this.eventBus.emit('notification:show', { message, type: 'success' });
            }

            this.close();

            // Refresh view
            if (window.app.ui.currentView?.smartRefresh) {
                await window.app.ui.currentView.smartRefresh(result);
            } else if (window.app.ui.currentView?.refresh) {
                await window.app.ui.currentView.refresh();
            }

        } catch (error) {
            console.error('❌ Order submit failed:', error);
            this.eventBus.emit('notification:show', {
                message: 'Грешка при запазване: ' + error.message,
                type: 'error'
            });
        }
    }

    async handleClientSubmit(e) {
        e.preventDefault();

        const clientData = {
            name: document.getElementById('clientName').value,
            phone: document.getElementById('clientPhone').value,
            email: document.getElementById('clientEmail').value,
            address: document.getElementById('clientAddress').value,
            preferredSource: document.getElementById('clientPreferredSource').value,
            notes: document.getElementById('clientNotes').value
        };

        try {
            if (this.currentModal.mode === 'edit') {
                await this.modules.clients.update(this.currentModal.id, clientData);
                this.eventBus.emit('notification:show', { message: 'Клиентът е актуализиран!', type: 'success' });
            } else {
                await this.modules.clients.create(clientData);
                this.eventBus.emit('notification:show', { message: 'Клиентът е създаден!', type: 'success' });
            }

            this.close();

            if (window.app.ui.currentView?.refresh) {
                await window.app.ui.currentView.refresh();
            }

        } catch (error) {
            console.error('❌ Client submit failed:', error);
            this.eventBus.emit('notification:show', {
                message: 'Грешка при запазване: ' + error.message,
                type: 'error'
            });
        }
    }

    async handleExpenseSubmit(e) {
        e.preventDefault();

        const expenseData = {
            name: document.getElementById('expenseName').value,
            amount: document.getElementById('expenseAmount').value,
            note: document.getElementById('expenseNote').value
        };

        try {
            if (this.currentModal.mode === 'edit') {
                await this.modules.expenses.update(this.currentModal.id, expenseData);
                this.eventBus.emit('notification:show', { message: 'Разходът е актуализиран!', type: 'success' });
            } else {
                await this.modules.expenses.create(expenseData);
                this.eventBus.emit('notification:show', { message: 'Разходът е добавен!', type: 'success' });
            }

            this.close();

            if (window.app.ui.currentView?.refresh) {
                await window.app.ui.currentView.refresh();
            }

        } catch (error) {
            console.error('❌ Expense submit failed:', error);
            this.eventBus.emit('notification:show', {
                message: 'Грешка при запазване: ' + error.message,
                type: 'error'
            });
        }
    }

    async handleInventorySubmit(e) {
        e.preventDefault();

        const itemData = {
            brand: document.getElementById('itemBrand').value,
            type: document.getElementById('itemType').value,
            purchasePrice: document.getElementById('itemPurchasePrice').value,
            sellPrice: document.getElementById('itemSellPrice').value,
            stock: document.getElementById('itemStock').value,
            ordered: document.getElementById('itemOrdered').value
        };

        try {
            if (this.currentModal.mode === 'edit') {
                await this.modules.inventory.updateItem(this.currentModal.id, itemData);
                this.eventBus.emit('notification:show', { message: 'Кутията е актуализирана!', type: 'success' });
            } else {
                await this.modules.inventory.createItem(itemData);
                this.eventBus.emit('notification:show', { message: 'Кутията е добавена!', type: 'success' });
            }

            this.close();

            if (window.app.ui.currentView?.refresh) {
                await window.app.ui.currentView.refresh();
            }

        } catch (error) {
            console.error('❌ Inventory submit failed:', error);
            this.eventBus.emit('notification:show', {
                message: 'Грешка при запазване: ' + error.message,
                type: 'error'
            });
        }
    }

    handleImageUpload(file) {
        if (file && file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                this.tempImageData = e.target.result;
                this.updateImagePreview(e.target.result);
            };
            reader.readAsDataURL(file);
        }
    }

    handleImagePaste(e) {
        const items = e.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                const file = items[i].getAsFile();
                this.handleImageUpload(file);
                e.preventDefault();
                this.eventBus.emit('notification:show', { message: 'Снимката е поставена!', type: 'info' });
                break;
            }
        }
    }

    updateImagePreview(imageSrc) {
        const preview = document.getElementById('image-preview');
        if (preview) {
            preview.innerHTML = `
                <img src="${imageSrc}" class="preview-img">
                <button type="button" class="remove-img-btn" onclick="window.app.ui.modals.removeImage()">✕</button>
            `;
        }
    }

    removeImage() {
        this.tempImageData = null;
        const preview = document.getElementById('image-preview');
        if (preview) {
            preview.innerHTML = '<div class="no-image">Няма избрана снимка</div>';
        }
    }

    async updateClientHint(clientName) {
        const hint = document.getElementById('client-hint');
        if (!hint) return;

        try {
            // Clear hint first
            hint.style.display = 'none';
            hint.innerHTML = '';

            // If no client name, clear all auto-filled fields
            if (!clientName || !clientName.trim()) {
                this.clearClientAutoFillFields();
                return;
            }

            const client = await this.modules.clients.getClientByName(clientName.trim());

            if (client) {
                const stats = await this.modules.clients.getClientStats(client.name);

                // Update hint display
                hint.innerHTML = `
                📞 ${client.phone || 'Няма тел.'} |
                📊 ${stats.totalOrders} поръчки |
                💰 ${stats.totalRevenue.toFixed(2)} €
            `;
                hint.style.display = 'block';

                // FIXED: Auto-fill ALL client fields (not just phone when empty)
                this.populateClientFields(client);

            } else {
                // Client not found - clear auto-filled fields but keep user input
                this.clearClientAutoFillFields();
            }

        } catch (error) {
            console.error('❌ Client hint update failed:', error);
            hint.style.display = 'none';
            this.clearClientAutoFillFields();
        }
    }

    populateClientFields(client) {
        // Always update phone (override existing value)
        const phoneField = document.getElementById('orderPhone');
        if (phoneField && client.phone) {
            phoneField.value = client.phone;
        }

        // Auto-select preferred source if available
        const originField = document.getElementById('orderOrigin');
        if (originField && client.preferredSource) {
            // Find and select the matching option
            const option = Array.from(originField.options).find(opt =>
                opt.value === client.preferredSource
            );
            if (option) {
                originField.value = client.preferredSource;
            }
        }

        // Note: Other fields like vendor, model, etc. should remain as user input
        // since they're order-specific, not client-specific
    }

// NEW METHOD: Clear client auto-filled fields
    clearClientAutoFillFields() {
        // Clear phone only if it matches a known client's phone
        // This prevents clearing user-entered phone numbers
        const phoneField = document.getElementById('orderPhone');
        if (phoneField) {
            // Optionally clear phone - or leave user's input
            // phoneField.value = '';
        }

        // Reset origin to default/first option if it was auto-selected
        const originField = document.getElementById('orderOrigin');
        if (originField && originField.options.length > 0) {
            // Don't auto-clear origin as user might have selected it manually
            // originField.selectedIndex = 0;
        }
    }

    async quickAddClient() {
        const clientName = document.getElementById('orderClient').value;
        if (!clientName) {
            this.eventBus.emit('notification:show', {
                message: 'Моля въведете име на клиент',
                type: 'error'
            });
            return;
        }

        try {
            // Check if client already exists
            const existingClient = await this.modules.clients.getClientByName(clientName);
            if (existingClient) {
                this.eventBus.emit('notification:show', {
                    message: 'Клиентът вече съществува',
                    type: 'info'
                });
                return;
            }

            // Create client
            const newClient = await this.modules.clients.create({
                name: clientName,
                phone: document.getElementById('orderPhone').value || '',
                preferredSource: document.getElementById('orderOrigin').value || '',
                notes: 'Добавен от поръчка'
            });

            this.eventBus.emit('notification:show', {
                message: `Клиент "${clientName}" е добавен!`,
                type: 'success'
            });

            // Update datalist
            await this.updateClientsDatalist();

        } catch (error) {
            console.error('❌ Quick add client failed:', error);
            this.eventBus.emit('notification:show', {
                message: 'Грешка при създаване на клиент: ' + error.message,
                type: 'error'
            });
        }
    }

    async updateClientsDatalist() {
        const datalist = document.getElementById('clients-list');
        if (datalist) {
            try {
                datalist.innerHTML = '';
                const clients = await this.modules.clients.getAllClients();
                clients.forEach(client => {
                    const option = document.createElement('option');
                    option.value = client.name;
                    datalist.appendChild(option);
                });
            } catch (error) {
                console.error('❌ Update clients datalist failed:', error);
            }
        }
    }

    editClient(clientId) {
        this.close();
        setTimeout(() => {
            this.open({ type: 'client', mode: 'edit', id: clientId });
        }, 100);
    }
}