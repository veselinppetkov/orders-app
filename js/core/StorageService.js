export class StorageService {
    constructor(prefix = 'orderSystem_') {
        this.prefix = prefix;
    }

    save(key, data) {
        try {
            localStorage.setItem(this.prefix + key, JSON.stringify(data));
            return true;
        } catch (error) {
            console.error('Storage save error:', error);
            return false;
        }
    }

    load(key) {
        try {
            const rawData = localStorage.getItem(this.prefix + key);
            if (!rawData) return null;

            const parsed = JSON.parse(rawData);

            // Специална проверка за monthlyData
            if (key === 'monthlyData' && parsed) {
                console.log('Loading monthlyData, sample check:', {
                    hasAugust: !!parsed['2025-08'],
                    augustOrders: parsed['2025-08']?.orders?.length || 0
                });
            }

            return parsed;
        } catch (error) {
            console.error('Storage load error for key:', key, error);
            return null;
        }
    }

    remove(key) {
        localStorage.removeItem(this.prefix + key);
    }

    clear() {
        Object.keys(localStorage)
            .filter(key => key.startsWith(this.prefix))
            .forEach(key => localStorage.removeItem(key));
    }

    async exportData() {
        // Директно четене от localStorage без load метода
        const rawMonthlyData = localStorage.getItem(this.prefix + 'monthlyData');
        const rawClientsData = localStorage.getItem(this.prefix + 'clientsData');
        const rawSettings = localStorage.getItem(this.prefix + 'settings');

        const monthlyData = rawMonthlyData ? JSON.parse(rawMonthlyData) : {};
        const clientsData = rawClientsData ? JSON.parse(rawClientsData) : {};
        const settings = rawSettings ? JSON.parse(rawSettings) : {};

        // Проверка преди експорт
        console.log('Export check:', {
            hasMonthlyData: !!monthlyData['2025-08'],
            ordersCount: monthlyData['2025-08']?.orders?.length || 0,
            firstOrder: monthlyData['2025-08']?.orders?.[0]
        });

        const data = {
            monthlyData: this.load('monthlyData') || {},
            clientsData: this.load('clientsData') || {},
            settings: this.load('settings') || {},
            inventory: this.load('inventory') || {},
            availableMonths: JSON.parse(localStorage.getItem('orderSystem_availableMonths')) || [],
            currentMonth: localStorage.getItem('orderSystem_currentMonth') || '',
            exportDate: new Date().toISOString(),
            version: '1.1'
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

        return true;
    }

    async importData(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    console.log('Importing data:', data);

                    // Validate data structure
                    if (!data.monthlyData || !data.clientsData || !data.settings) {
                        throw new Error('Невалиден формат на файла');
                    }

                    if (data.availableMonths) {
                        localStorage.setItem('orderSystem_availableMonths', JSON.stringify(data.availableMonths));
                    }

                    // Log what we're importing
                    Object.keys(data.monthlyData).forEach(month => {
                        console.log(`Month ${month}:`, {
                            orders: data.monthlyData[month].orders?.length || 0,
                            expenses: data.monthlyData[month].expenses?.length || 0
                        });
                    });

                    // Clear old data
                    localStorage.removeItem(this.prefix + 'monthlyData');
                    localStorage.removeItem(this.prefix + 'clientsData');
                    localStorage.removeItem(this.prefix + 'settings');

                    // Save with proper structure
                    localStorage.setItem(this.prefix + 'monthlyData', JSON.stringify(data.monthlyData));
                    localStorage.setItem(this.prefix + 'clientsData', JSON.stringify(data.clientsData));
                    localStorage.setItem(this.prefix + 'settings', JSON.stringify(data.settings));

                    // Verify save
                    const saved = JSON.parse(localStorage.getItem(this.prefix + 'monthlyData'));
                    console.log('Saved monthlyData:', saved);

                    resolve(data);
                } catch (error) {
                    console.error('Import error:', error);
                    reject(error);
                }
            };
            reader.readAsText(file);
        });
    }
}