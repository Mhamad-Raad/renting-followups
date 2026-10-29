-- The currency belongs to each rent period, so a new renter can pay in another
-- currency from their first month. Existing rows take their area's currency.
-- `areas.currency` is the currency of the current rent period; the app keeps it
-- in step (a correction on Edit is still only allowed before the first payment).
ALTER TABLE area_prices ADD COLUMN currency TEXT NOT NULL DEFAULT 'IQD'
  CHECK (currency IN ('IQD', 'USD'));
UPDATE area_prices SET currency = (SELECT currency FROM areas WHERE areas.id = area_prices.area_id);
DROP TRIGGER areas_currency_fixed_once_paid;
