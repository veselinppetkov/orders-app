export class FormatUtils {
    static formatCurrency(amount, currency = 'лв') {
        return `${amount.toFixed(2)} ${currency}`;
    }

    static formatNumber(num, decimals = 2) {
        return num.toFixed(decimals);
    }

    static truncateText(text, maxLength = 50) {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }

    static getOriginColor(origin) {
        const colors = {
            'OLX': '#dc3545',
            'Bazar.bg': '#ff9800',
            'Instagram': '#667eea',
            'WhatsApp': '#28a745',
            'Facebook': '#3b5998',
            'IG Ads': '#764ba2'
        };
        return colors[origin] || '#6c757d';
    }
}