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
      monthCount: 1,
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

  it('pays several whole months at once and the month colours follow', () => {
    payOk({ monthCount: 2 });
    expect(statuses()?.slice(0, 6)).toEqual(['paid', 'paid', 'late', 'late', 'due', 'upcoming']);
    const year = repos.areaViews.year(areaId, 2026, TODAY.month);
    expect(year?.boxes[1]).toMatchObject({ paid: RENT, status: 'paid' });
    expect(year?.figures[0]?.received).toBe(2 * RENT);
    expect(receipts()[0]?.totalAmount).toBe(2 * RENT);
  });

  it('this month is red until it is paid, then green', () => {
    payOk({ monthCount: 4 });
    expect(statuses()?.[4]).toBe('due');
    payOk({ from: { year: 2026, month: 5 } });
    expect(statuses()?.[4]).toBe('paid');
  });

  it('a prepaid future month is green', () => {
    payOk({ from: { year: 2026, month: 7 } });
    expect(statuses()?.slice(6, 9)).toEqual(['paid', 'upcoming', 'upcoming']);
  });

  it('skips months already paid and pays the next open ones', () => {
    payOk({ from: { year: 2026, month: 2 } });
    const { id } = payOk({ monthCount: 2 });
    expect(
      receipts()
        .find((r) => r.id === id)
        ?.allocations.map((m) => m.month),
    ).toEqual([1, 3]);
  });

  it('shows on the Areas list with this year’s colours', () => {
    payOk({ monthCount: 5 });
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

  it('refuses more months than are open up to 2 years ahead, a future date, or a missing area', () => {
    // From January 2026 up to May 2028: 29 months.
    expect(pay({ monthCount: 30 })).toEqual({ ok: false, reason: 'too_much' });
    expect(pay({ monthCount: 29 }).ok).toBe(true);
    expect(pay({ paidOn: '2026-05-16' })).toEqual({ ok: false, reason: 'future_date' });
    expect(pay({ areaId: 999 })).toEqual({ ok: false, reason: 'not_found' });
    repos.areas.softDelete(areaId);
    expect(pay()).toEqual({ ok: false, reason: 'not_found' });
  });

  it('a refused payment leaves nothing behind and uses no number', () => {
    pay({ monthCount: 100 });
    expect(receipts()).toEqual([]);
    expect(payOk().receiptNumber).toBe(1);
  });

  it('suggests the oldest month not paid', () => {
    expect(repos.payments.suggestedStart(areaId, TODAY.month)).toEqual({ year: 2026, month: 1 });
    payOk();
    expect(repos.payments.suggestedStart(areaId, TODAY.month)).toEqual({ year: 2026, month: 2 });
  });

  it('previews the months without saving anything', () => {
    const preview = repos.payments.preview(areaId, 2, { year: 2026, month: 1 }, TODAY.month, null);
    expect(preview).toMatchObject({
      ok: true,
      months: [
        { month: 1, amount: RENT },
        { month: 2, amount: RENT },
      ],
      open: 29,
    });
    expect(receipts()).toEqual([]);
    expect(repos.payments.preview(999, 1, TODAY.month, TODAY.month, null)).toBeNull();
    // A receipt id from another area is not used for this area's preview.
    const { id } = payOk();
    const other = repos.areas.create(
      areaInput(repos.categories.list()[0]?.id ?? 0, { name: 'Shop 2', monthlyPrice: 100_000 }),
    );
    if (!other.ok) throw new Error('area failed');
    const foreign = repos.payments.preview(other.id, 1, { year: 2026, month: 1 }, TODAY.month, id);
    expect(foreign).toMatchObject({ ok: true, months: [{ month: 1, amount: 100_000 }] });
  });
});

