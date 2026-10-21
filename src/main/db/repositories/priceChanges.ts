import {
  isBeforeRentStart,
  type PriceChange,
  type PriceChangeImpact,
  type PriceChangeResult,
} from '@shared/areas';
import { monthIndex, type YearMonth } from '@shared/dates';
import { priceForMonth, withPriceFrom, type PriceRow } from '@shared/prices';
import { reshare, type ReshareReceipt, type ReshareResult } from '../../services/allocation';
import { statusChanges, type PaidHistory } from '../../services/monthStatus';
import type { Db } from '../connection';
import type { AllocationRepository } from './allocations';
import type { AreaRepository } from './areas';
import type { AuditRepository } from './audit';
import type { PriceRepository } from './prices';

interface Dependencies {
  allocations: AllocationRepository;
  areas: AreaRepository;
  audit: AuditRepository;
  prices: PriceRepository;
}

/** Changing an area's rent from a month onward, and sharing paid money out again. */
export function createPriceChangeRepository(
  db: Db,
  { allocations, areas, audit, prices }: Dependencies,
) {
  /**
   * How the money already paid from `from` onward would be shared out again
   * with `newPrices` (oldest receipt first), plus what is paid now, for the
   * warning and for saving. Cancelled receipts are left alone.
   */
  const planReshare = (
    areaId: number,
    from: YearMonth,
    newPrices: readonly PriceRow[],
    today: YearMonth,
  ): { now: PaidHistory; plan: ReshareResult } => {
    const fromIndex = monthIndex(from);
    const now = new Map<number, number>();
    const kept = new Map<number, number>();
    const receipts = new Map<number, ReshareReceipt>();
    for (const row of allocations.countingForArea(areaId)) {
      const index = monthIndex(row);
      now.set(index, (now.get(index) ?? 0) + row.amount);
      const receipt = receipts.get(row.receiptId);
      if (index < fromIndex) {
        kept.set(index, (kept.get(index) ?? 0) + row.amount);
        // A receipt that started before the change restarts at the change month.
        if (!receipt) receipts.set(row.receiptId, { id: row.receiptId, start: from, amount: 0 });
      } else if (receipt) {
        receipt.amount += row.amount;
      } else {
        receipts.set(row.receiptId, {
          id: row.receiptId,
          start: { year: row.year, month: row.month },
          amount: row.amount,
        });
      }
    }
    // Rows come oldest receipt first, so the map keeps that order.
    const affected = [...receipts.values()].filter((receipt) => receipt.amount > 0);
    return { now, plan: reshare(affected, kept, newPrices, today) };
  };

  return {
    /**
     * What a price change would do to money already paid: the receipts from
     * that month onward are shared out again with the new rent. Lists every
     * month that gains or loses money or changes colour, or says the money
     * would have nowhere to go. Null when the area does not exist.
     */
    priceChangeImpact(change: PriceChange, today: YearMonth): PriceChangeImpact | null {
      if (!areas.isActive(change.areaId)) return null;
      const before = prices.forArea(change.areaId);
      const after = withPriceFrom(before, change.from, change.monthlyPrice);
      const { now, plan } = planReshare(change.areaId, change.from, after, today);
      if (!plan.ok) return plan;
      return {
        ok: true,
        changes: statusChanges(before, after, now, plan.paid, change.from, today),
      };
    },

    /**
     * A new price from a month onward. Earlier months keep their price; 0 means
     * vacant. Money already paid from that month onward is shared out again
     * with the new rent, in the same transaction.
     */
    changePrice: db.transaction(
      ({ areaId, from, monthlyPrice }: PriceChange, today: YearMonth): PriceChangeResult => {
        if (!areas.isActive(areaId)) return { ok: false, reason: 'not_found' };
        const history = prices.forArea(areaId);
        if (isBeforeRentStart(history, from)) return { ok: false, reason: 'before_rent_start' };
        const after = withPriceFrom(history, from, monthlyPrice);
        const { plan } = planReshare(areaId, from, after, today);
        if (!plan.ok) return plan;
        prices.set(areaId, from, monthlyPrice);
        for (const [receiptId, months] of plan.byReceipt) {
          allocations.replaceFrom(receiptId, areaId, from, months);
        }
        audit.record('change_price', 'area', areaId, {
          from,
          previousPrice: priceForMonth(history, from),
          monthlyPrice,
          resharedReceipts: [...plan.byReceipt.keys()],
        });
        return { ok: true };
      },
    ),
  };
}

export type PriceChangeRepository = ReturnType<typeof createPriceChangeRepository>;
