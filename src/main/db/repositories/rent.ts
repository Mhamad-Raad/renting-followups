import { chargedRent, type PriceRow } from '@shared/prices';
import type { PaidRepository } from './paid';
import type { PriceRepository } from './prices';
import type { RenterRepository } from './renters';

interface Dependencies {
  paid: PaidRepository;
  prices: PriceRepository;
  renters: RenterRepository;
}

/**
 * The rent each month is charged (`chargedRent`): the price history, with the
 * months no renter was in as empty. What colours, figures, reminders, reports
 * and payments use; the price history itself (and its editing) stays in
 * `prices`.
 */
export function createRentRepository({ paid, prices, renters }: Dependencies) {
  return {
    /** Oldest first. A receipt being edited can be left out of what counts as paid. */
    forArea(areaId: number, exceptReceiptId = 0): PriceRow[] {
      return chargedRent(
        prices.forArea(areaId),
        renters.forArea(areaId),
        paid.history(areaId, exceptReceiptId),
      );
    },

    /** Every area in use, in three queries (no query per area). */
    forActiveAreas(): Map<number, PriceRow[]> {
      const rentersByArea = renters.forActiveAreas();
      const paidByArea = paid.historyForActiveAreas();
      const byArea = new Map<number, PriceRow[]>();
      for (const [areaId, history] of prices.forActiveAreas()) {
        const charged = chargedRent(
          history,
          rentersByArea.get(areaId) ?? [],
          paidByArea.get(areaId) ?? new Map(),
        );
        byArea.set(areaId, charged);
      }
      return byArea;
    },
  };
}

export type RentRepository = ReturnType<typeof createRentRepository>;
