import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ReportQuery } from '@shared/reports';
import type { Db } from '../../src/main/db/connection';
import type { Repositories } from '../../src/main/db/repositories';
import { areaInput, createTestDatabase } from './helpers';

const TODAY = { year: 2026, month: 5 };
const RENT = 250_000;

let db: Db;
let repos: Repositories;
let shops: number;
let offices: number;

beforeEach(() => {
  ({ db, repos } = createTestDatabase());
  const created = [
    repos.categories.create({ name: 'Shops', color: null }),
    repos.categories.create({ name: 'Offices', color: null }),
  ];
  if (!created[0]?.ok || !created[1]?.ok) throw new Error('category failed');
  shops = created[0].id;
  offices = created[1].id;
});
afterEach(() => db.close());

function area(name: string, categoryId: number, overrides: Parameters<typeof areaInput>[1] = {}) {
  const result = repos.areas.create(areaInput(categoryId, { name, ...overrides }));
  if (!result.ok) throw new Error('area failed');
  return result.id;
}

function pay(areaId: number, amount: number, month = 1) {
  const result = repos.payments.create(
    {
      areaId,
      isBackfill: false,
      amount,
      from: { year: 2026, month },
      paidOn: '2026-05-01',
      note: '',
    },
    { date: '2026-05-15', month: TODAY },
  );
  if (!result.ok) throw new Error('payment failed');
}

const build = (query: Partial<ReportQuery> = {}) =>
  repos.reports.build(
    {
      year: 2026,
      month: null,
      categoryId: null,
      currency: null,
      status: 'all',
      excludedIds: [],
      onlyIds: null,
      ...query,
    },
    TODAY,
    'en',
  );
const names = (query: Partial<ReportQuery> = {}) =>
  build(query)
    .rows.map((row) => row.name)
    .sort();

describe('reports', () => {
  it('gives each area its figures and months for the year, with totals per currency', () => {
    const paidUp = area('Shop 1', shops);
    pay(paidUp, 5 * RENT);
    const dollars = area('Office 1', offices, { currency: 'USD', monthlyPrice: 500_00 });
    pay(dollars, 500_00);
    const report = build();
    const shop = report.rows.find((row) => row.id === paidUp);
    expect(shop).toMatchObject({
      name: 'Shop 1',
      categoryName: 'Shops',
      renterName: 'Karwan Ahmed',
      figures: [
        { currency: 'IQD', rent: RENT, expected: 12 * RENT, received: 5 * RENT, remaining: 0 },
      ],
      summary: 'paid',
      monthStatus: null,
    });
    expect(shop?.boxes).toHaveLength(12);
    expect(report.totals).toEqual([
      { currency: 'IQD', rent: RENT, received: 5 * RENT, remaining: 0, areas: 1 },
      { currency: 'USD', rent: 500_00, received: 500_00, remaining: 4 * 500_00, areas: 1 },
    ]);
  });

  it('filters by category, currency and status', () => {
    pay(area('Shop paid', shops), 5 * RENT);
    pay(area('Shop partial', shops), 4 * RENT + 1);
    area('Shop late', shops);
    area('Office late', offices, { currency: 'USD' });
    expect(names({ categoryId: offices })).toEqual(['Office late']);
    expect(names({ currency: 'IQD' })).toEqual(['Shop late', 'Shop paid', 'Shop partial']);
    expect(names({ status: 'paid' })).toEqual(['Shop paid']);
    expect(names({ status: 'partial' })).toEqual(['Shop partial']);
    expect(names({ status: 'late' })).toEqual(['Office late', 'Shop late']);
  });

  it('with a month chosen, gives that month’s figures, status and totals', () => {
    const id = area('Shop 1', shops);
    pay(id, RENT + 100_000);
    const report = build({ month: 2 });
    expect(report.rows[0]).toMatchObject({
      figures: [
        {
          currency: 'IQD',
          rent: RENT,
          expected: RENT,
          received: 100_000,
          remaining: RENT - 100_000,
        },
      ],
      monthStatus: 'late',
    });
    expect(report.totals[0]).toMatchObject({ received: 100_000, remaining: RENT - 100_000 });
    expect(names({ month: 1, status: 'paid' })).toEqual(['Shop 1']);
    expect(names({ month: 2, status: 'paid' })).toEqual([]);
  });

  it('leaves out areas unticked in the picker, which still offers them', () => {
    const one = area('Shop 1', shops);
    area('Shop 2', shops);
    const report = build({ excludedIds: [one] });
    expect(report.rows.map((row) => row.name)).toEqual(['Shop 2']);
    expect(report.candidates.map((c) => c.name).sort()).toEqual(['Shop 1', 'Shop 2']);
    expect(report.totals[0]?.areas).toBe(1);
  });

  it('can be limited to chosen areas, for Print selected and Print this area', () => {
    area('Shop 1', shops);
    const two = area('Shop 2', shops);
    expect(names({ onlyIds: [two] })).toEqual(['Shop 2']);
  });

  it('lists areas by name, in the same order for the screen, print and Excel', () => {
    area('Shop B', shops);
    area('Shop A', shops);
    area('Shop C', shops);
    expect(build().rows.map((row) => row.name)).toEqual(['Shop A', 'Shop B', 'Shop C']);
    expect(build().candidates.map((row) => row.name)).toEqual(['Shop A', 'Shop B', 'Shop C']);
  });

  it('lists an area without a name by its category', () => {
    area('Shop B', shops);
    area('', shops, {
      renter: { fullName: 'Aram', phone: '', startedOn: '2026-01-01' },
    });
    expect(build().rows.map((row) => [row.name, row.renterName])).toEqual([
      ['Shop B', 'Karwan Ahmed'],
      ['', 'Aram'],
    ]);
    expect(build().candidates.map((row) => row.renterName)).toEqual(['Karwan Ahmed', 'Aram']);
  });

  it('leaves out deleted areas', () => {
    repos.areas.softDelete(area('Shop 1', shops));
    expect(build().rows).toEqual([]);
  });

  it('remembers the last filters, and falls back to the defaults', () => {
    expect(repos.reports.lastFilters()).toEqual({
      month: null,
      categoryId: null,
      currency: null,
      status: 'all',
    });
    repos.reports.rememberFilters({ month: 3, categoryId: shops, currency: 'USD', status: 'late' });
    expect(repos.reports.lastFilters()).toEqual({
      month: 3,
      categoryId: shops,
      currency: 'USD',
      status: 'late',
    });
    db.prepare(
      "UPDATE settings SET value = 'not json' WHERE key = 'report_filters_last_used'",
    ).run();
    expect(repos.reports.lastFilters().status).toBe('all');
  });

  it('builds a report of 200 areas quickly', () => {
    for (let index = 0; index < 200; index += 1) pay(area(`Shop ${index}`, shops), 3 * RENT);
    const started = performance.now();
    const report = build();
    expect(report.rows).toHaveLength(200);
    expect(performance.now() - started).toBeLessThan(200);
  });
});
