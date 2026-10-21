import { describe, expect, it } from 'vitest';
import { monthIndex, type YearMonth } from '@shared/dates';
import type { PriceRow } from '@shared/prices';
import { allocate, oldestOpenMonth, type PaidHistory } from '../../src/main/services/allocation';

const TODAY = { year: 2026, month: 5 };
const RENT = 250_000;
const FROM_JANUARY: PriceRow[] = [{ year: 2026, month: 1, monthlyPrice: RENT }];
const NOTHING_PAID: PaidHistory = new Map();

function paid(entries: [YearMonth, number][]): PaidHistory {
  return new Map(entries.map(([month, amount]) => [monthIndex(month), amount]));
}

/** The result as "month/year=amount" strings, easy to read in a failing test. */
function split(result: ReturnType<typeof allocate>): string[] | string {
  if (!result.ok) return result.reason;
  return result.months.map((m) => `${m.month}/${m.year}=${m.amount}`);
}

describe('allocate', () => {
  it('fills one month exactly', () => {
    expect(
      split(allocate(RENT, { year: 2026, month: 3 }, FROM_JANUARY, NOTHING_PAID, TODAY)),
    ).toEqual(['3/2026=250000']);
  });

  it('fills several months at once, the last one partly', () => {
    const result = allocate(
      2 * RENT + 50_000,
      { year: 2026, month: 3 },
      FROM_JANUARY,
      NOTHING_PAID,
      TODAY,
    );
    expect(split(result)).toEqual(['3/2026=250000', '4/2026=250000', '5/2026=50000']);
    expect(result.ok && result.months[2]).toMatchObject({ expected: RENT, paidBefore: 0 });
  });

  it('first tops up a month that is already partly paid', () => {
    const history = paid([[{ year: 2026, month: 3 }, 100_000]]);
    const result = allocate(200_000, { year: 2026, month: 3 }, FROM_JANUARY, history, TODAY);
    expect(split(result)).toEqual(['3/2026=150000', '4/2026=50000']);
    expect(result.ok && result.months[0]?.paidBefore).toBe(100_000);
  });

  it('skips months that are already fully paid', () => {
    const history = paid([[{ year: 2026, month: 3 }, RENT]]);
    expect(split(allocate(RENT, { year: 2026, month: 3 }, FROM_JANUARY, history, TODAY))).toEqual([
      '4/2026=250000',
    ]);
  });

  it('skips vacant months and months before the rent started', () => {
    const prices: PriceRow[] = [
      { year: 2026, month: 3, monthlyPrice: RENT },
      { year: 2026, month: 4, monthlyPrice: 0 },
      { year: 2026, month: 6, monthlyPrice: RENT },
    ];
    expect(
      split(allocate(2 * RENT, { year: 2026, month: 1 }, prices, NOTHING_PAID, TODAY)),
    ).toEqual(['3/2026=250000', '6/2026=250000']);
  });

  it('uses each month its own price', () => {
    const prices: PriceRow[] = [
      { year: 2026, month: 1, monthlyPrice: 100_000 },
      { year: 2026, month: 2, monthlyPrice: 300_000 },
    ];
    expect(split(allocate(400_000, { year: 2026, month: 1 }, prices, NOTHING_PAID, TODAY))).toEqual(
      ['1/2026=100000', '2/2026=300000'],
    );
  });

  it('continues across the end of the year', () => {
    expect(
      split(allocate(2 * RENT, { year: 2026, month: 12 }, FROM_JANUARY, NOTHING_PAID, TODAY)),
    ).toEqual(['12/2026=250000', '1/2027=250000']);
  });

  it('may reach 24 months past the current month, but no further', () => {
    // From May 2026, the horizon is May 2028: 25 months from May 2026 inclusive.
    const all = allocate(25 * RENT, TODAY, FROM_JANUARY, NOTHING_PAID, TODAY);
    expect(all.ok && all.months.at(-1)).toMatchObject({ year: 2028, month: 5 });
    expect(allocate(25 * RENT + 1, TODAY, FROM_JANUARY, NOTHING_PAID, TODAY)).toEqual({
      ok: false,
      reason: 'too_much',
    });
  });

  it('refuses a start beyond the horizon, or an area with nothing owed', () => {
    expect(allocate(1, { year: 2028, month: 6 }, FROM_JANUARY, NOTHING_PAID, TODAY).ok).toBe(false);
    const vacant: PriceRow[] = [{ year: 2026, month: 1, monthlyPrice: 0 }];
    expect(allocate(1, TODAY, vacant, NOTHING_PAID, TODAY).ok).toBe(false);
  });

  it('never splits an amount into a fraction: the parts always add up exactly', () => {
    const cents = 33_333;
    const prices: PriceRow[] = [{ year: 2026, month: 1, monthlyPrice: cents }];
    const result = allocate(100_000, { year: 2026, month: 1 }, prices, NOTHING_PAID, TODAY);
    expect(result.ok && result.months.reduce((sum, m) => sum + m.amount, 0)).toBe(100_000);
    expect(result.ok && result.months.every((m) => Number.isInteger(m.amount))).toBe(true);
  });
});

describe('oldestOpenMonth', () => {
  it('is the first month of the rent when nothing is paid', () => {
    expect(oldestOpenMonth(FROM_JANUARY, NOTHING_PAID, TODAY)).toEqual({ year: 2026, month: 1 });
  });

  it('is the first month not fully paid, even a partly paid one', () => {
    const history = paid([
      [{ year: 2026, month: 1 }, RENT],
      [{ year: 2026, month: 2 }, 10],
    ]);
    expect(oldestOpenMonth(FROM_JANUARY, history, TODAY)).toEqual({ year: 2026, month: 2 });
  });

  it('skips vacant months', () => {
    const prices: PriceRow[] = [
      { year: 2026, month: 1, monthlyPrice: 0 },
      { year: 2026, month: 4, monthlyPrice: RENT },
    ];
    expect(oldestOpenMonth(prices, NOTHING_PAID, TODAY)).toEqual({ year: 2026, month: 4 });
  });

  it('is null when there is no rent or everything up to the horizon is paid', () => {
    expect(oldestOpenMonth([], NOTHING_PAID, TODAY)).toBeNull();
    const history = new Map(
      Array.from({ length: 29 }, (_, i) => [monthIndex({ year: 2026, month: 1 }) + i, RENT]),
    );
    expect(oldestOpenMonth(FROM_JANUARY, history, TODAY)).toBeNull();
  });
});
