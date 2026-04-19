// js/utils/ValidationUtils.js - Centralized schema-based validation (QW-2)
//
// Usage:
//   import { validateSchema, Validators, orderSchema } from './ValidationUtils.js';
//   const errors = validateSchema(data, orderSchema);
//   if (errors) throw new ValidationError(errors);

export class ValidationError extends Error {
    constructor(errors) {
        const first = Object.values(errors)[0];
        super(first);
        this.name = 'ValidationError';
        this.errors = errors;
    }
}

// Individual rule functions. Each returns an error message string on failure, or
// a falsy value on success. Rules are composable within a field's rule array.
export const Validators = {
    required: (v, field) =>
        (v === null || v === undefined || (typeof v === 'string' && v.trim() === ''))
            ? `${field} е задължително`
            : null,

    string: (v, field) =>
        (v !== null && v !== undefined && typeof v !== 'string')
            ? `${field} трябва да е текст`
            : null,

    maxLen: (n) => (v, field) =>
        (typeof v === 'string' && v.length > n)
            ? `${field} не може да е повече от ${n} символа`
            : null,

    minLen: (n) => (v, field) =>
        (typeof v === 'string' && v.trim().length > 0 && v.length < n)
            ? `${field} трябва да е поне ${n} символа`
            : null,

    email: (v, field) => {
        if (!v || typeof v !== 'string' || !v.trim()) return null;
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? null : `Невалиден ${field}`;
    },

    phone: (v, field) => {
        if (!v || typeof v !== 'string' || !v.trim()) return null;
        const digits = v.replace(/\D/g, '');
        return digits.length >= 6 ? null : `${field} трябва да съдържа поне 6 цифри`;
    },

    // Empty/null accepted — coerced to 0 by coerceNumber.
    numberOrEmpty: (v, field) => {
        if (v === null || v === undefined || v === '') return null;
        return isNaN(parseFloat(v)) ? `${field} трябва да е число` : null;
    },

    nonNegative: (v, field) => {
        if (v === null || v === undefined || v === '') return null;
        const n = parseFloat(v);
        return (!isNaN(n) && n < 0) ? `${field} не може да е отрицателно` : null;
    },

    maxValue: (max) => (v, field) => {
        if (v === null || v === undefined || v === '') return null;
        const n = parseFloat(v);
        return (!isNaN(n) && n > max) ? `${field} не може да надвишава ${max}` : null;
    },

    dateISO: (v, field) => {
        if (!v) return null;
        return /^\d{4}-\d{2}-\d{2}$/.test(v) ? null : `Невалиден формат на ${field} (очаква се YYYY-MM-DD)`;
    },

    monthKey: (v, field) => {
        if (!v) return null;
        return /^\d{4}-\d{2}$/.test(v) ? null : `Невалиден формат на ${field} (очаква се YYYY-MM)`;
    },
};

// Coerce numeric fields: empty string / null / undefined → 0. Returns a new object.
export function coerceNumbers(data, fields) {
    const out = { ...data };
    for (const f of fields) {
        if (out[f] === '' || out[f] === null || out[f] === undefined) {
            out[f] = 0;
        } else {
            const n = parseFloat(out[f]);
            if (!isNaN(n)) out[f] = n;
        }
    }
    return out;
}

// Run a schema against a data object. Returns null on success, or
// { fieldName: errorMessage } on failure (one error per field — first rule wins).
export function validateSchema(data, schema) {
    const errors = {};
    for (const [field, rules] of Object.entries(schema)) {
        for (const rule of rules) {
            const err = rule(data?.[field], field);
            if (err) { errors[field] = err; break; }
        }
    }
    return Object.keys(errors).length ? errors : null;
}

// Throw a ValidationError if the schema fails. Convenience for call sites that
// want the pre-existing throw-on-error behaviour.
export function assertValid(data, schema) {
    const errors = validateSchema(data, schema);
    if (errors) throw new ValidationError(errors);
}

// ---------- Domain schemas ----------

export const orderSchema = {
    date:    [Validators.required, Validators.dateISO],
    client:  [Validators.required, Validators.string, Validators.maxLen(200)],
    origin:  [Validators.required, Validators.string, Validators.maxLen(100)],
    vendor:  [Validators.required, Validators.string, Validators.maxLen(200)],
    model:   [Validators.required, Validators.string, Validators.maxLen(500)],
    phone:   [Validators.string, Validators.maxLen(50)],
    notes:   [Validators.string, Validators.maxLen(2000)],
    costUSD:     [Validators.numberOrEmpty, Validators.nonNegative],
    shippingUSD: [Validators.numberOrEmpty, Validators.nonNegative],
    extrasEUR:   [Validators.numberOrEmpty, Validators.nonNegative],
    sellEUR:     [Validators.numberOrEmpty, Validators.nonNegative],
};

export const ORDER_NUMERIC_FIELDS = ['costUSD', 'shippingUSD', 'extrasEUR', 'sellEUR'];

export const clientSchema = {
    name:             [Validators.required, Validators.string, Validators.maxLen(100)],
    phone:            [Validators.phone, Validators.maxLen(50)],
    email:            [Validators.email, Validators.maxLen(200)],
    address:          [Validators.string, Validators.maxLen(500)],
    preferredSource:  [Validators.string, Validators.maxLen(100)],
    notes:            [Validators.string, Validators.maxLen(2000)],
};

export const expenseSchema = {
    name:   [Validators.required, Validators.string, Validators.maxLen(100)],
    amount: [Validators.required, Validators.numberOrEmpty, Validators.nonNegative, Validators.maxValue(999999)],
    note:   [Validators.string, Validators.maxLen(500)],
};
