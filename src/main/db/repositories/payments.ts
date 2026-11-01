import type { Currency } from '@shared/currency';
import { renterFirstMonth } from '@shared/areas';
import { monthIndex, type BusinessToday, type YearMonth } from '@shared/dates';
import {
  NOTHING_SKIPPED,
  type Allocation,
  type AllocationResult,
  type PaymentCreate,
  type PaymentCreateResult,
  type PaymentUpdate,
  type PaymentUpdateResult,
  type AreaReceiptsQuery,
  type PaymentVoidResult,
  type Receipt,
} from '@shared/payments';
import { paymentCurrency, pricesInCurrency } from '@shared/prices';
import { allocate, oldestOpenMonth } from '../../services/allocation';
import type { Db } from '../connection';
import type { AllocationRepository } from './allocations';
import type { AuditRepository } from './audit';
import type { PaidRepository } from './paid';
import type { RentRepository } from './rent';
import type { RenterRepository } from './renters';
import { createKeyValueStore } from './settings';
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
  allocations: AllocationRepository;
  audit: AuditRepository;
  paid: PaidRepository;
  rent: RentRepository;
  renters: RenterRepository;
}

const RECEIPT_COLUMNS = `id, receipt_number, is_backfill, area_id, renter_name_snapshot, currency,
  total_amount, paid_on, note, voided_at`;
const LAST_NUMBER_KEY = 'last_receipt_number';

