import {
  isBeforeRentStart,
  type AreaCreate,
  type AreaDetails,
  type AreaListItem,
  type AreaListQuery,
  type AreaSaveResult,
  type AreaUpdate,
  type PriceChange,
  type PriceChangeResult,
  type RenterChange,
  type RenterChangeResult,
  type RestoreResult,
} from '@shared/areas';
import type { CategoryColor } from '@shared/categories';
import type { Currency } from '@shared/currency';
import type { YearMonth } from '@shared/dates';
import type { AreaYear, StatusChange } from '@shared/months';
import { normalizePhone, normalizeText } from '@shared/normalizeText';
import { priceForMonth, withPriceFrom } from '@shared/prices';
import { areaYear, NO_PAYMENTS, statusChanges } from '../../services/monthStatus';
import type { PaymentRepository } from './payments';
import type { Db } from '../connection';
import type { AuditRepository } from './audit';
import type { CategoryRepository } from './categories';
import type { PriceRepository } from './prices';
import type { RenterRepository } from './renters';
import { containsPattern, NOW_SQL } from './sql';

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

interface AreaListRecord {
  id: number;
  name: string;
  currency: Currency;
  category_id: number;
  category_name: string;
  category_color: CategoryColor | null;
  renter_name: string | null;
  renter_phone: string | null;
}

interface Dependencies {
  audit: AuditRepository;
  categories: CategoryRepository;
  payments: PaymentRepository;
  prices: PriceRepository;
  renters: RenterRepository;
}

export function createAreaRepository(
  db: Db,
  { audit, categories, payments, prices, renters }: Dependencies,
) {
  const selectList = db.prepare<
    { categoryId: number | null; namePattern: string; phonePattern: string | null },
    AreaListRecord
  >(
    `SELECT a.id, a.name, a.currency, a.category_id,
       c.name AS category_name, c.color AS category_color,
       r.full_name AS renter_name, r.phone AS renter_phone
     FROM areas a
     JOIN categories c ON c.id = a.category_id
     LEFT JOIN renters r ON r.area_id = a.id AND r.ended_on IS NULL
     WHERE a.deleted_at IS NULL
       AND (@categoryId IS NULL OR a.category_id = @categoryId)
       AND (a.name_normalized LIKE @namePattern ESCAPE '\\'
         OR r.full_name_normalized LIKE @namePattern ESCAPE '\\'
         OR (@phonePattern IS NOT NULL AND r.phone_digits LIKE @phonePattern ESCAPE '\\'))`,
  );
  const selectById = db.prepare<[number], AreaRecord>(
    `SELECT id, category_id, name, currency, address, contract_start, notes, deleted_at
     FROM areas WHERE id = ?`,
  );
  const selectNameInUse = db.prepare<[number, string, number], { id: number }>(
    `SELECT id FROM areas
     WHERE category_id = ? AND name_normalized = ? AND deleted_at IS NULL AND id <> ?`,
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
  const markDeleted = db.prepare<[number]>(`UPDATE areas SET deleted_at = ${NOW_SQL} WHERE id = ?`);
  const markRestored = db.prepare<[number]>('UPDATE areas SET deleted_at = NULL WHERE id = ?');
  const selectDeleted = db.prepare<
    [],
    { id: number; name: string; category_name: string; deleted_at: string }
  >(
    `SELECT a.id, a.name, c.name AS category_name, a.deleted_at
     FROM areas a JOIN categories c ON c.id = a.category_id
     WHERE a.deleted_at IS NOT NULL ORDER BY a.deleted_at DESC`,
  );

  const findActive = (id: number) => {
    const row = selectById.get(id);
    return row && row.deleted_at === null ? row : null;
  };
  // The search copy of the name is always written from here, so it never drifts from the name.
  const nameInUse = (categoryId: number, name: string, exceptId = 0) =>
    selectNameInUse.get(categoryId, normalizeText(name), exceptId) !== undefined;
  const emptyToNull = (text: string) => (text === '' ? null : text);

  return {
    /** Areas in use, optionally in one category and matching a search on area name, renter name or phone. */
    list({ search, categoryId }: AreaListQuery, today: YearMonth): AreaListItem[] {
      const query = normalizeText(search);
      const digits = normalizePhone(search);
      const pricesByArea = prices.forActiveAreas();
      const paidByArea = payments.paidInYear(today.year);
      return selectList
        .all({
          categoryId,
          namePattern: containsPattern(query),
          phonePattern: digits === '' ? null : containsPattern(digits),
        })
        .map((row) => {
          const history = pricesByArea.get(row.id) ?? [];
          const paid = paidByArea.get(row.id) ?? NO_PAYMENTS;
          const { boxes, summary } = areaYear(history, paid, today.year, today);
          return {
            id: row.id,
            name: row.name,
            categoryId: row.category_id,
            categoryName: row.category_name,
            categoryColor: row.category_color,
            currency: row.currency,
            renterName: row.renter_name,
            renterPhone: row.renter_phone,
            currentPrice: priceForMonth(history, today),
            months: boxes,
            summary,
          };
        });
    },

    /** One year of an area: its 12 month boxes, summary word, and figures for the year or one month. */
    year(id: number, year: number, today: YearMonth, month: number | null = null): AreaYear | null {
      if (!findActive(id)) return null;
      return areaYear(prices.forArea(id), payments.paidInAreaYear(id, year), year, today, month);
    },

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
        },
        after: {
          name: input.name,
          categoryId: input.categoryId,
          address: input.address,
          contractStart: input.contractStart,
          notes: input.notes,
          renter: input.renter && currentRenter ? input.renter : null,
        },
      });
      return { ok: true, id: input.id };
    }),

    /** The paid months a price change would alter; null when the area does not exist. */
    priceChangeImpact(
      { areaId, from, monthlyPrice }: PriceChange,
      today: YearMonth,
    ): StatusChange[] | null {
      if (!findActive(areaId)) return null;
      const history = prices.forArea(areaId);
      const after = withPriceFrom(history, from, monthlyPrice);
      return statusChanges(history, after, payments.history(areaId), from, today);
    },

    /** A new price from a month onward. Earlier months keep their price; 0 means vacant. */
    changePrice: db.transaction(
      ({ areaId, from, monthlyPrice }: PriceChange): PriceChangeResult => {
        if (!findActive(areaId)) return { ok: false, reason: 'not_found' };
        const history = prices.forArea(areaId);
        if (isBeforeRentStart(history, from)) return { ok: false, reason: 'before_rent_start' };
        prices.set(areaId, from, monthlyPrice);
        audit.record('change_price', 'area', areaId, {
          from,
          previousPrice: priceForMonth(history, from),
          monthlyPrice,
        });
        return { ok: true };
      },
    ),

    /** A new renter closes the current one on the day the new one starts; "left" just closes it. */
    changeRenter: db.transaction((change: RenterChange): RenterChangeResult => {
      if (!findActive(change.areaId)) return { ok: false, reason: 'not_found' };
      const current = renters.current(change.areaId);
      if (change.kind === 'left') {
        if (!current) return { ok: false, reason: 'no_current_renter' };
        if (change.endedOn < current.startedOn)
          return { ok: false, reason: 'before_current_renter' };
        renters.end(current.id, change.endedOn);
        audit.record('end_renter', 'area', change.areaId, {
          renter: current.fullName,
          endedOn: change.endedOn,
        });
        return { ok: true };
      }
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
        categoryName: row.category_name,
        deletedAt: row.deleted_at,
      }));
    },
  };
}

export type AreaRepository = ReturnType<typeof createAreaRepository>;
