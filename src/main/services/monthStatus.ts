import { CURRENCIES, type Currency } from '@shared/currency';
import { compareYearMonth, fromMonthIndex, monthIndex, type YearMonth } from '@shared/dates';
import type { CurrencyTotals } from '@shared/home';
import type { ReportStatus, ReportTotal } from '@shared/reports';
import type {
  AreaStanding,
  AreaYear,
  MonthBox,
  MonthStatus,
  StatusChange,
  YearFigures,
  YearSummary,
} from '@shared/months';
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

/** Paid amounts of an area across all years, keyed by `monthIndex`. Missing months count as 0. */
export type PaidHistory = ReadonlyMap<number, number>;

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
 * Rent, expected, received and still owed for the given boxes (a year, or one
 * month of it). Months that are not applicable count for nothing, and a month
 * never counts as more received than its rent. Still owed counts only months
 * that have already come (late or due), never months still to come.
 * `rentMonth` is the month whose rent is shown.
 */
export function yearFigures(boxes: readonly MonthBox[], rentMonth: number): YearFigures {
  let expected = 0;
  let received = 0;
  let remaining = 0;
  for (const box of boxes) {
    // Null or 0: before the rent started, or vacant.
    if (!box.expected) continue;
    expected += box.expected;
    received += Math.min(box.paid, box.expected);
    if (box.status === 'late' || box.status === 'due') remaining += box.expected - box.paid;
  }
  const rent = boxes.find((box) => box.month === rentMonth)?.expected ?? null;
  return { rent, expected, received, remaining };
}

/**
 * The month whose rent stands for the whole year: this month in the current
 * year, December of a past year, January of a future one.
 */
