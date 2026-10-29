import {
  isBeforeRentStart,
  type PriceChange,
  type PriceChangeImpact,
  type PriceChangeResult,
  type RenterChange,
  type RenterChangeResult,
  type VacantPayment,
} from '@shared/areas';
import { monthIndex, parseDateString, toDateString, type YearMonth } from '@shared/dates';
import {
  currencyForMonth,
  priceForMonth,
  priceRowForMonth,
  pricesInCurrency,
  withPriceFrom,
  type PriceRow,
} from '@shared/prices';
import { reshare, type ReshareReceipt, type ReshareResult } from '../../services/allocation';
import { statusChanges, type PaidHistory } from '../../services/monthStatus';
import type { Db } from '../connection';
import type { AllocationRepository } from './allocations';
import type { AreaRepository } from './areas';
import type { AuditRepository } from './audit';
import type { MonthPaymentRepository } from './monthPayments';
import type { PriceRepository } from './prices';
import type { RenterRepository } from './renters';

interface Dependencies {
  allocations: AllocationRepository;
  areas: AreaRepository;
  audit: AuditRepository;
  monthPayments: MonthPaymentRepository;
  prices: PriceRepository;
  renters: RenterRepository;
}

/** Money that would have no month to go to; thrown so the whole save is undone. */
class NoRoom extends Error {}

