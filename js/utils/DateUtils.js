export class DateUtils {
    static formatDate(dateStr) {
        if (!dateStr) return '';
        const isoMatch = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (isoMatch) return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;

        const date = new Date(dateStr);
        const day = date.getDate().toString().padStart(2, '0');
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
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
