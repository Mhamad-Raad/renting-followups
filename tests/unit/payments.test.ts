import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { BusinessToday } from '@shared/dates';
import type { RenterChange } from '@shared/areas';
import type { PaymentCreate } from '@shared/payments';
import type { Db } from '../../src/main/db/connection';
import type { Repositories } from '../../src/main/db/repositories';
import { areaInput, createTestDatabase } from './helpers';

const TODAY: BusinessToday = { date: '2026-05-15', month: { year: 2026, month: 5 } };
const RENT = 250_000;

let db: Db;
let repos: Repositories;
let areaId: number;

beforeEach(() => {
  ({ db, repos } = createTestDatabase());
  const category = repos.categories.create({ name: 'Shops', color: null });
  if (!category.ok) throw new Error('category failed');
  const area = repos.areas.create(areaInput(category.id));
  if (!area.ok) throw new Error('area failed');
  areaId = area.id;
});
afterEach(() => db.close());

function pay(overrides: Partial<PaymentCreate> = {}) {
  return repos.payments.create(
    {
      areaId,
      isBackfill: false,
      amount: RENT,
      from: { year: 2026, month: 1 },
      paidOn: '2026-05-10',
      note: '',
      ...overrides,
    },
    TODAY,
  );
}

function payOk(overrides: Partial<PaymentCreate> = {}) {
  const result = pay(overrides);
  if (!result.ok) throw new Error(`payment failed: ${result.reason}`);
  return result;
}

const receipts = (year = 2026, month: number | null = null) =>
  repos.payments.forArea({ areaId, year, month });

const statuses = () =>
  repos.areaViews.year(areaId, 2026, TODAY.month)?.boxes.map((box) => box.status);

describe('recording payments', () => {
  it('numbers receipts 1, 2, 3 in order', () => {
    expect(payOk().receiptNumber).toBe(1);
    expect(payOk().receiptNumber).toBe(2);
    expect(payOk().receiptNumber).toBe(3);
  });

  it('pays several months at once and the month colours follow', () => {
    payOk({ amount: 2 * RENT + 100_000 });
    expect(statuses()?.slice(0, 6)).toEqual(['paid', 'paid', 'late', 'late', 'due', 'upcoming']);
    const year = repos.areaViews.year(areaId, 2026, TODAY.month);
    expect(year?.boxes[2]).toMatchObject({ paid: 100_000, status: 'late' });
    expect(year?.figures[0]?.received).toBe(2 * RENT + 100_000);
  });

  it('a partial payment for this month is orange, a full one green', () => {
    payOk({ amount: 4 * RENT + 50_000 });
    expect(statuses()?.[4]).toBe('due');
    payOk({ amount: RENT - 50_000, from: { year: 2026, month: 5 } });
    expect(statuses()?.[4]).toBe('paid');
  });

  it('a prepaid future month is green, a part-prepaid one orange', () => {
    payOk({ amount: RENT + 100_000, from: { year: 2026, month: 7 } });
    expect(statuses()?.slice(6, 9)).toEqual(['paid', 'partial', 'upcoming']);
  });

  it('shows on the Areas list with this year’s colours', () => {
    payOk({ amount: 5 * RENT });
    const [area] = repos.areaViews.list({ search: '', categoryId: null }, TODAY.month);
    expect(area?.summary).toBe('paid');
    expect(area?.figures).toMatchObject([{ rent: RENT, received: 5 * RENT, remaining: 0 }]);
    expect(area?.months.slice(0, 6).map((box) => box.status)).toEqual([
      ...Array<string>(5).fill('paid'),
      'upcoming',
    ]);
  });

  it('keeps the renter at the time of payment, even after the renter changes', () => {
    const { id } = payOk();
    repos.areas.changeRenter({
      areaId,
      fullName: 'Sara Ali',
      phone: '',
      startedOn: '2026-05-12',
    });
    expect(receipts().find((r) => r.id === id)?.renterName).toBe('Karwan Ahmed');
  });

  it('a past record gets no receipt number and does not use one up', () => {
    const past = payOk({ isBackfill: true, paidOn: '2026-02-01' });
    expect(past.receiptNumber).toBeNull();
    expect(payOk().receiptNumber).toBe(1);
    expect(receipts().find((r) => r.id === past.id)).toMatchObject({
      isBackfill: true,
      receiptNumber: null,
    });
    expect(statuses()?.slice(0, 2)).toEqual(['paid', 'paid']);
  });

  it('refuses more than 2 years of rent, a date in the future, or a missing area', () => {
    expect(pay({ amount: 100 * RENT })).toEqual({ ok: false, reason: 'too_much' });
    expect(pay({ paidOn: '2026-05-16' })).toEqual({ ok: false, reason: 'future_date' });
    expect(pay({ areaId: 999 })).toEqual({ ok: false, reason: 'not_found' });
    repos.areas.softDelete(areaId);
    expect(pay()).toEqual({ ok: false, reason: 'not_found' });
  });

  it('a refused payment leaves nothing behind and uses no number', () => {
    pay({ amount: 100 * RENT });
    expect(receipts()).toEqual([]);
    expect(payOk().receiptNumber).toBe(1);
  });

  it('suggests the oldest month not fully paid', () => {
    expect(repos.payments.suggestedStart(areaId, TODAY.month)).toEqual({ year: 2026, month: 1 });
    payOk({ amount: RENT + 1 });
    expect(repos.payments.suggestedStart(areaId, TODAY.month)).toEqual({ year: 2026, month: 2 });
  });

  it('previews the months without saving anything', () => {
    const preview = repos.payments.preview(
      areaId,
      RENT + 10,
      { year: 2026, month: 1 },
      TODAY.month,
      null,
    );
    expect(preview).toMatchObject({
      ok: true,
      months: [
        { month: 1, amount: RENT },
        { month: 2, amount: 10 },
      ],
    });
    expect(receipts()).toEqual([]);
    expect(repos.payments.preview(999, 1, TODAY.month, TODAY.month, null)).toBeNull();
  });
});

