import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../../src/main/db/connection';
import type { Repositories } from '../../src/main/db/repositories';
import {
  areaCreateSchema,
  areaLabel,
  compareAreaLabels,
  areaSubline,
  hasOwnName,
  nameCollator,
} from '@shared/areas';
import { areaInput, createTestDatabase } from './helpers';

const TODAY = { year: 2026, month: 10 };

let db: Db;
let repos: Repositories;
let categoryId: number;

beforeEach(() => {
  ({ db, repos } = createTestDatabase());
  const created = repos.categories.create({ name: 'Shops', color: '#2f6f9f' });
  if (!created.ok) throw new Error('category failed');
  categoryId = created.id;
});
afterEach(() => db.close());

function createArea(overrides: Parameters<typeof areaInput>[1] = {}) {
  const result = repos.areas.create(areaInput(categoryId, overrides));
  if (!result.ok) throw new Error(`create failed: ${result.reason}`);
  return result.id;
}

function auditFor(areaId: number) {
  return (
    db
      .prepare(
        "SELECT action, details_json FROM audit_log WHERE entity = 'area' AND entity_id = ? ORDER BY id",
      )
      .all(areaId) as { action: string; details_json: string }[]
  ).map((row) => ({ action: row.action, details: JSON.parse(row.details_json) as unknown }));
}

describe('creating areas', () => {
  it('stores the area with its first price ("rent starts from") and its renter', () => {
    const id = createArea();
    expect(repos.areas.get(id)).toEqual({
      id,
      name: 'Shop 1',
      category: { id: categoryId, name: 'Shops', color: '#2f6f9f' },
      currency: 'IQD',
      address: '',
      contractStart: null,
      notes: '',
      prices: [{ year: 2026, month: 1, monthlyPrice: 250_000, currency: 'IQD' }],
      renters: [
        {
          id: expect.any(Number),
          fullName: 'Karwan Ahmed',
          phone: '0750 123 4567',
          startedOn: '2026-01-01',
          endedOn: null,
        },
      ],
      hasPayments: false,
    });
    expect(auditFor(id).map((entry) => entry.action)).toEqual(['create']);
  });

  it('allows an area without a renter', () => {
    const id = createArea({ renter: null });
    expect(repos.areas.get(id)?.renters).toEqual([]);
  });

  it('refuses a duplicate name in the same category, but allows it in another', () => {
    createArea({ name: 'Shop 1' });
    expect(repos.areas.create(areaInput(categoryId, { name: ' shop 1 ' }))).toEqual({
      ok: false,
      reason: 'duplicate_name',
    });
    const other = repos.categories.create({ name: 'Houses', color: null });
    if (!other.ok) throw new Error('category failed');
    expect(repos.areas.create(areaInput(other.id, { name: 'Shop 1' }))).toMatchObject({ ok: true });
  });

  it('allows any number of areas without a name in one category', () => {
    const first = createArea({ name: '' });
    const second = createArea({ name: '' });
    expect(repos.areas.get(second)?.name).toBe('');
    repos.areas.softDelete(first);
    expect(repos.areas.listDeleted()).toEqual([
      expect.objectContaining({ id: first, name: '', renterName: 'Karwan Ahmed' }),
    ]);
    expect(repos.areas.restore(first)).toEqual({ ok: true });
    expect(
      repos.areas.update({
        id: first,
        categoryId,
        name: '',
        address: '',
        contractStart: null,
        notes: '',
      }),
    ).toMatchObject({ ok: true });
  });

  it('accepts a blank name, or one of only invisible marks, as no name', () => {
    expect(areaCreateSchema.parse(areaInput(categoryId, { name: '   ' })).name).toBe('');
    expect(areaCreateSchema.parse(areaInput(categoryId, { name: '\u0640\u200c' })).name).toBe('');
    createArea({ name: '' });
    const input = areaCreateSchema.parse(areaInput(categoryId, { name: '\u200c' }));
    expect(repos.areas.create(input)).toMatchObject({ ok: true });
  });

  it('finds areas by their category, which names a place without a name', () => {
    createArea({ name: '' });
    expect(repos.areaViews.list({ search: 'shop', categoryId: null }, TODAY)).toHaveLength(1);
    expect(repos.areaViews.list({ search: 'offices', categoryId: null }, TODAY)).toEqual([]);
  });

  it('sorts areas by their shown name, then renter, then in the order they were added', () => {
    const areas = [
      { id: 3, name: '', categoryName: 'Lands', renterName: 'Karwan' },
      { id: 1, name: 'Shop B', categoryName: 'Shops', renterName: null },
      { id: 2, name: '', categoryName: 'Lands', renterName: 'Aram' },
      { id: 5, name: '', categoryName: 'Lands', renterName: 'Aram' },
      { id: 4, name: 'Kiosk', categoryName: 'Shops', renterName: null },
    ];
    const sorted = [...areas].sort(compareAreaLabels(nameCollator('en')));
    expect(sorted.map((area) => area.id)).toEqual([4, 2, 5, 3, 1]);
  });

  it('shows an area by its name, else its category', () => {
    expect(areaLabel({ name: 'Shop 1', categoryName: 'Shops' })).toBe('Shop 1');
    expect(areaLabel({ name: '', categoryName: 'Lands' })).toBe('Lands');
  });

  it('puts numbers in names in number order', () => {
    const names = ['Shop 10', 'Shop 9', 'Shop 1'];
    expect(names.sort(nameCollator('en').compare)).toEqual(['Shop 1', 'Shop 9', 'Shop 10']);
  });

  it('shows the category under an own name, else the renter, and never the label twice', () => {
    expect(areaSubline({ name: 'Shop 1', categoryName: 'Shops', renterName: 'Aram' })).toBe(
      'Shops',
    );
    expect(areaSubline({ name: '', categoryName: 'Lands', renterName: 'Aram' })).toBe('Aram');
    expect(areaSubline({ name: '', categoryName: 'Lands', renterName: null })).toBeNull();
    expect(hasOwnName({ name: 'Shop 1' })).toBe(true);
    expect(hasOwnName({ name: '' })).toBe(false);
  });

  it('refuses a missing or deleted category', () => {
    expect(repos.areas.create(areaInput(9999))).toEqual({
      ok: false,
      reason: 'category_not_found',
    });
  });

  it('leaves nothing behind when part of the creation fails', () => {
    // A renter start date the database cannot store rolls back the area and its price row too.
    const before = db.prepare('SELECT COUNT(*) AS count FROM areas').get();
    expect(() =>
      repos.areas.create(
        areaInput(categoryId, {
          name: 'Broken',
          // @ts-expect-error a null full name violates the NOT NULL constraint on purpose
          renter: { fullName: null, phone: '', startedOn: '2026-01-01' },
        }),
      ),
    ).toThrow();
    expect(db.prepare('SELECT COUNT(*) AS count FROM areas').get()).toEqual(before);
    expect(db.prepare('SELECT COUNT(*) AS count FROM area_prices').get()).toEqual({ count: 0 });
  });
});

