-- The area name is optional. Names that are filled in stay unique within a
-- category; areas without a name never clash with each other.
DROP INDEX areas_name_unique;
CREATE UNIQUE INDEX areas_name_unique ON areas (category_id, name_normalized)
  WHERE deleted_at IS NULL AND name_normalized <> '';