describe('price changes keep paid months as they are', () => {
  const months = (id: number) =>
    receipts()
      .find((receipt) => receipt.id === id)
      ?.allocations.map((m) => [m.month, m.amount]);
  const changePrice = (month: number, monthlyPrice: number) =>
    repos.priceChanges.changePrice({ areaId, from: { year: 2026, month }, monthlyPrice });

  it('a higher rent: paid months stay paid at the old rent, the rest take the new one', () => {
    const { id } = payOk({ monthCount: 2, from: { year: 2026, month: 3 } });
    expect(changePrice(3, 300_000)).toEqual({ ok: true });
    expect(months(id)).toEqual([
      [3, RENT],
      [4, RENT],
    ]);
    expect(statuses()?.slice(2, 5)).toEqual(['paid', 'paid', 'due']);
    const year = repos.areaViews.year(areaId, 2026, TODAY.month);
    // Months 1–2 and 3–4 at the old rent, 5–12 at the new one.
    expect(year?.figures[0]).toMatchObject({
      rent: 300_000,
      expected: 4 * RENT + 8 * 300_000,
      received: 2 * RENT,
      remaining: 2 * RENT + 300_000,
    });
    const next = payOk({ from: { year: 2026, month: 3 } });
    expect(months(next.id)).toEqual([[5, 300_000]]);
  });

  it('a lower rent: receipts keep their number, months and total', () => {
    const { id, receiptNumber } = payOk({ monthCount: 3, from: { year: 2026, month: 3 } });
    expect(changePrice(3, 200_000)).toEqual({ ok: true });
    expect(months(id)).toEqual([
      [3, RENT],
      [4, RENT],
      [5, RENT],
    ]);
    expect(receipts()[0]).toMatchObject({ receiptNumber, totalAmount: 3 * RENT });
  });

  it('editing a receipt after a rent change keeps its paid months at the old rent', () => {
    const { id } = payOk({ monthCount: 2, from: { year: 2026, month: 3 } });
    changePrice(3, 300_000);
    const edit = {
      id,
      monthCount: 3,
      from: { year: 2026, month: 3 },
      paidOn: TODAY.date,
      note: '',
    };
    const preview = repos.payments.preview(areaId, 3, edit.from, TODAY.month, id);
    expect(preview?.ok && preview.months.map((m) => m.amount)).toEqual([RENT, RENT, 300_000]);
    expect(repos.payments.update(edit, TODAY)).toEqual({ ok: true });
    expect(months(id)).toEqual([
      [3, RENT],
      [4, RENT],
      [5, 300_000],
    ]);
    expect(receipts()[0]?.totalAmount).toBe(2 * RENT + 300_000);
  });

  it('says which paid months keep their old rent, without saving', () => {
    payOk({ monthCount: 2, from: { year: 2026, month: 3 } });
    const change = { areaId, from: { year: 2026, month: 4 }, monthlyPrice: 300_000 };
    expect(repos.priceChanges.priceChangeImpact(change)).toEqual({
      ok: true,
      keptPaid: [{ year: 2026, month: 4 }],
    });
    expect(
      repos.priceChanges.priceChangeImpact({ ...change, from: { year: 2026, month: 5 } }),
    ).toEqual({ ok: true, keptPaid: [] });
    // The same rent again changes nothing.
    expect(repos.priceChanges.priceChangeImpact({ ...change, monthlyPrice: RENT })).toEqual({
      ok: true,
      keptPaid: [],
    });
    expect(repos.priceChanges.priceChangeImpact({ ...change, areaId: 999 })).toBeNull();
    expect(repos.areas.get(areaId)?.prices).toHaveLength(1);
  });

  it('refuses when the money would have nowhere to go, and changes nothing', () => {
    const { id } = payOk({ from: { year: 2026, month: 6 } });
    expect(changePrice(6, 0)).toEqual({ ok: false, reason: 'no_room' });
    expect(
      repos.priceChanges.priceChangeImpact({
        areaId,
        from: { year: 2026, month: 6 },
        monthlyPrice: 0,
      }),
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
    const early = payOk({ monthCount: 3, from: { year: 2026, month: 4 } });
    const later = payOk({ from: { year: 2026, month: 7 } });
    const impact = repos.priceChanges.priceChangeImpact({
      areaId,
      from: { year: 2026, month: 6 },
      monthlyPrice: 0,
    });
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
    const early = payOk({ monthCount: 3, from: { year: 2026, month: 4 } });
    const later = payOk({ from: { year: 2026, month: 7 } });
    expect(
      repos.priceChanges.changePrice({
        areaId,
        from: { year: 2026, month: 6 },
        monthlyPrice: 0,
        takeOutVacantMonths: true,
      }),
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
    const { id } = payOk({ monthCount: 2, from: { year: 2026, month: 6 } });
    changePrice(7, RENT);
    expect(
      repos.priceChanges.changePrice({
        areaId,
        from: { year: 2026, month: 6 },
        monthlyPrice: 0,
        takeOutVacantMonths: true,
      }),
    ).toEqual({ ok: true });
    expect(months(id)).toEqual([[7, RENT]]);
  });

  it('marking a paid month vacant never moves its money to another month', () => {
    const { id } = payOk({ from: { year: 2026, month: 6 } });
    // Rent from month 8 is set on its own first, so months 6 and 7 become the vacant gap.
    changePrice(8, RENT);
    expect(changePrice(6, 0)).toEqual({ ok: false, reason: 'no_room' });
    expect(months(id)).toEqual([[6, RENT]]);
  });
});

describe('editing and cancelling receipts', () => {
  it('editing works the months out again and keeps the receipt number', () => {
    const { id } = payOk({ monthCount: 2 });
    expect(
      repos.payments.update(
        { id, monthCount: 1, from: { year: 2026, month: 3 }, paidOn: '2026-05-11', note: 'fixed' },
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
    const { id } = payOk();
    const preview = repos.payments.preview(areaId, 2, { year: 2026, month: 1 }, TODAY.month, id);
    expect(preview).toMatchObject({ ok: true, months: [{ month: 1 }, { month: 2 }], open: 29 });
  });

  it('cancelling keeps the receipt listed, stops it counting and never reuses its number', () => {
    const { id } = payOk();
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
        { id, monthCount: 1, from: TODAY.month, paidOn: TODAY.date, note: '' },
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
      { id, monthCount: 2, from: TODAY.month, paidOn: TODAY.date, note: '' },
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
    const march = payOk({ from: { year: 2026, month: 3 } });
    const yearEnd = payOk({ monthCount: 2, from: { year: 2026, month: 12 } });
    repos.payments.void(march.id);
    expect(receipts().map((r) => r.id)).toEqual([yearEnd.id, march.id]);
    expect(receipts(2026, 3).map((r) => r.id)).toEqual([march.id]);
    expect(receipts(2027).map((r) => r.id)).toEqual([yearEnd.id]);
    expect(receipts(2026, 4)).toEqual([]);
  });

  it('gives each month\u2019s paid amount across all years, for one area or all', () => {
    payOk({ monthCount: 2, from: { year: 2026, month: 12 } });
    const history = repos.paid.history(areaId);
    expect([...history.values()]).toEqual([RENT, RENT]);
    expect(repos.paid.historyForActiveAreas().get(areaId)).toEqual(history);
    repos.areas.softDelete(areaId);
    expect(repos.paid.historyForActiveAreas().size).toBe(0);
  });

  it('gives Home each area\u2019s figures for this year and its standing across years', () => {
    payOk({ monthCount: 2 });
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
    payOk({ monthCount: 2 });
    const [area] = repos.areaViews.reminderAreas();
    expect(area).toMatchObject({
      id: areaId,
      name: 'Shop 1',
      currency: 'IQD',
      renterName: 'Karwan Ahmed',
    });
    expect(area?.prices).toEqual([{ year: 2026, month: 1, monthlyPrice: RENT, currency: 'IQD' }]);
    expect([...(area?.paid.values() ?? [])]).toEqual([RENT, RENT]);
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
    repos.priceChanges.changeRenter({
      areaId,
      fullName: 'Ahmed Ali',
      phone: '',
      startedOn: '2026-07-01',
      monthlyPrice: RENT,
      ...overrides,
    });
  const prices = () => repos.areas.get(areaId)?.prices;
  const changePriceTo = (month: number, monthlyPrice: number) =>
    repos.priceChanges.changePrice({ areaId, from: { year: 2026, month }, monthlyPrice });

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
    // January to May paid in dinars while the first renter was there.
    payOk({ monthCount: 5 });
    expect(newRenter({ monthlyPrice: USD_RENT, currency: 'USD' })).toEqual({ ok: true });
    expect(repos.areas.get(areaId)?.currency).toBe('USD');
    // The form starts from the new renter's month; the first renter's June is paid from its box, alone.
    const june = { year: 2026, month: 6 };
    expect(pay({ from: june })).toEqual({ ok: false, reason: 'before_renter' });
    expect(pay({ from: june, monthCount: 2, monthBox: true })).toEqual({
      ok: false,
      reason: 'before_renter',
    });
    payOk({ from: june, monthBox: true });
    const dollars = payOk({ from: { year: 2026, month: 7 } });
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
    const prepaid = payOk({ monthCount: 8 });
    const impact = repos.priceChanges.priceChangeImpact({
      areaId,
      from: { year: 2026, month: 7 },
      monthlyPrice: USD_RENT,
      currency: 'USD',
    });
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
      repos.priceChanges.changeRenter({
        areaId: area.id,
        fullName: 'Ahmed Ali',
        phone: '',
        startedOn: '2026-10-20',
        monthlyPrice: RENT,
      }),
    ).toEqual({ ok: true });
    expect(repos.areas.get(area.id)?.prices).toHaveLength(1);
  });

  it('a new renter after an empty place pays from their own month, in their currency', () => {
    changePriceTo(5, 0);
    expect(newRenter({ startedOn: '2026-07-01', monthlyPrice: USD_RENT, currency: 'USD' })).toEqual(
      { ok: true },
    );
    // The empty months before them are not theirs to pay.
    expect(pay({ from: { year: 2026, month: 5 } })).toEqual({ ok: false, reason: 'before_renter' });
    expect(repos.payments.suggestedStart(areaId, TODAY.month)).toEqual({ year: 2026, month: 7 });
    const { id } = payOk({ from: { year: 2026, month: 7 } });
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

describe('months without a renter (the business, 2026-11-01)', () => {
  /** A place whose rent starts in January, with its renter from `startedOn`. */
  function placeWithRenterFrom(startedOn: string) {
    const category = repos.categories.list()[0];
    if (!category) throw new Error('no category');
    const area = repos.areas.create(
      areaInput(category.id, {
        name: 'Shop 9',
        renter: { fullName: 'Shirin Omar', phone: '', startedOn },
      }),
    );
    if (!area.ok) throw new Error('area failed');
    return area.id;
  }
  const boxes = (id: number) =>
    repos.areaViews.year(id, 2026, { year: 2026, month: 11 })?.boxes.map((box) => box.status);
  const NOVEMBER: BusinessToday = { date: '2026-11-01', month: { year: 2026, month: 11 } };

  it('a month nobody was in is an empty box, not owed', () => {
    const id = placeWithRenterFrom('2026-09-01');
    expect(boxes(id)).toEqual([
      ...Array<string>(8).fill('not_applicable'),
      'late',
      'late',
      'due',
      'upcoming',
    ]);
    expect(repos.areaViews.year(id, 2026, NOVEMBER.month)?.figures[0]).toMatchObject({
      expected: 4 * RENT,
      remaining: 3 * RENT,
    });
  });

  it("pays from the renter's first month only", () => {
    const id = placeWithRenterFrom('2026-09-15');
    expect(repos.payments.suggestedStart(id, NOVEMBER.month)).toEqual({ year: 2026, month: 9 });
    const august = { year: 2026, month: 8 };
    expect(repos.payments.preview(id, 2, august, NOVEMBER.month, null)).toEqual({
      ok: false,
      reason: 'before_renter',
    });
    const create = (from: { year: number; month: number }, monthBox?: true) =>
      repos.payments.create(
        {
          areaId: id,
          isBackfill: false,
          monthCount: 1,
          from,
          paidOn: '2026-11-01',
          note: '',
          monthBox,
        },
        NOVEMBER,
      );
    expect(create(august)).toEqual({ ok: false, reason: 'before_renter' });
    // A month box of an empty month is no button; even so, it has no rent to pay.
    expect(create(august, true)).toEqual({ ok: false, reason: 'nothing_open' });
    expect(create({ year: 2026, month: 9 })).toMatchObject({ ok: true });
  });

  it('the months between a renter who left and the next one are empty', () => {
    // The first renter (from January) left at the end of June; the next came in September.
    expect(
      repos.priceChanges.changeRenter({
        areaId,
        fullName: 'Ahmed Ali',
        phone: '',
        startedOn: '2026-09-01',
        monthlyPrice: RENT,
      }),
    ).toEqual({ ok: true });
    db.prepare(
      "UPDATE renters SET ended_on = '2026-07-01' WHERE area_id = ? AND ended_on = '2026-09-01'",
    ).run(areaId);
    expect(boxes(areaId)?.slice(5, 9)).toEqual([
      'late',
      'not_applicable',
      'not_applicable',
      'late',
    ]);
  });

  it('a month already paid keeps counting, renter or not', () => {
    const id = placeWithRenterFrom('2026-01-01');
    const paidMarch = repos.payments.create(
      {
        areaId: id,
        isBackfill: true,
        monthCount: 1,
        from: { year: 2026, month: 3 },
        paidOn: '2026-03-01',
        note: '',
      },
      NOVEMBER,
    );
    expect(paidMarch).toMatchObject({ ok: true });
    // The renter's start is corrected to May: March stays paid, April is empty.
    db.prepare("UPDATE renters SET started_on = '2026-05-01' WHERE area_id = ?").run(id);
    expect(boxes(id)?.slice(0, 5)).toEqual([
      'not_applicable',
      'not_applicable',
      'paid',
      'not_applicable',
      'late',
    ]);
  });
});
