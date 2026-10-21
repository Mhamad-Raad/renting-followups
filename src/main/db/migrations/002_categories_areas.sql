CREATE TABLE categories (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  name_normalized TEXT NOT NULL,
  color TEXT CHECK (color IS NULL OR color GLOB '#[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]'),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at TEXT
);
-- Two categories in use may not share a name; deleted ones do not count.
CREATE UNIQUE INDEX categories_name_unique ON categories (name_normalized) WHERE deleted_at IS NULL;

CREATE TABLE areas (
  id INTEGER PRIMARY KEY,
  category_id INTEGER NOT NULL REFERENCES categories (id),
  name TEXT NOT NULL,
  name_normalized TEXT NOT NULL,
  currency TEXT NOT NULL CHECK (currency IN ('IQD', 'USD')),
  address TEXT,
  contract_start TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at TEXT
);
CREATE INDEX areas_category ON areas (category_id);
CREATE UNIQUE INDEX areas_name_unique ON areas (category_id, name_normalized) WHERE deleted_at IS NULL;

-- The currency is chosen once, when the area is created.
CREATE TRIGGER areas_currency_fixed
BEFORE UPDATE OF currency ON areas
WHEN NEW.currency <> OLD.currency
BEGIN
  SELECT RAISE (ABORT, 'area currency cannot change');
END;

CREATE TABLE area_prices (
  id INTEGER PRIMARY KEY,
  area_id INTEGER NOT NULL REFERENCES areas (id),
  monthly_price INTEGER NOT NULL CHECK (monthly_price >= 0),
  effective_from_year INTEGER NOT NULL CHECK (effective_from_year BETWEEN 2000 AND 2100),
  effective_from_month INTEGER NOT NULL CHECK (effective_from_month BETWEEN 1 AND 12),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE UNIQUE INDEX area_prices_month ON area_prices (area_id, effective_from_year, effective_from_month);

CREATE TABLE renters (
  id INTEGER PRIMARY KEY,
  area_id INTEGER NOT NULL REFERENCES areas (id),
  full_name TEXT NOT NULL,
  full_name_normalized TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  phone_digits TEXT NOT NULL DEFAULT '',
  started_on TEXT NOT NULL,
  ended_on TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX renters_area ON renters (area_id);
-- At most one current renter per area.
CREATE UNIQUE INDEX renters_current ON renters (area_id) WHERE ended_on IS NULL;

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX audit_log_at ON audit_log (at);
CREATE INDEX audit_log_entity ON audit_log (entity, entity_id);