describe('price changes share paid money out again', () => {
  const months = (id: number) =>
    receipts()
      .find((receipt) => receipt.id === id)
      ?.allocations.map((m) => [m.month, m.amount]);
  const changePrice = (month: number, monthlyPrice: number) =>
    repos.priceChanges.changePrice(
      { areaId, from: { year: 2026, month }, monthlyPrice },
      TODAY.month,
    );

  it('a higher rent: the same money fills fewer months', () => {
    const { id } = payOk({ amount: 3 * RENT, from: { year: 2026, month: 3 } });
    expect(changePrice(3, 300_000)).toEqual({ ok: true });
    expect(months(id)).toEqual([
      [3, 300_000],
      [4, 300_000],
      [5, 150_000],
    ]);
    expect(statuses()?.slice(2, 5)).toEqual(['paid', 'paid', 'due']);
  });

  it('a lower rent: the extra moves on to the next months', () => {
    const { id, receiptNumber } = payOk({ amount: 3 * RENT, from: { year: 2026, month: 3 } });
    expect(changePrice(3, 200_000)).toEqual({ ok: true });
    expect(months(id)).toEqual([
      [3, 200_000],
      [4, 200_000],
      [5, 200_000],
      [6, 150_000],
    ]);
    expect(receipts()[0]).toMatchObject({ receiptNumber, totalAmount: 3 * RENT });
  });

  it('months before the change keep their money; later receipts keep their own start', () => {
    const early = payOk({ amount: 4 * RENT, from: { year: 2026, month: 1 } });
    const later = payOk({ amount: RENT, from: { year: 2026, month: 8 } });
    expect(changePrice(3, 300_000)).toEqual({ ok: true });
    expect(months(early.id)).toEqual([
      [1, RENT],
      [2, RENT],
      [3, 300_000],
      [4, 200_000],
    ]);
    expect(months(later.id)).toEqual([[8, RENT]]);
  });

  it('cancelled receipts are left alone', () => {
    const { id } = payOk({ amount: RENT, from: { year: 2026, month: 3 } });
    repos.payments.void(id);
    expect(changePrice(3, 300_000)).toEqual({ ok: true });
    expect(months(id)).toEqual([[3, RENT]]);
  });

  it('refuses when the money would have nowhere to go, and changes nothing', () => {
    const { id } = payOk({ amount: RENT, from: { year: 2026, month: 6 } });
    expect(changePrice(6, 0)).toEqual({ ok: false, reason: 'no_room' });
    expect(
      repos.priceChanges.priceChangeImpact(
        { areaId, from: { year: 2026, month: 6 }, monthlyPrice: 0 },
        TODAY.month,
      ),
    ).toEqual({
      ok: false,
      reason: 'no_room',
      vacantPayments: [
        {
          receiptId: id,
          receiptNumber: 1,
          currency: 'IQD',
          months: [{ year: 2026, month: 6 }],
          amount: RENT,
          cancels: true,
        },
      ],
    });
    expect(repos.areas.get(areaId)?.prices).toHaveLength(1);
    expect(months(id)).toEqual([[6, RENT]]);
  });

  it('lists each receipt paying months that would become vacant', () => {
    const early = payOk({ amount: 3 * RENT, from: { year: 2026, month: 4 } });
    const later = payOk({ amount: RENT, from: { year: 2026, month: 7 } });
    const impact = repos.priceChanges.priceChangeImpact(
      { areaId, from: { year: 2026, month: 6 }, monthlyPrice: 0 },
      TODAY.month,
    );
    expect(impact).toEqual({
      ok: false,
      reason: 'no_room',
      vacantPayments: [
        {
          receiptId: early.id,
          receiptNumber: 1,
          currency: 'IQD',
          months: [{ year: 2026, month: 6 }],
          amount: RENT,
          cancels: false,
        },
        {
          receiptId: later.id,
          receiptNumber: 2,
          currency: 'IQD',
          months: [{ year: 2026, month: 7 }],
          amount: RENT,
          cancels: true,
        },
      ],
    });
  });

  it('can take the paid vacant months out and mark vacant in one step', () => {
    const early = payOk({ amount: 3 * RENT, from: { year: 2026, month: 4 } });
    const later = payOk({ amount: RENT, from: { year: 2026, month: 7 } });
    expect(
      repos.priceChanges.changePrice(
        { areaId, from: { year: 2026, month: 6 }, monthlyPrice: 0, takeOutVacantMonths: true },
        TODAY.month,
      ),
    ).toEqual({ ok: true });
    expect(months(early.id)).toEqual([
      [4, RENT],
      [5, RENT],
    ]);
    const after = receipts();
    expect(after.find((receipt) => receipt.id === early.id)).toMatchObject({
      receiptNumber: 1,
      totalAmount: 2 * RENT,
      voided: false,
    });
    expect(after.find((receipt) => receipt.id === later.id)?.voided).toBe(true);
    expect(repos.areas.get(areaId)?.prices.at(-1)).toMatchObject({ month: 6, monthlyPrice: 0 });
    expect(repos.areas.get(areaId)?.renters[0]?.endedOn).toBe('2026-06-01');
  });

  it('taking out leaves months that keep their rent alone', () => {
    const { id } = payOk({ amount: 2 * RENT, from: { year: 2026, month: 6 } });
    changePrice(7, RENT);
    expect(
      repos.priceChanges.changePrice(
        { areaId, from: { year: 2026, month: 6 }, monthlyPrice: 0, takeOutVacantMonths: true },
        TODAY.month,
      ),
    ).toEqual({ ok: true });
    expect(months(id)).toEqual([[7, RENT]]);
  });

  it('marking vacant moves the money to the next month with rent', () => {
    const { id } = payOk({ amount: RENT, from: { year: 2026, month: 6 } });
    // Rent from month 8 is set on its own first, so months 6 and 7 become the vacant gap.
    changePrice(8, RENT);
    expect(changePrice(6, 0)).toEqual({ ok: true });
    expect(months(id)).toEqual([[8, RENT]]);
  });
});

