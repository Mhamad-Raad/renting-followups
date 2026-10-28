import { describe, expect, it } from 'vitest';
import { monthIndex, type BusinessToday, type YearMonth } from '@shared/dates';
import type { PriceRow } from '@shared/prices';
import {
  buildBackupReminder,
  buildReminders,
  type ReminderArea,
} from '../../src/main/services/notifications';

const RENT = 250_000;
const byName = (a: string, b: string) => a.localeCompare(b);
const on = (date: string): BusinessToday => {
  const [year, month] = date.split('-').map(Number);
  return { date, month: { year: year ?? 0, month: month ?? 0 } };
};

function area(name: string, prices: PriceRow[], paid: [YearMonth, number][] = []): ReminderArea {
  return {
    id: name.length,
    name,
    categoryName: 'Shops',
    currency: 'IQD',
    renterName: 'Karwan',
    renterPhone: null,
    prices,
    paid: new Map(paid.map(([month, amount]) => [monthIndex(month), amount])),
  };
}

const FROM_MARCH: PriceRow[] = [{ year: 2026, month: 3, monthlyPrice: RENT }];

describe('buildReminders', () => {
  it('reports late rent with its months and what is owed', () => {
    const reminders = buildReminders(
      [area('Shop', FROM_MARCH, [[{ year: 2026, month: 4 }, 100_000]])],
      on('2026-05-10'),
      7,
      byName,
    );
    expect(reminders).toEqual([
      expect.objectContaining({
        kind: 'late',
        areaName: 'Shop',
        months: [
          { year: 2026, month: 3 },
          { year: 2026, month: 4 },
        ],
        owed: RENT + RENT - 100_000,
      }),
    ]);
  });

  it('reminds about this month only when it ends within the set number of days', () => {
    const shop = area('Shop', [{ year: 2026, month: 5, monthlyPrice: RENT }]);
    expect(buildReminders([shop], on('2026-05-24'), 7, byName)).toEqual([]);
    // 31 days in May: on the 25th there are 7 days left, counting today.
    expect(buildReminders([shop], on('2026-05-25'), 7, byName)).toEqual([
      expect.objectContaining({
        kind: 'month_end',
        month: { year: 2026, month: 5 },
        daysLeft: 7,
        owed: RENT,
      }),
    ]);
  });

  it('always reminds in the last 3 days, even with a shorter setting', () => {
    const shop = area('Shop', [{ year: 2026, month: 2, monthlyPrice: RENT }]);
    // February 2026 has 28 days.
    expect(buildReminders([shop], on('2026-02-25'), 1, byName)).toEqual([]);
    expect(buildReminders([shop], on('2026-02-26'), 1, byName)[0]).toMatchObject({ daysLeft: 3 });
  });

  it('says nothing for a paid month, a vacant month, or rent that has not started', () => {
    const paid = area(
      'Paid',
      [{ year: 2026, month: 5, monthlyPrice: RENT }],
      [[{ year: 2026, month: 5 }, RENT]],
    );
    const vacant = area('Vacant', [{ year: 2026, month: 1, monthlyPrice: 0 }]);
    const later = area('Later', [{ year: 2026, month: 7, monthlyPrice: RENT }]);
    expect(buildReminders([paid, vacant, later], on('2026-05-30'), 7, byName)).toEqual([]);
  });

  it('puts late rent first, most late months first, then month-end reminders by name', () => {
    const many = area('B many', FROM_MARCH);
    const one = area('A one', [{ year: 2026, month: 4, monthlyPrice: RENT }]);
    const dueOnly = area('C due', [{ year: 2026, month: 5, monthlyPrice: RENT }]);
    const reminders = buildReminders([dueOnly, one, many], on('2026-05-30'), 7, byName);
    expect(reminders.map((r) => `${r.kind}:${r.areaName}`)).toEqual([
      'late:B many',
      'late:A one',
      'month_end:A one',
      'month_end:B many',
      'month_end:C due',
    ]);
  });
});

describe('backup reminder', () => {
  const today: BusinessToday = { date: '2026-10-22', month: { year: 2026, month: 10 } };

  it('reminds while no backup was made this calendar month', () => {
    expect(buildBackupReminder(null, today, true)).toEqual({ kind: 'backup', lastBackupOn: null });
    expect(buildBackupReminder('2026-09-30', today, true)).toEqual({
      kind: 'backup',
      lastBackupOn: '2026-09-30',
    });
    expect(buildBackupReminder('2025-10-22', today, true)?.kind).toBe('backup');
  });

  it('is quiet after a backup this month, and before there is any area', () => {
    expect(buildBackupReminder('2026-10-01', today, true)).toBeNull();
    expect(buildBackupReminder(null, today, false)).toBeNull();
  });
});
