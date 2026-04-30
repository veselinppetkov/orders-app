import { CurrencyUtils } from '../../utils/CurrencyUtils.js';
import { FormatUtils } from '../../utils/FormatUtils.js';

export class ModalsManager {
    constructor(modules, state, eventBus) {
        this.modules = modules;
        this.state = state;
        this.eventBus = eventBus;
        this.currentModal = null;
        this.tempImageData = null;
        this.imageMarkedForRemoval = false;
        this._previousFocus = null;
        this._tabHandler = null;
        this.container = null;
        this._boundContainer = null;
        this._containerClickHandler = (e) => this.handleContainerClick(e);

        this.initContainer();
        this.attachGlobalListeners();
    }

    initContainer() {
        this.container = document.getElementById('modal-container');

        if (!this.container) {
            this.container = document.createElement('div');
            this.container.id = 'modal-container';
            document.body.appendChild(this.container);
        }

        this.attachContainerListener();
        return this.container;
    }

    attachContainerListener() {
        if (!this.container || this._boundContainer === this.container) return;

        if (this._boundContainer) {
            this._boundContainer.removeEventListener('click', this._containerClickHandler);
        }

        this.container.addEventListener('click', this._containerClickHandler);
        this._boundContainer = this.container;
    }

    handleContainerClick(e) {
        const el = e.target.closest('[data-action]');
        if (!el) return;
        switch (el.dataset.action) {
            case 'close':            this.close(); break;
            case 'upload-image':     document.getElementById('orderImage')?.click(); break;
            case 'remove-image':     this.removeImage(); break;
            case 'quick-add-client': this.quickAddClient(); break;
            case 'edit-client':      this.editClient(el.dataset.clientId); break;
            case 'view-profile-image':
                this.openProfileImage(el);
                break;
        }
    }

    async openProfileImage(el) {
        let fullImageUrl = null;
        try {
            fullImageUrl = el.dataset.imagePath
                ? await this.modules.orders.getFullImageUrl(el.dataset.imagePath)
                : null;
        } catch (error) {
            console.warn('Could not load full profile image:', error);
        }

        this.open({
            type: 'image',
            imageSrc: fullImageUrl || el.src,
            title: el.dataset.model,
            caption: el.dataset.caption
        });
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

        // Delegated handler for all data-action buttons (replaces inline onclick)
        this.attachContainerListener();
    }

