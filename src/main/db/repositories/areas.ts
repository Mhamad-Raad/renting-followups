import type {
  AreaCreate,
  AreaDetails,
  AreaSaveResult,
  AreaUpdate,
  RenterChange,
  RenterChangeResult,
  RestoreResult,
} from '@shared/areas';
import { FRACTION_DIGITS, type Currency } from '@shared/currency';
import { normalizeText } from '@shared/normalizeText';
import type { Db } from '../connection';
import type { AuditRepository } from './audit';
import type { CategoryRepository } from './categories';
import type { PriceRepository } from './prices';
import type { RenterRepository } from './renters';
import { NOW_SQL } from './sql';

interface AreaRecord {
  id: number;
  category_id: number;
  name: string;
  currency: Currency;
  address: string | null;
  contract_start: string | null;
  notes: string;
  deleted_at: string | null;
}

interface Dependencies {
  audit: AuditRepository;
  categories: CategoryRepository;
  prices: PriceRepository;
  renters: RenterRepository;
}

export function createAreaRepository(db: Db, { audit, categories, prices, renters }: Dependencies) {
  const selectById = db.prepare<[number], AreaRecord>(
    `SELECT id, category_id, name, currency, address, contract_start, notes, deleted_at
     FROM areas WHERE id = ?`,
  );
  const selectNameInUse = db.prepare<[number, string, number], { id: number }>(
    `SELECT id FROM areas
     WHERE category_id = ? AND name_normalized = ? AND name_normalized <> ''
       AND deleted_at IS NULL AND id <> ?`,
  );
  const insert = db.prepare<
    [number, string, string, Currency, string | null, string | null, string]
  >(
    `INSERT INTO areas (category_id, name, name_normalized, currency, address, contract_start, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const update = db.prepare<[number, string, string, string | null, string | null, string, number]>(
    `UPDATE areas SET category_id = ?, name = ?, name_normalized = ?, address = ?,
       contract_start = ?, notes = ?
     WHERE id = ?`,
  );
  const selectHasPayments = db.prepare<[number], { found: number }>(
    'SELECT 1 AS found FROM receipts WHERE area_id = ? AND voided_at IS NULL LIMIT 1',
  );
  const updateCurrency = db.prepare<[Currency, number]>(
    'UPDATE areas SET currency = ? WHERE id = ?',
  );
  // A corrected currency keeps the written rent: 1,100,000.00 dollars becomes 1,100,000 dinar.
  const rescalePrices = db.prepare<[number, number]>(
    'UPDATE area_prices SET monthly_price = CAST(ROUND(monthly_price * ?) AS INTEGER) WHERE area_id = ?',
  );
  const markDeleted = db.prepare<[number]>(`UPDATE areas SET deleted_at = ${NOW_SQL} WHERE id = ?`);
  const markRestored = db.prepare<[number]>('UPDATE areas SET deleted_at = NULL WHERE id = ?');
  const selectDeleted = db.prepare<
    [],
    {
      id: number;
      name: string;
      category_name: string;
      renter_name: string | null;
      deleted_at: string;
    }
  >(
    `SELECT a.id, a.name, c.name AS category_name, r.full_name AS renter_name, a.deleted_at
     FROM areas a JOIN categories c ON c.id = a.category_id
     LEFT JOIN renters r ON r.area_id = a.id AND r.ended_on IS NULL
     WHERE a.deleted_at IS NOT NULL ORDER BY a.deleted_at DESC`,
  );

  const findActive = (id: number) => {
    const row = selectById.get(id);
    return row && row.deleted_at === null ? row : null;
  };
  // The search copy of the name is always written from here, so it never drifts from the name.
  // Areas without a name never clash: they are told apart by their renter.
  const nameInUse = (categoryId: number, name: string, exceptId = 0) =>
    selectNameInUse.get(categoryId, normalizeText(name), exceptId) !== undefined;
  const emptyToNull = (text: string) => (text === '' ? null : text);
  const hasPayments = (id: number) => selectHasPayments.get(id) !== undefined;

  return {
    /** True when an area in use in the category already has this name (letter variants count as the same). */
    nameTaken: (categoryId: number, name: string) => nameInUse(categoryId, name),

    /** True for an area that exists and is not deleted. */
    isActive: (id: number) => findActive(id) !== null,

    get(id: number): AreaDetails | null {
      const area = findActive(id);
      const category = area ? categories.findActive(area.category_id) : null;
      if (!area || !category) return null;
      return {
        id: area.id,
        name: area.name,
        category: { id: category.id, name: category.name, color: category.color },
        currency: area.currency,
        address: area.address ?? '',
        contractStart: area.contract_start,
        notes: area.notes,
        prices: prices.forArea(id),
        renters: renters.forArea(id),
        hasPayments: hasPayments(id),
      };
    },

    /** Creates the area, its first price row ("Rent starts from") and its first renter in one step. */
    create: db.transaction((input: AreaCreate): AreaSaveResult => {
      if (!categories.findActive(input.categoryId))
        return { ok: false, reason: 'category_not_found' };
      if (nameInUse(input.categoryId, input.name)) return { ok: false, reason: 'duplicate_name' };
      const id = Number(
        insert.run(
          input.categoryId,
          input.name,
          normalizeText(input.name),
          input.currency,
          emptyToNull(input.address),
          input.contractStart,
          input.notes,
        ).lastInsertRowid,
      );
      prices.set(id, input.rentStartsFrom, input.monthlyPrice);
      if (input.renter) renters.start(id, input.renter, input.renter.startedOn);
      audit.record('create', 'area', id, {
        name: input.name,
        categoryId: input.categoryId,
        currency: input.currency,
        monthlyPrice: input.monthlyPrice,
        rentStartsFrom: input.rentStartsFrom,
        renter: input.renter?.fullName ?? null,
      });
      return { ok: true, id };
    }),

    update: db.transaction((input: AreaUpdate): AreaSaveResult => {
      const before = findActive(input.id);
      if (!before) return { ok: false, reason: 'not_found' };
      if (!categories.findActive(input.categoryId))
        return { ok: false, reason: 'category_not_found' };
      if (nameInUse(input.categoryId, input.name, input.id)) {
        return { ok: false, reason: 'duplicate_name' };
      }
      const currency = input.currency ?? before.currency;
      if (currency !== before.currency) {
        if (hasPayments(input.id)) return { ok: false, reason: 'has_payments' };
        updateCurrency.run(currency, input.id);
        rescalePrices.run(
          10 ** (FRACTION_DIGITS[currency] - FRACTION_DIGITS[before.currency]),
          input.id,
        );
      }
      update.run(
        input.categoryId,
        input.name,
        normalizeText(input.name),
        emptyToNull(input.address),
        input.contractStart,
        input.notes,
        input.id,
      );
      const currentRenter = renters.current(input.id);
      if (input.renter && currentRenter) renters.correct(currentRenter.id, input.renter);
      audit.record('update', 'area', input.id, {
        before: {
          name: before.name,
          categoryId: before.category_id,
          address: before.address ?? '',
          contractStart: before.contract_start,
          notes: before.notes,
          renter: currentRenter && { fullName: currentRenter.fullName, phone: currentRenter.phone },
          currency: before.currency,
        },
        after: {
          name: input.name,
          categoryId: input.categoryId,
          address: input.address,
          contractStart: input.contractStart,
          notes: input.notes,
          renter: input.renter && currentRenter ? input.renter : null,
          currency,
        },
      });
      return { ok: true, id: input.id };
    }),

    /** A new renter closes the current one on the day the new one starts. */
    changeRenter: db.transaction((change: RenterChange): RenterChangeResult => {
      if (!findActive(change.areaId)) return { ok: false, reason: 'not_found' };
      const current = renters.current(change.areaId);
      if (current && change.startedOn < current.startedOn) {
        return { ok: false, reason: 'before_current_renter' };
      }
      if (current) renters.end(current.id, change.startedOn);
      renters.start(change.areaId, change, change.startedOn);
      audit.record('change_renter', 'area', change.areaId, {
        previous: current?.fullName ?? null,
        renter: change.fullName,
        startedOn: change.startedOn,
      });
      return { ok: true };
    }),

    /** Moves the area to Deleted items. Nothing is erased; it can be restored. */
    softDelete: db.transaction((id: number): { ok: true } | { ok: false; reason: 'not_found' } => {
      const area = findActive(id);
      if (!area) return { ok: false, reason: 'not_found' };
      markDeleted.run(id);
      audit.record('delete', 'area', id, { name: area.name });
      return { ok: true };
    }),

    /** Brings an area back, with its category if that was deleted too. */
    restore: db.transaction((id: number): RestoreResult => {
      const area = selectById.get(id);
      if (!area || area.deleted_at === null) return { ok: false, reason: 'not_found' };
      // Check every reason to refuse before changing anything.
      if (nameInUse(area.category_id, area.name, id))
        return { ok: false, reason: 'duplicate_name' };
      if (!categories.findActive(area.category_id)) {
        const restored = categories.restore(area.category_id);
        if (!restored.ok) return restored;
      }
      markRestored.run(id);
      audit.record('restore', 'area', id, { name: area.name });
      return { ok: true };
    }),

    listDeleted() {
      return selectDeleted.all().map((row) => ({
        id: row.id,
        name: row.name,
        renterName: row.renter_name,
        categoryName: row.category_name,
        deletedAt: row.deleted_at,
      }));
    },
  };
}

export type AreaRepository = ReturnType<typeof createAreaRepository>;
