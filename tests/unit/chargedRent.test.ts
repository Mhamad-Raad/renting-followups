import { describe, expect, it } from 'vitest';
import { monthIndex } from '@shared/dates';
import { chargedRent, priceForMonth, type PriceRow, type RenterSpan } from '@shared/prices';

const RENT = 250_000;
const FROM_JANUARY: PriceRow[] = [{ year: 2026, month: 1, monthlyPrice: RENT, currency: 'IQD' }];
const NOTHING_PAID = new Map<number, number>();

/** The rent of each month of 2026, January first. */
function year(prices: PriceRow[]): (number | null)[] {
  return Array.from({ length: 12 }, (_, index) =>
    priceForMonth(prices, { year: 2026, month: index + 1 }),
  );
}

describe('chargedRent', () => {
  it('leaves a place that never had a renter as it is', () => {
    expect(chargedRent(FROM_JANUARY, [], NOTHING_PAID)).toEqual(FROM_JANUARY);
  });

  it('charges nothing before the renter came', () => {
    const renters: RenterSpan[] = [{ startedOn: '2026-09-15', endedOn: null }];
    expect(year(chargedRent(FROM_JANUARY, renters, NOTHING_PAID))).toEqual([
      ...Array<number>(8).fill(0),
      ...Array<number>(4).fill(RENT),
    ]);
  });

  it('charges nothing between a renter who left and the next one', () => {
    // Left on 1 July: June was theirs, July was not.
    const renters: RenterSpan[] = [
      { startedOn: '2026-01-01', endedOn: '2026-07-01' },
      { startedOn: '2026-09-01', endedOn: null },
    ];
    expect(year(chargedRent(FROM_JANUARY, renters, NOTHING_PAID))).toEqual([
      ...Array<number>(6).fill(RENT),
      0,
      0,
      ...Array<number>(4).fill(RENT),
    ]);
  });

  it('a renter who left mid-month still owes that month', () => {
    const renters: RenterSpan[] = [{ startedOn: '2026-01-01', endedOn: '2026-06-20' }];
    expect(year(chargedRent(FROM_JANUARY, renters, NOTHING_PAID)).slice(4, 8)).toEqual([
      RENT,
      RENT,
      0,
      0,
    ]);
  });

  it('keeps the rent of a paid month without a renter, and the price history otherwise', () => {
    const prices: PriceRow[] = [
      ...FROM_JANUARY,
      { year: 2026, month: 10, monthlyPrice: 300_000, currency: 'IQD' },
    ];
    const renters: RenterSpan[] = [{ startedOn: '2026-05-01', endedOn: null }];
    const paid = new Map([[monthIndex({ year: 2026, month: 2 }), RENT]]);
    expect(year(chargedRent(prices, renters, paid))).toEqual([
      0,
      RENT,
      0,
      0,
      ...Array<number>(5).fill(RENT),
      300_000,
      300_000,
      300_000,
    ]);
  });

  it('keeps months before the rent started as no rent at all', () => {
    const prices: PriceRow[] = [{ year: 2026, month: 3, monthlyPrice: RENT, currency: 'USD' }];
    const charged = chargedRent(prices, [{ startedOn: '2026-01-01', endedOn: null }], NOTHING_PAID);
    expect(year(charged).slice(0, 3)).toEqual([null, null, RENT]);
    expect(charged[0]).toMatchObject({ currency: 'USD' });
  });
});
