import { fromMonthIndex, monthIndex, type YearMonth } from '@shared/dates';
import {
  HORIZON_MONTHS,
  type Allocation,
  type AllocationResult,
  type PlannedMonth,
} from '@shared/payments';
import { priceForMonth, type PriceRow } from '@shared/prices';
import type { PaidHistory } from './monthStatus';

/**
 * How a payment is split across months (ARCHITECTURE.md section 7.1). Pure:
 * `today` and everything already paid are passed in.
 */

/** The months a payment may fill, oldest first: from `from` up to 24 months past today. */
function* openMonths(
  prices: readonly PriceRow[],
  paid: PaidHistory,
  from: number,
  today: YearMonth,
) {
  const last = monthIndex(today) + HORIZON_MONTHS;
  for (let index = from; index <= last; index += 1) {
    const month = fromMonthIndex(index);
    // Null or 0: before the rent started, or vacant; these are skipped.
    const expected = priceForMonth(prices, month);
    if (!expected) continue;
    const paidBefore = paid.get(index) ?? 0;
    if (paidBefore < expected) yield { ...month, expected, paidBefore };
  }
}

/**
 * Fills each open month up to its rent, starting from `from` and moving
 * forward into later months and years. A payment larger than everything owed
 * up to the horizon is refused rather than silently kept.
 */
export function allocate(
  amount: number,
  from: YearMonth,
  prices: readonly PriceRow[],
  paid: PaidHistory,
  today: YearMonth,
): AllocationResult {
  const months: PlannedMonth[] = [];
  let left = amount;
  for (const open of openMonths(prices, paid, monthIndex(from), today)) {
    const share = Math.min(left, open.expected - open.paidBefore);
    months.push({ ...open, amount: share });
    left -= share;
    if (left === 0) return { ok: true, months };
  }
  return { ok: false, reason: months.length === 0 ? 'nothing_open' : 'too_much' };
}

/**
 * Where the payment form starts by default: the oldest month that is not
 * fully paid, from when the rent started (`prices` oldest first). Null when everything up to the
 * horizon is paid (or the area has no rent).
 */
export function oldestOpenMonth(
  prices: readonly PriceRow[],
  paid: PaidHistory,
  today: YearMonth,
): YearMonth | null {
  const start = prices[0];
  if (!start) return null;
  for (const open of openMonths(prices, paid, monthIndex(start), today)) {
    return { year: open.year, month: open.month };
  }
  return null;
}

/** One receipt's money from the change month onward, to be shared out again. */
export interface ReshareReceipt {
  id: number;
  /** Where its money starts filling: the change month, or later if the receipt started later. */
  start: YearMonth;
  amount: number;
}

export type ReshareResult =
  | {
      ok: true;
      /** The new months of each receipt (from its start onward). */
      byReceipt: Map<number, Allocation[]>;
      /** What every month is paid afterwards. */
      paid: PaidHistory;
    }
  /** Some money would have no month to go to (for example vacant from then on). */
  | { ok: false; reason: 'no_room' };

/**
 * After a price change, shares the money of the affected receipts out again
 * with the new prices, oldest receipt first, each filling oldest month first
 * from its start. `kept` is what stays where it is (months before the change,
 * and receipts that only paid earlier months).
 */
export function reshare(
  receipts: readonly ReshareReceipt[],
  kept: PaidHistory,
  prices: readonly PriceRow[],
  today: YearMonth,
): ReshareResult {
  const paid = new Map(kept);
  const byReceipt = new Map<number, Allocation[]>();
  for (const receipt of receipts) {
    const result = allocate(receipt.amount, receipt.start, prices, paid, today);
    if (!result.ok) return { ok: false, reason: 'no_room' };
    const months = result.months.map(({ year, month, amount }) => ({ year, month, amount }));
    for (const month of months) {
      const index = monthIndex(month);
      paid.set(index, (paid.get(index) ?? 0) + month.amount);
    }
    byReceipt.set(receipt.id, months);
  }
  return { ok: true, byReceipt, paid };
}
