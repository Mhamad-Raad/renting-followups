import { describe, expect, it } from 'vitest';
import type { MonthBox, MonthStatus } from '@shared/months';
import type { PriceRow } from '@shared/prices';
import {
  areaYear,
  monthBoxes,
  monthStatus,
  NO_PAYMENTS,
  yearFigures,
  yearSummary,
} from '../../src/main/services/monthStatus';

const TODAY = { year: 2026, month: 5 };
const RENT = 250_000;
const statuses = (boxes: readonly MonthBox[]) => boxes.map((box) => box.status);
const paidMap = (entries: [number, number][]) => new Map(entries);

describe('monthStatus: the status table', () => {
  const past = { year: 2026, month: 4 };
  const future = { year: 2026, month: 6 };

  it.each<[string, number | null, number, MonthStatus]>([
    ['before the rent started', null, 0, 'not_applicable'],
    ['vacant (price 0)', 0, 0, 'not_applicable'],
    ['vacant even with money on it', 0, 100, 'not_applicable'],
  ])('%s is not applicable, in the past, now and in the future', (_, expected, paid, status) => {
    for (const month of [past, TODAY, future]) {
      expect(monthStatus(expected, paid, month, TODAY)).toBe(status);
    }
  });

  it('a fully paid month is paid, whether past, current or future', () => {
    for (const month of [past, TODAY, future]) {
      expect(monthStatus(RENT, RENT, month, TODAY)).toBe('paid');
    }
  });

  it('more than the rent still counts as paid', () => {
    expect(monthStatus(RENT, RENT + 1, past, TODAY)).toBe('paid');
  });

  it('a past month with nothing or only part paid is late', () => {
    expect(monthStatus(RENT, 0, past, TODAY)).toBe('late');
    expect(monthStatus(RENT, 50_000, past, TODAY)).toBe('late');
    expect(monthStatus(RENT, RENT - 1, past, TODAY)).toBe('late');
  });

  it('the current month with nothing or only part paid is due', () => {
    expect(monthStatus(RENT, 0, TODAY, TODAY)).toBe('due');
    expect(monthStatus(RENT, 50_000, TODAY, TODAY)).toBe('due');
  });

  it('a future month with part paid is partial', () => {
    expect(monthStatus(RENT, 50_000, future, TODAY)).toBe('partial');
  });

  it('a future month with nothing paid is upcoming', () => {
    expect(monthStatus(RENT, 0, future, TODAY)).toBe('upcoming');
  });

  it('a month turns late on the 1st of the next month, with no grace period', () => {
    const may = { year: 2026, month: 5 };
    expect(monthStatus(RENT, 0, may, { year: 2026, month: 5 })).toBe('due');
    expect(monthStatus(RENT, 0, may, { year: 2026, month: 6 })).toBe('late');
  });

  it('a partial payment is orange until its month passes, then red', () => {
    const june = { year: 2026, month: 6 };
    expect(monthStatus(RENT, 50_000, june, { year: 2026, month: 5 })).toBe('partial');
    expect(monthStatus(RENT, 50_000, june, { year: 2026, month: 6 })).toBe('due');
    expect(monthStatus(RENT, 50_000, june, { year: 2026, month: 7 })).toBe('late');
  });

  it('compares across year boundaries', () => {
    const december = { year: 2025, month: 12 };
    expect(monthStatus(RENT, 0, december, { year: 2025, month: 12 })).toBe('due');
    expect(monthStatus(RENT, 0, december, { year: 2026, month: 1 })).toBe('late');
    expect(monthStatus(RENT, 0, { year: 2027, month: 1 }, { year: 2026, month: 12 })).toBe(
      'upcoming',
    );
  });
});

