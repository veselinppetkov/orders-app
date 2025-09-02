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

    open(data) {
        this.currentModal = data;
        const container = document.getElementById('modal-container');

        let modalContent = '';
        switch(data.type) {
            case 'order':
                modalContent = this.renderOrderModal(data);
                break;
            case 'client':
                modalContent = this.renderClientModal(data);
                break;
            case 'inventory':
                modalContent = this.renderInventoryModal(data);
                break;
            case 'expense':
                modalContent = this.renderExpenseModal(data);
                break;
            case 'image':
                modalContent = this.renderImageModal(data);
                break;
            case 'clientProfile':
                modalContent = this.renderClientProfileModal(data);
                break;
            default:
                return;
        }

        container.innerHTML = modalContent;
        container.querySelector('.modal').classList.add('active');

        this.attachModalListeners();
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

    renderOrderModal(data) {
        const isEdit = data.mode === 'edit';
        const isDuplicate = data.mode === 'duplicate';
        const order = (isEdit || isDuplicate) ? this.modules.orders.getOrders().find(o => o.id === data.id) : null;

// За дублиране, създаваме нов обект с reset-нати полета
        const formData = isDuplicate && order ? {
            ...order,
            id: null, // премахваме ID за да се създаде нов
            // date: запазва оригиналната дата
            status: 'Очакван', // reset статус
            notes: '', // изчистваме бележките
            imageData: null // премахваме снимката
        } : order;

        const settings = this.state.get('settings');
        const clients = this.modules.clients.getAllClients();

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
                            <label>Доп. разходи (BGN):</label>
                            <input type="number" id="orderExtrasBGN" value="${formData?.extrasBGN || 0}" step="0.01">
                        </div>
                        <div class="form-group">
                            <label>Продажна цена (BGN):</label>
                            <input type="number" id="orderSellBGN" value="${formData?.sellBGN || ''}" step="0.01">
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

    renderClientModal(data) {
        const isEdit = data.mode === 'edit';
        const client = isEdit ? this.modules.clients.getClient(data.id) : null;
        const settings = this.state.get('settings');

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

    renderExpenseModal(data) {
        const isEdit = data.mode === 'edit';
        const expense = isEdit ? this.modules.expenses.getExpenses().find(e => e.id === data.id) : null;

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
                            <label>Сума (BGN):</label>
                            <input type="number" id="expenseAmount" value="${expense?.amount || ''}" step="0.01" required>
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
                    <button class="modal-close" id="close-modal">✕</button>
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
                            <label>Доставна цена (лв):</label>
                            <input type="number" id="itemPurchasePrice" value="${item?.purchasePrice || ''}" step="0.01" required>
                        </div>
                        <div class="form-group">
                            <label>Продажна цена (лв):</label>
                            <input type="number" id="itemSellPrice" value="${item?.sellPrice || ''}" step="0.01" required>
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
                        <button type="button" class="btn secondary" id="cancel-btn">Отказ</button>
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

    renderClientProfileModal(data) {
        const client = this.modules.clients.getClient(data.id);
        const stats = this.modules.clients.getClientStats(client.name);
        const orders = this.modules.clients.getClientOrders(client.name);

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
                                <div class="stat-value">${stats.totalRevenue.toFixed(2)} лв</div>
                            </div>
                            <div class="stat-card">
                                <div class="stat-label">Обща печалба</div>
                                <div class="stat-value">${stats.totalProfit.toFixed(2)} лв</div>
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
        <td>${o.sellBGN.toFixed(2)} лв</td>
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
            orderForm.addEventListener('submit', (e) => this.handleOrderSubmit(e));

            // Client field change
            document.getElementById('orderClient')?.addEventListener('input', (e) => {
                this.updateClientHint(e.target.value);
            });

            // Image upload
            document.getElementById('orderImage')?.addEventListener('change', (e) => {
                this.handleImageUpload(e.target.files[0]);
            });
        }

        const inventoryForm = document.getElementById('inventory-form');
        if (inventoryForm) {
            inventoryForm.addEventListener('submit', (e) => this.handleInventorySubmit(e));
        }

        // Client form
        const clientForm = document.getElementById('client-form');
        if (clientForm) {
            clientForm.addEventListener('submit', (e) => this.handleClientSubmit(e));
        }

        // Expense form
        const expenseForm = document.getElementById('expense-form');
        if (expenseForm) {
            expenseForm.addEventListener('submit', (e) => this.handleExpenseSubmit(e));
        }
    }

    handleOrderSubmit(e) {
        e.preventDefault();

        const orderData = {
            date: document.getElementById('orderDate').value,
            client: document.getElementById('orderClient').value,
            phone: document.getElementById('orderPhone').value,
            origin: document.getElementById('orderOrigin').value,
            vendor: document.getElementById('orderVendor').value,
            model: document.getElementById('orderModel').value,
            costUSD: document.getElementById('orderCostUSD').value,
            shippingUSD: document.getElementById('orderShippingUSD').value,
            extrasBGN: document.getElementById('orderExtrasBGN').value,
            sellBGN: document.getElementById('orderSellBGN').value,
            status: document.getElementById('orderStatus').value,
            fullSet: document.getElementById('orderFullSet').checked,
            notes: document.getElementById('orderNotes').value,
            imageData: this.tempImageData || (this.currentModal.mode === 'edit' ?
                this.modules.orders.getOrders().find(o => o.id === this.currentModal.id)?.imageData : null)
        };

        let result;
        if (this.currentModal.mode === 'edit') {
            result = this.modules.orders.update(this.currentModal.id, orderData);
            this.eventBus.emit('notification:show', { message: 'Поръчката е актуализирана!', type: 'success' });
        } else {
            // Both 'create' and 'duplicate' create new orders
            result = this.modules.orders.create(orderData);
            const message = this.currentModal.mode === 'duplicate' ?
                'Копието на поръчката е създадено!' : 'Поръчката е добавена!';
            this.eventBus.emit('notification:show', { message, type: 'success' });
        }

        this.close();

        // Използвай smartRefresh ако е достъпно
        if (window.app.ui.currentView?.smartRefresh) {
            window.app.ui.currentView.smartRefresh(result);
        } else if (window.app.ui.currentView?.refresh) {
            window.app.ui.currentView.refresh();
        }
    }

    handleClientSubmit(e) {
        e.preventDefault();

        const clientData = {
            name: document.getElementById('clientName').value,
            phone: document.getElementById('clientPhone').value,
            email: document.getElementById('clientEmail').value,
            address: document.getElementById('clientAddress').value,
            preferredSource: document.getElementById('clientPreferredSource').value,
            notes: document.getElementById('clientNotes').value
        };

        if (this.currentModal.mode === 'edit') {
            this.modules.clients.update(this.currentModal.id, clientData);
            this.eventBus.emit('notification:show', { message: 'Клиентът е актуализиран!', type: 'success' });
        } else {
            this.modules.clients.create(clientData);
            this.eventBus.emit('notification:show', { message: 'Клиентът е създаден!', type: 'success' });
        }

        this.close();

        // Refresh current view
        if (window.app.ui.currentView?.refresh) {
            window.app.ui.currentView.refresh();
        }
    }

    handleExpenseSubmit(e) {
        e.preventDefault();

        const expenseData = {
            name: document.getElementById('expenseName').value,
            amount: document.getElementById('expenseAmount').value,
            note: document.getElementById('expenseNote').value
        };

        if (this.currentModal.mode === 'edit') {
            this.modules.expenses.update(this.currentModal.id, expenseData);
            this.eventBus.emit('notification:show', { message: 'Разходът е актуализиран!', type: 'success' });
        } else {
            this.modules.expenses.create(expenseData);
            this.eventBus.emit('notification:show', { message: 'Разходът е добавен!', type: 'success' });
        }

        this.close();

        // Refresh current view
        if (window.app.ui.currentView?.refresh) {
            window.app.ui.currentView.refresh();
        }
    }

    handleInventorySubmit(e) {
        e.preventDefault();

        const itemData = {
            brand: document.getElementById('itemBrand').value,
            type: document.getElementById('itemType').value,
            purchasePrice: document.getElementById('itemPurchasePrice').value,
            sellPrice: document.getElementById('itemSellPrice').value,
            stock: document.getElementById('itemStock').value,
            ordered: document.getElementById('itemOrdered').value
        };

        if (this.currentModal.mode === 'edit') {
            this.modules.inventory.updateItem(this.currentModal.id, itemData);
            this.eventBus.emit('notification:show', { message: 'Кутията е актуализирана!', type: 'success' });
        } else {
            this.modules.inventory.createItem(itemData);
            this.eventBus.emit('notification:show', { message: 'Кутията е добавена!', type: 'success' });
        }

        this.close();

        if (window.app.ui.currentView?.refresh) {
            window.app.ui.currentView.refresh();
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

    updateClientHint(clientName) {
        const hint = document.getElementById('client-hint');
        if (!hint) return;

        const client = this.modules.clients.getClientByName(clientName);
        if (client) {
            const stats = this.modules.clients.getClientStats(client.name);
            hint.innerHTML = `
                📞 ${client.phone || 'Няма тел.'} | 
                📊 ${stats.totalOrders} поръчки | 
                💰 ${stats.totalRevenue.toFixed(2)} лв
            `;
            hint.style.display = 'block';

            // Auto-fill phone if empty
            const phoneField = document.getElementById('orderPhone');
            if (phoneField && !phoneField.value && client.phone) {
                phoneField.value = client.phone;
            }
        } else {
            hint.style.display = 'none';
        }
    }

    quickAddClient() {
        const clientName = document.getElementById('orderClient').value;
        if (!clientName) {
            this.eventBus.emit('notification:show', {
                message: 'Моля въведете име на клиент',
                type: 'error'
            });
            return;
        }

        // Проверка дали клиентът вече съществува
        const existingClient = this.modules.clients.getClientByName(clientName);
        if (existingClient) {
            this.eventBus.emit('notification:show', {
                message: 'Клиентът вече съществува',
                type: 'info'
            });
            return;
        }

        // Директно създаване на клиент
        const newClient = this.modules.clients.create({
            name: clientName,
            phone: document.getElementById('orderPhone').value || '',
            preferredSource: document.getElementById('orderOrigin').value || '',
            notes: 'Добавен от поръчка'
        });

        this.eventBus.emit('notification:show', {
            message: `Клиент "${clientName}" е добавен!`,
            type: 'success'
        });

        // Обновяване на datalist
        this.updateClientsDatalist();
    }

    updateClientsDatalist() {
        const datalist = document.getElementById('clients-list');
        if (datalist) {
            datalist.innerHTML = '';
            const clients = this.modules.clients.getAllClients();
            clients.forEach(client => {
                const option = document.createElement('option');
                option.value = client.name;
                datalist.appendChild(option);
            });
        }
    }

    editClient(clientId) {
        this.close();
        setTimeout(() => {
            this.open({ type: 'client', mode: 'edit', id: clientId });
        }, 100);
    }
}