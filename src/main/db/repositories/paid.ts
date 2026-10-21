import { monthIndex, type DateString } from '@shared/dates';
import type { Allocation } from '@shared/payments';
import type { PaidByMonth, PaidHistory } from '../../services/monthStatus';
import type { Db } from '../connection';

// Only receipts that still count: cancelled ones are kept but never add to what was paid.
const COUNTING = 'r.voided_at IS NULL';

/** How much has been paid, per month: what the colours, totals and month filling are based on. */
export function createPaidRepository(db: Db) {
  const selectPaidForArea = db.prepare<[number, number], Allocation>(
    `SELECT a.year, a.month, SUM(a.amount) AS amount
     FROM payment_allocations a JOIN receipts r ON r.id = a.receipt_id
     WHERE a.area_id = ? AND ${COUNTING} AND a.receipt_id <> ?
     GROUP BY a.year, a.month`,
  );
  const selectPaidInYear = db.prepare<[number], { area_id: number; month: number; amount: number }>(
    `SELECT a.area_id, a.month, SUM(a.amount) AS amount
     FROM payment_allocations a JOIN receipts r ON r.id = a.receipt_id
     WHERE a.year = ? AND ${COUNTING}
     GROUP BY a.area_id, a.month`,
  );
  const selectPaidForActiveAreas = db.prepare<
    [],
    { area_id: number; year: number; month: number; amount: number }
  >(
    `SELECT a.area_id, a.year, a.month, SUM(a.amount) AS amount
     FROM payment_allocations a JOIN receipts r ON r.id = a.receipt_id
     WHERE ${COUNTING} AND a.area_id IN (SELECT id FROM areas WHERE deleted_at IS NULL)
     GROUP BY a.area_id, a.year, a.month`,
  );
  const selectLatestPaidOn = db.prepare<[], { latest: string | null }>(
    `SELECT MAX(paid_on) AS latest FROM receipts r WHERE ${COUNTING}`,
  );

  return {
    /** What every month of the area has been paid, across all years, leaving out one receipt if given. */
    history(areaId: number, exceptReceiptId = 0): PaidHistory {
      return new Map(
        selectPaidForArea
          .all(areaId, exceptReceiptId)
          .map((row) => [monthIndex(row), row.amount] as const),
      );
    },

    /** The same for every area in use, in one query. */
    historyForActiveAreas(): Map<number, PaidHistory> {
      const byArea = new Map<number, Map<number, number>>();
      for (const row of selectPaidForActiveAreas.all()) {
        const months = byArea.get(row.area_id) ?? new Map<number, number>();
        months.set(monthIndex(row), row.amount);
        byArea.set(row.area_id, months);
      }
      return byArea;
    },

    /** What each month of one area's year has been paid. */
    inAreaYear(areaId: number, year: number): PaidByMonth {
      const paid = new Map<number, number>();
      for (const row of selectPaidForArea.all(areaId, 0)) {
        if (row.year === year) paid.set(row.month, row.amount);
      }
      return paid;
    },

    /** What each month of a year has been paid, for every area, in one query. */
    inYear(year: number): Map<number, Map<number, number>> {
      const byArea = new Map<number, Map<number, number>>();
      for (const row of selectPaidInYear.all(year)) {
        const months = byArea.get(row.area_id) ?? new Map<number, number>();
        months.set(row.month, row.amount);
        byArea.set(row.area_id, months);
      }
      return byArea;
    },

    /** The latest date money was received, for the "computer date looks wrong" check. */
    latestPaidOn(): DateString | null {
      return selectLatestPaidOn.get()?.latest ?? null;
    },
  };
}

export type PaidRepository = ReturnType<typeof createPaidRepository>;
