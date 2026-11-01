import { fromMonthIndex, monthIndex, type YearMonth } from '@shared/dates';
import { HORIZON_MONTHS, type Allocation, type AllocationResult } from '@shared/payments';
import { priceForMonth, type PriceRow } from '@shared/prices';
import type { PaidHistory } from './monthStatus';

/**
 * Which months a payment pays (ARCHITECTURE.md section 7.1). A month is paid
 * whole or not at all, so a payment is a number of months, each at its full
 * rent. Pure: `today` and everything already paid are passed in.
 */

/** The months a payment may pay, oldest first: not paid yet, from `from` up to 24 months past today. */
function* openMonths(
  prices: readonly PriceRow[],
  paid: PaidHistory,
  from: number,
  today: YearMonth,
): Generator<Allocation> {
  const last = monthIndex(today) + HORIZON_MONTHS;
  for (let index = from; index <= last; index += 1) {
    // Null or 0: before the rent started, or vacant; these are skipped.
    const rent = priceForMonth(prices, fromMonthIndex(index));
    if (rent && !paid.get(index)) yield { ...fromMonthIndex(index), amount: rent };
  }
}

/**
 * The first `count` months not paid yet from `from` onward, each at its
 * rent, moving forward into later months and years. Asking for more months
 * than are open up to the horizon is refused.
 */
export function allocate(
  count: number,
  from: YearMonth,
  prices: readonly PriceRow[],
  paid: PaidHistory,
  today: YearMonth,
): AllocationResult {
  const open = [...openMonths(prices, paid, monthIndex(from), today)];
  if (open.length === 0) return { ok: false, reason: 'nothing_open' };
  if (count > open.length) return { ok: false, reason: 'too_much', open: open.length };
  return { ok: true, months: open.slice(0, count), open: open.length };
}

/**
 * Where the payment form starts by default: the oldest month not paid, from
 * when the rent started (`prices` oldest first). Null when everything up to
 * the horizon is paid (or the area has no rent).
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
