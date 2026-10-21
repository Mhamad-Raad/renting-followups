import { compareYearMonth, type YearMonth } from '@shared/dates';
import type { AreaYear, MonthBox, MonthStatus, YearFigures, YearSummary } from '@shared/months';
import { priceForMonth, type PriceRow } from '@shared/prices';

/**
 * The single source of truth for month colours and yearly totals
 * (ARCHITECTURE.md section 6). Every screen, print, export and notification
 * uses these functions; nothing else decides whether a month is late.
 * Everything here is pure: `today` is always passed in.
 */

/** Paid amounts of one year, by month number (1–12). Missing months count as 0. */
export type PaidByMonth = ReadonlyMap<number, number>;

export const NO_PAYMENTS: PaidByMonth = new Map();

/**
 * The status of one month. `expected` is the month's rent: null before the
 * rent started and 0 while vacant, both of which are not applicable. Only the
 * month counts, not the day: a month turns late on the 1st of the next month.
 */
export function monthStatus(
  expected: number | null,
  paid: number,
  month: YearMonth,
  today: YearMonth,
): MonthStatus {
  if (expected === null || expected === 0) return 'not_applicable';
  if (paid >= expected) return 'paid';
  const when = compareYearMonth(month, today);
  if (when < 0) return 'late';
  if (when === 0) return 'due';
  return paid > 0 ? 'partial' : 'upcoming';
}

/** The 12 month boxes of one year, month 1 first. */
export function monthBoxes(
  prices: readonly PriceRow[],
  paid: PaidByMonth,
  year: number,
  today: YearMonth,
): MonthBox[] {
  return Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const expected = priceForMonth(prices, { year, month });
    const paidAmount = paid.get(month) ?? 0;
    return {
      month,
      expected,
      paid: paidAmount,
      status: monthStatus(expected, paidAmount, { year, month }, today),
    };
  });
}

/**
 * Expected, received and still owed for the year. Months that are not
 * applicable count for nothing, and a month never counts as more received than
 * its rent, so the amount still owed is never below 0.
 */
export function yearFigures(boxes: readonly MonthBox[]): YearFigures {
  let expected = 0;
  let received = 0;
  for (const box of boxes) {
    // Null or 0: before the rent started, or vacant.
    if (!box.expected) continue;
    expected += box.expected;
    received += Math.min(box.paid, box.expected);
  }
  return { expected, received, remaining: expected - received };
}

/** One word for the year, from the most urgent month (see `YearSummary`). */
export function yearSummary(boxes: readonly MonthBox[]): YearSummary {
  const has = (status: MonthStatus) => boxes.some((box) => box.status === status);
  if (has('late')) return 'late';
  if (has('due')) return 'due';
  if (has('partial')) return 'partial';
  if (has('paid')) return 'paid';
  return 'nothing_due';
}

/** Everything about one area's year: its boxes, figures and summary word. */
export function areaYear(
  prices: readonly PriceRow[],
  paid: PaidByMonth,
  year: number,
  today: YearMonth,
): AreaYear {
  const boxes = monthBoxes(prices, paid, year, today);
  return { year, boxes, figures: yearFigures(boxes), summary: yearSummary(boxes) };
}
