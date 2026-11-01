import { describe, expect, it } from 'vitest';
import { CURRENCIES, type Currency } from '@shared/currency';
import { fromMonthIndex, monthIndex, toDateString, type YearMonth } from '@shared/dates';
import { currentRenter, isEmptyPlace } from '@shared/areas';
import { priceForMonth, pricesInCurrency } from '@shared/prices';
import { totalsByCurrency } from '../../src/main/services/monthStatus';
import { areaInput, createTestDatabase } from './helpers';

/**
 * Four years of daily use, month by month (2026–2029, with the leap year
 * 2028): payments of one or several months, past records, month boxes,
 * renters leaving and coming, rent changes, receipt edits and cancellations.
 * After every month the money and the screens must still add up. Random but
 * repeatable (seeded), on a real SQLite database.
 */

const AREAS = 150;
const FIRST = { year: 2026, month: 1 };
const LAST = { year: 2029, month: 12 };

function seeded(seed: number) {
  let state = seed;
  const next = () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  return {
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    chance: (probability: number) => next() < probability,
    pick: <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)] as T,
  };
}

describe('four years of use', () => {
  it('keeps every figure, colour and receipt right, month after month', () => {
    const { db, repos } = createTestDatabase();
    const random = seeded(2026);
    const category = repos.categories.create({ name: 'Shops', color: null });
    if (!category.ok) throw new Error('category failed');
    const ids: number[] = [];
    for (let n = 0; n < AREAS; n += 1) {
      const usd = n % 5 === 0;
      const area = repos.areas.create(
        areaInput(category.id, {
          name: `Shop ${n}`,
          currency: usd ? 'USD' : 'IQD',
          monthlyPrice: usd ? 300_00 : random.int(2, 12) * 50_000,
          rentStartsFrom: FIRST,
          renter: { fullName: `Renter ${n}`, phone: '', startedOn: '2026-01-01' },
        }),
      );
      if (!area.ok) throw new Error('area failed');
      ids.push(area.id);
    }

    const counted = { payments: 0, refused: 0, renters: 0, vacant: 0, edits: 0, voids: 0 };
    for (let index = monthIndex(FIRST); index <= monthIndex(LAST); index += 1) {
      const month = fromMonthIndex(index);
      const today = { date: toDateString(month.year, month.month, 15), month };
      for (const areaId of ids) act(areaId, month, today);
      check(month);
    }

    function act(areaId: number, month: YearMonth, today: { date: string; month: YearMonth }) {
      const area = repos.areas.get(areaId);
      if (!area) throw new Error('area gone');
      const renter = currentRenter(area.renters);
      const rentNow = priceForMonth(area.chargedPrices, month);
      const firstDay = toDateString(month.year, month.month, 1);
      const newRent = () =>
        area.currency === 'USD' ? random.int(2, 5) * 100_00 : random.int(2, 12) * 50_000;
      if (isEmptyPlace(rentNow, renter !== null)) {
        if (random.chance(0.25)) {
          const result = repos.priceChanges.changeRenter({
            areaId,
            fullName: `New ${areaId}-${monthIndex(month)}`,
            phone: '',
            startedOn: firstDay,
            monthlyPrice: newRent(),
            takeOutVacantMonths: true,
          });
          expect(result).toEqual({ ok: true });
          counted.renters += 1;
        }
        return;
      }
      if (random.chance(0.75)) {
        const from = repos.payments.suggestedStart(areaId, month);
        if (from) {
          const result = repos.payments.create(
            {
              areaId,
              isBackfill: random.chance(0.1),
              monthCount: random.chance(0.8) ? 1 : random.int(2, 6),
              from,
              paidOn: today.date,
              note: '',
            },
            today,
          );
          if (result.ok) counted.payments += 1;
          else counted.refused += 1;
        }
      }
      if (random.chance(0.02)) {
        expect(
          repos.priceChanges.changePrice({
            areaId,
            from: month,
            monthlyPrice: 0,
            takeOutVacantMonths: true,
          }),
        ).toEqual({ ok: true });
        counted.vacant += 1;
      } else if (random.chance(0.02)) {
        expect(
          repos.priceChanges.changeRenter({
            areaId,
            fullName: `Next ${areaId}-${monthIndex(month)}`,
            phone: '',
            startedOn: toDateString(month.year, month.month, random.int(1, 28)),
            monthlyPrice: newRent(),
            takeOutVacantMonths: true,
          }),
        ).toEqual({ ok: true });
        counted.renters += 1;
      } else if (random.chance(0.02)) {
        expect(
          repos.priceChanges.changePrice({ areaId, from: month, monthlyPrice: newRent() }),
        ).toEqual({ ok: true });
      }
      const receipts = repos.payments
        .forArea({ areaId, year: month.year, month: null })
        .filter((receipt) => !receipt.voided);
      const receipt = receipts.length > 0 ? random.pick(receipts) : undefined;
      const first = receipt?.allocations[0];
      if (receipt && first && random.chance(0.02)) {
        const result = repos.payments.update(
          {
            id: receipt.id,
            monthCount: Math.max(1, receipt.allocations.length + random.pick([-1, 1])),
            from: first,
            paidOn: receipt.paidOn,
            note: 'edited',
          },
          today,
        );
        if (result.ok) counted.edits += 1;
      } else if (receipt && random.chance(0.01)) {
        expect(repos.payments.void(receipt.id)).toEqual({ ok: true });
        counted.voids += 1;
      } else if (receipt && first && random.chance(0.01)) {
        expect(repos.monthPayments.takeOut({ areaId, ...first }).ok).toBe(true);
      }
    }

    function check(today: YearMonth) {
      // Every counting receipt's total is the sum of its months.
      expect(
        db
          .prepare(
            `SELECT r.id FROM receipts r LEFT JOIN payment_allocations a ON a.receipt_id = r.id
             WHERE r.voided_at IS NULL GROUP BY r.id
             HAVING r.total_amount <> COALESCE(SUM(a.amount), 0) OR COUNT(a.id) = 0`,
          )
          .all(),
      ).toEqual([]);
      // No month is paid by two counting receipts.
      expect(
        db
          .prepare(
            `SELECT a.area_id FROM payment_allocations a JOIN receipts r ON r.id = a.receipt_id
             WHERE r.voided_at IS NULL GROUP BY a.area_id, a.year, a.month HAVING COUNT(*) > 1`,
          )
          .all(),
      ).toEqual([]);
      // Receipt numbers never repeat and only ever go up.
      const numbers = db
        .prepare(
          'SELECT receipt_number AS n FROM receipts WHERE receipt_number IS NOT NULL ORDER BY id',
        )
        .all()
        .map((row) => (row as { n: number }).n);
      expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
      expect(new Set(numbers).size).toBe(numbers.length);

      const allocations = db
        .prepare(
          `SELECT a.area_id AS areaId, a.year, a.month, a.amount, r.currency
           FROM payment_allocations a JOIN receipts r ON r.id = a.receipt_id
           WHERE r.voided_at IS NULL`,
        )
        .all() as {
        areaId: number;
        year: number;
        month: number;
        amount: number;
        currency: Currency;
      }[];
      const overviews = repos.areaViews.overviews(today);
      for (const areaId of ids) {
        const area = repos.areas.get(areaId);
        if (!area) throw new Error('area gone');
        const own = allocations.filter((paid) => paid.areaId === areaId);
        // Money only ever sits on a month with rent in the receipt's currency.
        for (const paid of own) {
          expect(priceForMonth(pricesInCurrency(area.prices, paid.currency), paid)).toBeGreaterThan(
            0,
          );
        }
        const year = repos.areaViews.year(areaId, today.year, today);
        if (!year) throw new Error('year missing');
        for (const box of year.boxes) {
          const when = monthIndex({ year: today.year, month: box.month }) - monthIndex(today);
          if (box.status === 'paid') expect(box.paid).toBeGreaterThan(0);
          if (box.status === 'late') expect(when).toBeLessThan(0);
          if (box.status === 'due') expect(when).toBe(0);
          if (box.status === 'upcoming') expect(when).toBeGreaterThan(0);
        }
        for (const figures of year.figures) {
          const received = own
            .filter((paid) => paid.year === today.year && paid.currency === figures.currency)
            .reduce((sum, paid) => sum + paid.amount, 0);
          expect(figures.received).toBe(received);
          expect(figures.remaining).toBeGreaterThanOrEqual(0);
          expect(figures.expected).toBeGreaterThanOrEqual(figures.received + figures.remaining);
        }
      }
      // Home's cards add up the areas; the report's totals add up its rows.
      const home = totalsByCurrency(overviews);
      const report = repos.reports.build(
        {
          year: today.year,
          month: null,
          categoryId: null,
          currency: null,
          status: 'all',
          excludedIds: [],
          onlyIds: null,
        },
        today,
        'en',
      );
      for (const currency of CURRENCIES) {
        const parts = overviews
          .flatMap((area) => area.figures)
          .filter((part) => part.currency === currency);
        const card = home.find((total) => total.currency === currency);
        if (card) expect(card.received).toBe(parts.reduce((sum, part) => sum + part.received, 0));
        const rows = report.rows
          .flatMap((row) => row.figures)
          .filter((part) => part.currency === currency);
        const total = report.totals.find((row) => row.currency === currency);
        if (total) {
          expect(total.received).toBe(rows.reduce((sum, part) => sum + part.received, 0));
          expect(total.remaining).toBe(rows.reduce((sum, part) => sum + part.remaining, 0));
        }
      }
    }

    // Busy years: the scenario really happened, not just a quiet run.
    expect(counted.payments).toBeGreaterThan(4_000);
    expect(counted.renters).toBeGreaterThan(100);
    expect(counted.vacant).toBeGreaterThan(50);
    expect(counted.edits + counted.voids).toBeGreaterThan(50);

    // The file is healthy, and the screens are still quick after four years.
    expect(db.prepare('PRAGMA integrity_check').pluck().get()).toBe('ok');
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    const started = performance.now();
    repos.areaViews.list({ search: '', categoryId: null }, LAST);
    repos.areaViews.overviews(LAST);
    repos.reports.build(
      {
        year: LAST.year,
        month: null,
        categoryId: null,
        currency: null,
        status: 'all',
        excludedIds: [],
        onlyIds: null,
      },
      LAST,
      'en',
    );
    expect(performance.now() - started).toBeLessThan(1_000);
    db.close();
  }, 300_000);
});