describe('editing and cancelling receipts', () => {
  it('editing works the months out again and keeps the receipt number', () => {
    const { id } = payOk({ amount: 2 * RENT });
    expect(
      repos.payments.update(
        { id, amount: RENT, from: { year: 2026, month: 3 }, paidOn: '2026-05-11', note: 'fixed' },
        TODAY,
      ),
    ).toEqual({ ok: true });
    const [receipt] = receipts();
    expect(receipt).toMatchObject({
      receiptNumber: 1,
      totalAmount: RENT,
      note: 'fixed',
      paidOn: '2026-05-11',
    });
    expect(receipt?.allocations).toEqual([{ year: 2026, month: 3, amount: RENT }]);
    expect(statuses()?.slice(0, 3)).toEqual(['late', 'late', 'paid']);
  });

  it('while editing, the receipt’s own months count as open again', () => {
    const { id } = payOk({ amount: RENT });
    const preview = repos.payments.preview(areaId, RENT, { year: 2026, month: 1 }, TODAY.month, id);
    expect(preview).toMatchObject({ ok: true, months: [{ month: 1, paidBefore: 0 }] });
  });

  it('cancelling keeps the receipt listed, stops it counting and never reuses its number', () => {
    const { id } = payOk({ amount: RENT });
    expect(repos.payments.void(id)).toEqual({ ok: true });
    expect(receipts()[0]).toMatchObject({ id, voided: true, receiptNumber: 1 });
    expect(statuses()?.[0]).toBe('late');
    expect(payOk().receiptNumber).toBe(2);
  });

  it('a cancelled receipt cannot be edited or cancelled again', () => {
    const { id } = payOk();
    repos.payments.void(id);
    expect(repos.payments.void(id)).toEqual({ ok: false, reason: 'cancelled' });
    expect(
      repos.payments.update(
        { id, amount: 1, from: TODAY.month, paidOn: TODAY.date, note: '' },
        TODAY,
      ),
    ).toEqual({ ok: false, reason: 'cancelled' });
  });

  it('the database refuses to change a receipt number', () => {
    const { id } = payOk();
    expect(() =>
      db.prepare('UPDATE receipts SET receipt_number = 7 WHERE id = ?').run(id),
    ).toThrow();
  });

  it('writes every save, edit and cancel to the activity log', () => {
    const { id } = payOk();
    repos.payments.update(
      { id, amount: 2, from: TODAY.month, paidOn: TODAY.date, note: '' },
      TODAY,
    );
    repos.payments.void(id);
    const actions = db
      .prepare(
        "SELECT action FROM audit_log WHERE entity = 'receipt' AND entity_id = ? ORDER BY id",
      )
      .all(id)
      .map((row) => (row as { action: string }).action);
    expect(actions).toEqual(['create', 'update', 'void']);
  });

  it('lists the receipts of a year or of one month, cancelled ones included', () => {
    const march = payOk({ amount: RENT, from: { year: 2026, month: 3 } });
    const yearEnd = payOk({ amount: 2 * RENT, from: { year: 2026, month: 12 } });
    repos.payments.void(march.id);
    expect(receipts().map((r) => r.id)).toEqual([yearEnd.id, march.id]);
    expect(receipts(2026, 3).map((r) => r.id)).toEqual([march.id]);
    expect(receipts(2027).map((r) => r.id)).toEqual([yearEnd.id]);
    expect(receipts(2026, 4)).toEqual([]);
  });

  it('gives each month\u2019s paid amount across all years, for one area or all', () => {
    payOk({ amount: RENT + 10, from: { year: 2026, month: 12 } });
    const history = repos.paid.history(areaId);
    expect([...history.values()]).toEqual([RENT, 10]);
    expect(repos.paid.historyForActiveAreas().get(areaId)).toEqual(history);
    repos.areas.softDelete(areaId);
    expect(repos.paid.historyForActiveAreas().size).toBe(0);
  });

  it('previews which months a price change would alter, without saving', () => {
    payOk({ amount: 2 * RENT, from: { year: 2026, month: 3 } });
    const change = { areaId, from: { year: 2026, month: 4 }, monthlyPrice: 300_000 };
    expect(repos.priceChanges.priceChangeImpact(change, TODAY.month)).toEqual({
      ok: true,
      changes: [
        {
          year: 2026,
          month: 4,
          currency: 'IQD',
          before: 'paid',
          after: 'late',
          paidBefore: RENT,
          paidAfter: RENT,
        },
      ],
    });
    expect(
      repos.priceChanges.priceChangeImpact(
        { ...change, from: { year: 2026, month: 5 } },
        TODAY.month,
      ),
    ).toEqual({ ok: true, changes: [] });
    expect(
      repos.priceChanges.priceChangeImpact({ ...change, areaId: 999 }, TODAY.month),
    ).toBeNull();
    expect(receipts()[0]?.allocations.map((m) => m.month)).toEqual([3, 4]);
  });

  it('gives Home each area\u2019s figures for this year and its standing across years', () => {
    payOk({ amount: 2 * RENT });
    const [area] = repos.areaViews.overviews(TODAY.month);
    expect(area).toMatchObject({
      id: areaId,
      name: 'Shop 1',
      currency: 'IQD',
      renterName: 'Karwan Ahmed',
      figures: [{ currency: 'IQD', rent: RENT, received: 2 * RENT, remaining: 3 * RENT }],
      standing: { owed: [{ currency: 'IQD', amount: 3 * RENT }], lateMonths: 2, dueNow: true },
    });
  });

  it('shows nothing of a deleted area until it is restored', () => {
    payOk();
    repos.areas.softDelete(areaId);
    expect(receipts()).toEqual([]);
    expect(repos.payments.suggestedStart(areaId, TODAY.month)).toBeNull();
    repos.areas.restore(areaId);
    expect(receipts()).toHaveLength(1);
  });

  it('gives the reminders every area with its whole price and payment history', () => {
    payOk({ amount: RENT + 10 });
    const [area] = repos.areaViews.reminderAreas();
    expect(area).toMatchObject({
      id: areaId,
      name: 'Shop 1',
      currency: 'IQD',
      renterName: 'Karwan Ahmed',
    });
    expect(area?.prices).toEqual([{ year: 2026, month: 1, monthlyPrice: RENT, currency: 'IQD' }]);
    expect([...(area?.paid.values() ?? [])]).toEqual([RENT, 10]);
  });

  it('knows the latest date money was received', () => {
    expect(repos.paid.latestPaidOn()).toBeNull();
    payOk({ paidOn: '2026-03-02' });
    payOk({ paidOn: '2026-04-20' });
    expect(repos.paid.latestPaidOn()).toBe('2026-04-20');
  });
});