/** Changing an area's rent from a month onward, and sharing paid money out again. */
export function createPriceChangeRepository(
  db: Db,
  { allocations, areas, audit, monthPayments, prices, renters }: Dependencies,
) {
  /**
   * A vacant area has no renter: the current one leaves on the first day of
   * the vacant month (or the day they started, if that is later).
   */
  const endRenterForVacancy = (areaId: number, from: YearMonth) => {
    const current = renters.current(areaId);
    if (!current) return;
    const firstDay = toDateString(from.year, from.month, 1);
    const endedOn = firstDay < current.startedOn ? current.startedOn : firstDay;
    renters.end(current.id, endedOn);
    audit.record('end_renter', 'area', areaId, { renter: current.fullName, endedOn });
  };

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
        if (!receipt) {
          receipts.set(row.receiptId, {
            id: row.receiptId,
            start: from,
            amount: 0,
            currency: row.currency,
          });
        }
      } else if (receipt) {
        receipt.amount += row.amount;
      } else {
        receipts.set(row.receiptId, {
          id: row.receiptId,
          start: { year: row.year, month: row.month },
          amount: row.amount,
          currency: row.currency,
        });
      }
    }
    // Rows come oldest receipt first, so the map keeps that order.
    const affected = [...receipts.values()].filter((receipt) => receipt.amount > 0);
    return { now, plan: reshare(affected, kept, newPrices, today) };
  };

  /**
   * The receipts paying months from `from` onward that `newPrices` leave
   * without rent in the receipt's currency (vacant, or another currency),
   * oldest receipt first; such money has nowhere to go. A receipt that pays
   * nothing else would be cancelled by taking those months out.
   */
  const vacantPayments = (
    areaId: number,
    from: YearMonth,
    newPrices: readonly PriceRow[],
  ): VacantPayment[] => {
    const fromIndex = monthIndex(from);
    const payments = new Map<number, VacantPayment>();
    const paysOtherMonths = new Set<number>();
    for (const row of allocations.countingForArea(areaId)) {
      const rent = priceForMonth(pricesInCurrency(newPrices, row.currency), row);
      if (monthIndex(row) < fromIndex || rent !== 0) {
        paysOtherMonths.add(row.receiptId);
        continue;
      }
      const payment = payments.get(row.receiptId) ?? {
        receiptId: row.receiptId,
        receiptNumber: row.receiptNumber,
        currency: row.currency,
        months: [],
        amount: 0,
        cancels: false,
      };
      payment.months.push({ year: row.year, month: row.month });
      payment.amount += row.amount;
      payments.set(row.receiptId, payment);
    }
    return [...payments.values()].map((payment) => ({
      ...payment,
      cancels: !paysOtherMonths.has(payment.receiptId),
    }));
  };

  const save = db.transaction(
    (
      { areaId, from, monthlyPrice, currency, takeOutVacantMonths }: PriceChange,
      today: YearMonth,
    ): PriceChangeResult => {
      if (!areas.isActive(areaId)) return { ok: false, reason: 'not_found' };
      const history = prices.forArea(areaId);
      if (isBeforeRentStart(history, from)) return { ok: false, reason: 'before_rent_start' };
      const after = withPriceFrom(history, from, monthlyPrice, currency);
      if (takeOutVacantMonths) {
        const months = new Map<number, YearMonth>();
        for (const payment of vacantPayments(areaId, from, after)) {
          for (const month of payment.months) months.set(monthIndex(month), month);
        }
        for (const month of months.values()) monthPayments.takeOut({ areaId, ...month });
      }
      const { plan } = planReshare(areaId, from, after, today);
      // Thrown so that any months already taken out are put back.
      if (!plan.ok) throw new NoRoom();
      const row = priceRowForMonth(after, from);
      prices.set(areaId, from, monthlyPrice, row?.currency ?? 'IQD');
      for (const [receiptId, months] of plan.byReceipt) {
        allocations.replaceFrom(receiptId, areaId, from, months);
      }
      audit.record('change_price', 'area', areaId, {
        from,
        previousPrice: priceForMonth(history, from),
        monthlyPrice,
        ...(currency && { currency }),
        resharedReceipts: [...plan.byReceipt.keys()],
      });
      if (monthlyPrice === 0) endRenterForVacancy(areaId, from);
      return { ok: true };
    },
  );

  /**
   * A new renter, and with them, if it differs, a new rent (and currency)
   * from the month they start, all saved together or not at all.
   */
  const saveRenter = db.transaction(
    (
      { monthlyPrice, currency, takeOutVacantMonths, ...renter }: RenterChange,
      today: YearMonth,
    ): RenterChangeResult => {
      const start = parseDateString(renter.startedOn);
      const from = start && { year: start.year, month: start.month };
      const history = prices.forArea(renter.areaId);
      const rentChanges =
        from !== null &&
        monthlyPrice !== undefined &&
        (priceForMonth(history, from) !== monthlyPrice ||
          (currency !== undefined && currencyForMonth(history, from) !== currency));
      if (rentChanges && isBeforeRentStart(history, from)) {
        return { ok: false, reason: 'before_rent_start' };
      }
      const result = areas.changeRenter(renter);
      if (!result.ok || !rentChanges) return result;
      // Money with nowhere to go is thrown out of `save`, which undoes the renter too.
      return save(
        {
          areaId: renter.areaId,
          from,
          monthlyPrice,
          ...(currency && { currency }),
          ...(takeOutVacantMonths && { takeOutVacantMonths }),
        },
        today,
      );
    },
  );

  /** Turns money with nowhere to go into a plain answer; the transaction has already been undone. */
  const refusingNoRoom = <T>(work: () => T): T | { ok: false; reason: 'no_room' } => {
    try {
      return work();
    } catch (error) {
      if (error instanceof NoRoom) return { ok: false, reason: 'no_room' };
      throw error;
    }
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
      const after = withPriceFrom(before, change.from, change.monthlyPrice, change.currency);
      const { now, plan } = planReshare(change.areaId, change.from, after, today);
      if (!plan.ok) {
        return { ...plan, vacantPayments: vacantPayments(change.areaId, change.from, after) };
      }
      return {
        ok: true,
        changes: statusChanges(before, after, now, plan.paid, change.from, today),
      };
    },

    /**
     * A new price from a month onward. Earlier months keep their price; 0 means
     * vacant, which also ends the current renter. Money already paid from that
     * month onward is shared out again with the new rent, in the same
     * transaction; with `takeOutVacantMonths`, paid months that become vacant
     * are first taken out of their receipts (as clicking their month box does).
     */
    changePrice(change: PriceChange, today: YearMonth): PriceChangeResult {
      return refusingNoRoom(() => save(change, today));
    },

    /** Change renter (see `saveRenter`). */
    changeRenter(change: RenterChange, today: YearMonth): RenterChangeResult {
      return refusingNoRoom(() => saveRenter(change, today));
    },
  };
}

export type PriceChangeRepository = ReturnType<typeof createPriceChangeRepository>;
