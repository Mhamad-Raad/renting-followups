import { describe, expect, it } from 'vitest';
import {
  compareYearMonth,
  dateStringSchema,
  daysInMonth,
  formatDate,
  formatDateTime,
  formatMonthRuns,
  formatYearMonth,
  monthRuns,
  monthIndex,
  parseDateString,
  toDateString,
} from '@shared/dates';
import { priceForMonth, sortPrices, withPriceFrom, type PriceRow } from '@shared/prices';

describe('dates', () => {
  it('orders months across year boundaries', () => {
    expect(compareYearMonth({ year: 2025, month: 12 }, { year: 2026, month: 1 })).toBeLessThan(0);
    expect(monthIndex({ year: 2026, month: 1 }) - monthIndex({ year: 2025, month: 12 })).toBe(1);
  });

  it('knows month lengths, including leap years', () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2026, 12)).toBe(31);
  });

  it('accepts real dates and rejects impossible ones', () => {
    expect(parseDateString('2026-02-28')).toEqual({ year: 2026, month: 2, day: 28 });
    for (const bad of [
      '2026-02-30',
      '2026-13-01',
      '1999-01-01',
      '2026-1-1',
      '',
      '2026-02-28T00:00',
    ]) {
      expect(dateStringSchema.safeParse(bad).success, bad).toBe(false);
    }
    expect(toDateString(2026, 3, 5)).toBe('2026-03-05');
  });

  it('shows dates and months in the chosen digit style', () => {
    expect(formatDate('2026-10-20', 'western')).toBe('20/10/2026');
    expect(formatDate('2026-10-20', 'arabic')).toBe('٢٠/١٠/٢٠٢٦');
    expect(formatYearMonth({ year: 2026, month: 3 }, 'western')).toBe('3/2026');
  });
});

describe('priceForMonth', () => {
  const prices: PriceRow[] = [
    { year: 2026, month: 6, monthlyPrice: 300_000 },
    { year: 2025, month: 11, monthlyPrice: 250_000 },
    { year: 2026, month: 9, monthlyPrice: 0 },
  ];

  it.each([
    [2025, 10, null],
    [2025, 11, 250_000],
    [2026, 1, 250_000],
    [2026, 5, 250_000],
    [2026, 6, 300_000],
    [2026, 8, 300_000],
    [2026, 9, 0],
    [2030, 1, 0],
  ])('%i/%i costs %s', (year, month, expected) => {
    expect(priceForMonth(prices, { year, month })).toBe(expected);
  });

  it('has no price at all for an area without price rows', () => {
    expect(priceForMonth([], { year: 2026, month: 1 })).toBeNull();
  });

  it('sorts price rows oldest first', () => {
    expect(sortPrices(prices).map((row) => row.monthlyPrice)).toEqual([250_000, 300_000, 0]);
  });
});

describe('withPriceFrom', () => {
  const prices: PriceRow[] = [
    { year: 2026, month: 1, monthlyPrice: 100 },
    { year: 2026, month: 6, monthlyPrice: 200 },
  ];

  it('adds a new row in order, like saving a price change', () => {
    expect(withPriceFrom(prices, { year: 2026, month: 3 }, 150).map((r) => r.monthlyPrice)).toEqual(
      [100, 150, 200],
    );
  });

  it('replaces a row for the same month and leaves the original untouched', () => {
    expect(withPriceFrom(prices, { year: 2026, month: 6 }, 0)).toEqual([
      { year: 2026, month: 1, monthlyPrice: 100 },
      { year: 2026, month: 6, monthlyPrice: 0 },
    ]);
    expect(prices[1]?.monthlyPrice).toBe(200);
  });
});

describe('month runs', () => {
  const m = (month: number, year = 2026) => ({ year, month });

  it('groups consecutive months, across the end of a year, and keeps gaps apart', () => {
    expect(monthRuns([m(3), m(1), m(2), m(11, 2025), m(12, 2025), m(6)])).toEqual([
      { from: m(11, 2025), to: m(3) },
      { from: m(6), to: m(6) },
    ]);
    expect(monthRuns([])).toEqual([]);
  });

  it('shows runs as ranges and single months on their own', () => {
    expect(formatMonthRuns([m(1), m(2), m(3), m(5)], 'western', ', ')).toBe(
      '1/2026 – 3/2026, 5/2026',
    );
    // Each Arabic-Indic month is one isolated piece, so the range follows the text's direction.
    expect(formatMonthRuns([m(4), m(4)], 'arabic', '، ')).toBe('\u2066٤/٢٠٢٦\u2069');
    expect(formatMonthRuns([m(1), m(2), m(5)], 'arabic', ', ')).toBe(
      '\u2066١/٢٠٢٦\u2069 – \u2066٢/٢٠٢٦\u2069, \u2066٥/٢٠٢٦\u2069',
    );
  });
});

describe('formatDateTime', () => {
  it('shows the local day and a 24-hour time in the chosen digits', () => {
    const moment = new Date(2026, 9, 21, 9, 5);
    expect(formatDateTime(moment, 'western')).toBe('21/10/2026 09:05');
    // The date and the time are isolated pieces, so they keep their order in any language.
    expect(formatDateTime(moment, 'arabic')).toBe('\u2066٢١/١٠/٢٠٢٦\u2069 \u2066٠٩:٠٥\u2069');
  });
});
