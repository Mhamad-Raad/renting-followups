import type { Currency } from '@shared/currency';
import { monthIndex, type BusinessToday, type YearMonth } from '@shared/dates';
import type {
  Allocation,
  AllocationResult,
  PaymentCreate,
  PaymentCreateResult,
  PaymentUpdate,
  PaymentUpdateResult,
  AreaReceiptsQuery,
  PaymentVoidResult,
  Receipt,
} from '@shared/payments';
import {
  allocate,
  oldestOpenMonth,
  reshare,
  type ReshareReceipt,
  type ReshareResult,
} from '../../services/allocation';
import type { PaidHistory } from '../../services/monthStatus';
import type { PriceRow } from '@shared/prices';
import type { Db } from '../connection';
import type { AuditRepository } from './audit';
import type { PaidRepository } from './paid';
import type { PriceRepository } from './prices';
import type { RenterRepository } from './renters';
import { NOW_SQL } from './sql';

interface ReceiptRecord {
  id: number;
  receipt_number: number | null;
  is_backfill: 0 | 1;
  area_id: number;
  renter_name_snapshot: string | null;
  currency: Currency;
  total_amount: number;
  paid_on: string;
  note: string;
  voided_at: string | null;
}

interface AllocationRecord {
  receipt_id: number;
  year: number;
  month: number;
  amount: number;
}

interface Dependencies {
  audit: AuditRepository;
  paid: PaidRepository;
  prices: PriceRepository;
  renters: RenterRepository;
}

const RECEIPT_COLUMNS = `id, receipt_number, is_backfill, area_id, renter_name_snapshot, currency,
  total_amount, paid_on, note, voided_at`;
const LAST_NUMBER_KEY = 'last_receipt_number';

