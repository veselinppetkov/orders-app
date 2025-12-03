-- Normalize legacy BGN amounts that were mistakenly relabeled as EUR
-- Official conversion rate: 1 EUR = 1.95583 BGN

DO $$
DECLARE
    official_rate CONSTANT numeric := 1.95583;
BEGIN
    RAISE NOTICE '🔄 Normalizing orders to EUR using rate %', official_rate;

    WITH normalized_orders AS (
        SELECT
            id,
            -- Prefer BGN when values disagree to fix relabeled EUR columns
            CASE
                WHEN extras_bgn IS NOT NULL AND extras_eur IS NOT NULL AND abs(extras_eur - extras_bgn / official_rate) <= 0.05 THEN extras_eur
                WHEN extras_bgn IS NOT NULL THEN extras_bgn / official_rate
                WHEN extras_eur IS NOT NULL THEN extras_eur / official_rate
                ELSE 0
            END AS extras_eur_norm,
            CASE
                WHEN sell_bgn IS NOT NULL AND sell_eur IS NOT NULL AND abs(sell_eur - sell_bgn / official_rate) <= 0.05 THEN sell_eur
                WHEN sell_bgn IS NOT NULL THEN sell_bgn / official_rate
                WHEN sell_eur IS NOT NULL THEN sell_eur / official_rate
                ELSE 0
            END AS sell_eur_norm
        FROM orders
    )
    UPDATE orders o
    SET
        extras_eur = ROUND(n.extras_eur_norm, 2),
        extras_bgn = ROUND(n.extras_eur_norm * official_rate, 2),
        sell_eur = ROUND(n.sell_eur_norm, 2),
        sell_bgn = ROUND(n.sell_eur_norm * official_rate, 2),
        total_eur = ROUND(((o.cost_usd + o.shipping_usd) * o.rate) + n.extras_eur_norm, 2),
        balance_eur = ROUND(n.sell_eur_norm - (((o.cost_usd + o.shipping_usd) * o.rate) + n.extras_eur_norm), 2),
        total_bgn = ROUND((((o.cost_usd + o.shipping_usd) * o.rate) + n.extras_eur_norm) * official_rate, 2),
        balance_bgn = ROUND((n.sell_eur_norm - (((o.cost_usd + o.shipping_usd) * o.rate) + n.extras_eur_norm)) * official_rate, 2),
        currency = 'EUR'
    FROM normalized_orders n
    WHERE o.id = n.id;

    RAISE NOTICE '💶 Orders normalized.';

    RAISE NOTICE '🔄 Normalizing expenses to EUR using rate %', official_rate;
    UPDATE expenses
    SET
        amount_eur = ROUND(
            CASE
                WHEN amount_eur IS NOT NULL AND amount IS NOT NULL AND abs(amount_eur - amount / official_rate) <= 0.05 THEN amount_eur
                WHEN amount IS NOT NULL THEN amount / official_rate
                WHEN amount_eur IS NOT NULL THEN amount_eur / official_rate
                ELSE 0
            END, 2),
        amount = ROUND(
            CASE
                WHEN amount IS NOT NULL THEN amount
                WHEN amount_eur IS NOT NULL THEN amount_eur * official_rate
                ELSE 0
            END, 2),
        currency = 'EUR'
    WHERE TRUE;

    RAISE NOTICE '💶 Expenses normalized.';

    RAISE NOTICE '🔄 Normalizing inventory prices to EUR (only values clearly above EUR ranges)';
    UPDATE inventory
    SET
        purchase_price = ROUND(purchase_price / official_rate, 2),
        sell_price = ROUND(sell_price / official_rate, 2)
    WHERE purchase_price > 100 OR sell_price > 100;

    RAISE NOTICE '📦 Inventory prices normalized.';
END $$;
