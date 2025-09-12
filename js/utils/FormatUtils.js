// js/utils/FormatUtils.js - Replace entire file

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

    // UNIQUE ORIGIN COLORS - Vibrant & Distinct
    static getOriginColor(origin) {
        const colors = {
            'OLX': '#e74c3c',           // Red
            'Bazar.bg': '#f39c12',      // Orange
            'Instagram': '#9b59b6',     // Purple
            'WhatsApp': '#27ae60',      // Green
            'Facebook': '#3498db',      // Blue
            'IG Ads': '#e91e63',        // Pink
            'OLX Romania': '#ff5722',   // Deep Orange
            'Viber': '#673ab7',         // Deep Purple
            // Fallback colors for any new origins
            'Messenger': '#00b4d8',     // Cyan
            'Telegram': '#0088cc'       // Telegram Blue
        };
        return colors[origin] || '#34495e'; // Dark Gray fallback
    }

    // UNIQUE STATUS COLORS - Professional & Distinct
    static getStatusColor(status) {
        const statusColors = {
            'Очакван': '#f1c40f',       // Yellow (Pending)
            'Доставен': '#2ecc71',      // Green (Delivered)
            'Свободен': '#95a5a6',      // Gray (Free)
            'Други': '#8e44ad'          // Violet (Other)
        };
        return statusColors[status] || '#7f8c8d'; // Medium Gray fallback
    }

    // TEXT COLOR based on background (for readability)
    static getContrastTextColor(backgroundColor) {
        // Simple contrast logic - light backgrounds get dark text
        const lightBackgrounds = ['#f1c40f', '#2ecc71']; // Yellow, Light Green
        return lightBackgrounds.includes(backgroundColor) ? '#2c3e50' : '#ffffff';
    }

    // COMBINED METHOD - Get both background and text color for badges
    static getBadgeColors(value, type = 'origin') {
        const backgroundColor = type === 'status'
            ? this.getStatusColor(value)
            : this.getOriginColor(value);

        return {
            backgroundColor,
            textColor: this.getContrastTextColor(backgroundColor)
        };
    }
}