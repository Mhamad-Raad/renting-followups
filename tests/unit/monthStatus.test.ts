import { describe, expect, it } from 'vitest';
import { monthIndex, type YearMonth } from '@shared/dates';
import type { MonthBox, MonthStatus } from '@shared/months';
import { withPriceFrom, type PriceRow } from '@shared/prices';
import {
  areaStanding,
  areaYear,
  monthBoxes,
  monthStatus,
  needsAttention,
  NO_PAYMENTS,
  type PaidHistory,
  statusChanges,
  totalsByCurrency,
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
  // TODAY is May 2026: months 1–5 have come, 6–12 are still to come.
  const figuresOf = (prices: PriceRow[], paid = NO_PAYMENTS, rentMonth = 5) =>
    yearFigures(monthBoxes(prices, paid, 2026, TODAY), rentMonth);

  it('sums the rent and money received for applicable months', () => {
    const prices: PriceRow[] = [{ year: 2026, month: 1, monthlyPrice: RENT }];
    const paid = paidMap([
      [1, RENT],
      [2, 100_000],
    ]);
    expect(figuresOf(prices, paid)).toMatchObject({
      rent: RENT,
      expected: 12 * RENT,
      received: RENT + 100_000,
    });
  });

  it('counts as still owed only the months that have come, never later ones', () => {
    const prices: PriceRow[] = [{ year: 2026, month: 1, monthlyPrice: RENT }];
    // Month 1 paid, month 2 part-paid, months 3–5 unpaid; 6–12 are not owed yet.
    const paid = paidMap([
      [1, RENT],
      [2, 100_000],
    ]);
    expect(figuresOf(prices, paid).remaining).toBe(RENT - 100_000 + 3 * RENT);
  });

  it('a prepaid future month counts as received but does not lower what is owed now', () => {
    const prices: PriceRow[] = [{ year: 2026, month: 1, monthlyPrice: RENT }];
    const figures = figuresOf(prices, paidMap([[9, RENT]]));
    expect(figures.received).toBe(RENT);
    expect(figures.remaining).toBe(5 * RENT);
  });

  it('a past year owes every unpaid month, a future year owes nothing yet', () => {
    const prices: PriceRow[] = [{ year: 2025, month: 1, monthlyPrice: RENT }];
    expect(yearFigures(monthBoxes(prices, NO_PAYMENTS, 2025, TODAY), 12).remaining).toBe(12 * RENT);
    expect(yearFigures(monthBoxes(prices, NO_PAYMENTS, 2027, TODAY), 1)).toEqual({
      rent: RENT,
      expected: 12 * RENT,
      received: 0,
      remaining: 0,
    });
  });

  it('leaves out months before the rent started and vacant months', () => {
    const prices: PriceRow[] = [
      { year: 2026, month: 3, monthlyPrice: RENT },
      { year: 2026, month: 4, monthlyPrice: 0 },
      { year: 2026, month: 5, monthlyPrice: RENT },
    ];
    // Month 3 and months 5–12 count: 9 months. Months 3 and 5 have come.
    expect(figuresOf(prices)).toEqual({
      rent: RENT,
      expected: 9 * RENT,
      received: 0,
      remaining: 2 * RENT,
    });
  });

  it('shows the rent of the chosen month: vacant is 0, not started is null', () => {
    const prices: PriceRow[] = [
      { year: 2026, month: 3, monthlyPrice: RENT },
      { year: 2026, month: 5, monthlyPrice: 0 },
    ];
    expect(figuresOf(prices, NO_PAYMENTS, 5).rent).toBe(0);
    expect(figuresOf(prices, NO_PAYMENTS, 1).rent).toBeNull();
  });

  it('uses each month its own price when the price changes mid-year', () => {
    const prices: PriceRow[] = [
      { year: 2026, month: 1, monthlyPrice: 100_000 },
      { year: 2026, month: 7, monthlyPrice: 200_000 },
    ];
    expect(figuresOf(prices).expected).toBe(6 * 100_000 + 6 * 200_000);
  });

  it('never counts more than the rent as received, so still owed is never below 0', () => {
    const prices: PriceRow[] = [{ year: 2026, month: 5, monthlyPrice: RENT }];
    const figures = yearFigures(
      monthBoxes(prices, paidMap([[5, RENT * 3]]), 2026, TODAY).filter((box) => box.month === 5),
      5,
    );
    expect(figures).toEqual({ rent: RENT, expected: RENT, received: RENT, remaining: 0 });
  });

  it('ignores money on a month that later became vacant', () => {
    const prices: PriceRow[] = [{ year: 2026, month: 1, monthlyPrice: 0 }];
    expect(figuresOf(prices, paidMap([[1, RENT]]))).toEqual({
      rent: 0,
      expected: 0,
      received: 0,
      remaining: 0,
    });
  });

  it('is exact with large amounts (no floating-point drift)', () => {
    const cents = 123_456_789_01;
    const prices: PriceRow[] = [{ year: 2026, month: 1, monthlyPrice: cents }];
    expect(figuresOf(prices).expected).toBe(12 * cents);
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
  const prices: PriceRow[] = [{ year: 2026, month: 3, monthlyPrice: RENT }];

  it('puts the boxes, figures and summary of a year together', () => {
    const year = areaYear(prices, paidMap([[3, RENT]]), 2026, TODAY);
    expect(year).toMatchObject({ year: 2026, month: null, summary: 'late' });
    expect(year.boxes).toHaveLength(12);
    expect(year.figures).toEqual({
      rent: RENT,
      expected: 10 * RENT,
      received: RENT,
      remaining: 2 * RENT,
    });
  });

  it('gives the figures of one month when a month is chosen, with all 12 boxes', () => {
    const year = areaYear(prices, paidMap([[4, 100_000]]), 2026, TODAY, 4);
    expect(year.month).toBe(4);
    expect(year.boxes).toHaveLength(12);
    expect(year.figures).toEqual({
      rent: RENT,
      expected: RENT,
      received: 100_000,
      remaining: RENT - 100_000,
    });
  });

  it('shows December\u2019s rent for a past year and January\u2019s for a future one', () => {
    const changing: PriceRow[] = [
      { year: 2025, month: 1, monthlyPrice: 100 },
      { year: 2025, month: 12, monthlyPrice: 200 },
      { year: 2027, month: 2, monthlyPrice: 300 },
    ];
    expect(areaYear(changing, NO_PAYMENTS, 2025, TODAY).figures.rent).toBe(200);
    expect(areaYear(changing, NO_PAYMENTS, 2027, TODAY).figures.rent).toBe(200);
  });
});

describe('areaStanding', () => {
  const history = (entries: [YearMonth, number][]): PaidHistory =>
    new Map(entries.map(([month, amount]) => [monthIndex(month), amount]));

  it('counts late months and what is owed across earlier years', () => {
    const prices: PriceRow[] = [{ year: 2025, month: 11, monthlyPrice: RENT }];
    // Nov 2025 paid; Dec 2025 and Jan–Apr 2026 late; May 2026 due.
    const paid = history([[{ year: 2025, month: 11 }, RENT]]);
    expect(areaStanding(prices, paid, TODAY)).toEqual({
      owed: 6 * RENT,
      lateMonths: 5,
      dueNow: true,
    });
  });

  it('a fully paid area owes nothing; prepaying the future changes nothing now', () => {
    const prices: PriceRow[] = [{ year: 2026, month: 5, monthlyPrice: RENT }];
    const paid = history([
      [{ year: 2026, month: 5 }, RENT],
      [{ year: 2026, month: 6 }, RENT],
    ]);
    expect(areaStanding(prices, paid, TODAY)).toEqual({ owed: 0, lateMonths: 0, dueNow: false });
  });

  it('skips vacant months and has nothing for an area whose rent has not started', () => {
    const prices: PriceRow[] = [
      { year: 2026, month: 1, monthlyPrice: 0 },
      { year: 2026, month: 5, monthlyPrice: RENT },
    ];
    expect(areaStanding(prices, new Map(), TODAY)).toEqual({
      owed: RENT,
      lateMonths: 0,
      dueNow: true,
    });
    const later: PriceRow[] = [{ year: 2026, month: 9, monthlyPrice: RENT }];
    expect(areaStanding(later, new Map(), TODAY)).toEqual({
      owed: 0,
      lateMonths: 0,
      dueNow: false,
    });
    expect(areaStanding([], new Map(), TODAY).owed).toBe(0);
  });

  it('counts only the unpaid part of a part-paid month', () => {
    const prices: PriceRow[] = [{ year: 2026, month: 4, monthlyPrice: RENT }];
    const paid = history([[{ year: 2026, month: 4 }, 100_000]]);
    expect(areaStanding(prices, paid, TODAY).owed).toBe(RENT - 100_000 + RENT);
  });
});

describe('statusChanges', () => {
  const history = (entries: [YearMonth, number][]): PaidHistory =>
    new Map(entries.map(([month, amount]) => [monthIndex(month), amount]));
  const before: PriceRow[] = [{ year: 2026, month: 1, monthlyPrice: RENT }];

  it('lists paid months that a higher price turns from paid to late or partial', () => {
    const paid = history([
      [{ year: 2026, month: 3 }, RENT],
      [{ year: 2026, month: 7 }, RENT],
    ]);
    const after = withPriceFrom(before, { year: 2026, month: 3 }, 300_000);
    expect(statusChanges(before, after, paid, { year: 2026, month: 3 }, TODAY)).toEqual([
      { year: 2026, month: 3, before: 'paid', after: 'late', uncounted: 0 },
      { year: 2026, month: 7, before: 'paid', after: 'partial', uncounted: 0 },
    ]);
  });

  it('ignores months before the change and months with nothing paid', () => {
    const paid = history([[{ year: 2026, month: 2 }, RENT]]);
    const after = withPriceFrom(before, { year: 2026, month: 3 }, 300_000);
    expect(statusChanges(before, after, paid, { year: 2026, month: 3 }, TODAY)).toEqual([]);
  });

  it('warns when marking vacant a month that was paid', () => {
    const paid = history([[{ year: 2026, month: 6 }, RENT]]);
    const after = withPriceFrom(before, { year: 2026, month: 6 }, 0);
    expect(statusChanges(before, after, paid, { year: 2026, month: 6 }, TODAY)).toEqual([
      { year: 2026, month: 6, before: 'paid', after: 'not_applicable', uncounted: RENT },
    ]);
  });

  it('says nothing when the paid months keep their status and all their money still counts', () => {
    const paid = history([[{ year: 2026, month: 4 }, 300_000]]);
    // Rent was 250,000 with 300,000 paid; a new rent of 280,000 counts more of it, not less.
    const after = withPriceFrom(before, { year: 2026, month: 4 }, 280_000);
    expect(statusChanges(before, after, paid, { year: 2026, month: 4 }, TODAY)).toEqual([]);
  });

  it('warns when a lower rent would leave money on a paid month uncounted', () => {
    const paid = history([[{ year: 2026, month: 4 }, RENT]]);
    const after = withPriceFrom(before, { year: 2026, month: 4 }, 200_000);
    expect(statusChanges(before, after, paid, { year: 2026, month: 4 }, TODAY)).toEqual([
      { year: 2026, month: 4, before: 'paid', after: 'paid', uncounted: RENT - 200_000 },
    ]);
  });
});

describe('Home totals and attention list', () => {
  const overview = (
    currency: 'IQD' | 'USD',
    received: number,
    remaining: number,
    lateMonths: number,
    dueNow = false,
    owed = remaining,
  ) => ({
    currency,
    figures: { rent: RENT, expected: 0, received, remaining },
    standing: { owed, lateMonths, dueNow },
  });

  it('adds up each currency on its own and counts late areas', () => {
    const areas = [
      overview('USD', 500, 100, 1),
      overview('IQD', 1000, 0, 0),
      overview('IQD', 2000, 300, 2),
    ];
    expect(totalsByCurrency(areas)).toEqual([
      { currency: 'IQD', received: 3000, remaining: 300, lateAreas: 1 },
      { currency: 'USD', received: 500, remaining: 100, lateAreas: 1 },
    ]);
  });

  it('leaves out a currency with no areas', () => {
    expect(totalsByCurrency([overview('IQD', 1, 0, 0)]).map((t) => t.currency)).toEqual(['IQD']);
    expect(totalsByCurrency([])).toEqual([]);
  });

  it('lists late and due areas, most late months first, then most owed', () => {
    const paid = overview('IQD', 0, 0, 0);
    const due = overview('IQD', 0, 10, 0, true);
    const late1 = overview('IQD', 0, 10, 1, false, 50);
    const late1More = overview('IQD', 0, 10, 1, false, 90);
    const late3 = overview('IQD', 0, 10, 3);
    expect(needsAttention([paid, due, late1, late3, late1More])).toEqual([
      late3,
      late1More,
      late1,
      due,
    ]);
  });
});