describe('a new renter with a new rent or currency', () => {
  const USD_RENT = 300_00;
  const newRenter = (overrides: Partial<RenterChange> = {}) =>
    repos.priceChanges.changeRenter(
      {
        areaId,
        fullName: 'Ahmed Ali',
        phone: '',
        startedOn: '2026-07-01',
        monthlyPrice: RENT,
        ...overrides,
      },
      TODAY.month,
    );
  const prices = () => repos.areas.get(areaId)?.prices;
  const changePriceTo = (month: number, monthlyPrice: number) =>
    repos.priceChanges.changePrice(
      { areaId, from: { year: 2026, month }, monthlyPrice },
      TODAY.month,
    );

  it('keeps the rent as it is when it does not change', () => {
    expect(newRenter()).toEqual({ ok: true });
    expect(prices()).toHaveLength(1);
    expect(repos.areas.get(areaId)?.renters[0]?.fullName).toBe('Ahmed Ali');
  });

  it('sets a new rent from the month the renter starts', () => {
    expect(newRenter({ monthlyPrice: 300_000 })).toEqual({ ok: true });
    expect(prices()?.at(-1)).toEqual({
      year: 2026,
      month: 7,
      monthlyPrice: 300_000,
      currency: 'IQD',
    });
  });

  it('switches currency from that month: new money is in it and never fills older months', () => {
    expect(newRenter({ monthlyPrice: USD_RENT, currency: 'USD' })).toEqual({ ok: true });
    expect(repos.areas.get(areaId)?.currency).toBe('USD');
    // Paid from January in dinars: it fills January to June only, never the dollar months.
    expect(pay({ amount: 7 * RENT })).toEqual({ ok: false, reason: 'too_much' });
    payOk({ amount: 6 * RENT });
    const dollars = payOk({ amount: USD_RENT, from: { year: 2026, month: 7 } });
    const saved = receipts();
    expect(saved.find((receipt) => receipt.id === dollars.id)?.currency).toBe('USD');
    expect(saved.find((receipt) => receipt.id !== dollars.id)?.currency).toBe('IQD');
    expect(repos.areaViews.year(areaId, 2026, TODAY.month)?.figures).toEqual([
      { currency: 'IQD', rent: RENT, expected: 6 * RENT, received: 6 * RENT, remaining: 0 },
      {
        currency: 'USD',
        rent: USD_RENT,
        expected: 6 * USD_RENT,
        received: USD_RENT,
        remaining: 0,
      },
    ]);
  });

  it('lists dinar payments for the new dollar months, and can take them out in the same step', () => {
    const prepaid = payOk({ amount: 8 * RENT });
    const impact = repos.priceChanges.priceChangeImpact(
      { areaId, from: { year: 2026, month: 7 }, monthlyPrice: USD_RENT, currency: 'USD' },
      TODAY.month,
    );
    expect(impact).toMatchObject({
      ok: false,
      reason: 'no_room',
      vacantPayments: [
        {
          receiptId: prepaid.id,
          currency: 'IQD',
          months: [
            { year: 2026, month: 7 },
            { year: 2026, month: 8 },
          ],
          amount: 2 * RENT,
          cancels: false,
        },
      ],
    });
    // Without taking them out nothing is saved, not even the renter.
    expect(newRenter({ monthlyPrice: USD_RENT, currency: 'USD' })).toEqual({
      ok: false,
      reason: 'no_room',
    });
    expect(repos.areas.get(areaId)?.renters).toHaveLength(1);
    expect(prices()).toHaveLength(1);
    expect(
      newRenter({ monthlyPrice: USD_RENT, currency: 'USD', takeOutVacantMonths: true }),
    ).toEqual({ ok: true });
    expect(receipts()[0]).toMatchObject({ totalAmount: 6 * RENT, currency: 'IQD' });
    expect(repos.areas.get(areaId)?.renters[0]?.fullName).toBe('Ahmed Ali');
  });

  it('adds only the renter when they start before the rent does', () => {
    const area = repos.areas.create(
      areaInput(repos.categories.list()[0]?.id ?? 0, {
        name: 'Shop 2',
        rentStartsFrom: { year: 2026, month: 11 },
        renter: null,
      }),
    );
    if (!area.ok) throw new Error('area failed');
    expect(
      repos.priceChanges.changeRenter(
        {
          areaId: area.id,
          fullName: 'Ahmed Ali',
          phone: '',
          startedOn: '2026-10-20',
          monthlyPrice: RENT,
        },
        TODAY.month,
      ),
    ).toEqual({ ok: true });
    expect(repos.areas.get(area.id)?.prices).toHaveLength(1);
  });

  it('new money starting in a vacant month takes the currency of the next rent', () => {
    changePriceTo(5, 0);
    expect(newRenter({ startedOn: '2026-07-01', monthlyPrice: USD_RENT, currency: 'USD' })).toEqual(
      { ok: true },
    );
    const { id } = payOk({ amount: USD_RENT, from: { year: 2026, month: 5 } });
    const receipt = receipts().find((each) => each.id === id);
    expect(receipt).toMatchObject({ currency: 'USD' });
    expect(receipt?.allocations).toEqual([{ year: 2026, month: 7, amount: USD_RENT }]);
  });

  it('changes nothing when the renter cannot be saved', () => {
    expect(newRenter({ startedOn: '2025-12-01', monthlyPrice: 300_000 })).toMatchObject({
      ok: false,
    });
    expect(prices()).toHaveLength(1);
  });
});