    async open(data) {
        this._previousFocus = document.activeElement;
        this.currentModal = data;
        if (data.type === 'order') {
            this.tempImageData = null;
            this.imageMarkedForRemoval = false;
        }
        const container = this.initContainer();

        // Show loading state
        container.innerHTML = `
            <div class="modal">
                <div class="modal-content">
                    <div class="loading-state">
                        <h3>Зареждане...</h3>
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
            const modal = container.querySelector('.modal');
            modal.classList.add('active');
            this.attachModalListeners();
            this._setupFocusTrap(modal);

            // Direct close-button listeners as belt-and-suspenders fallback.
            // The delegated handler on #modal-container covers the common case,
            // but direct binding guarantees the button always works regardless of
            // event-bubbling edge cases (e.g. position:fixed + deep nesting).
            container.querySelectorAll('[data-action="close"]').forEach(btn => {
                btn.addEventListener('click', () => this.close());
            });

        } catch (error) {
            console.error('❌ Failed to open modal:', error);
            container.innerHTML = `
                <div class="modal">
                    <div class="modal-content">
                        <div class="error-state">
                            <h3>Неуспешно зареждане</h3>
                            <p>Грешка: ${error.message}</p>
                            <button data-action="close" class="btn">Затвори</button>
                        </div>
                    </div>
                </div>
            `;
        }
    }

    close() {
        const container = this.initContainer();
        const modal = container.querySelector('.modal');
        if (modal) {
            if (this._tabHandler) {
                modal.removeEventListener('keydown', this._tabHandler);
                this._tabHandler = null;
            }
            if (this._previousFocus) {
                this._previousFocus.focus();
                this._previousFocus = null;
            }
            modal.classList.remove('active');
            setTimeout(() => {
                container.innerHTML = '';
                this.currentModal = null;
                this.tempImageData = null;
                this.imageMarkedForRemoval = false;
            }, 300);
        }
    }

    // HTML-escape helper (delegates to FormatUtils)
    _esc(str) { return FormatUtils.escapeHtml(String(str ?? '')); }

    _setupFocusTrap(modal) {
        const heading = modal.querySelector('h2');
        if (heading && !heading.id) heading.id = 'modal-title';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        if (heading?.id) modal.setAttribute('aria-labelledby', heading.id);

        const sel = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';
        const getFocusables = () => [...modal.querySelectorAll(sel)];

        const first = getFocusables()[0];
        if (first) first.focus();

        this._tabHandler = (e) => {
            if (e.key !== 'Tab') return;
            const els = getFocusables();
            if (!els.length) return;
            const firstEl = els[0];
            const lastEl = els[els.length - 1];
            if (e.shiftKey) {
                if (document.activeElement === firstEl) { e.preventDefault(); lastEl.focus(); }
            } else {
                if (document.activeElement === lastEl) { e.preventDefault(); firstEl.focus(); }
            }
        };
        modal.addEventListener('keydown', this._tabHandler);
    }

    _attachValidation(rules) {
        Object.entries(rules).forEach(([fieldId, { validate, message }]) => {
            const field = document.getElementById(fieldId);
            if (!field) return;
            const errorSpan = document.createElement('span');
            errorSpan.className = 'form-error';
            errorSpan.textContent = message;
            field.after(errorSpan);
            const check = () => {
                const invalid = !validate(field.value);
                field.classList.toggle('invalid', invalid);
                errorSpan.classList.toggle('visible', invalid);
            };
            field.addEventListener('input', check);
            field.addEventListener('blur', check);
        });
    }

    getTodayISODate() {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    formatDisplayDate(dateValue) {
        if (!dateValue) return '';

        const isoMatch = String(dateValue).match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (isoMatch) return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;

        const parsed = this.parseDisplayDate(dateValue);
        return parsed ? this.formatDisplayDate(parsed) : String(dateValue);
    }

    parseDisplayDate(dateValue) {
        const raw = String(dateValue || '').trim();
        if (!raw) return '';

        const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (isoMatch) return raw;

        const compactMatch = raw.match(/^(\d{2})(\d{2})(\d{4})$/);
        const match = compactMatch || raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
        if (!match) return '';

        const day = Number(match[1]);
        const month = Number(match[2]);
        const year = Number(match[3]);
        const date = new Date(year, month - 1, day);
        const isValid = date.getFullYear() === year
            && date.getMonth() === month - 1
            && date.getDate() === day;
        if (!isValid) return '';

        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
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
        const calculationRate = isEdit && formData?.rate ? formData.rate : settings.eurRate;

        return `
        <div class="modal">
            <div class="modal-content">
                <div class="modal-header">
                    <h2>${isEdit ? 'Редактиране на поръчка' :
            isDuplicate ? 'Дублиране на поръчка' :
                'Нова поръчка'}</h2>
                    <button class="modal-close" data-action="close" aria-label="Затвори">×</button>
                </div>
                
                <form id="order-form" class="modal-form">
                    <section class="form-section">
                        <div class="form-section-title">Клиент и дата</div>
                        <div class="form-row">
                            <div class="form-group">
                                <label for="orderDate">Дата</label>
                                <input type="text" id="orderDate" value="${this._esc(this.formatDisplayDate(formData?.date || this.getTodayISODate()))}" inputmode="numeric" maxlength="10" placeholder="дд/мм/гггг" autocomplete="off" required>
                            </div>
                            <div class="form-group">
                                <label for="orderClient">Клиент</label>
                                <div class="input-with-button">
                                    <input type="text" id="orderClient" list="clients-list" value="${this._esc(formData?.client || '')}" required placeholder="Изберете или въведете клиент">
                                    <datalist id="clients-list">
                                        ${clients.map(c => `<option value="${this._esc(c.name)}">`).join('')}
                                    </datalist>
                                    <button type="button" class="input-addon-btn" data-action="quick-add-client" title="Добави клиента">+</button>
                                </div>
                                <div id="client-hint" class="hint-text"></div>
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label for="orderPhone">Телефон</label>
                                <input type="tel" id="orderPhone" value="${this._esc(formData?.phone || '')}" placeholder="+359...">
                            </div>
                            <div class="form-group">
                                <label for="orderOrigin">Източник</label>
                                <select id="orderOrigin" required>
                                    ${settings.origins.map(o => `
                                        <option value="${this._esc(o)}" ${formData?.origin === o ? 'selected' : ''}>${this._esc(o)}</option>
                                    `).join('')}
                                </select>
                            </div>
                        </div>
                    </section>

                    <section class="form-section">
                        <div class="form-section-title">Продукт</div>
                        <div class="form-row">
                            <div class="form-group">
                                <label for="orderVendor">Доставчик</label>
                                <select id="orderVendor" required>
                                    ${settings.vendors.map(v => `
                                        <option value="${this._esc(v)}" ${formData?.vendor === v ? 'selected' : ''}>${this._esc(v)}</option>
                                    `).join('')}
                                </select>
                            </div>
                            <div class="form-group">
                                <label for="orderModel">Модел</label>
                                <input type="text" id="orderModel" value="${this._esc(formData?.model || '')}" required placeholder="Марка, модел, референция">
                            </div>
                        </div>

                        <div class="form-group">
                            <label>Снимка на модела</label>
                            <div class="image-upload-area">
                                <input type="file" id="orderImage" accept="image/*" style="display: none;">
                                <button type="button" class="btn btn-upload" data-action="upload-image">
                                    Избери снимка
                                </button>
                                <div class="hint-text">Можете да поставите снимка и с Ctrl+V.</div>
                                <div id="image-preview" class="image-preview">
                                    ${formData?.imageData ? `
                                        <img src="${this._esc(formData.imageData)}" class="preview-img" alt="Снимка на модела">
                                        <button type="button" class="remove-img-btn" data-action="remove-image" aria-label="Премахни снимката">×</button>
                                    ` : '<div class="no-image">Няма избрана снимка</div>'}
                                </div>
                            </div>
                        </div>
                    </section>

                    <section class="form-section">
                        <div class="form-section-title">Финанси и доставка</div>
                        <div class="form-row">
                            <div class="form-group">
                                <label for="orderCostUSD">Доставна цена (USD)</label>
                                <input type="number" id="orderCostUSD" value="${this._esc(formData?.costUSD || '')}" step="0.01" min="0" required>
                            </div>
                            <div class="form-group">
                                <label for="orderShippingUSD">Доставка (USD)</label>
                                <input type="number" id="orderShippingUSD" value="${this._esc(formData?.shippingUSD || settings.factoryShipping)}" step="0.01" min="0">
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label for="orderExtrasEUR">Допълнителни разходи (€)</label>
                                <input type="number" id="orderExtrasEUR" value="${this._esc(formData?.extrasEUR || '')}" step="0.01" min="0" placeholder="0.00">
                                <small>Такси, ремонт, консумативи или други разходи.</small>
                            </div>
                            <div class="form-group">
                                <label for="orderSellEUR">Продажна цена (€)</label>
                                <input type="number" id="orderSellEUR" value="${this._esc(formData?.sellEUR || '')}" step="0.01" min="0" placeholder="0.00">
                                <small>Крайна цена за клиента.</small>
                            </div>
                        </div>
                        <div class="order-calculation-preview" id="orderCalculationPreview" data-rate="${this._esc(calculationRate)}">
                            <div>
                                <span>Себестойност</span>
                                <strong data-calc-total>0.00 €</strong>
                            </div>
                            <div>
                                <span>Продажба</span>
                                <strong data-calc-sell>0.00 €</strong>
                            </div>
                            <div>
                                <span>Печалба</span>
                                <strong data-calc-profit>0.00 €</strong>
                            </div>
                        </div>
                    </section>

                    <section class="form-section">
                        <div class="form-section-title">Статус и бележки</div>
                        <div class="form-row">
                            <div class="form-group">
                                <label for="orderStatus">Статус</label>
                                <select id="orderStatus">
                                    <option value="Очакван" ${formData?.status === 'Очакван' ? 'selected' : ''}>Очакван</option>
                                    <option value="Доставен" ${formData?.status === 'Доставен' ? 'selected' : ''}>Доставен</option>
                                    <option value="Свободен" ${formData?.status === 'Свободен' ? 'selected' : ''}>Свободен</option>
                                    <option value="Други" ${formData?.status === 'Други' ? 'selected' : ''}>Други</option>
                                </select>
                            </div>
                            <div class="form-group form-group-inline">
                                <label class="checkbox-label">
                                    <input type="checkbox" id="orderFullSet" ${formData?.fullSet ? 'checked' : ''}>
                                    Пълен сет
                                </label>
                            </div>
                        </div>
                        <div class="form-group">
                            <label for="orderNotes">Бележки</label>
                            <textarea id="orderNotes" rows="3" placeholder="Състояние, уговорки, доставка, гаранция...">${this._esc(formData?.notes || '')}</textarea>
                        </div>
                    </section>
                    
                    <div class="form-actions">
                        <button type="button" class="btn secondary" data-action="close">Отказ</button>
                        <button type="submit" class="btn btn-primary">
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
                        <button class="modal-close" data-action="close">✕</button>
                    </div>
                    
                    <form id="client-form" class="modal-form">
                        <div class="form-group">
                            <label>Име на клиента:</label>
                            <input type="text" id="clientName" value="${this._esc(client?.name || '')}" required>
                        </div>
                        
                        <div class="form-row">
                            <div class="form-group">
                                <label>Телефон:</label>
                                <input type="tel" id="clientPhone" value="${this._esc(client?.phone || '')}">
                            </div>
                            <div class="form-group">
                                <label>Email:</label>
                                <input type="email" id="clientEmail" value="${this._esc(client?.email || '')}">
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <label>Адрес:</label>
                            <textarea id="clientAddress" rows="2">${this._esc(client?.address || '')}</textarea>
                        </div>
                        
                        <div class="form-group">
                            <label>Предпочитан източник:</label>
                            <select id="clientPreferredSource">
                                <option value="">Няма предпочитание</option>
                                ${settings.origins.map(o => `
                                    <option value="${this._esc(o)}" ${client?.preferredSource === o ? 'selected' : ''}>${this._esc(o)}</option>
                                `).join('')}
                            </select>
                        </div>
                        
                        <div class="form-group">
                            <label>Бележки:</label>
                            <textarea id="clientNotes" rows="3" placeholder="Предпочитания, специални условия...">${this._esc(client?.notes || '')}</textarea>
                        </div>
                        
                        <div class="form-actions">
                            <button type="button" class="btn secondary" data-action="close">Отказ</button>
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
                    <button class="modal-close" data-action="close">✕</button>
                </div>
                
                <form id="expense-form" class="modal-form">
                    <div class="form-group">
                        <label>Име на разхода:</label>
                        <input type="text" id="expenseName" value="${this._esc(expense?.name || '')}" required>
                    </div>
                    
                    <div class="form-group">
                        <label>Сума (€):</label>
                        <input type="number" id="expenseAmount" value="${this._esc(expense?.amount || '')}" step="0.01" placeholder="0.00" required>
                        <small style="color:#6c757d;">Размер на разхода в евро</small>
                    </div>
                    
                    <div class="form-group">
                        <label>Бележка:</label>
                        <textarea id="expenseNote" rows="3">${this._esc(expense?.note || '')}</textarea>
                    </div>
                    
                    <div class="form-actions">
                        <button type="button" class="btn secondary" data-action="close">Отказ</button>
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
                    <button class="modal-close" data-action="close">✕</button>
                </div>
                
                <form id="inventory-form" class="modal-form">
                    <div class="form-group">
                        <label>Бранд:</label>
                        <input type="text" id="itemBrand" value="${this._esc(item?.brand || '')}" required>
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
                            <input type="number" id="itemPurchasePrice" value="${this._esc(item?.purchasePrice || '')}" step="0.01" placeholder="0.00" required>
                            <small style="color:#6c757d;">Цена на закупуване в евро</small>
                        </div>
                        <div class="form-group">
                            <label>Продажна цена (€):</label>
                            <input type="number" id="itemSellPrice" value="${this._esc(item?.sellPrice || '')}" step="0.01" placeholder="0.00" required>
                            <small style="color:#6c757d;">Препоръчана цена за клиенти в евро</small>
                        </div>
                    </div>
                    
                    <div class="form-row">
                        <div class="form-group">
                            <label>Наличност (бр.):</label>
                            <input type="number" id="itemStock" value="${this._esc(item?.stock || 0)}" min="0" required>
                        </div>
                        <div class="form-group">
                            <label>Поръчани (бр.):</label>
                            <input type="number" id="itemOrdered" value="${this._esc(item?.ordered || 0)}" min="0">
                        </div>
                    </div>
                    
                    <div class="form-actions">
                        <button type="button" class="btn secondary" data-action="close">Отказ</button>
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
        const safeTitle   = data.title   ? this._esc(data.title)   : 'Снимка на модел';
        const safeCaption = data.caption ? this._esc(data.caption) : '';
        return `
        <div class="modal">
            <div class="modal-content modal-image">
                <div class="modal-header">
                    <h2>📷 ${safeTitle}</h2>
                    <button class="modal-close" data-action="close" aria-label="Затвори">✕</button>
                </div>
                <div class="modal-image-body">
                    <img src="${this._esc(data.imageSrc)}" alt="${safeTitle}" class="full-image">
                    ${safeCaption ? `<p class="image-caption">${safeCaption}</p>` : ''}
                </div>
            </div>
        </div>
    `;
    }

