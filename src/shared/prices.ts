import type { Currency } from './currency';
import {
  compareYearMonth,
  fromMonthIndex,
  monthIndex,
  type DateString,
  type YearMonth,
} from './dates';

/**
 * One row of an area's rent price history: the price from that month onward,
 * in that period's currency (a new renter may pay in another currency).
 */
export interface PriceRow extends YearMonth {
  monthlyPrice: number;
  currency: Currency;
}

/** The row that applies to a month: the latest one starting on or before it, or null before the rent started. */
export function priceRowForMonth(prices: readonly PriceRow[], month: YearMonth): PriceRow | null {
  let found: PriceRow | null = null;
  for (const row of prices) {
    if (compareYearMonth(row, month) > 0) continue;
    if (!found || compareYearMonth(row, found) > 0) found = row;
  }
  return found;
}

/**
 * The price that applies to a month. Null means the month is before the rent
 * started (not applicable). A price of 0 means the area is vacant that month.
 * This is the only place that decides a month's price.
 */
export function priceForMonth(prices: readonly PriceRow[], month: YearMonth): number | null {
  return priceRowForMonth(prices, month)?.monthlyPrice ?? null;
}

/**
 * The currency of a month: that of its price row, or of the first row before
 * the rent started. Null for an area without rent rows.
 */
export function currencyForMonth(prices: readonly PriceRow[], month: YearMonth): Currency | null {
  return (priceRowForMonth(prices, month) ?? prices[0])?.currency ?? null;
}

/**
 * The currency new money from `from` is in: that of the first month with rent
 * on or after it, so a payment starting in a vacant month before a new renter's
 * currency takes the new one. Falls back to the month's own currency.
 */
export function paymentCurrency(prices: readonly PriceRow[], from: YearMonth): Currency | null {
  const current = priceRowForMonth(prices, from);
  if (current && current.monthlyPrice > 0) return current.currency;
  const next = prices.find((row) => row.monthlyPrice > 0 && compareYearMonth(row, from) > 0);
  return next?.currency ?? currencyForMonth(prices, from);
}

/**
 * The history as seen in one currency: rows in another currency count as
 * vacant (rent 0), so their months are left out of that currency's figures.
 * Months belong to exactly one currency, so totals are never mixed.
 */
export function pricesInCurrency(prices: readonly PriceRow[], currency: Currency): PriceRow[] {
  return prices.map((row) => (row.currency === currency ? row : { ...row, monthlyPrice: 0 }));
}

/** Price rows sorted oldest first. */
export function sortPrices<T extends YearMonth>(prices: readonly T[]): T[] {
  return [...prices].sort(compareYearMonth);
}

/**
 * The price history after setting `monthlyPrice` from `from` onward: a row for
 * the same month is replaced (one price per month), like saving does. The
 * currency stays that of the month unless a new one is given.
 */
export function withPriceFrom(
  prices: readonly PriceRow[],
  from: YearMonth,
  monthlyPrice: number,
  currency: Currency | null = null,
): PriceRow[] {
  const others = prices.filter((row) => compareYearMonth(row, from) !== 0);
  const rowCurrency = currency ?? currencyForMonth(prices, from) ?? 'IQD';
  return sortPrices([
    ...others,
    { year: from.year, month: from.month, monthlyPrice, currency: rowCurrency },
  ]);
}

/** When a renter was there: from their start date to their end date (none while they stay). */
export interface RenterSpan {
  startedOn: DateString;
  endedOn: DateString | null;
}

const dateMonthIndex = (date: DateString) => {
  const [year = 0, month = 0] = date.split('-').map(Number);
  return monthIndex({ year, month });
};

/**
 * The months a renter was there, as month indexes: from the month they
 * started to the last month they were in (one who left on the 1st was not in
 * that month).
 */
function renterMonths({ startedOn, endedOn }: RenterSpan): [number, number] {
  if (endedOn === null) return [dateMonthIndex(startedOn), Infinity];
  const last = dateMonthIndex(endedOn) - (endedOn.endsWith('-01') ? 1 : 0);
  return [dateMonthIndex(startedOn), last];
}

/**
 * The rent as charged: the price history with every month no renter was in
 * at rent 0, an empty month that nobody owes and nobody can pay (the
 * business, 2026-11-01: "nobody was in them"). A month already paid keeps its
 * rent, so money is never hidden. An area that never had a renter keeps its
 * history as it is.
 */
export function chargedRent(
  prices: readonly PriceRow[],
  renters: readonly RenterSpan[],
  paid: ReadonlyMap<number, number>,
): PriceRow[] {
  const first = prices[0];
  if (!first || renters.length === 0) return [...prices];
  const spans = renters.map(renterMonths);
  const isPaid = (index: number) => (paid.get(index) ?? 0) > 0;
  const charged = (index: number) =>
    isPaid(index) || spans.some(([from, to]) => index >= from && index <= to);
  // Only where a price, a renter or a paid month starts or ends can the charged rent change.
  const points = new Set(prices.map(monthIndex));
  for (const [from, to] of spans) {
    points.add(from);
    if (to !== Infinity) points.add(to + 1);
  }
  for (const index of paid.keys()) {
    if (isPaid(index)) points.add(index).add(index + 1);
  }
  const start = monthIndex(first);
  const rows: PriceRow[] = [];
  for (const index of [...points].filter((point) => point >= start).sort((a, b) => a - b)) {
    const month = fromMonthIndex(index);
    const row = priceRowForMonth(prices, month);
    if (!row) continue;
    const monthlyPrice = charged(index) ? row.monthlyPrice : 0;
    const previous = rows.at(-1);
    if (previous?.monthlyPrice === monthlyPrice && previous.currency === row.currency) continue;
    rows.push({ ...month, monthlyPrice, currency: row.currency });
  }
  return rows;
}