export function createPaymentRepository(
  db: Db,
  { allocations, audit, paid, rent, renters }: Dependencies,
) {
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
  const selectHighestNumber = db.prepare<[], { highest: number | null }>(
    'SELECT MAX(receipt_number) AS highest FROM receipts',
  );
  const store = createKeyValueStore(db);
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
  /** A receipt is in one currency: new money takes that of the first month it can fill. */
  const currencyFrom = (areaId: number, from: YearMonth, fallback: Currency): Currency =>
    paymentCurrency(rent.forArea(areaId), from) ?? fallback;
  // Months in another currency count as vacant for this money, so it never fills them.
  const plan = (
    areaId: number,
    monthCount: number,
    from: YearMonth,
    today: YearMonth,
    currency: Currency,
    except = 0,
    anyStart = false,
  ) =>
    allocate(
      monthCount,
      from,
      pricesInCurrency(rent.forArea(areaId, except), currency),
      paid.history(areaId, except),
      today,
      anyStart ? null : earliestMonth(areaId, except),
    );

  /**
   * The first month a payment may pay: the current renter's first month, so
   * no one pays for a month before their renter started (owner's request,
   * 2026-11-01). Past records and single month boxes are not limited (see `plan`'s `anyStart`). A receipt being edited may still start where it already does,
   * for a receipt saved before this rule or for an earlier renter. Null while
   * the place has no renter: an earlier renter's old debts can then be paid.
   */
  const earliestMonth = (areaId: number, receiptId = 0): YearMonth | null => {
    const first = renterFirstMonth(renters.current(areaId));
    const own = receiptId ? selectAllocationsForReceipt.get(receiptId) : undefined;
    if (!first || !own) return first;
    return monthIndex(own) < monthIndex(first) ? { year: own.year, month: own.month } : first;
  };

  /**
   * A receipt's own months, when an edit keeps how many months it pays and its start month
   * (only the date or note change): they stay exactly as they are, with the rent they were
   * paid at, so a month taken out of the receipt (ARCHITECTURE.md section 7.4) is not quietly
   * filled again. Null when the months change.
   */
  const keptMonths = (receiptId: number, monthCount: number, from: YearMonth) => {
    const months = selectAllocationsForReceipt.all(receiptId);
    const first = months[0];
    const same =
      months.length === monthCount && first?.year === from.year && first.month === from.month;
    return same ? months : null;
  };

  /**
   * After an edit works a receipt's months out again, the months it already paid keep the
   * amount they were paid at (a rent change since does not re-price them); only months it
   * did not pay before take the current rent.
   */
  const atOwnRent = (receiptId: number, months: readonly Allocation[]): Allocation[] => {
    const own = new Map(
      selectAllocationsForReceipt.all(receiptId).map((paid) => [monthIndex(paid), paid.amount]),
    );
    return months.map((month) => ({
      ...month,
      amount: own.get(monthIndex(month)) ?? month.amount,
    }));
  };

  // Numbers only ever go up: the stored counter survives even if a receipt row were lost.
  const nextReceiptNumber = () => {
    const stored = Number(store.read(LAST_NUMBER_KEY) ?? 0);
    const highest = selectHighestNumber.get()?.highest ?? 0;
    const next = Math.max(Number.isSafeInteger(stored) ? stored : 0, highest) + 1;
    store.write(LAST_NUMBER_KEY, String(next));
    return next;
  };

  const monthsOf = (months: readonly Allocation[]) =>
    months.map(({ year, month, amount }) => ({ year, month, amount }));
  const totalOf = (months: readonly Allocation[]) =>
    months.reduce((total, month) => total + month.amount, 0);

  return {
    /** The months a payment would pay, and their rent, before saving. Null when the area does not exist. */
    preview(
      areaId: number,
      monthCount: number,
      from: YearMonth,
      today: YearMonth,
      receiptId: number | null,
      isBackfill = false,
    ): AllocationResult | null {
      const area = selectAreaCurrency.get(areaId);
      if (!area) return null;
      // A receipt of another area is ignored: only this area's receipts can be edited here.
      const found = receiptId === null ? undefined : selectReceipt.get(receiptId);
      const receipt = found?.area_id === areaId ? found : undefined;
      const currency = receipt?.currency ?? currencyFrom(areaId, from, area.currency);
      const pastRecord = isBackfill || receipt?.is_backfill === 1;
      const planned = plan(areaId, monthCount, from, today, currency, receipt?.id ?? 0, pastRecord);
      if (!receipt) return planned;
      const kept = keptMonths(receipt.id, monthCount, from);
      if (!kept) {
        return planned.ok ? { ...planned, months: atOwnRent(receipt.id, planned.months) } : planned;
      }
      // The receipt's own months are open to it, so at least that many can be paid.
      const open = Math.max(
        kept.length,
        planned.ok || planned.reason === 'too_much' ? planned.open : 0,
      );
      return { ok: true, months: kept, open, skipped: NOTHING_SKIPPED };
    },

    /** The month the payment form suggests: the oldest one not paid. */
    suggestedStart(areaId: number, today: YearMonth): YearMonth | null {
      if (!selectAreaCurrency.get(areaId)) return null;
      return oldestOpenMonth(
        rent.forArea(areaId),
        paid.history(areaId),
        today,
        earliestMonth(areaId),
      );
    },

    /** Saves a payment, its receipt number (unless it is a past record) and its months, all at once. */
    create: db.transaction((input: PaymentCreate, today: BusinessToday): PaymentCreateResult => {
      const area = selectAreaCurrency.get(input.areaId);
      if (!area) return { ok: false, reason: 'not_found' };
      if (input.paidOn > today.date) return { ok: false, reason: 'future_date' };
      const currency = currencyFrom(input.areaId, input.from, area.currency);
      const planned = plan(
        input.areaId,
        input.monthCount,
        input.from,
        today.month,
        currency,
        0,
        // A past record is history (an earlier renter's months too), so it may start anywhere.
        input.isBackfill || (input.monthBox === true && input.monthCount === 1),
      );
      if (!planned.ok) return { ok: false, reason: planned.reason };
      // A month box pays that month itself, never a later one in its place.
      const first = planned.months[0];
      if (input.monthBox && (first?.year !== input.from.year || first.month !== input.from.month))
        return { ok: false, reason: 'nothing_open' };
      const amount = totalOf(planned.months);
      const receiptNumber = input.isBackfill ? null : nextReceiptNumber();
      const renter = renters.current(input.areaId);
      const id = Number(
        insertReceipt.run(
          receiptNumber,
          input.isBackfill ? 1 : 0,
          input.areaId,
          renter?.fullName ?? null,
          renter?.phone ?? null,
          currency,
          amount,
          input.paidOn,
          input.note,
        ).lastInsertRowid,
      );
      allocations.write(id, input.areaId, planned.months);
      audit.record('create', 'receipt', id, {
        areaId: input.areaId,
        receiptNumber,
        isBackfill: input.isBackfill,
        amount,
        paidOn: input.paidOn,
        months: monthsOf(planned.months),
      });
      return { ok: true, id, receiptNumber };
    }),

    /** Corrects a receipt. It keeps its number; its months and amount are worked out again. */
    update: db.transaction((input: PaymentUpdate, today: BusinessToday): PaymentUpdateResult => {
      const before = selectReceipt.get(input.id);
      if (!before) return { ok: false, reason: 'not_found' };
      if (before.voided_at !== null) return { ok: false, reason: 'cancelled' };
      if (input.paidOn > today.date) return { ok: false, reason: 'future_date' };
      const previousMonths = selectAllocationsForReceipt.all(input.id);
      let months: readonly Allocation[] = previousMonths;
      if (!keptMonths(input.id, input.monthCount, input.from)) {
        const planned = plan(
          before.area_id,
          input.monthCount,
          input.from,
          today.month,
          before.currency,
          input.id,
          before.is_backfill === 1,
        );
        if (!planned.ok) return { ok: false, reason: planned.reason };
        months = atOwnRent(input.id, planned.months);
        allocations.replace(input.id, before.area_id, months);
      }
      const amount = totalOf(months);
      updateReceipt.run(amount, input.paidOn, input.note, input.id);
      audit.record('update', 'receipt', input.id, {
        before: {
          amount: before.total_amount,
          paidOn: before.paid_on,
          note: before.note,
          months: previousMonths,
        },
        after: {
          amount,
          paidOn: input.paidOn,
          note: input.note,
          months: monthsOf(months),
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
        .map((row) => toReceipt(row, byReceipt.get(row.id) ?? []));
    },
  };
}

function toReceipt(row: ReceiptRecord, allocations: Allocation[]): Receipt {
  return {
    id: row.id,
    receiptNumber: row.receipt_number,
    isBackfill: row.is_backfill === 1,
    renterName: row.renter_name_snapshot,
    currency: row.currency,
    totalAmount: row.total_amount,
    paidOn: row.paid_on,
    note: row.note,
    voided: row.voided_at !== null,
    allocations,
  };
}

export type PaymentRepository = ReturnType<typeof createPaymentRepository>;
