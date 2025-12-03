/**
 * CurrencyUtils.js
 * Centralized currency conversion and handling for Bulgaria's Euro adoption
 *
 * Official conversion rate: 1 EUR = 1.95583 BGN
 * Effective date: January 1, 2026
 */

export class CurrencyUtils {
    // Official EU-approved conversion rate
    static BGN_TO_EUR_RATE = 1.95583;

    // Currency adoption cutoff date
    static EURO_ADOPTION_DATE = new Date('2026-01-01T00:00:00');

    // Currency symbols
    static SYMBOLS = {
        BGN: 'лв',
        EUR: '€',
        USD: '$'
    };

    // Currency names
    static NAMES = {
        BGN: 'Bulgarian Lev',
        EUR: 'Euro',
        USD: 'US Dollar'
    };

    /**
     * Convert BGN to EUR using official rate
     * @param {number} amountBGN - Amount in Bulgarian Lev
     * @returns {number} Amount in Euro
     */
    static convertBGNtoEUR(amountBGN) {
        if (amountBGN === null || amountBGN === undefined || isNaN(amountBGN)) {
            return 0;
        }
        return this.roundEUR(amountBGN / this.BGN_TO_EUR_RATE);
    }

    /**
     * Convert EUR to BGN using official rate
     * @param {number} amountEUR - Amount in Euro
     * @returns {number} Amount in Bulgarian Lev
     */
    static convertEURtoBGN(amountEUR) {
        if (amountEUR === null || amountEUR === undefined || isNaN(amountEUR)) {
            return 0;
        }
        return this.roundBGN(amountEUR * this.BGN_TO_EUR_RATE);
    }

    /**
     * Determine which currency should be used based on date
     * @param {Date|string} date - Date to check
     * @returns {string} 'EUR' or 'BGN'
     */
    static getCurrencyForDate(date) {
        if (!date) {
            date = new Date();
        }

        const checkDate = typeof date === 'string' ? new Date(date) : date;
        return checkDate >= this.EURO_ADOPTION_DATE ? 'EUR' : 'BGN';
    }

    /**
     * Check if a date is before euro adoption
     * @param {Date|string} date - Date to check
     * @returns {boolean} True if date is before Jan 1, 2026
     */
    static isHistoricalBGN(date) {
        if (!date) return false;

        const checkDate = typeof date === 'string' ? new Date(date) : date;
        return checkDate < this.EURO_ADOPTION_DATE;
    }

    /**
     * Round to nearest euro cent (0.01 EUR) per EU regulations
     * @param {number} amount - Amount to round
     * @returns {number} Rounded amount
     */
    static roundEUR(amount) {
        return Math.round(amount * 100) / 100;
    }

    /**
     * Round to nearest stotinka (0.01 BGN)
     * @param {number} amount - Amount to round
     * @returns {number} Rounded amount
     */
    static roundBGN(amount) {
        return Math.round(amount * 100) / 100;
    }

    /**
     * Format currency amount with proper symbol
     * @param {number} amount - Amount to format
     * @param {string} currency - Currency code ('EUR', 'BGN', 'USD')
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
     * Format with conversion notation for historical BGN amounts
     * Example: "1000.00 лв (511.29 €)"
     * @param {number} amountBGN - Original BGN amount
     * @param {boolean} showConversion - Whether to show EUR conversion
     * @returns {string} Formatted string with optional conversion
     */
    static formatBGNwithConversion(amountBGN, showConversion = true) {
        const bgnFormatted = this.formatAmount(amountBGN, 'BGN');

        if (!showConversion) {
            return bgnFormatted;
        }

        const eurAmount = this.convertBGNtoEUR(amountBGN);
        const eurFormatted = this.formatAmount(eurAmount, 'EUR');

        return `${bgnFormatted} (${eurFormatted})`;
    }

    /**
     * Format amount with automatic currency detection based on date
     * @param {number} amount - Amount to format
     * @param {Date|string} date - Date of the transaction
     * @param {string} sourceCurrency - Original currency of the amount ('BGN' or 'EUR')
     * @param {boolean} showConversion - Show conversion for historical BGN
     * @returns {string} Formatted currency string
     */
    static formatWithDate(amount, date, sourceCurrency = 'BGN', showConversion = true) {
        const isHistorical = this.isHistoricalBGN(date);

        if (sourceCurrency === 'BGN' && isHistorical && showConversion) {
            return this.formatBGNwithConversion(amount, true);
        }

        const currency = sourceCurrency || this.getCurrencyForDate(date);
        return this.formatAmount(amount, currency);
    }

    /**
     * Get the appropriate currency for new transactions
     * @returns {string} 'EUR' or 'BGN' based on current date
     */
    static getCurrentCurrency() {
        return this.getCurrencyForDate(new Date());
    }

    /**
     * Get currency symbol for current period
     * @returns {string} Currency symbol
     */
    static getCurrentSymbol() {
        const currency = this.getCurrentCurrency();
        return this.SYMBOLS[currency];
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
     * Convert USD to BGN using market rate
     * @param {number} amountUSD - Amount in US Dollars
     * @param {number} usdToBgnRate - Current USD to BGN exchange rate
     * @returns {number} Amount in Bulgarian Lev
     */
    static convertUSDtoBGN(amountUSD, usdToBgnRate) {
        if (!amountUSD || !usdToBgnRate) {
            return 0;
        }
        return this.roundBGN(amountUSD * usdToBgnRate);
    }

    /**
     * Get display value with both currencies for transition period
     * @param {number} amountBGN - Amount in BGN
     * @param {number} amountEUR - Amount in EUR
     * @param {string} primaryCurrency - Which to show first
     * @returns {string} Formatted dual-currency display
     */
    static formatDualCurrency(amountBGN, amountEUR, primaryCurrency = 'EUR') {
        if (primaryCurrency === 'EUR') {
            return `${this.formatAmount(amountEUR, 'EUR')} (${this.formatAmount(amountBGN, 'BGN')})`;
        }
        return `${this.formatAmount(amountBGN, 'BGN')} (${this.formatAmount(amountEUR, 'EUR')})`;
    }

    /**
     * Validate currency code
     * @param {string} currency - Currency code to validate
     * @returns {boolean} True if valid
     */
    static isValidCurrency(currency) {
        return ['BGN', 'EUR', 'USD'].includes(currency);
    }

    /**
     * Get all supported currencies
     * @returns {Array<Object>} Array of currency objects
     */
    static getSupportedCurrencies() {
        return [
            { code: 'EUR', symbol: this.SYMBOLS.EUR, name: this.NAMES.EUR, primary: true },
            { code: 'BGN', symbol: this.SYMBOLS.BGN, name: this.NAMES.BGN, historical: true },
            { code: 'USD', symbol: this.SYMBOLS.USD, name: this.NAMES.USD, foreign: true }
        ];
    }
}
