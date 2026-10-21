import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { BusinessToday } from '@shared/dates';
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

const statuses = () => repos.areas.year(areaId, 2026, TODAY.month)?.boxes.map((box) => box.status);

describe('recording payments', () => {
  it('numbers receipts 1, 2, 3 in order', () => {
    expect(payOk().receiptNumber).toBe(1);
    expect(payOk().receiptNumber).toBe(2);
    expect(payOk().receiptNumber).toBe(3);
  });

  it('pays several months at once and the month colours follow', () => {
    payOk({ amount: 2 * RENT + 100_000 });
    expect(statuses()?.slice(0, 6)).toEqual(['paid', 'paid', 'late', 'late', 'due', 'upcoming']);
    const year = repos.areas.year(areaId, 2026, TODAY.month);
    expect(year?.boxes[2]).toMatchObject({ paid: 100_000, status: 'late' });
    expect(year?.figures.received).toBe(2 * RENT + 100_000);
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
    const [area] = repos.areas.list({ search: '', categoryId: null }, TODAY.month);
    expect(area?.summary).toBe('paid');
    expect(area?.months.slice(0, 6).map((box) => box.status)).toEqual([
      ...Array<string>(5).fill('paid'),
      'upcoming',
    ]);
  });

  it('keeps the renter at the time of payment, even after the renter changes', () => {
    const { id } = payOk();
    repos.areas.changeRenter({
      kind: 'new',
      areaId,
      fullName: 'Sara Ali',
      phone: '',
      startedOn: '2026-05-12',
    });
    expect(repos.payments.forArea(areaId).find((r) => r.id === id)?.renterName).toBe(
      'Karwan Ahmed',
    );
  });

  it('a past record gets no receipt number and does not use one up', () => {
    const past = payOk({ isBackfill: true, paidOn: '2026-02-01' });
    expect(past.receiptNumber).toBeNull();
    expect(payOk().receiptNumber).toBe(1);
    expect(repos.payments.forArea(areaId).find((r) => r.id === past.id)).toMatchObject({
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
    expect(repos.payments.forArea(areaId)).toEqual([]);
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
    expect(repos.payments.forArea(areaId)).toEqual([]);
    expect(repos.payments.preview(999, 1, TODAY.month, TODAY.month, null)).toBeNull();
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
    const [receipt] = repos.payments.forArea(areaId);
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
    expect(repos.payments.forArea(areaId)[0]).toMatchObject({ id, voided: true, receiptNumber: 1 });
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

  it('knows the latest date money was received', () => {
    expect(repos.payments.latestPaidOn()).toBeNull();
    payOk({ paidOn: '2026-03-02' });
    payOk({ paidOn: '2026-04-20' });
    expect(repos.payments.latestPaidOn()).toBe('2026-04-20');
  });
});