    getClientProfileStats(orders = []) {
        let totalRevenue = 0;
        let totalProfit = 0;
        let lastOrder = null;
        let firstOrder = null;

        for (const order of orders) {
            totalRevenue += order.sellEUR || 0;
            totalProfit += order.balanceEUR || 0;

            const orderDate = new Date(order.date);
            if (!lastOrder || orderDate > new Date(lastOrder.date)) lastOrder = order;
            if (!firstOrder || orderDate < new Date(firstOrder.date)) firstOrder = order;
        }

        return {
            totalOrders: orders.length,
            totalRevenue,
            totalProfit,
            lastOrder,
            firstOrder,
            avgOrderValue: orders.length ? totalRevenue / orders.length : 0
        };
    }

    async renderClientProfileModal(data) {
        const client = await this.modules.clients.getClient(data.id);
        const orders = await this.modules.clients.getClientOrders(client.name, { includeImageUrls: false });
        const stats = this.getClientProfileStats(orders);
        const sortedOrders = [...orders].sort((a, b) => new Date(b.date) - new Date(a.date));

        return `
            <div class="modal">
                <div class="modal-content modal-large">
                    <div class="modal-header">
                        <h2>👤 ${this._esc(client.name)}</h2>
                        <button class="modal-close" data-action="close">✕</button>
                    </div>
                    
                    <div class="client-profile">
                        <div class="profile-info">
                            <p><strong>Телефон:</strong> ${this._esc(client.phone || 'Няма')}</p>
                            <p><strong>Email:</strong> ${this._esc(client.email || 'Няма')}</p>
                            <p><strong>Адрес:</strong> ${this._esc(client.address || 'Няма')}</p>
                            <p><strong>Предпочитан източник:</strong> ${this._esc(client.preferredSource || 'Няма')}</p>
                            <p><strong>Бележки:</strong> ${this._esc(client.notes || 'Няма')}</p>
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
                                    ${sortedOrders.map(o => {
                                        const formattedDate = this.formatDisplayDate(o.date);
                                        return `
                                        <tr>
                                            <td>${formattedDate}</td>
                                            <td class="image-cell">
                                                ${o.imageData ?
            `<img src="${this._esc(o.imageData)}"
                                                         class="model-image profile-order-img"
                                                         loading="lazy"
                                                         alt="${this._esc(o.model)}"
                                                         title="${this._esc(o.model)}"
                                                         data-action="view-profile-image"
                                                         data-model="${this._esc(o.model)}"
                                                         data-image-path="${this._esc(o.imagePath || '')}"
                                                         data-caption="${this._esc(`Клиент: ${o.client} | Дата: ${formattedDate}`)}">` :
            `<div class="no-image-placeholder">${this._esc(o.model)}</div>`}
                                            </td>
                                            <td>${(o.sellEUR || 0).toFixed(2)} €</td>
                                            <td><span class="status-badge ${this.modules.orders.getStatusClass(o.status)}">${this._esc(o.status)}</span></td>
                                        </tr>
                                    `;
                                    }).join('')}
                                </tbody>
                            </table>
                        ` : '<p>Няма поръчки</p>'}
                    </div>
                    
