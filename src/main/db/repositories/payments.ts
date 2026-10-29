import type { Currency } from '@shared/currency';
import { monthIndex, type BusinessToday, type DateString, type YearMonth } from '@shared/dates';
import type { ReceiptPrintData } from '@shared/printing';
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
import { currencyForMonth, priceForMonth, pricesInCurrency } from '@shared/prices';
import { allocate, oldestOpenMonth } from '../../services/allocation';
import type { Db } from '../connection';
import type { AllocationRepository } from './allocations';
import type { AuditRepository } from './audit';
import type { PaidRepository } from './paid';
import type { PriceRepository } from './prices';
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
  prices: PriceRepository;
  renters: RenterRepository;
}

const RECEIPT_COLUMNS = `id, receipt_number, is_backfill, area_id, renter_name_snapshot, currency,
  total_amount, paid_on, note, voided_at`;
const LAST_NUMBER_KEY = 'last_receipt_number';

export function createPaymentRepository(
  db: Db,
  { allocations, audit, paid, prices, renters }: Dependencies,
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
  const selectPrintExtra = db.prepare<
    [number],
    { area_name: string; renter_phone_snapshot: string | null; print_count: number }
  >(
    // The receipt already names the renter, so an area without a name is shown by its category.
    `SELECT COALESCE(NULLIF(a.name, ''), c.name) AS area_name, r.renter_phone_snapshot, r.print_count
     FROM receipts r
     JOIN areas a ON a.id = r.area_id
     JOIN categories c ON c.id = a.category_id
     WHERE r.id = ?`,
  );
  const addPrint = db.prepare<[number]>(
    'UPDATE receipts SET print_count = print_count + 1 WHERE id = ?',
  );
  const markVoided = db.prepare<[number]>(
    `UPDATE receipts SET voided_at = ${NOW_SQL} WHERE id = ?`,
  );
  /** A receipt is in one currency: new money takes the currency of its first month. */
  const currencyFrom = (areaId: number, from: YearMonth, fallback: Currency): Currency =>
    currencyForMonth(prices.forArea(areaId), from) ?? fallback;
  // Months in another currency count as vacant for this money, so it never fills them.
  const plan = (
    areaId: number,
    amount: number,
    from: YearMonth,
    today: YearMonth,
    currency: Currency,
    except = 0,
  ) =>
    allocate(
      amount,
      from,
      pricesInCurrency(prices.forArea(areaId), currency),
      paid.history(areaId, except),
      today,
    );

  /**
   * A receipt's own months, when an edit keeps its amount and start month (only the date or
   * note change): they stay exactly as they are, so a month taken out of the receipt
   * (ARCHITECTURE.md section 7.4) is not quietly filled again. Null when the money changes.
   */
  const keptMonths = (receiptId: number, amount: number, from: YearMonth) => {
    const months = selectAllocationsForReceipt.all(receiptId);
    const first = months[0];
    const same =
      selectReceipt.get(receiptId)?.total_amount === amount &&
      first?.year === from.year &&
      first.month === from.month;
    return same ? months : null;
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

  return {
    /** The months a payment would fill, before saving. Null when the area does not exist. */
    preview(
      areaId: number,
      amount: number,
      from: YearMonth,
      today: YearMonth,
      receiptId: number | null,
    ): AllocationResult | null {
      const area = selectAreaCurrency.get(areaId);
      if (!area) return null;
      const kept = receiptId === null ? null : keptMonths(receiptId, amount, from);
      if (!kept) {
        const receipt = receiptId === null ? undefined : selectReceipt.get(receiptId);
        const currency = receipt?.currency ?? currencyFrom(areaId, from, area.currency);
        return plan(areaId, amount, from, today, currency, receiptId ?? 0);
      }
      const history = paid.history(areaId, receiptId ?? 0);
      const rents = prices.forArea(areaId);
      return {
        ok: true,
        months: kept.map((paidMonth) => ({
          ...paidMonth,
          expected: priceForMonth(rents, paidMonth) ?? 0,
          paidBefore: history.get(monthIndex(paidMonth)) ?? 0,
        })),
      };
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
      const currency = currencyFrom(input.areaId, input.from, area.currency);
      const planned = plan(input.areaId, input.amount, input.from, today.month, currency);
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
          currency,
          input.amount,
          input.paidOn,
          input.note,
        ).lastInsertRowid,
      );
      allocations.write(id, input.areaId, planned.months);
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
      const previousMonths = selectAllocationsForReceipt.all(input.id);
      let months: readonly Allocation[] = previousMonths;
      if (!keptMonths(input.id, input.amount, input.from)) {
        const planned = plan(
          before.area_id,
          input.amount,
          input.from,
          today.month,
          before.currency,
          input.id,
        );
        if (!planned.ok) return planned;
        months = planned.months;
        allocations.replace(input.id, before.area_id, months);
      }
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

    /**
     * What a receipt page shows. Null when it does not exist, is cancelled or
     * belongs to a deleted area; 'past_record' for a past payment, which has
     * no receipt number and is never printed as a receipt.
     */
    printData(id: number, printedOn: DateString): ReceiptPrintData | 'past_record' | null {
      const row = selectReceipt.get(id);
      const extra = selectPrintExtra.get(id);
      if (!row || !extra || row.voided_at !== null) return null;
      if (row.is_backfill === 1) return 'past_record';
      return {
        receipt: toReceipt(row, selectAllocationsForReceipt.all(id)),
        areaName: extra.area_name,
        renterPhone: extra.renter_phone_snapshot,
        printCount: extra.print_count,
        printedOn,
      };
    },

    /** Counts a finished print, so every later print is stamped "Copy". */
    markPrinted(id: number): void {
      addPrint.run(id);
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
