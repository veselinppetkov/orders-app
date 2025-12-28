/**
 * CurrencyUtils.js
 * Currency conversion and formatting utilities
 *
 * Application operates exclusively in EUR.
 * BGN fields are preserved in database for historical audit only.
 */

export class CurrencyUtils {
    // Currency symbols
    static SYMBOLS = {
        EUR: '€',
        USD: '$'
    };

    // Currency names
    static NAMES = {
        EUR: 'Euro',
        USD: 'US Dollar'
    };

    /**
     * Round to nearest euro cent (0.01 EUR) per EU regulations
     * @param {number} amount - Amount to round
     * @returns {number} Rounded amount
     */
    static roundEUR(amount) {
        return Math.round(amount * 100) / 100;
    }

    /**
     * Format currency amount with proper symbol
     * @param {number} amount - Amount to format
     * @param {string} currency - Currency code ('EUR' or 'USD')
     * @param {boolean} showCode - Show currency code instead of symbol
     * @returns {string} Formatted currency string
     */
    static formatAmount(amount, currency = 'EUR', showCode = false) {
        if (amount === null || amount === undefined || isNaN(amount)) {
            amount = 0;
        }

        const formatted = amount.toFixed(2);

        if (showCode) {
            return `${formatted} ${currency}`;
        }

        const symbol = this.SYMBOLS[currency] || currency;
        return `${formatted} ${symbol}`;
    }

    /**
     * Get the currency for new transactions (always EUR)
     * @returns {string} 'EUR'
     */
    static getCurrentCurrency() {
        return 'EUR';
    }

    /**
     * Get currency symbol for current period (always €)
     * @returns {string} Currency symbol
     */
    static getCurrentSymbol() {
        return '€';
    }

    /**
     * Convert USD to EUR using market rate
     * @param {number} amountUSD - Amount in US Dollars
     * @param {number} usdToEurRate - Current USD to EUR exchange rate
     * @returns {number} Amount in Euro
     */
    static convertUSDtoEUR(amountUSD, usdToEurRate) {
        if (!amountUSD || !usdToEurRate) {
            return 0;
        }
        return this.roundEUR(amountUSD * usdToEurRate);
    }

    /**
     * Validate currency code
     * @param {string} currency - Currency code to validate
     * @returns {boolean} True if valid
     */
    static isValidCurrency(currency) {
        return ['EUR', 'USD'].includes(currency);
    }

    /**
     * Get all supported currencies
     * @returns {Array<Object>} Array of currency objects
     */
    static getSupportedCurrencies() {
        return [
            { code: 'EUR', symbol: this.SYMBOLS.EUR, name: this.NAMES.EUR, primary: true },
            { code: 'USD', symbol: this.SYMBOLS.USD, name: this.NAMES.USD, foreign: true }
        ];
    }
}
