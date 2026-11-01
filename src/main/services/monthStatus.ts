import { CURRENCIES, type Currency } from '@shared/currency';
import { compareYearMonth, fromMonthIndex, monthIndex, type YearMonth } from '@shared/dates';
import type { CurrencyTotals } from '@shared/home';
import type { ReportStatus, ReportTotal } from '@shared/reports';
import type {
  AreaStanding,
  AreaYear,
  CurrencyAmount,
  CurrencyFigures,
  MonthBox,
  MonthStatus,
  YearFigures,
  YearSummary,
} from '@shared/months';
import {
  currencyForMonth,
  priceForMonth,
  pricesInCurrency,
  priceRowForMonth,
  type PriceRow,
} from '@shared/prices';

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
 * rent started and 0 while vacant, both of which are not applicable. A month
 * is paid whole or not at all: any money for it means it is paid, at the rent
 * it had when it was paid, even if the rent changed later. Only the month
 * counts, not the day: a month turns late on the 1st of the next month.
 */
export function monthStatus(
  expected: number | null,
  paid: number,
  month: YearMonth,
  today: YearMonth,
): MonthStatus {
  if (expected === null || expected === 0) return 'not_applicable';
  if (paid > 0) return 'paid';
  const when = compareYearMonth(month, today);
  if (when < 0) return 'late';
  return when === 0 ? 'due' : 'upcoming';
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
      currency: currencyForMonth(prices, { year, month }) ?? FALLBACK_CURRENCY,
    };
  });
}

/** Only for an area without any rent row, which the app never creates. */
const FALLBACK_CURRENCY: Currency = CURRENCIES[0];

/**
 * Rent, expected, received and still owed for the given boxes (a year, or one
 * month of it). Months that are not applicable count for nothing. A paid
 * month counts what was paid for it (its rent at the time, even if the rent
 * changed since); any other month counts its rent. Still owed counts only
 * months that have already come (late or due), never months still to come.
 * `rentMonth` is the month whose rent is shown.
 */