describe('correcting an area currency', () => {
  const edit = (currency: 'IQD' | 'USD') => {
    const area = repos.areas.get(areaId);
    if (!area) throw new Error('no area');
    return repos.areas.update({
      id: areaId,
      categoryId: area.category.id,
      name: area.name,
      address: area.address,
      contractStart: area.contractStart,
      notes: area.notes,
      currency,
    });
  };

  it('changes while there are no payments, and the rent keeps its written number', () => {
    expect(repos.areas.get(areaId)?.hasPayments).toBe(false);
    expect(edit('USD')).toEqual({ ok: true, id: areaId });
    // 250,000 dinar becomes 250,000.00 dollars (stored in cents).
    expect(repos.areas.get(areaId)).toMatchObject({
      currency: 'USD',
      prices: [expect.objectContaining({ monthlyPrice: RENT * 100, currency: 'USD' })],
    });
    expect(edit('IQD')).toEqual({ ok: true, id: areaId });
    expect(repos.areas.get(areaId)?.prices[0]?.monthlyPrice).toBe(RENT);
  });

  it('is refused once a payment counts, and allowed again after it is cancelled', () => {
    const { id } = payOk();
    expect(repos.areas.get(areaId)?.hasPayments).toBe(true);
    expect(edit('USD')).toEqual({ ok: false, reason: 'has_payments' });
    expect(repos.areas.get(areaId)?.currency).toBe('IQD');
    repos.payments.void(id);
    expect(edit('USD')).toEqual({ ok: true, id: areaId });
  });
});
