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

/** Changing an area's rent from a month onward; months already paid stay as they are. */
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
   * The paid months from `from` onward whose rent `newPrices` change. They
   * stay paid at the rent they had (a month is paid whole or not at all), so
   * the form only says so; nothing is moved.
   */
  const keptPaidMonths = (
    areaId: number,
    from: YearMonth,
    before: readonly PriceRow[],
    after: readonly PriceRow[],
  ): YearMonth[] => {
    const months = new Map<number, YearMonth>();
    for (const row of allocations.countingForArea(areaId)) {
      const index = monthIndex(row);
      if (index < monthIndex(from) || priceForMonth(before, row) === priceForMonth(after, row))
        continue;
      months.set(index, { year: row.year, month: row.month });
    }
    return [...months.entries()].sort(([a], [b]) => a - b).map(([, month]) => month);
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
    ({
      areaId,
      from,
      monthlyPrice,
      currency,
      takeOutVacantMonths,
    }: PriceChange): PriceChangeResult => {
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
      // Paid months left without rent in their money's currency: thrown so that any months
      // already taken out are put back. Other paid months keep their money as it is.
      if (vacantPayments(areaId, from, after).length > 0) throw new NoRoom();
      const row = priceRowForMonth(after, from);
      prices.set(areaId, from, monthlyPrice, row?.currency ?? 'IQD');
      audit.record('change_price', 'area', areaId, {
        from,
        previousPrice: priceForMonth(history, from),
        previousCurrency: currencyForMonth(history, from),
        monthlyPrice,
        currency: row?.currency ?? null,
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
    ({
      monthlyPrice,
      currency,
      takeOutVacantMonths,
      ...renter
    }: RenterChange): RenterChangeResult => {
      const start = parseDateString(renter.startedOn);
      const from = start && { year: start.year, month: start.month };
      const history = prices.forArea(renter.areaId);
      // A renter who starts before the rent does only adds the renter; the rent stays.
      const rentChanges =
        from !== null &&
        monthlyPrice !== undefined &&
        !isBeforeRentStart(history, from) &&
        (priceForMonth(history, from) !== monthlyPrice ||
          (currency !== undefined && currencyForMonth(history, from) !== currency));
      const result = areas.changeRenter(renter);
      if (!result.ok || !rentChanges) return result;
      // Money with nowhere to go is thrown out of `save`, which undoes the renter too.
      return save({
        areaId: renter.areaId,
        from,
        monthlyPrice,
        ...(currency && { currency }),
        ...(takeOutVacantMonths && { takeOutVacantMonths }),
      });
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
     * What a price change would do to money already paid: the paid months
     * whose rent it changes (they stay paid as they are), or the paid months
     * it would leave without rent in their money's currency, which must be
     * taken out first. Null when the area does not exist.
     */
    priceChangeImpact(change: PriceChange): PriceChangeImpact | null {
      if (!areas.isActive(change.areaId)) return null;
      const before = prices.forArea(change.areaId);
      const after = withPriceFrom(before, change.from, change.monthlyPrice, change.currency);
      const vacant = vacantPayments(change.areaId, change.from, after);
      if (vacant.length > 0) return { ok: false, reason: 'no_room', vacantPayments: vacant };
      return { ok: true, keptPaid: keptPaidMonths(change.areaId, change.from, before, after) };
    },

    /**
     * A new price from a month onward. Earlier months keep their price; 0 means
     * vacant, which also ends the current renter. Months already paid stay
     * paid with the money they have; with `takeOutVacantMonths`, paid months
     * that become vacant (or another currency) are first taken out of their
     * receipts (as clicking their month box does), in the same transaction.
     */
    changePrice(change: PriceChange): PriceChangeResult {
      return refusingNoRoom(() => save(change));
    },

    /** Change renter (see `saveRenter`). */
    changeRenter(change: RenterChange): RenterChangeResult {
      return refusingNoRoom(() => saveRenter(change));
    },
  };
}

export type PriceChangeRepository = ReturnType<typeof createPriceChangeRepository>;