describe('editing areas', () => {
  it('updates details, corrects the current renter, and keeps the search copies in sync', () => {
    const id = createArea();
    repos.areas.update({
      id,
      categoryId,
      name: 'دوکانی ١',
      address: 'Main street',
      contractStart: '2025-12-15',
      notes: 'Corner shop',
      renter: { fullName: 'كاروان أحمد', phone: '٠٧٥٠ ١١١ ٢٢٢٢' },
    });
    const details = repos.areas.get(id);
    expect(details).toMatchObject({
      name: 'دوکانی ١',
      address: 'Main street',
      contractStart: '2025-12-15',
      notes: 'Corner shop',
    });
    expect(details?.renters).toHaveLength(1);
    expect(details?.renters[0]?.fullName).toBe('كاروان أحمد');
    // Found by the corrected name typed with Kurdish letters, and by the new phone digits.
    expect(repos.areaViews.list({ search: 'کاروان', categoryId: null }, TODAY)).toHaveLength(1);
    expect(repos.areaViews.list({ search: '07501112222', categoryId: null }, TODAY)).toHaveLength(
      1,
    );
    expect(repos.areaViews.list({ search: 'دوكاني', categoryId: null }, TODAY)).toHaveLength(1);
    expect(auditFor(id).at(-1)?.action).toBe('update');
  });
});

