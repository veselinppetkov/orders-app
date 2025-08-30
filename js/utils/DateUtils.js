export class DateUtils {
    static formatDate(dateStr) {
        if (!dateStr) return '';
        return new Date(dateStr).toLocaleDateString('bg-BG');
    }

    static formatMonthKey(date) {
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        return `${year}-${month}`;
    }

    static formatMonthName(date) {
        const months = Constants.MONTHS_BG;
        return `${months[date.getMonth()]} ${date.getFullYear()}`;
    }

    static getCurrentMonth() {
        return this.formatMonthKey(new Date());
    }

    static getLastNMonths(n) {
        const months = [];
        const currentDate = new Date();

        for (let i = n - 1; i >= 0; i--) {
            const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
            months.push({
                key: this.formatMonthKey(date),
                name: this.formatMonthName(date)
            });
        }

        return months;
    }
}