function rentMonthOf(year: number, today: YearMonth): number {
  if (year === today.year) return today.month;
  return year < today.year ? 12 : 1;
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

/**
 * Everything about one area's year: its boxes, summary word, and the figures
 * for the whole year or, when `month` is given, for that month only.
 */
export function areaYear(
  prices: readonly PriceRow[],
  paid: PaidByMonth,
  year: number,
  today: YearMonth,
  month: number | null = null,
): AreaYear {
  const boxes = monthBoxes(prices, paid, year, today);
  const figures =
    month === null
      ? yearFigures(boxes, rentMonthOf(year, today))
      : yearFigures(
          boxes.filter((box) => box.month === month),
          month,
        );
  return { year, month, boxes, figures, summary: yearSummary(boxes) };
}

/**
 * How an area stands today across every year since its rent started
 * (`prices` oldest first): what it still owes, how many past months are late,
 * and whether this month is due. Uses `monthStatus` for every month.
 */
export function areaStanding(
  prices: readonly PriceRow[],
  paid: PaidHistory,
  today: YearMonth,
): AreaStanding {
  const standing: AreaStanding = { owed: 0, lateMonths: 0, dueNow: false };
  const start = prices[0];
  if (!start) return standing;
  for (let index = monthIndex(start); index <= monthIndex(today); index += 1) {
    const month = fromMonthIndex(index);
    const expected = priceForMonth(prices, month);
    const paidAmount = paid.get(index) ?? 0;
    const status = monthStatus(expected, paidAmount, month, today);
    if (status !== 'late' && status !== 'due') continue;
    standing.owed += (expected ?? 0) - paidAmount;
    if (status === 'late') standing.lateMonths += 1;
    else standing.dueNow = true;
  }
  return standing;
}

/**
 * The months from `from` onward whose money or status would change when the
 * price history goes from `before` to `after` and the paid amounts go from
 * `paidBefore` to `paidAfter` (the money shared out again). Used to warn before
 * a price change so the past is never rewritten silently.
 */
export function statusChanges(
  before: readonly PriceRow[],
  after: readonly PriceRow[],
  paidBefore: PaidHistory,
  paidAfter: PaidHistory,
  from: YearMonth,
  today: YearMonth,
): StatusChange[] {
  const indexes = [...new Set([...paidBefore.keys(), ...paidAfter.keys()])]
    .filter((index) => index >= monthIndex(from))
    .sort((a, b) => a - b);
  const changes: StatusChange[] = [];
  for (const index of indexes) {
    const month = fromMonthIndex(index);
    const was = paidBefore.get(index) ?? 0;
    const will = paidAfter.get(index) ?? 0;
    const statusBefore = monthStatus(priceForMonth(before, month), was, month, today);
    const statusAfter = monthStatus(priceForMonth(after, month), will, month, today);
    if (statusBefore !== statusAfter || was !== will) {
      changes.push({
        ...month,
        before: statusBefore,
        after: statusAfter,
        paidBefore: was,
        paidAfter: will,
      });
    }
  }
  return changes;
}

/** An area as Home needs it: its currency, this year's figures and its standing today. */
export interface AreaOverview {
  currency: Currency;
  figures: YearFigures;
  standing: AreaStanding;
}

/** Groups items by currency, IQD first, leaving out currencies with no items. */
function byCurrency<T extends { currency: Currency }>(items: readonly T[]): [Currency, T[]][] {
  return CURRENCIES.flatMap((currency) => {
    const inCurrency = items.filter((item) => item.currency === currency);
    return inCurrency.length === 0 ? [] : [[currency, inCurrency] as [Currency, T[]]];
  });
}

const sum = <T>(items: readonly T[], value: (item: T) => number) =>
  items.reduce((total, item) => total + value(item), 0);

/** Home's cards: received, still owed and late areas, one set per currency in use. */
export function totalsByCurrency(areas: readonly AreaOverview[]): CurrencyTotals[] {
  return byCurrency(areas).map(([currency, inCurrency]) => ({
    currency,
    received: sum(inCurrency, (area) => area.figures.received),
    remaining: sum(inCurrency, (area) => area.figures.remaining),
    lateAreas: inCurrency.filter((area) => area.standing.lateMonths > 0).length,
  }));
}

/** The report's total rows: rent, received and still owed, one row per currency in use. */
export function reportTotals(
  rows: readonly { currency: Currency; figures: YearFigures }[],
): ReportTotal[] {
  return byCurrency(rows).map(([currency, inCurrency]) => ({
    currency,
    rent: sum(inCurrency, (row) => row.figures.rent ?? 0),
    received: sum(inCurrency, (row) => row.figures.received),
    remaining: sum(inCurrency, (row) => row.figures.remaining),
    areas: inCurrency.length,
  }));
}

/**
 * The report's status filter (ARCHITECTURE.md section 6). For a year: Late =
 * at least one late month; Partial = at least one orange month (due or partly
 * paid) and none late; Paid = every applicable month up to and including this
 * month is paid, with at least one such month. For one chosen month, that
 * month's own status decides.
 */
export function matchesReportStatus(
  boxes: readonly MonthBox[],
  status: ReportStatus,
  month: number | null,
): boolean {
  if (status === 'all') return true;
  const chosen = month === null ? boxes : boxes.filter((box) => box.month === month);
  const has = (...statuses: MonthStatus[]) => chosen.some((box) => statuses.includes(box.status));
  if (status === 'late') return has('late');
  if (status === 'partial') return has('due', 'partial') && !has('late');
  // Months up to now that are not fully paid are late or due, so "no late, no due" means
  // every applicable month up to now is paid.
  return has('paid') && !has('late', 'due');
}

/**
 * "Needs attention now": areas late in any year or due this month. Most late
 * months first; then by currency (amounts in different currencies are never
 * compared), then most owed.
 */
export function needsAttention<T extends { currency: Currency; standing: AreaStanding }>(
  areas: readonly T[],
): T[] {
  return areas
    .filter(({ standing }) => standing.lateMonths > 0 || standing.dueNow)
    .sort(
      (a, b) =>
        b.standing.lateMonths - a.standing.lateMonths ||
        CURRENCIES.indexOf(a.currency) - CURRENCIES.indexOf(b.currency) ||
        b.standing.owed - a.standing.owed,
    );
}