describe('prices', () => {
  it('changes the price from a month onward and keeps earlier months', () => {
    const id = createArea();
    expect(
      repos.priceChanges.changePrice(
        {
          areaId: id,
          from: { year: 2026, month: 6 },
          monthlyPrice: 300_000,
        },
        TODAY,
      ),
    ).toEqual({ ok: true });
    expect(repos.areas.get(id)?.prices).toEqual([
      { year: 2026, month: 1, monthlyPrice: 250_000, currency: 'IQD' },
      { year: 2026, month: 6, monthlyPrice: 300_000, currency: 'IQD' },
    ]);
    expect(auditFor(id).at(-1)).toEqual({
      action: 'change_price',
      details: {
        from: { year: 2026, month: 6 },
        previousPrice: 250_000,
        previousCurrency: 'IQD',
        monthlyPrice: 300_000,
        currency: 'IQD',
        resharedReceipts: [],
      },
    });
  });

  it('replaces the price when changed twice from the same month', () => {
    const id = createArea();
    repos.priceChanges.changePrice(
      { areaId: id, from: { year: 2026, month: 6 }, monthlyPrice: 300_000 },
      TODAY,
    );
    repos.priceChanges.changePrice(
      { areaId: id, from: { year: 2026, month: 6 }, monthlyPrice: 280_000 },
      TODAY,
    );
    expect(repos.areas.get(id)?.prices.map((p) => p.monthlyPrice)).toEqual([250_000, 280_000]);
  });

  it('marks vacant with 0 and sets rent again later', () => {
    const id = createArea();
    repos.priceChanges.changePrice(
      { areaId: id, from: { year: 2026, month: 9 }, monthlyPrice: 0 },
      TODAY,
    );
    expect(repos.areaViews.list({ search: '', categoryId: null }, TODAY)[0]?.currentPrice).toBe(0);
    repos.priceChanges.changePrice(
      { areaId: id, from: { year: 2026, month: 10 }, monthlyPrice: 260_000 },
      TODAY,
    );
    expect(repos.areaViews.list({ search: '', categoryId: null }, TODAY)[0]?.currentPrice).toBe(
      260_000,
    );
  });

  it('refuses a change before the rent started', () => {
    const id = createArea();
    expect(
      repos.priceChanges.changePrice(
        { areaId: id, from: { year: 2025, month: 12 }, monthlyPrice: 1 },
        TODAY,
      ),
    ).toEqual({ ok: false, reason: 'before_rent_start' });
  });

  it('shows no current price before the rent starts', () => {
    createArea({ rentStartsFrom: { year: 2027, month: 1 } });
    expect(
      repos.areaViews.list({ search: '', categoryId: null }, TODAY)[0]?.currentPrice,
    ).toBeNull();
  });
});

describe('month boxes', () => {
  const statusesOf = (boxes: { status: string }[] | undefined) => boxes?.map((box) => box.status);

  it("lists each area with this year's month boxes, figures, summary and notes", () => {
    createArea({ rentStartsFrom: { year: 2026, month: 3 }, notes: 'Key with the guard' });
    const [area] = repos.areaViews.list({ search: '', categoryId: null }, TODAY);
    expect(area?.notes).toBe('Key with the guard');
    expect(area?.figures).toEqual([
      {
        currency: 'IQD',
        rent: 250_000,
        expected: 10 * 250_000,
        received: 0,
        remaining: 8 * 250_000,
      },
    ]);
    expect(statusesOf(area?.months)).toEqual([
      'not_applicable',
      'not_applicable',
      ...Array<string>(7).fill('late'),
      'due',
      'upcoming',
      'upcoming',
    ]);
    expect(area?.summary).toBe('late');
  });

  it('follows the price history, including vacant months', () => {
    const id = createArea();
    repos.priceChanges.changePrice(
      { areaId: id, from: { year: 2026, month: 6 }, monthlyPrice: 0 },
      TODAY,
    );
    const [area] = repos.areaViews.list({ search: '', categoryId: null }, TODAY);
    expect(statusesOf(area?.months)?.slice(4, 7)).toEqual([
      'late',
      'not_applicable',
      'not_applicable',
    ]);
  });

  it('gives any year of an area, and nothing for a missing or deleted area', () => {
    const id = createArea();
    const next = repos.areaViews.year(id, 2027, TODAY);
    expect(next?.year).toBe(2027);
    expect(next?.summary).toBe('nothing_due');
    expect(next?.figures).toEqual([
      { currency: 'IQD', rent: 250_000, expected: 12 * 250_000, received: 0, remaining: 0 },
    ]);
    expect(repos.areaViews.year(999, 2026, TODAY)).toBeNull();
    repos.areas.softDelete(id);
    expect(repos.areaViews.year(id, 2026, TODAY)).toBeNull();
  });
});

