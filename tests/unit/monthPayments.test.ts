import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { BusinessToday } from '@shared/dates';
import type { Db } from '../../src/main/db/connection';
import type { Repositories } from '../../src/main/db/repositories';
import { areaInput, createTestDatabase } from './helpers';

const TODAY: BusinessToday = { date: '2026-10-25', month: { year: 2026, month: 10 } };
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

function pay(amount: number, month: number) {
  const result = repos.payments.create(
    {
      areaId,
      isBackfill: false,
      amount,
      from: { year: 2026, month },
      paidOn: '2026-10-01',
      note: '',
    },
    TODAY,
  );
  if (!result.ok) throw new Error(`payment failed: ${result.reason}`);
  return result;
}

const statuses = () =>
  repos.areaViews
    .year(areaId, 2026, TODAY.month)
    ?.boxes.map((box) => box.status[0])
    .join('');
const receipt = (id: number) =>
  repos.payments.forArea({ areaId, year: 2026, month: null }).find((r) => r.id === id);
const month = (value: number) => ({ areaId, year: 2026, month: value });

describe('taking a paid month out (clicking a green month box)', () => {
  it('cancels a receipt that paid only that month', () => {
    const { id } = pay(RENT, 3);
    expect(repos.monthPayments.takeOutPreview(month(3))).toEqual({
      ok: true,
      changes: [{ receiptId: id, receiptNumber: 1, amount: RENT, cancels: true }],
    });
    expect(repos.monthPayments.takeOut(month(3))).toMatchObject({ ok: true });
    expect(receipt(id)?.voided).toBe(true);
    expect(statuses()?.[2]).toBe('l');
  });

  it('takes one month out of a receipt for several, keeping its number and other months', () => {
    const { id } = pay(RENT * 8, 1);
    expect(repos.monthPayments.takeOut(month(3))).toEqual({
      ok: true,
      changes: [{ receiptId: id, receiptNumber: 1, amount: RENT, cancels: false }],
    });
    expect(receipt(id)).toMatchObject({ voided: false, receiptNumber: 1, totalAmount: RENT * 7 });
    expect(receipt(id)?.allocations.map((paid) => paid.month)).toEqual([1, 2, 4, 5, 6, 7, 8]);
    expect(statuses()).toBe('pplppppplduu');
    const [edit] = repos.activity.page({ beforeId: null }).entries;
    expect(edit).toMatchObject({ action: 'update', amount: RENT * 7, previousAmount: RENT * 8 });
  });

  it('keeps the gap when the receipt is edited only for its date or note', () => {
    const { id } = pay(RENT * 3, 1);
    repos.monthPayments.takeOut(month(2));
    const edit = { id, amount: RENT * 2, from: { year: 2026, month: 1 }, paidOn: '2026-10-02' };
    expect(repos.payments.update({ ...edit, note: 'cash' }, TODAY)).toEqual({ ok: true });
    expect(receipt(id)).toMatchObject({ note: 'cash', paidOn: '2026-10-02' });
    expect(receipt(id)?.allocations.map((paid) => paid.month)).toEqual([1, 3]);
    const preview = repos.payments.preview(areaId, RENT * 2, edit.from, TODAY.month, id);
    expect(preview?.ok && preview.months.map((paid) => paid.month)).toEqual([1, 3]);
    // A new amount shares the money out again from the start month, as any edit does.
    repos.payments.update({ ...edit, amount: RENT * 3, note: 'cash' }, TODAY);
    expect(receipt(id)?.allocations.map((paid) => paid.month)).toEqual([1, 2, 3]);
  });

  it('takes out every receipt that paid part of the month', () => {
    const first = pay(100_000, 5);
    const second = pay(RENT * 2, 5);
    expect(repos.monthPayments.takeOut(month(5))).toEqual({
      ok: true,
      changes: [
        { receiptId: first.id, receiptNumber: 1, amount: 100_000, cancels: true },
        { receiptId: second.id, receiptNumber: 2, amount: 150_000, cancels: false },
      ],
    });
    expect(receipt(second.id)?.allocations).toEqual([
      { year: 2026, month: 6, amount: RENT },
      { year: 2026, month: 7, amount: 100_000 },
    ]);
  });

  it('refuses a month that is not paid, or an area that is gone', () => {
    expect(repos.monthPayments.takeOut(month(2))).toEqual({ ok: false, reason: 'not_paid' });
    repos.areas.softDelete(areaId);
    expect(repos.monthPayments.takeOutPreview(month(2))).toEqual({
      ok: false,
      reason: 'not_found',
    });
  });

  it('a click on an unpaid month pays just that month, even with older months open', () => {
    pay(RENT, 7);
    expect(statuses()).toBe('llllllpllduu');
  });
});