describe('monthBoxes', () => {
  const fromJanuary: PriceRow[] = [{ year: 2026, month: 1, monthlyPrice: RENT }];

  it('always gives 12 boxes, month 1 first, with the price and amount paid', () => {
    const boxes = monthBoxes(fromJanuary, paidMap([[3, 100_000]]), 2026, TODAY);
    expect(boxes.map((box) => box.month)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(boxes[2]).toEqual({ month: 3, expected: RENT, paid: 100_000, status: 'late' });
    expect(boxes[0]).toEqual({ month: 1, expected: RENT, paid: 0, status: 'late' });
  });

  it('with no payments: past months late, this month due, later months upcoming', () => {
    expect(statuses(monthBoxes(fromJanuary, NO_PAYMENTS, 2026, TODAY))).toEqual([
      ...Array<MonthStatus>(4).fill('late'),
      'due',
      ...Array<MonthStatus>(7).fill('upcoming'),
    ]);
  });

  it('months before the rent started are not applicable', () => {
    const fromMarch: PriceRow[] = [{ year: 2026, month: 3, monthlyPrice: RENT }];
    const boxes = monthBoxes(fromMarch, NO_PAYMENTS, 2026, TODAY);
    expect(statuses(boxes).slice(0, 4)).toEqual([
      'not_applicable',
      'not_applicable',
      'late',
      'late',
    ]);
    expect(boxes[0]?.expected).toBeNull();
  });

  it('a rent that started in an earlier year applies to every month', () => {
    const fromLastYear: PriceRow[] = [{ year: 2025, month: 11, monthlyPrice: RENT }];
    expect(monthBoxes(fromLastYear, NO_PAYMENTS, 2026, TODAY)[0]?.expected).toBe(RENT);
  });

  it('a rent that starts next year makes the whole year not applicable', () => {
    const nextYear: PriceRow[] = [{ year: 2027, month: 1, monthlyPrice: RENT }];
    expect(new Set(statuses(monthBoxes(nextYear, NO_PAYMENTS, 2026, TODAY)))).toEqual(
      new Set(['not_applicable']),
    );
  });

  it('vacant months are not applicable and never late; renting again brings them back', () => {
    const prices: PriceRow[] = [
      { year: 2026, month: 1, monthlyPrice: RENT },
      { year: 2026, month: 2, monthlyPrice: 0 },
      { year: 2026, month: 4, monthlyPrice: 300_000 },
    ];
    const boxes = monthBoxes(prices, NO_PAYMENTS, 2026, TODAY);
    expect(statuses(boxes).slice(0, 5)).toEqual([
      'late',
      'not_applicable',
      'not_applicable',
      'late',
      'due',
    ]);
    expect(boxes[1]?.expected).toBe(0);
    expect(boxes[3]?.expected).toBe(300_000);
  });

  it('a price change in the middle of the year keeps the old price for earlier months', () => {
    const prices: PriceRow[] = [
      { year: 2026, month: 1, monthlyPrice: RENT },
      { year: 2026, month: 7, monthlyPrice: 300_000 },
    ];
    const paid = paidMap([
      [6, RENT],
      [7, RENT],
    ]);
    const boxes = monthBoxes(prices, paid, 2026, { year: 2026, month: 8 });
    expect(boxes[5]).toMatchObject({ expected: RENT, status: 'paid' });
    // The old amount no longer covers the new, higher price.
    expect(boxes[6]).toMatchObject({ expected: 300_000, paid: RENT, status: 'late' });
  });

  it('prepaid future months show green, partly prepaid ones orange', () => {
    const paid = paidMap([
      [5, RENT],
      [6, RENT],
      [7, RENT],
      [8, 100_000],
    ]);
    expect(statuses(monthBoxes(fromJanuary, paid, 2026, TODAY)).slice(4, 9)).toEqual([
      'paid',
      'paid',
      'paid',
      'partial',
      'upcoming',
    ]);
  });

  it('a whole past year is judged as past, a whole future year as future', () => {
    const fromEarlier: PriceRow[] = [{ year: 2024, month: 1, monthlyPrice: RENT }];
    expect(new Set(statuses(monthBoxes(fromEarlier, NO_PAYMENTS, 2025, TODAY)))).toEqual(
      new Set(['late']),
    );
    expect(new Set(statuses(monthBoxes(fromEarlier, NO_PAYMENTS, 2027, TODAY)))).toEqual(
      new Set(['upcoming']),
    );
  });

  it('December and January sit on either side of a year boundary', () => {
    const today = { year: 2027, month: 1 };
    expect(monthBoxes(fromJanuary, NO_PAYMENTS, 2026, today)[11]?.status).toBe('late');
    expect(monthBoxes(fromJanuary, NO_PAYMENTS, 2027, today)[0]?.status).toBe('due');
  });
});

describe('yearFigures', () => {
  it('sums the rent and money received for applicable months', () => {
    const prices: PriceRow[] = [{ year: 2026, month: 1, monthlyPrice: RENT }];
    const paid = paidMap([
      [1, RENT],
      [2, 100_000],
    ]);
    expect(yearFigures(monthBoxes(prices, paid, 2026, TODAY))).toEqual({
      expected: 12 * RENT,
      received: RENT + 100_000,
      remaining: 12 * RENT - RENT - 100_000,
    });
  });

  it('leaves out months before the rent started and vacant months', () => {
    const prices: PriceRow[] = [
      { year: 2026, month: 3, monthlyPrice: RENT },
      { year: 2026, month: 10, monthlyPrice: 0 },
    ];
    // Months 3 to 9 count: 7 months.
    expect(yearFigures(monthBoxes(prices, NO_PAYMENTS, 2026, TODAY))).toEqual({
      expected: 7 * RENT,
      received: 0,
      remaining: 7 * RENT,
    });
  });

  it('uses each month its own price when the price changes mid-year', () => {
    const prices: PriceRow[] = [
      { year: 2026, month: 1, monthlyPrice: 100_000 },
      { year: 2026, month: 7, monthlyPrice: 200_000 },
    ];
    expect(yearFigures(monthBoxes(prices, NO_PAYMENTS, 2026, TODAY)).expected).toBe(
      6 * 100_000 + 6 * 200_000,
    );
  });

  it('never counts more than the rent as received, so still owed is never below 0', () => {
    const prices: PriceRow[] = [{ year: 2026, month: 12, monthlyPrice: RENT }];
    const figures = yearFigures(monthBoxes(prices, paidMap([[12, RENT * 3]]), 2026, TODAY));
    expect(figures).toEqual({ expected: RENT, received: RENT, remaining: 0 });
  });

  it('ignores money on a month that later became vacant', () => {
    const prices: PriceRow[] = [{ year: 2026, month: 1, monthlyPrice: 0 }];
    expect(yearFigures(monthBoxes(prices, paidMap([[1, RENT]]), 2026, TODAY))).toEqual({
      expected: 0,
      received: 0,
      remaining: 0,
    });
  });

  it('is exact with large amounts (no floating-point drift)', () => {
    const cents = 123_456_789_01;
    const prices: PriceRow[] = [{ year: 2026, month: 1, monthlyPrice: cents }];
    expect(yearFigures(monthBoxes(prices, NO_PAYMENTS, 2026, TODAY)).expected).toBe(12 * cents);
  });
});

describe('yearSummary', () => {
  const box = (status: MonthStatus): MonthBox => ({ month: 1, expected: RENT, paid: 0, status });

  it.each<[MonthStatus[], string]>([
    [['paid', 'late', 'due', 'partial'], 'late'],
    [['paid', 'due', 'partial', 'upcoming'], 'due'],
    [['paid', 'partial', 'upcoming'], 'partial'],
    [['paid', 'upcoming', 'not_applicable'], 'paid'],
    [['upcoming', 'not_applicable'], 'nothing_due'],
    [['not_applicable'], 'nothing_due'],
  ])('%j is summed up as %s', (list, summary) => {
    expect(yearSummary(list.map(box))).toBe(summary);
  });
});

describe('areaYear', () => {
  it('puts the boxes, figures and summary of a year together', () => {
    const prices: PriceRow[] = [{ year: 2026, month: 5, monthlyPrice: RENT }];
    const year = areaYear(prices, paidMap([[5, RENT]]), 2026, TODAY);
    expect(year.year).toBe(2026);
    expect(year.boxes).toHaveLength(12);
    expect(year.summary).toBe('paid');
    expect(year.figures).toEqual({ expected: 8 * RENT, received: RENT, remaining: 7 * RENT });
  });
});
