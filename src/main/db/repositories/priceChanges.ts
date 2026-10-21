import {
  isBeforeRentStart,
  type PriceChange,
  type PriceChangeImpact,
  type PriceChangeResult,
} from '@shared/areas';
import type { YearMonth } from '@shared/dates';
import { priceForMonth, withPriceFrom } from '@shared/prices';
import { statusChanges } from '../../services/monthStatus';
import type { Db } from '../connection';
import type { AreaRepository } from './areas';
import type { AuditRepository } from './audit';
import type { PaymentRepository } from './payments';
import type { PriceRepository } from './prices';

interface Dependencies {
  areas: AreaRepository;
  audit: AuditRepository;
  payments: PaymentRepository;
  prices: PriceRepository;
}

/** Changing an area's rent from a month onward, and sharing paid money out again. */
export function createPriceChangeRepository(
  db: Db,
  { areas, audit, payments, prices }: Dependencies,
) {
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
      const { now, plan } = payments.planReshare(change.areaId, change.from, after, today);
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
        const { plan } = payments.planReshare(areaId, from, after, today);
        if (!plan.ok) return plan;
        prices.set(areaId, from, monthlyPrice);
        payments.applyReshare(areaId, from, plan.byReceipt);
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
