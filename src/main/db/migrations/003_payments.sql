CREATE TABLE receipts (
  id INTEGER PRIMARY KEY,
  -- Sequential and never reused; NULL only for past records (backfill), which get no number.
  receipt_number INTEGER UNIQUE CHECK (receipt_number IS NULL OR receipt_number > 0),
  is_backfill INTEGER NOT NULL DEFAULT 0 CHECK (is_backfill IN (0, 1)),
  area_id INTEGER NOT NULL REFERENCES areas (id),
  renter_name_snapshot TEXT,
  renter_phone_snapshot TEXT,
  currency TEXT NOT NULL CHECK (currency IN ('IQD', 'USD')),
  total_amount INTEGER NOT NULL CHECK (total_amount > 0),
  paid_on TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  voided_at TEXT,
  print_count INTEGER NOT NULL DEFAULT 0 CHECK (print_count >= 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK ((is_backfill = 1) = (receipt_number IS NULL))
);
CREATE INDEX receipts_area ON receipts (area_id);

-- A receipt keeps its number for ever, even when edited or cancelled.
CREATE TRIGGER receipts_number_fixed
BEFORE UPDATE OF receipt_number, is_backfill ON receipts
WHEN NEW.receipt_number IS NOT OLD.receipt_number OR NEW.is_backfill <> OLD.is_backfill
BEGIN
  SELECT RAISE (ABORT, 'receipt number cannot change');
END;

CREATE TABLE payment_allocations (
  id INTEGER PRIMARY KEY,
  receipt_id INTEGER NOT NULL REFERENCES receipts (id),
  area_id INTEGER NOT NULL REFERENCES areas (id),
  year INTEGER NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  amount INTEGER NOT NULL CHECK (amount > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (receipt_id, year, month)
);
CREATE INDEX payment_allocations_area_month ON payment_allocations (area_id, year, month);
