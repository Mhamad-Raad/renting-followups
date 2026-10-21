import type {
  Category,
  CategoryColor,
  CategoryDeleteResult,
  CategoryInput,
  CategorySaveResult,
  CategoryUpdate,
} from '@shared/categories';
import type { RestoreResult } from '@shared/areas';
import { normalizeText } from '@shared/normalizeText';
import type { Db } from '../connection';
import type { AuditRepository } from './audit';
import { NOW_SQL } from './sql';

interface CategoryRow {
  id: number;
  name: string;
  color: CategoryColor | null;
  deleted_at: string | null;
}

export function createCategoryRepository(db: Db, audit: AuditRepository) {
  const selectActive = db.prepare<[], CategoryRow & { area_count: number }>(
    `SELECT c.id, c.name, c.color, c.deleted_at,
       (SELECT COUNT(*) FROM areas a WHERE a.category_id = c.id AND a.deleted_at IS NULL) AS area_count
     FROM categories c WHERE c.deleted_at IS NULL ORDER BY c.sort_order, c.id`,
  );
  const selectById = db.prepare<[number], CategoryRow>(
    'SELECT id, name, color, deleted_at FROM categories WHERE id = ?',
  );
  const selectNameInUse = db.prepare<[string, number], { id: number }>(
    'SELECT id FROM categories WHERE name_normalized = ? AND deleted_at IS NULL AND id <> ?',
  );
  const insert = db.prepare<[string, string, string | null]>(
    `INSERT INTO categories (name, name_normalized, color, sort_order)
     VALUES (?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM categories))`,
  );
  const update = db.prepare<[string, string, string | null, number]>(
    'UPDATE categories SET name = ?, name_normalized = ?, color = ? WHERE id = ?',
  );
  const countAreas = db.prepare<[number], { count: number }>(
    'SELECT COUNT(*) AS count FROM areas WHERE category_id = ? AND deleted_at IS NULL',
  );
  const markDeleted = db.prepare<[number]>(
    `UPDATE categories SET deleted_at = ${NOW_SQL} WHERE id = ?`,
  );
  const markRestored = db.prepare<[number]>('UPDATE categories SET deleted_at = NULL WHERE id = ?');
  const selectDeleted = db.prepare<[], { id: number; name: string; deleted_at: string }>(
    'SELECT id, name, deleted_at FROM categories WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC',
  );

  const nameInUse = (name: string, exceptId = 0) =>
    selectNameInUse.get(normalizeText(name), exceptId) !== undefined;
  const findActive = (id: number) => {
    const row = selectById.get(id);
    return row && row.deleted_at === null ? row : null;
  };

  return {
    list(): Category[] {
      return selectActive.all().map((row) => ({
        id: row.id,
        name: row.name,
        color: row.color,
        areaCount: row.area_count,
      }));
    },

    /** Null when the category does not exist or is deleted. */
    findActive,

    create: db.transaction(({ name, color }: CategoryInput): CategorySaveResult => {
      if (nameInUse(name)) return { ok: false, reason: 'duplicate_name' };
      const id = Number(insert.run(name, normalizeText(name), color).lastInsertRowid);
      audit.record('create', 'category', id, { name, color });
      return { ok: true, id };
    }),

    update: db.transaction(({ id, name, color }: CategoryUpdate): CategorySaveResult => {
      const before = findActive(id);
      if (!before) return { ok: false, reason: 'not_found' };
      if (nameInUse(name, id)) return { ok: false, reason: 'duplicate_name' };
      update.run(name, normalizeText(name), color, id);
      audit.record('update', 'category', id, {
        before: { name: before.name, color: before.color },
        after: { name, color },
      });
      return { ok: true, id };
    }),

    /** Only an empty category can be deleted, so no area is ever left without one. */
    softDelete: db.transaction((id: number): CategoryDeleteResult => {
      const category = findActive(id);
      if (!category) return { ok: false, reason: 'not_found' };
      if ((countAreas.get(id)?.count ?? 0) > 0) return { ok: false, reason: 'has_areas' };
      markDeleted.run(id);
      audit.record('delete', 'category', id, { name: category.name });
      return { ok: true };
    }),

    restore: db.transaction((id: number): RestoreResult => {
      const category = selectById.get(id);
      if (!category || category.deleted_at === null) return { ok: false, reason: 'not_found' };
      if (nameInUse(category.name, id)) return { ok: false, reason: 'duplicate_name' };
      markRestored.run(id);
      audit.record('restore', 'category', id, { name: category.name });
      return { ok: true };
    }),

    listDeleted() {
      return selectDeleted
        .all()
        .map((row) => ({ id: row.id, name: row.name, deletedAt: row.deleted_at }));
    },
  };
}

export type CategoryRepository = ReturnType<typeof createCategoryRepository>;
