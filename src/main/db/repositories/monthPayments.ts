import type { AreaMonth, MonthTakeOut, MonthTakeOutResult } from '@shared/payments';
import type { Db } from '../connection';
import type { AreaRepository } from './areas';
import type { AuditRepository } from './audit';
import type { PaymentRepository } from './payments';

interface Dependencies {
  areas: AreaRepository;
  audit: AuditRepository;
  payments: PaymentRepository;
}

interface ShareRecord {
  receipt_id: number;
  receipt_number: number | null;
  total_amount: number;
  paid_on: string;
  note: string;
  amount: number;
  other_months: number;
}

/**
 * Taking one paid month out of the receipts that paid it, when its month box
 * is clicked (ARCHITECTURE.md section 7.4). A receipt that paid only this
 * month is cancelled; any other keeps its number and other months, and its
 * amount goes down by this month's share.
 */
export function createMonthPaymentRepository(db: Db, { areas, audit, payments }: Dependencies) {
  const selectShares = db.prepare<[number, number, number], ShareRecord>(
    `SELECT r.id AS receipt_id, r.receipt_number, r.total_amount, r.paid_on, r.note, a.amount,
       (SELECT COUNT(*) FROM payment_allocations o
         WHERE o.receipt_id = r.id AND NOT (o.year = a.year AND o.month = a.month)) AS other_months
     FROM payment_allocations a JOIN receipts r ON r.id = a.receipt_id
     WHERE a.area_id = ? AND a.year = ? AND a.month = ? AND r.voided_at IS NULL
     ORDER BY r.paid_on, r.id`,
  );
  const selectMonths = db.prepare<[number], { year: number; month: number; amount: number }>(
    'SELECT year, month, amount FROM payment_allocations WHERE receipt_id = ? ORDER BY year, month',
  );
  const deleteShare = db.prepare<[number, number, number]>(
    'DELETE FROM payment_allocations WHERE receipt_id = ? AND year = ? AND month = ?',
  );
  const lowerTotal = db.prepare<[number, number]>(
    'UPDATE receipts SET total_amount = total_amount - ? WHERE id = ?',
  );

  const sharesOf = ({ areaId, year, month }: AreaMonth) => selectShares.all(areaId, year, month);

  return {
    /** What taking the month out would change, for the question before it is done. */
    takeOutPreview(query: AreaMonth): MonthTakeOutResult {
      if (!areas.isActive(query.areaId)) return { ok: false, reason: 'not_found' };
      const shares = sharesOf(query);
      return shares.length === 0
        ? { ok: false, reason: 'not_paid' }
        : { ok: true, changes: shares.map(toChange) };
    },

    takeOut: db.transaction((query: AreaMonth): MonthTakeOutResult => {
      if (!areas.isActive(query.areaId)) return { ok: false, reason: 'not_found' };
      const shares = sharesOf(query);
      if (shares.length === 0) return { ok: false, reason: 'not_paid' };
      for (const share of shares) {
        if (share.other_months === 0) {
          payments.void(share.receipt_id);
          continue;
        }
        const before = selectMonths.all(share.receipt_id);
        deleteShare.run(share.receipt_id, query.year, query.month);
        lowerTotal.run(share.amount, share.receipt_id);
        audit.record('update', 'receipt', share.receipt_id, {
          before: {
            amount: share.total_amount,
            paidOn: share.paid_on,
            note: share.note,
            months: before,
          },
          after: {
            amount: share.total_amount - share.amount,
            paidOn: share.paid_on,
            note: share.note,
            months: selectMonths.all(share.receipt_id),
          },
        });
      }
      return { ok: true, changes: shares.map(toChange) };
    }),
  };
}

function toChange(share: ShareRecord): MonthTakeOut {
  return {
    receiptId: share.receipt_id,
    receiptNumber: share.receipt_number,
    amount: share.amount,
    cancels: share.other_months === 0,
  };
}

export type MonthPaymentRepository = ReturnType<typeof createMonthPaymentRepository>;
