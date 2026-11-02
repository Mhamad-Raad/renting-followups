-- Search finds a place by its address too, with the same letter rules as names
-- (ARCHITECTURE.md section 9). Existing addresses get their search copy here.
ALTER TABLE areas ADD COLUMN address_normalized TEXT NOT NULL DEFAULT '';
UPDATE areas SET address_normalized = normalize_text(COALESCE(address, ''));
