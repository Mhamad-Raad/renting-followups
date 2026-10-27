-- The currency may be corrected until the area has a payment that counts;
-- cancelled receipts keep their own currency and do not block it.
DROP TRIGGER areas_currency_fixed;
CREATE TRIGGER areas_currency_fixed_once_paid
BEFORE UPDATE OF currency ON areas
WHEN NEW.currency <> OLD.currency
  AND EXISTS (SELECT 1 FROM receipts WHERE area_id = OLD.id AND voided_at IS NULL)
BEGIN
  SELECT RAISE (ABORT, 'area currency cannot change once it has payments');
END;
