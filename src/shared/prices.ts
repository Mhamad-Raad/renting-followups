import type { Currency } from './currency';
import { compareYearMonth, type YearMonth } from './dates';

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