describe('price rows for all areas', () => {
  it('come oldest first even when added out of order', () => {
    const id = createArea({ rentStartsFrom: { year: 2026, month: 5 } });
    // A row added later but for an earlier month (as an import could do).
    db.prepare(
      `INSERT INTO area_prices (area_id, monthly_price, effective_from_year, effective_from_month)
       VALUES (?, 100, 2026, 2)`,
    ).run(id);
    const rows = repos.areaViews.overviews(TODAY);
    expect(rows[0]?.standing.lateMonths).toBe(8);
  });
});

describe('renters', () => {
  it('a new renter closes the current one and both stay in the history', () => {
    const id = createArea();
    expect(
      repos.areas.changeRenter({
        areaId: id,
        fullName: 'Sara Ali',
        phone: '0770 000 0000',
        startedOn: '2026-07-01',
      }),
    ).toEqual({ ok: true });
    expect(repos.areas.get(id)?.renters.map((r) => [r.fullName, r.startedOn, r.endedOn])).toEqual([
      ['Sara Ali', '2026-07-01', null],
      ['Karwan Ahmed', '2026-01-01', '2026-07-01'],
    ]);
    expect(repos.areaViews.list({ search: 'karwan', categoryId: null }, TODAY)).toEqual([]);
    expect(repos.areaViews.list({ search: 'sara', categoryId: null }, TODAY)).toHaveLength(1);
  });

  it('marking the area vacant also ends its renter, from the first day of that month', () => {
    const id = createArea();
    expect(
      repos.priceChanges.changePrice(
        { areaId: id, from: { year: 2026, month: 9 }, monthlyPrice: 0 },
        TODAY,
      ),
    ).toEqual({ ok: true });
    const [area] = repos.areaViews.list({ search: '', categoryId: null }, TODAY);
    expect(area?.renterName).toBeNull();
    expect(area?.currentPrice).toBe(0);
    expect(repos.areas.get(id)?.renters.map((renter) => renter.endedOn)).toEqual(['2026-09-01']);
    expect(auditFor(id).at(-1)).toEqual({
      action: 'end_renter',
      details: { renter: 'Karwan Ahmed', endedOn: '2026-09-01' },
    });
  });

  it('a renter who started after the vacant month ends on the day they started', () => {
    const id = createArea();
    repos.areas.changeRenter({
      areaId: id,
      fullName: 'Sara Ali',
      phone: '',
      startedOn: '2026-07-15',
    });
    repos.priceChanges.changePrice(
      { areaId: id, from: { year: 2026, month: 6 }, monthlyPrice: 0 },
      TODAY,
    );
    expect(repos.areas.get(id)?.renters.map((renter) => [renter.fullName, renter.endedOn])).toEqual(
      expect.arrayContaining([['Sara Ali', '2026-07-15']]),
    );
  });

  it('a new price that is not vacant keeps the renter', () => {
    const id = createArea();
    repos.priceChanges.changePrice(
      { areaId: id, from: { year: 2026, month: 9 }, monthlyPrice: 300_000 },
      TODAY,
    );
    expect(repos.areaViews.list({ search: '', categoryId: null }, TODAY)[0]?.renterName).toBe(
      'Karwan Ahmed',
    );
  });

  it('refuses dates before the current renter started', () => {
    const id = createArea();
    expect(
      repos.areas.changeRenter({
        areaId: id,
        fullName: 'Early',
        phone: '',
        startedOn: '2025-12-31',
      }),
    ).toEqual({ ok: false, reason: 'before_current_renter' });
  });
});