                    <div class="form-actions">
                        <button type="button" class="btn secondary" data-action="close">Затвори</button>
                        <button type="button" class="btn primary" data-action="edit-client" data-client-id="${this._esc(client.id)}">
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
            document.getElementById('orderClient')?.addEventListener('input', async (e) => {
                await this.updateClientHint(e.target.value);
            });
            document.getElementById('orderImage')?.addEventListener('change', (e) => {
                this.handleImageUpload(e.target.files[0]);
            });
            document.getElementById('orderDate')?.addEventListener('blur', (e) => {
                const isoDate = this.parseDisplayDate(e.target.value);
                if (isoDate) e.target.value = this.formatDisplayDate(isoDate);
            });
            ['orderCostUSD', 'orderShippingUSD', 'orderExtrasEUR', 'orderSellEUR'].forEach(id => {
                document.getElementById(id)?.addEventListener('input', () => this.updateOrderCalculationPreview());
            });
            this.updateOrderCalculationPreview();
            this._attachValidation({
                orderDate:    { validate: v => Boolean(this.parseDisplayDate(v)), message: 'Въведете дата във формат дд/мм/гггг' },
                orderClient:  { validate: v => v.trim().length > 0, message: 'Клиентът е задължителен' },
                orderModel:   { validate: v => v.trim().length > 0, message: 'Моделът е задължителен' },
                orderCostUSD: { validate: v => v !== '' && parseFloat(v) >= 0, message: 'Въведете валидна сума' },
                orderSellEUR: { validate: v => v !== '' && parseFloat(v) >= 0, message: 'Въведете валидна сума' },
            });
        }

        // Client form
        const clientForm = document.getElementById('client-form');
        if (clientForm) {
            clientForm.addEventListener('submit', async (e) => {
                await this.handleClientSubmit(e);
            });
            this._attachValidation({
                clientName:  { validate: v => v.trim().length > 0, message: 'Името е задължително' },
                clientEmail: { validate: v => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), message: 'Невалиден email адрес' },
                clientPhone: { validate: v => !v || /^\+?[\d\s\-(]{6,20}$/.test(v), message: 'Невалиден телефонен номер' },
            });
        }

        // Expense form
        const expenseForm = document.getElementById('expense-form');
        if (expenseForm) {
            expenseForm.addEventListener('submit', async (e) => {
                await this.handleExpenseSubmit(e);
            });
            this._attachValidation({
                expenseName:   { validate: v => v.trim().length > 0, message: 'Името е задължително' },
                expenseAmount: { validate: v => v !== '' && parseFloat(v) > 0, message: 'Въведете сума по-голяма от 0' },
            });
        }

        // Inventory form
        const inventoryForm = document.getElementById('inventory-form');
        if (inventoryForm) {
            inventoryForm.addEventListener('submit', async (e) => {
                await this.handleInventorySubmit(e);
            });
            this._attachValidation({
                itemBrand:         { validate: v => v.trim().length > 0, message: 'Брандът е задължителен' },
                itemPurchasePrice: { validate: v => v !== '' && parseFloat(v) >= 0, message: 'Въведете валидна цена' },
                itemSellPrice:     { validate: v => v !== '' && parseFloat(v) >= 0, message: 'Въведете валидна цена' },
            });
        }
    }

