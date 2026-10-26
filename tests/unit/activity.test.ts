import { beforeEach, describe, expect, it } from 'vitest';
import { ACTIVITY_PAGE_SIZE } from '@shared/audit';
import type { BusinessToday } from '@shared/dates';
import type { Db } from '../../src/main/db/connection';
import { areaInput, createTestDatabase } from './helpers';

const TODAY: BusinessToday = { date: '2026-05-15', month: { year: 2026, month: 5 } };

let db: Db;
let repos: ReturnType<typeof createTestDatabase>['repos'];
let areaId: number;

beforeEach(() => {
  ({ db, repos } = createTestDatabase());
  const category = repos.categories.create({ name: 'Shops', color: null });
  if (!category.ok) throw new Error('category not created');
  const area = repos.areas.create(areaInput(category.id));
  if (!area.ok) throw new Error('area not created');
  areaId = area.id;
});

const firstPage = () => repos.activity.page({ beforeId: null }).entries;

describe('activity log', () => {
  it('lists changes newest first with the area name and currency', () => {
    expect(firstPage().map((entry) => [entry.entity, entry.action, entry.name])).toEqual([
      ['area', 'create', 'Shop 1'],
      ['category', 'create', 'Shops'],
    ]);
    expect(firstPage()[0]).toMatchObject({ currency: 'IQD', amount: 250_000 });
  });

  it('describes a rent change with the month and both amounts', () => {
    repos.priceChanges.changePrice(
      { areaId, from: { year: 2026, month: 6 }, monthlyPrice: 300_000 },
      TODAY.month,
    );
    expect(firstPage()[0]).toMatchObject({
      action: 'change_price',
      month: { year: 2026, month: 6 },
      amount: 300_000,
      previousAmount: 250_000,
    });
  });

  it('names a receipt by its number and area, also after it is edited and cancelled', () => {
    const payment = { areaId, isBackfill: false, from: { year: 2026, month: 1 }, note: '' };
    const created = repos.payments.create(
      { ...payment, amount: 250_000, paidOn: '2026-05-10' },
      TODAY,
    );
    if (!created.ok) throw new Error('payment not saved');
    repos.payments.update(
      { id: created.id, amount: 500_000, from: payment.from, paidOn: '2026-05-10', note: '' },
      TODAY,
    );
    repos.payments.void(created.id);
    const [voided, updated, made] = firstPage();
    expect(made).toMatchObject({ action: 'create', name: 'Shop 1', receiptNumber: 1 });
    expect(updated).toMatchObject({ action: 'update', amount: 500_000, previousAmount: 250_000 });
    expect(voided).toMatchObject({ action: 'void', amount: 500_000, currency: 'IQD' });
  });

  it('names an area without a name, and its receipts, by its category and renter', () => {
    const shops = repos.categories.list()[0]?.id ?? 0;
    const area = repos.areas.create(
      areaInput(shops, {
        name: '',
        renter: { fullName: 'Aram', phone: '', startedOn: '2026-01-01' },
      }),
    );
    if (!area.ok) throw new Error('area not created');
    const paid = repos.payments.create(
      {
        areaId: area.id,
        isBackfill: false,
        from: { year: 2026, month: 1 },
        note: '',
        amount: 250_000,
        paidOn: '2026-05-10',
      },
      TODAY,
    );
    if (!paid.ok) throw new Error('payment not saved');
    expect(
      firstPage()
        .slice(0, 2)
        .map((entry) => [entry.entity, entry.name]),
    ).toEqual([
      ['receipt', 'Shops | Aram'],
      ['area', 'Shops | Aram'],
    ]);
    expect(repos.payments.printData(paid.id, '2026-05-10')).toMatchObject({ areaName: 'Shops' });

    // A new renter later does not rename the old entries.
    repos.areas.changeRenter({
      kind: 'new',
      areaId: area.id,
      fullName: 'Bakhtiar',
      phone: '',
      startedOn: '2026-06-01',
    });
    expect(
      firstPage()
        .slice(0, 4)
        .map((entry) => [entry.action, entry.name]),
    ).toEqual([
      ['change_renter', 'Shops | Bakhtiar'],
      ['create', 'Shops | Aram'],
      ['create', 'Shops | Aram'],
      ['create', 'Shop 1'],
    ]);
  });

  it('shows the name kept in the log when details cannot be read', () => {
    db.prepare(
      "INSERT INTO audit_log (action, entity, entity_id, details_json) VALUES ('delete', 'area', 999, 'not json')",
    ).run();
    expect(firstPage()[0]).toMatchObject({ action: 'delete', name: null, amount: null });
  });

  it('keeps the readable details when one stored field is unexpected', () => {
    db.prepare(
      `INSERT INTO audit_log (action, entity, entity_id, details_json)
       VALUES ('change_renter', 'area', ?, '{"renter": "Dara", "previous": {"odd": true}, "startedOn": 5}')`,
    ).run(areaId);
    db.prepare(
      `INSERT INTO audit_log (action, entity, entity_id, details_json)
       VALUES ('void', 'receipt', 999, '{"amount": 50000, "receiptNumber": "x", "renter": ["odd"]}')`,
    ).run();
    const [voided, renter] = firstPage();
    expect(renter).toMatchObject({ renter: 'Dara', name: 'Shop 1' });
    expect(voided).toMatchObject({ amount: 50_000, renter: null });
  });

  it('loads older entries a page at a time', () => {
    const insert = db.prepare(
      "INSERT INTO audit_log (action, entity, entity_id, details_json) VALUES ('update', 'area', ?, '{}')",
    );
    for (let i = 0; i < ACTIVITY_PAGE_SIZE; i += 1) insert.run(areaId);
    const first = repos.activity.page({ beforeId: null });
    expect(first.entries).toHaveLength(ACTIVITY_PAGE_SIZE);
    expect(first.hasMore).toBe(true);
    const second = repos.activity.page({ beforeId: first.entries.at(-1)?.id ?? null });
    expect(second.entries.map((entry) => entry.action)).toEqual(['create', 'create']);
    expect(second.hasMore).toBe(false);
  });
});
