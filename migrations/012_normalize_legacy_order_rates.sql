-- Migration 012: Normalize legacy order exchange rates
--
-- Older orders stored `rate` as USD->BGN (typically 1.5-1.9). The app now
-- operates in EUR, so `rate` must be USD->EUR. Convert any remaining legacy
-- rates using the fixed conversion rate: 1 EUR = 1.95583 BGN.

UPDATE public.orders
SET rate = ROUND(rate / 1.95583, 6)
WHERE rate > 1.2;

-- Quick verification:
-- SELECT id, date, client, cost_usd, shipping_usd, rate
-- FROM public.orders
-- WHERE rate > 1.2
-- ORDER BY date DESC;
