/**
 * CurrencyUtils.js
 * Currency conversion and formatting utilities
 *
 * Application operates exclusively in EUR.
 * BGN fields are preserved in database for historical audit only.
 */

export class CurrencyUtils {
    // Official fixed conversion rate: 1 EUR = 1.95583 BGN.
    static BGN_PER_EUR = 1.95583;

    // Historical orders stored rate as USD->BGN. Current orders store USD->EUR.
    static LEGACY_USD_TO_BGN_RATE_THRESHOLD = 1.2;

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
     * Convert a stored order exchange rate to the application's USD->EUR rate.
     * Older rows used USD->BGN rates around 1.5-1.9; those must be divided by
     * the fixed BGN/EUR conversion rate before calculating EUR totals.
     *
     * @param {number|string} rate - Stored exchange rate
     * @returns {number} Effective USD->EUR rate
     */
    static normalizeUSDtoEURRate(rate) {
        const parsedRate = parseFloat(rate) || 0;
        if (parsedRate > this.LEGACY_USD_TO_BGN_RATE_THRESHOLD) {
            return parsedRate / this.BGN_PER_EUR;
        }
        return parsedRate;
    }

    /**
     * @param {number|string} rate - Stored exchange rate
     * @returns {boolean} True when the value looks like a legacy USD->BGN rate
     */
    static isLegacyUSDtoBGNRate(rate) {
        return (parseFloat(rate) || 0) > this.LEGACY_USD_TO_BGN_RATE_THRESHOLD;
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
