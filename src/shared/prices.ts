import { compareYearMonth, type YearMonth } from './dates';

/** One row of an area's rent price history: the price from that month onward. */
export interface PriceRow extends YearMonth {
  monthlyPrice: number;
}

/**
 * The price that applies to a month: the latest row that starts on or before
 * it. Null means the month is before the rent started (not applicable). A
 * price of 0 means the area is vacant that month. This is the only place that
 * decides a month's price.
 */
export function priceForMonth(prices: readonly PriceRow[], month: YearMonth): number | null {
  let found: PriceRow | null = null;
  for (const row of prices) {
    if (compareYearMonth(row, month) > 0) continue;
    if (!found || compareYearMonth(row, found) > 0) found = row;
  }
  return found ? found.monthlyPrice : null;
}

/** Price rows sorted oldest first. */
export function sortPrices<T extends YearMonth>(prices: readonly T[]): T[] {
  return [...prices].sort(compareYearMonth);
}
