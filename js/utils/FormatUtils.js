// js/utils/FormatUtils.js - EUR-only formatting utilities

import { CurrencyUtils } from './CurrencyUtils.js';

export class FormatUtils {
    /**
     * Format currency amount with proper symbol
     * @param {number} amount - Amount to format
     * @param {string} currency - Currency code ('EUR', 'USD') or symbol ('€', '$')
     * @returns {string} Formatted currency string
     */
    static formatCurrency(amount, currency = '€') {
        // Normalize currency codes
        const currencyMap = {
            '€': 'EUR',
            '$': 'USD'
        };

        const currencyCode = currencyMap[currency] || currency;

        // Use CurrencyUtils for consistent formatting
        return CurrencyUtils.formatAmount(amount, currencyCode);
    }

    static formatNumber(num, decimals = 2) {
        return num.toFixed(decimals);
    }

    // HTML-escape user-supplied strings before interpolating into template literals.
    // Why: prevents XSS when `${value}` lands inside innerHTML-rendered markup.
    static escapeHtml(value) {
        if (value === null || value === undefined) return '';
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
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
