// js/core/StorageService.js - ПОПРАВЕНА ВЕРСИЯ
export class StorageService {
    constructor(prefix = 'orderSystem_') {
        this.prefix = prefix;
    }

    save(key, data) {
        try {
            const jsonStr = JSON.stringify(data);
            localStorage.setItem(this.prefix + key, jsonStr);

            // Debug информация
            console.log(`💾 Saved ${key}:`, {
                size: jsonStr.length,
                keys: typeof data === 'object' && data ? Object.keys(data).length : 'N/A'
            });

            return true;
        } catch (error) {
            console.error(`❌ Storage save error for ${key}:`, error);
            return false;
        }
    }

    load(key) {
        try {
            const rawData = localStorage.getItem(this.prefix + key);
            if (!rawData) {
                console.log(`📂 No data found for key: ${key}`);
                return null;
            }

            const parsed = JSON.parse(rawData);

            // Debug информация за monthlyData
            if (key === 'monthlyData' && parsed) {
                const months = Object.keys(parsed);
                const totalOrders = Object.values(parsed).reduce((sum, month) => sum + (month.orders?.length || 0), 0);

                console.log(`📊 Loaded ${key}:`, {
                    months: months,
                    totalOrders: totalOrders,
                    sample: months.length > 0 ? {
                        month: months[0],
                        orders: parsed[months[0]]?.orders?.length || 0
                    } : null
                });
            } else {
                console.log(`📂 Loaded ${key}:`, typeof parsed);
            }

            return parsed;
        } catch (error) {
            console.error(`❌ Storage load error for key ${key}:`, error);
            return null;
        }
    }

    remove(key) {
        localStorage.removeItem(this.prefix + key);
        console.log(`🗑️  Removed ${key}`);
    }

    clear() {
        const keysToRemove = Object.keys(localStorage)
            .filter(key => key.startsWith(this.prefix));

        keysToRemove.forEach(key => localStorage.removeItem(key));
        console.log(`🧹 Cleared ${keysToRemove.length} keys with prefix ${this.prefix}`);
    }

    // ПОПРАВЕНА ФУНКЦИЯ за експорт
    async exportData() {
        console.log('📤 Starting export...');

        // Използвай load метода за консистентност
        const monthlyData = this.load('monthlyData') || {};
        const clientsData = this.load('clientsData') || {};
        const settings = this.load('settings') || {};
        const inventory = this.load('inventory') || {};

        // Зареди допълнителни данни директно (те не минават през load метода)
        const availableMonths = JSON.parse(localStorage.getItem('orderSystem_availableMonths') || '[]');
        const currentMonth = localStorage.getItem('orderSystem_currentMonth') || '';

        // Debug информация преди експорт
        console.log('📋 Export data summary:', {
            months: Object.keys(monthlyData),
            totalOrders: Object.values(monthlyData).reduce((sum, month) => sum + (month.orders?.length || 0), 0),
            totalClients: Object.keys(clientsData).length,
            currentMonth: currentMonth
        });

        const data = {
            monthlyData,
            clientsData,
            settings,
            inventory,
            availableMonths,
            currentMonth,
            exportDate: new Date().toISOString(),
            version: '1.2' // Увеличена версия
        };

        const jsonStr = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `orders-backup-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        console.log('✅ Export completed successfully');
        return true;
    }

    // ПОДОБРЕНА ФУНКЦИЯ за импорт
    async importData(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    console.log('📥 Starting import...');
                    const data = JSON.parse(e.target.result);

                    // Валидация на структурата
                    if (!data.monthlyData || typeof data.monthlyData !== 'object') {
                        throw new Error('Липсват или са невалидни monthlyData');
                    }
                    if (!data.clientsData || typeof data.clientsData !== 'object') {
                        throw new Error('Липсват или са невалидни clientsData');
                    }
                    if (!data.settings || typeof data.settings !== 'object') {
                        throw new Error('Липсват или са невалидни settings');
                    }

                    // Debug информация за импорта
                    const importSummary = {
                        months: Object.keys(data.monthlyData),
                        totalOrders: Object.values(data.monthlyData).reduce((sum, month) => sum + (month.orders?.length || 0), 0),
                        totalClients: Object.keys(data.clientsData).length,
                        currentMonth: data.currentMonth || '',
                        version: data.version || 'unknown'
                    };

                    console.log('📋 Import data summary:', importSummary);

                    // ВАЖНО: Изчисти стари данни преди импорт
                    console.log('🧹 Clearing old data...');
                    localStorage.removeItem(this.prefix + 'monthlyData');
                    localStorage.removeItem(this.prefix + 'clientsData');
                    localStorage.removeItem(this.prefix + 'settings');
                    localStorage.removeItem(this.prefix + 'inventory');
                    localStorage.removeItem('orderSystem_currentMonth');
                    localStorage.removeItem('orderSystem_availableMonths');

                    // Запази новите данни
                    console.log('💾 Saving imported data...');
                    const success1 = this.save('monthlyData', data.monthlyData);
                    const success2 = this.save('clientsData', data.clientsData);
                    const success3 = this.save('settings', data.settings);
                    const success4 = this.save('inventory', data.inventory || {});

                    // Запази допълнителните данни
                    if (data.availableMonths) {
                        localStorage.setItem('orderSystem_availableMonths', JSON.stringify(data.availableMonths));
                    }
                    if (data.currentMonth) {
                        localStorage.setItem('orderSystem_currentMonth', data.currentMonth);
                    }

                    // Проверка че данните са запазени правилно
                    const verification = this.load('monthlyData');
                    if (!verification) {
                        throw new Error('Импортът не беше успешен - данните не са запазени');
                    }

                    console.log('✅ Import completed successfully');
                    console.log('🔍 Verification:', {
                        saved: !!verification,
                        months: Object.keys(verification),
                        orders: Object.values(verification).reduce((sum, month) => sum + (month.orders?.length || 0), 0)
                    });

                    resolve(data);
                } catch (error) {
                    console.error('❌ Import error:', error);
                    reject(error);
                }
            };

            reader.onerror = () => {
                reject(new Error('Грешка при четене на файла'));
            };

            reader.readAsText(file);
        });
    }

    // НОВА ФУНКЦИЯ за проверка на интегритета на данните
    checkDataIntegrity() {
        console.log('🔍 Checking data integrity...');

        const monthlyData = this.load('monthlyData');
        const currentMonth = localStorage.getItem('orderSystem_currentMonth');

        const report = {
            hasMonthlyData: !!monthlyData,
            currentMonth: currentMonth,
            totalMonths: monthlyData ? Object.keys(monthlyData).length : 0,
            totalOrders: monthlyData ? Object.values(monthlyData).reduce((sum, month) => sum + (month.orders?.length || 0), 0) : 0,
            currentMonthHasData: !!(monthlyData && currentMonth && monthlyData[currentMonth])
        };

        console.log('📊 Data integrity report:', report);
        return report;
    }
}