import { monthIndex, type YearMonth } from '@shared/dates';
import type { Currency } from '@shared/currency';
import type { Allocation } from '@shared/payments';
import type { Db } from '../connection';

/** One month's share of one receipt. */
export interface AllocationRow extends Allocation {
  receiptId: number;
  /** Null for a past record. */
  receiptNumber: number | null;
  currency: Currency;
}

/** Writes which months each receipt pays. Callers run these inside their own transaction. */
export function createAllocationRepository(db: Db) {
  const insert = db.prepare<[number, number, number, number, number]>(
    `INSERT INTO payment_allocations (receipt_id, area_id, year, month, amount)
     VALUES (?, ?, ?, ?, ?)`,
  );
  const deleteAll = db.prepare<[number]>('DELETE FROM payment_allocations WHERE receipt_id = ?');
  const deleteFrom = db.prepare<[number, number]>(
    `DELETE FROM payment_allocations
     WHERE receipt_id = ? AND year * 12 + (month - 1) >= ?`,
  );
  const selectCounting = db.prepare<[number], AllocationRow>(
    `SELECT a.receipt_id AS receiptId, r.receipt_number AS receiptNumber, r.currency,
       a.year, a.month, a.amount
     FROM payment_allocations a JOIN receipts r ON r.id = a.receipt_id
     WHERE a.area_id = ? AND r.voided_at IS NULL
     ORDER BY r.paid_on, r.id, a.year, a.month`,
  );

  const write = (receiptId: number, areaId: number, months: readonly Allocation[]) => {
    for (const { year, month, amount } of months)
      insert.run(receiptId, areaId, year, month, amount);
  };

  return {
    write,

    /** A receipt's months, replaced entirely (after an edit). */
    replace(receiptId: number, areaId: number, months: readonly Allocation[]): void {
      deleteAll.run(receiptId);
      write(receiptId, areaId, months);
    },

    /** A receipt's months from `from` onward, replaced (after a price change). */
    replaceFrom(receiptId: number, areaId: number, from: YearMonth, months: readonly Allocation[]) {
      deleteFrom.run(receiptId, monthIndex(from));
      write(receiptId, areaId, months);
    },

    /** Every month paid by receipts that still count, oldest receipt first. */
    countingForArea: (areaId: number): AllocationRow[] => selectCounting.all(areaId),
  };
}

export type AllocationRepository = ReturnType<typeof createAllocationRepository>;