describe('searching and filtering', () => {
  it('finds areas by name, renter or phone across letter variants and digit styles', () => {
    createArea({
      name: 'خانووی هەولێر',
      renter: { fullName: 'علی کەریم', phone: '٠٧٥٠ ٩٩٩ ٨٨٧٧', startedOn: '2026-01-01' },
    });
    createArea({ name: 'Shop 2', renter: null });
    const search = (text: string) =>
      repos.areaViews.list({ search: text, categoryId: null }, TODAY).map((area) => area.name);
    expect(search('خانوو')).toEqual(['خانووی هەولێر']);
    expect(search('هه‌ولێر')).toEqual(['خانووی هەولێر']);
    expect(search('علي كريم'.replace('كريم', 'كەريم'))).toEqual(['خانووی هەولێر']);
    expect(search('0750999')).toEqual(['خانووی هەولێر']);
    expect(search('shop 2')).toEqual(['Shop 2']);
    expect(search('')).toHaveLength(2);
    expect(search('nothing like this')).toEqual([]);
  });

  it('treats % and _ in a search as plain characters', () => {
    createArea({ name: '100% Shop' });
    createArea({ name: 'Other' });
    expect(
      repos.areaViews.list({ search: '%', categoryId: null }, TODAY).map((a) => a.name),
    ).toEqual(['100% Shop']);
    expect(repos.areaViews.list({ search: '_', categoryId: null }, TODAY)).toEqual([]);
  });

  it('filters by category', () => {
    createArea();
    const houses = repos.categories.create({ name: 'Houses', color: null });
    if (!houses.ok) throw new Error('category failed');
    repos.areas.create(areaInput(houses.id, { name: 'House 1' }));
    expect(
      repos.areaViews.list({ search: '', categoryId: houses.id }, TODAY).map((area) => area.name),
    ).toEqual(['House 1']);
  });

  it('lists and searches 200 areas quickly', () => {
    for (let index = 1; index <= 200; index += 1) {
      createArea({
        name: `Area ${index}`,
        renter: { fullName: `Renter ${index}`, phone: `0750${index}`, startedOn: '2026-01-01' },
      });
      if (index % 3 === 0) {
        repos.priceChanges.changePrice(
          {
            areaId: index,
            from: { year: 2026, month: 6 },
            monthlyPrice: 300_000,
          },
          TODAY,
        );
      }
    }
    const started = performance.now();
    expect(repos.areaViews.list({ search: '', categoryId: null }, TODAY)).toHaveLength(200);
    expect(
      repos.areaViews.list({ search: 'renter 15', categoryId: null }, TODAY).length,
    ).toBeGreaterThan(0);
    expect(performance.now() - started).toBeLessThan(100);
  });
});

describe('deleting and restoring', () => {
  it('moves an area to Deleted items and brings it back', () => {
    const id = createArea();
    expect(repos.areas.softDelete(id)).toEqual({ ok: true });
    expect(repos.areaViews.list({ search: '', categoryId: null }, TODAY)).toEqual([]);
    expect(repos.areas.get(id)).toBeNull();
    expect(repos.areas.listDeleted().map((area) => area.name)).toEqual(['Shop 1']);

    expect(repos.areas.restore(id)).toEqual({ ok: true });
    expect(repos.areas.get(id)?.prices).toHaveLength(1);
    expect(auditFor(id).map((entry) => entry.action)).toEqual(['create', 'delete', 'restore']);
  });

  it('restores the category too when it was deleted after the area', () => {
    const id = createArea();
    repos.areas.softDelete(id);
    repos.categories.softDelete(categoryId);
    expect(repos.areas.restore(id)).toEqual({ ok: true });
    expect(repos.categories.list().map((category) => category.name)).toEqual(['Shops']);
  });

  it('changes nothing when the name was reused meanwhile', () => {
    const id = createArea();
    repos.areas.softDelete(id);
    createArea({ name: 'Shop 1' });
    expect(repos.areas.restore(id)).toEqual({ ok: false, reason: 'duplicate_name' });
    expect(repos.areas.listDeleted().map((area) => area.id)).toEqual([id]);
  });

  it('a deleted area frees its name for a new one', () => {
    const id = createArea();
    repos.areas.softDelete(id);
    expect(repos.areas.create(areaInput(categoryId, { name: 'Shop 1' }))).toMatchObject({
      ok: true,
    });
  });
});
