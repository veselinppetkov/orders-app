export const Constants = {
    // Currency exchange rates (configurable via settings)
    DEFAULT_USD_TO_EUR_RATE: 0.92, // Default USD to EUR market rate (~1.09 EUR/USD)
    DEFAULT_SHIPPING: 1.5,

    // Currency settings (EUR-only operation, BGN kept in DB for historical audit)
    CURRENCY: {
        EUR: {
            code: 'EUR',
            symbol: '€',
            name: 'Euro',
            primary: true
        },
        USD: {
            code: 'USD',
            symbol: '$',
            name: 'US Dollar',
            foreign: true
        }
    },

    STATUS: {
        PENDING: 'Очакван',
        DELIVERED: 'Доставен',
        FREE: 'Свободен',
        OTHER: 'Други'
    },

    COLORS: {
        PRIMARY: '#667eea',
        SECONDARY: '#764ba2',
        SUCCESS: '#28a745',
        DANGER: '#dc3545',
        WARNING: '#ffc107',
        INFO: '#17a2b8'
    },

    NOTIFICATION_DURATION: 3000,

    MONTHS_BG: [
        'Януари', 'Февруари', 'Март', 'Април', 'Май', 'Юни',
        'Юли', 'Август', 'Септември', 'Октомври', 'Ноември', 'Декември'
    ]
};