// js/ui/components/ModalsManager.js - Fix handleOrderSubmit method

    updateOrderCalculationPreview() {
        const preview = document.getElementById('orderCalculationPreview');
        if (!preview) return;

        const value = (id) => parseFloat(document.getElementById(id)?.value || '0') || 0;
        const rate = parseFloat(preview.dataset.rate || this.modules.settings?.state?.get?.('settings')?.eurRate || '0.92') || 0.92;
        const costUSD = value('orderCostUSD');
        const shippingUSD = value('orderShippingUSD');
        const extrasEUR = value('orderExtrasEUR');
        const sellEUR = value('orderSellEUR');
        const totalEUR = ((costUSD + shippingUSD) * rate) + extrasEUR;
        const profitEUR = sellEUR - totalEUR;

        const totalEl = preview.querySelector('[data-calc-total]');
        const sellEl = preview.querySelector('[data-calc-sell]');
        const profitEl = preview.querySelector('[data-calc-profit]');

        if (totalEl) totalEl.textContent = CurrencyUtils.formatAmount(totalEUR, 'EUR');
        if (sellEl) sellEl.textContent = CurrencyUtils.formatAmount(sellEUR, 'EUR');
        if (profitEl) {
            profitEl.textContent = CurrencyUtils.formatAmount(profitEUR, 'EUR');
            profitEl.classList.toggle('amount-danger', profitEUR < 0);
            profitEl.classList.toggle('amount-success', profitEUR >= 0);
        }
    }

    async handleOrderSubmit(e) {
        e.preventDefault();

        // Get existing image data/path for edit mode
        let existingOrder = null;
        let existingImageData = null;
        let existingImagePath = null;
        if (this.currentModal.mode === 'edit') {
            const result = await this.modules.orders.findOrderById(this.currentModal.id);
            existingOrder = result?.order || null;
            existingImageData = existingOrder?.imageData || null;
            existingImagePath = existingOrder?.imagePath || existingOrder?.imageUrl || null;
        }

        const imageData = this.imageMarkedForRemoval
            ? null
            : (this.tempImageData || existingImageData);
        const imagePath = this.imageMarkedForRemoval
            ? null
            : existingImagePath;

        const isoDate = this.parseDisplayDate(document.getElementById('orderDate').value);
        if (!isoDate) {
            this.eventBus.emit('notification:show', {
                message: 'Въведете дата във формат дд/мм/гггг',
                type: 'error'
            });
            document.getElementById('orderDate')?.focus();
            return;
        }

        // FIXED: Ensure all form values are properly captured (no undefined/null values)
        const orderData = {
            date: isoDate,
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
            rate: existingOrder?.rate ?? '',
            status: document.getElementById('orderStatus').value,
            fullSet: document.getElementById('orderFullSet').checked,
            notes: document.getElementById('orderNotes').value || '',
            imageData,
            imagePath,
            previousImagePath: existingImagePath,
            removeImage: this.imageMarkedForRemoval
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
                this.imageMarkedForRemoval = false;
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
                <img src="${this._esc(imageSrc)}" class="preview-img">
                <button type="button" class="remove-img-btn" data-action="remove-image">✕</button>
            `;
        }
    }

    removeImage() {
        this.tempImageData = null;
        this.imageMarkedForRemoval = true;
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
        const clientName = document.getElementById('orderClient').value.trim();
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

    confirm(message, details, onConfirm) {
        this._previousFocus = document.activeElement;
        const container = this.initContainer();
        const detailsHtml = details
            ? `<div class="confirm-details">${details}</div>`
            : '';
        container.innerHTML = `
            <div class="modal active" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
                <div class="modal-content" style="max-width: 480px;">
                    <div class="modal-header">
                        <h2 id="confirm-title">⚠️ Потвърждение</h2>
                        <button class="modal-close" id="confirm-x">✕</button>
                    </div>
                    <div class="modal-form">
                        <p style="margin: 0 0 16px; color: var(--text-primary);">${message}</p>
                        ${detailsHtml}
                    </div>
                    <div class="form-actions">
                        <button class="btn secondary" id="confirm-cancel">Отказ</button>
                        <button class="btn danger" id="confirm-ok">Потвърди</button>
                    </div>
                </div>
            </div>
        `;
        const closeConfirm = () => {
            container.innerHTML = '';
            this.currentModal = null;
            document.removeEventListener('keydown', escHandler);
            if (this._previousFocus) { this._previousFocus.focus(); this._previousFocus = null; }
        };
        const escHandler = (e) => { if (e.key === 'Escape') closeConfirm(); };
        document.getElementById('confirm-ok').addEventListener('click', () => { closeConfirm(); onConfirm(); });
        document.getElementById('confirm-cancel').addEventListener('click', closeConfirm);
        document.getElementById('confirm-x').addEventListener('click', closeConfirm);
        document.addEventListener('keydown', escHandler);
        document.getElementById('confirm-cancel').focus();
    }

    editClient(clientId) {
        this.close();
        setTimeout(() => {
            this.open({ type: 'client', mode: 'edit', id: clientId });
        }, 100);
    }
}