export function createPaymentRepository(db: Db, { audit, paid, prices, renters }: Dependencies) {
  const selectAreaCurrency = db.prepare<[number], { currency: Currency }>(
    'SELECT currency FROM areas WHERE id = ? AND deleted_at IS NULL',
  );
  const selectReceipt = db.prepare<[number], ReceiptRecord>(
    `SELECT ${RECEIPT_COLUMNS} FROM receipts r
     WHERE id = ? AND area_id IN (SELECT id FROM areas WHERE deleted_at IS NULL)`,
  );
  const selectReceiptsForArea = db.prepare<[number], ReceiptRecord>(
    `SELECT ${RECEIPT_COLUMNS} FROM receipts
     WHERE area_id = ? AND area_id IN (SELECT id FROM areas WHERE deleted_at IS NULL)
     ORDER BY paid_on DESC, id DESC`,
  );
  const selectAllocationsForArea = db.prepare<[number], AllocationRecord>(
    `SELECT receipt_id, year, month, amount FROM payment_allocations
     WHERE area_id = ? ORDER BY year, month`,
  );
  const selectAllocationsForReceipt = db.prepare<[number], Allocation>(
    'SELECT year, month, amount FROM payment_allocations WHERE receipt_id = ? ORDER BY year, month',
  );
  const selectLastNumber = db.prepare<[string], { value: string }>(
    'SELECT value FROM settings WHERE key = ?',
  );
  const selectHighestNumber = db.prepare<[], { highest: number | null }>(
    'SELECT MAX(receipt_number) AS highest FROM receipts',
  );
  const saveLastNumber = db.prepare<[string, string]>(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = ${NOW_SQL}`,
  );
  const insertReceipt = db.prepare<
    [number | null, number, number, string | null, string | null, Currency, number, string, string]
  >(
    `INSERT INTO receipts (receipt_number, is_backfill, area_id, renter_name_snapshot,
       renter_phone_snapshot, currency, total_amount, paid_on, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const updateReceipt = db.prepare<[number, string, string, number]>(
    'UPDATE receipts SET total_amount = ?, paid_on = ?, note = ? WHERE id = ?',
  );
  const markVoided = db.prepare<[number]>(
    `UPDATE receipts SET voided_at = ${NOW_SQL} WHERE id = ?`,
  );
  const insertAllocation = db.prepare<[number, number, number, number, number]>(
    `INSERT INTO payment_allocations (receipt_id, area_id, year, month, amount)
     VALUES (?, ?, ?, ?, ?)`,
  );
  const selectCountingAllocations = db.prepare<[number], AllocationRecord>(
    `SELECT a.receipt_id, a.year, a.month, a.amount
     FROM payment_allocations a JOIN receipts r ON r.id = a.receipt_id
     WHERE a.area_id = ? AND r.voided_at IS NULL
     ORDER BY r.paid_on, r.id, a.year, a.month`,
  );
  const deleteAllocationsFrom = db.prepare<[number, number]>(
    `DELETE FROM payment_allocations
     WHERE receipt_id = ? AND year * 12 + (month - 1) >= ?`,
  );
  const deleteAllocations = db.prepare<[number]>(
    'DELETE FROM payment_allocations WHERE receipt_id = ?',
  );

  const plan = (areaId: number, amount: number, from: YearMonth, today: YearMonth, except = 0) =>
    allocate(amount, from, prices.forArea(areaId), paid.history(areaId, except), today);

  // Numbers only ever go up: the stored counter survives even if a receipt row were lost.
  const nextReceiptNumber = () => {
    const stored = Number(selectLastNumber.get(LAST_NUMBER_KEY)?.value ?? 0);
    const highest = selectHighestNumber.get()?.highest ?? 0;
    const next = Math.max(Number.isSafeInteger(stored) ? stored : 0, highest) + 1;
    saveLastNumber.run(LAST_NUMBER_KEY, String(next));
    return next;
  };

  const writeAllocations = (receiptId: number, areaId: number, months: readonly Allocation[]) => {
    for (const { year, month, amount } of months) {
      insertAllocation.run(receiptId, areaId, year, month, amount);
    }
  };

  const monthsOf = (months: readonly Allocation[]) =>
    months.map(({ year, month, amount }) => ({ year, month, amount }));

  return {
    /**
     * How the money already paid from `from` onward would be shared out again
     * with `newPrices` (oldest receipt first), plus what is paid now, for the
     * warning and for saving. Cancelled receipts are left alone.
     */
    planReshare(
      areaId: number,
      from: YearMonth,
      newPrices: readonly PriceRow[],
      today: YearMonth,
    ): { now: PaidHistory; plan: ReshareResult } {
      const fromIndex = monthIndex(from);
      const now = new Map<number, number>();
      const kept = new Map<number, number>();
      const receipts = new Map<number, ReshareReceipt>();
      for (const row of selectCountingAllocations.all(areaId)) {
        const index = monthIndex(row);
        now.set(index, (now.get(index) ?? 0) + row.amount);
        const receipt = receipts.get(row.receipt_id);
        if (index < fromIndex) {
          kept.set(index, (kept.get(index) ?? 0) + row.amount);
          // A receipt that started before the change restarts at the change month.
          if (!receipt)
            receipts.set(row.receipt_id, { id: row.receipt_id, start: from, amount: 0 });
        } else if (receipt) {
          receipt.amount += row.amount;
        } else {
          receipts.set(row.receipt_id, {
            id: row.receipt_id,
            start: { year: row.year, month: row.month },
            amount: row.amount,
          });
        }
      }
      // Rows come oldest receipt first, so the map keeps that order.
      const affected = [...receipts.values()].filter((receipt) => receipt.amount > 0);
      return { now, plan: reshare(affected, kept, newPrices, today) };
    },

    /** Saves a re-share: each receipt's months from `from` onward are replaced. Call inside a transaction. */
    applyReshare(areaId: number, from: YearMonth, byReceipt: ReadonlyMap<number, Allocation[]>) {
      for (const [receiptId, months] of byReceipt) {
        deleteAllocationsFrom.run(receiptId, monthIndex(from));
        writeAllocations(receiptId, areaId, months);
      }
    },

    /** The months a payment would fill, before saving. Null when the area does not exist. */
    preview(
      areaId: number,
      amount: number,
      from: YearMonth,
      today: YearMonth,
      receiptId: number | null,
    ): AllocationResult | null {
      if (!selectAreaCurrency.get(areaId)) return null;
      return plan(areaId, amount, from, today, receiptId ?? 0);
    },

    /** The month the payment form suggests: the oldest one not fully paid. */
    suggestedStart(areaId: number, today: YearMonth): YearMonth | null {
      if (!selectAreaCurrency.get(areaId)) return null;
      return oldestOpenMonth(prices.forArea(areaId), paid.history(areaId), today);
    },

    /** Saves a payment, its receipt number (unless it is a past record) and its months, all at once. */
    create: db.transaction((input: PaymentCreate, today: BusinessToday): PaymentCreateResult => {
      const area = selectAreaCurrency.get(input.areaId);
      if (!area) return { ok: false, reason: 'not_found' };
      if (input.paidOn > today.date) return { ok: false, reason: 'future_date' };
      const planned = plan(input.areaId, input.amount, input.from, today.month);
      if (!planned.ok) return planned;
      const receiptNumber = input.isBackfill ? null : nextReceiptNumber();
      const renter = renters.current(input.areaId);
      const id = Number(
        insertReceipt.run(
          receiptNumber,
          input.isBackfill ? 1 : 0,
          input.areaId,
          renter?.fullName ?? null,
          renter?.phone ?? null,
          area.currency,
          input.amount,
          input.paidOn,
          input.note,
        ).lastInsertRowid,
      );
      writeAllocations(id, input.areaId, planned.months);
      audit.record('create', 'receipt', id, {
        areaId: input.areaId,
        receiptNumber,
        isBackfill: input.isBackfill,
        amount: input.amount,
        paidOn: input.paidOn,
        months: monthsOf(planned.months),
      });
      return { ok: true, id, receiptNumber };
    }),

    /** Corrects a receipt. It keeps its number; its months are worked out again. */
    update: db.transaction((input: PaymentUpdate, today: BusinessToday): PaymentUpdateResult => {
      const before = selectReceipt.get(input.id);
      if (!before) return { ok: false, reason: 'not_found' };
      if (before.voided_at !== null) return { ok: false, reason: 'cancelled' };
      if (input.paidOn > today.date) return { ok: false, reason: 'future_date' };
      const planned = plan(before.area_id, input.amount, input.from, today.month, input.id);
      if (!planned.ok) return planned;
      const previousMonths = selectAllocationsForReceipt.all(input.id);
      deleteAllocations.run(input.id);
      writeAllocations(input.id, before.area_id, planned.months);
      updateReceipt.run(input.amount, input.paidOn, input.note, input.id);
      audit.record('update', 'receipt', input.id, {
        before: {
          amount: before.total_amount,
          paidOn: before.paid_on,
          note: before.note,
          months: previousMonths,
        },
        after: {
          amount: input.amount,
          paidOn: input.paidOn,
          note: input.note,
          months: monthsOf(planned.months),
        },
      });
      return { ok: true };
    }),

    /** Cancels a receipt: it stays listed, crossed out, and stops counting. Its number is never reused. */
    void: db.transaction((id: number): PaymentVoidResult => {
      const receipt = selectReceipt.get(id);
      if (!receipt) return { ok: false, reason: 'not_found' };
      if (receipt.voided_at !== null) return { ok: false, reason: 'cancelled' };
      markVoided.run(id);
      audit.record('void', 'receipt', id, {
        receiptNumber: receipt.receipt_number,
        amount: receipt.total_amount,
      });
      return { ok: true };
    }),

    /**
     * The receipts of an area that paid any month of `year` (or only of
     * `month`), newest first, with the months each one paid. Cancelled ones
     * are included: they still name the months they had paid.
     */
    forArea({ areaId, year, month }: AreaReceiptsQuery): Receipt[] {
      const byReceipt = new Map<number, Allocation[]>();
      for (const row of selectAllocationsForArea.all(areaId)) {
        const list = byReceipt.get(row.receipt_id) ?? [];
        list.push({ year: row.year, month: row.month, amount: row.amount });
        byReceipt.set(row.receipt_id, list);
      }
      const inPeriod = (paid: Allocation) =>
        paid.year === year && (month === null || paid.month === month);
      return selectReceiptsForArea
        .all(areaId)
        .filter((row) => byReceipt.get(row.id)?.some(inPeriod))
        .map((row) => ({
          id: row.id,
          receiptNumber: row.receipt_number,
          isBackfill: row.is_backfill === 1,
          renterName: row.renter_name_snapshot,
          currency: row.currency,
          totalAmount: row.total_amount,
          paidOn: row.paid_on,
          note: row.note,
          voided: row.voided_at !== null,
          allocations: byReceipt.get(row.id) ?? [],
        }));
    },
  };
}

export type PaymentRepository = ReturnType<typeof createPaymentRepository>;