export function yearFigures(boxes: readonly MonthBox[], rentMonth: number): YearFigures {
  let expected = 0;
  let received = 0;
  let remaining = 0;
  for (const box of boxes) {
    // Null or 0: before the rent started, or vacant.
    if (!box.expected) continue;
    if (box.status === 'paid') {
      expected += box.paid;
      received += box.paid;
      continue;
    }
    expected += box.expected;
    if (box.status === 'late' || box.status === 'due') remaining += box.expected;
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
  const rentMonth = month ?? rentMonthOf(year, today);
  const inPeriod = (all: MonthBox[]) =>
    month === null ? all : all.filter((box) => box.month === month);
  const currencies = periodCurrencies(inPeriod(boxes), prices, { year, month: rentMonth });
  const figures = currencies.map((currency): CurrencyFigures => {
    if (currencies.length === 1) return { currency, ...yearFigures(inPeriod(boxes), rentMonth) };
    // Seen in one currency, the other currency's months count as vacant and add nothing.
    const own = inPeriod(monthBoxes(pricesInCurrency(prices, currency), paid, year, today));
    return { currency, ...yearFigures(own, ownRentMonth(own, rentMonth)) };
  });
  return { year, month, boxes, figures, summary: yearSummary(boxes) };
}

/**
 * The currencies of the period's months that have rent, oldest first; the
 * currency of `rentMonth` alone when no month has rent (vacant, not started).
 */
function periodCurrencies(
  boxes: readonly MonthBox[],
  prices: readonly PriceRow[],
  rentMonth: YearMonth,
): Currency[] {
  const used = [...new Set(boxes.filter((box) => box.expected).map((box) => box.currency))];
  return used.length > 0 ? used : [currencyForMonth(prices, rentMonth) ?? FALLBACK_CURRENCY];
}

/**
 * The month whose rent one currency's figures show: `rentMonth` when it is in
 * that currency, otherwise the nearest earlier month with rent in it (or the
 * first one, for a currency that only starts later).
 */
function ownRentMonth(own: readonly MonthBox[], rentMonth: number): number {
  const withRent = own.filter((box) => box.expected);
  if (withRent.some((box) => box.month === rentMonth)) return rentMonth;
  const before = withRent.filter((box) => box.month < rentMonth).at(-1);
  return (before ?? withRent[0])?.month ?? rentMonth;
}

/** A month that has come and is not paid: late (passed) or due (this month). */
export interface UnpaidMonth extends YearMonth {
  status: 'late' | 'due';
  /** Its rent, not paid, in `currency`. */
  owed: number;
  currency: Currency;
}

/**
 * Every month from when the rent started (`prices` oldest first) up to and
 * including this one that is not paid, oldest first. Vacant months and
 * months before the rent started never appear. Uses `monthStatus` for each.
 */
export function unpaidMonths(
  prices: readonly PriceRow[],
  paid: PaidHistory,
  today: YearMonth,
): UnpaidMonth[] {
  const start = prices[0];
  if (!start) return [];
  const months: UnpaidMonth[] = [];
  for (let index = monthIndex(start); index <= monthIndex(today); index += 1) {
    const month = fromMonthIndex(index);
    const row = priceRowForMonth(prices, month);
    const expected = row?.monthlyPrice ?? null;
    const paidAmount = paid.get(index) ?? 0;
    const status = monthStatus(expected, paidAmount, month, today);
    if (row && (status === 'late' || status === 'due')) {
      months.push({ ...month, status, owed: row.monthlyPrice, currency: row.currency });
    }
  }
  return months;
}

/**
 * How an area stands today across every year since its rent started: what it
 * still owes, how many past months are late, and whether this month is due.
 */
export function areaStanding(
  prices: readonly PriceRow[],
  paid: PaidHistory,
  today: YearMonth,
): AreaStanding {
  const months = unpaidMonths(prices, paid, today);
  return {
    owed: owedByCurrency(months),
    lateMonths: months.filter((month) => month.status === 'late').length,
    lateIn: owedByCurrency(months.filter((month) => month.status === 'late')).map(
      (owed) => owed.currency,
    ),
    dueNow: months.some((month) => month.status === 'due'),
  };
}

/** What unpaid months owe, added up per currency, IQD first; currencies owing nothing are left out. */
export function owedByCurrency(months: readonly UnpaidMonth[]): CurrencyAmount[] {
  return byCurrency(months).map(([currency, inCurrency]) => ({
    currency,
    amount: sum(inCurrency, (month) => month.owed),
  }));
}

/** An area as Home needs it: its current currency, this year's figures and its standing today. */
export interface AreaOverview {
  currency: Currency;
  figures: CurrencyFigures[];
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

/**
 * Home's cards: received, still owed and late areas, one set per currency in
 * use. An area counts as late under the currency of its late months.
 */
export function totalsByCurrency(areas: readonly AreaOverview[]): CurrencyTotals[] {
  const figures = areas.flatMap((area) => area.figures);
  return CURRENCIES.flatMap((currency) => {
    const inCurrency = figures.filter((part) => part.currency === currency);
    const late = areas.filter((area) => area.standing.lateIn.includes(currency));
    const inUse = inCurrency.length > 0 || late.length > 0;
    if (!inUse && !areas.some((area) => area.currency === currency)) return [];
    return [
      {
        currency,
        received: sum(inCurrency, (part) => part.received),
        remaining: sum(inCurrency, (part) => part.remaining),
        lateAreas: late.length,
      },
    ];
  });
}

/** The report's total rows: rent, received and still owed, one row per currency in use. */
export function reportTotals(
  rows: readonly { figures: readonly CurrencyFigures[] }[],
): ReportTotal[] {
  return byCurrency(rows.flatMap((row) => row.figures)).map(([currency, inCurrency]) => ({
    currency,
    rent: sum(inCurrency, (part) => part.rent ?? 0),
    received: sum(inCurrency, (part) => part.received),
    remaining: sum(inCurrency, (part) => part.remaining),
    areas: inCurrency.length,
  }));
}

/**
 * The report's status filter (ARCHITECTURE.md section 6). For a year: Late =
 * at least one late month; Not paid = this month is not paid and none is
 * late; Paid = every applicable month up to and including this month is paid
 * (no late or due month) and at least one month is paid, so a year with no
 * rent yet is not called Paid. For one chosen month, that month's own status
 * decides.
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
  if (status === 'due') return has('due') && !has('late');
  // Months up to now that are not paid are late or due, so "no late, no due" means
  // every applicable month up to now is paid.
  return has('paid') && !has('late', 'due');
}

/**
 * "Needs attention now": areas late in any year or due this month. Most late
 * months first; then by currency (amounts in different currencies are never
 * compared), then most owed in that currency.
 */
export function needsAttention<T extends { standing: AreaStanding }>(areas: readonly T[]): T[] {
  // The first currency owed (IQD first) and its amount stand for the area.
  const first = ({ standing }: T) => standing.owed[0];
  const order = (area: T) => CURRENCIES.indexOf(first(area)?.currency ?? CURRENCIES[0]);
  return areas
    .filter(({ standing }) => standing.lateMonths > 0 || standing.dueNow)
    .sort(
      (a, b) =>
        b.standing.lateMonths - a.standing.lateMonths ||
        order(a) - order(b) ||
        (first(b)?.amount ?? 0) - (first(a)?.amount ?? 0),
    );
}
