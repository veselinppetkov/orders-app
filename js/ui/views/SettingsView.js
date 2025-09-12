import {StorageService} from "../../core/StorageService.js";

export default class SettingsView {
    constructor(modules, state, eventBus) {
        this.settingsModule = modules.settings;
        this.state = state;
        this.eventBus = eventBus;
        this.storage = new StorageService();
    }

    // --- helpers ---
    _escape(s = '') {
        return String(s)
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
    }
    _num(v, fallback = 0) {
        const n = parseFloat(v);
        return Number.isFinite(n) ? n : fallback;
    }
    _lines(text) {
        if (!text) return [];
        return text.split('\n').map(s => s.trim()).filter(Boolean);
    }

    async render() {
        try {
            // GET SETTINGS FROM SUPABASE/ASYNC
            const s = await this.settingsModule.getSettings() || {};

            const usdRate = this._escape(s.usdRate ?? 0);
            const factoryShipping = this._escape(s.factoryShipping ?? 0);
            const origins = Array.isArray(s.origins) ? s.origins : (typeof s.origins === 'string' ? s.origins.split('\n') : []);
            const vendors = Array.isArray(s.vendors) ? s.vendors : (typeof s.vendors === 'string' ? s.vendors.split('\n') : []);

            return `
          <div class="settings-view">
            <h2>⚙️ Настройки на системата</h2>

            <div class="settings-grid">
              <div class="settings-card">
                <h3>💱 Валутен курс</h3>
                <div class="form-group">
                  <label>Курс USD → BGN:</label>
                  <input type="number" id="usdRate" value="${usdRate}" step="0.01">
                </div>
              </div>

              <div class="settings-card">
                <h3>🚚 Доставка</h3>
                <div class="form-group">
                  <label>Стандартна доставка (USD):</label>
                  <input type="number" id="factoryShipping" value="${factoryShipping}" step="0.1">
                </div>
              </div>

              <div class="settings-card">
                <h3>📍 Източници</h3>
                <div class="form-group">
                  <label>Списък (по един на ред):</label>
                  <textarea id="originsList" rows="8">${this._escape(origins.join('\n'))}</textarea>
                </div>
              </div>

              <div class="settings-card">
                <h3>👥 Доставчици</h3>
                <div class="form-group">
                  <label>Списък (по един на ред):</label>
                  <textarea id="vendorsList" rows="8">${this._escape(vendors.join('\n'))}</textarea>
                </div>
              </div>
            </div>

            <br>
            <button class="btn success" id="save-settings">💾 Запази настройките</button>

            <div class="settings-card" style="margin-top:30px;border-color:#17a2b8;">
              <h3>📁 Backup & Restore</h3>
              <div style="display:flex;gap:15px;flex-wrap:wrap;">
                <button class="btn info" id="export-data">📤 Експорт данни (JSON)</button>
                <div>
                  <input type="file" id="importFile" accept=".json" style="display:none;">
                  <button class="btn info" id="import-data">📥 Импорт данни (JSON)</button>
                </div>
              </div>
              <p style="margin-top:10px;font-size:12px;color:#6c757d;">
                Експортирайте всички данни като JSON файл за backup или прехвърляне на друго устройство.
              </p>
            </div>
          </div>
        `;

        } catch (error) {
            console.error('❌ Failed to load settings:', error);
            return `
                <div class="error-state">
                    <h3>❌ Failed to load settings</h3>
                    <p>Error: ${error.message}</p>
                    <button onclick="window.app.ui.currentView.refresh()" class="btn">🔄 Retry</button>
                </div>
            `;
        }
    }

    attachListeners() {
        const $ = (id) => document.getElementById(id);

        // Save settings - MAKE ASYNC
        $('save-settings')?.addEventListener('click', async () => {
            const settings = {
                usdRate: this._num($('usdRate')?.value, 0),
                factoryShipping: this._num($('factoryShipping')?.value, 0),
                origins: this._lines($('originsList')?.value),
                vendors: this._lines($('vendorsList')?.value)
            };

            try {
                // ASYNC SETTINGS UPDATE
                await this.settingsModule.updateSettings(settings);
                this.eventBus?.emit('notification:show', { message: 'Настройките са запазени!', type: 'success' });
            } catch (err) {
                console.error(err);
                this.eventBus?.emit('notification:show', { message: 'Грешка при запазване: ' + err.message, type: 'error' });
            }
        });

        // Export data - MAKE ASYNC
        $('export-data')?.addEventListener('click', async () => {
            try {
                await this.storage.exportData();
                this.eventBus.emit('notification:show', {
                    message: 'Данните са експортирани успешно!',
                    type: 'success'
                });
            } catch (error) {
                this.eventBus.emit('notification:show', {
                    message: 'Грешка при експорт: ' + error.message,
                    type: 'error'
                });
            }
        });

        // Import data
        $('import-data')?.addEventListener('click', () => {
            document.getElementById('importFile').click();
        });

        $('importFile')?.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                if (confirm('Внимание! Това ще презапише всички текущи данни. Продължи?')) {
                    try {
                        // Import the data
                        const importedData = await this.storage.importData(file);

                        // Update the state directly
                        this.state.update({
                            monthlyData: importedData.monthlyData,
                            clientsData: importedData.clientsData,
                            settings: importedData.settings
                        });

                        // Force reload after state update
                        this.eventBus.emit('notification:show', {
                            message: 'Данните са импортирани успешно! Презареждане...',
                            type: 'success'
                        });

                        // Reload to refresh everything
                        setTimeout(() => {
                            window.location.reload(true); // Force reload from server
                        }, 1000);

                    } catch (error) {
                        this.eventBus.emit('notification:show', {
                            message: 'Грешка при импорт: ' + error.message,
                            type: 'error'
                        });
                    }
                }
                e.target.value = '';
            }
        });
    }

    // ADD ASYNC REFRESH METHOD
    async refresh() {
        const container = document.getElementById('view-container');
        if (container) {
            // Show loading
            container.innerHTML = `
                <div class="loading-state">
                    <h3>⚙️ Loading settings...</h3>
                </div>
            `;

            try {
                const content = await this.render();
                container.innerHTML = content;
                this.attachListeners();
            } catch (error) {
                console.error('❌ Failed to refresh settings view:', error);
                container.innerHTML = `
                    <div class="error-state">
                        <h3>❌ Failed to load settings</h3>
                        <p>Error: ${error.message}</p>
                        <button onclick="window.app.ui.currentView.refresh()" class="btn">🔄 Retry</button>
                    </div>
                `;
            }
        }
    }
}