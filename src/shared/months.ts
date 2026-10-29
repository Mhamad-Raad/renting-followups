import type { Currency } from './currency';

/**
 * The status of one rent month, as decided by `monthStatus.ts` in the main
 * process. The screen only shows these; it never works them out itself.
 */
export const MONTH_STATUSES = [
  'paid',
  'due',
  'partial',
  'late',
  'upcoming',
  'not_applicable',
] as const;
export type MonthStatus = (typeof MONTH_STATUSES)[number];

/** One month box: the rent expected, the amount paid towards it, and its status. */
export interface MonthBox {
  month: number;
  /** The rent for the month; 0 = vacant, null = before the rent started. */
  expected: number | null;
  paid: number;
  status: MonthStatus;
  /** The month's currency (that of its rent period); amounts above are in it. */
  currency: Currency;
}

/** The figures of one area for one year (or one month of it), in one currency (minor units). */
export interface YearFigures {
  /** The monthly rent shown with the figures; 0 = vacant, null = rent not started. */
  rent: number | null;
  /** Total rent for the period. */
  expected: number;
  received: number;
  /** Still owed: unpaid rent of months that have already come (late or due), never future months. */
  remaining: number;
}

/**
 * One word for a whole year: late if any month is late, otherwise due or
 * partly paid if any month is orange, otherwise paid if any month is paid.
 * `nothing_due` covers years where no rent applies yet (or the area is vacant).
 */
export type YearSummary = 'late' | 'due' | 'partial' | 'paid' | 'nothing_due';

/** One currency's figures. Amounts in different currencies are never added together. */
export interface CurrencyFigures extends YearFigures {
  currency: Currency;
}

/** An amount with its currency. */
export interface CurrencyAmount {
  currency: Currency;
  amount: number;
}

export interface AreaYear {
  year: number;
  /** The month the figures are for, or null for the whole year. */
  month: number | null;
  /** Always 12 boxes, month 1 first. */
  boxes: MonthBox[];
  /**
   * One entry per currency used in the period, oldest first: almost always
   * one, two in the year a new renter started paying in another currency.
   */
  figures: CurrencyFigures[];
  summary: YearSummary;
}

/** Where an area stands today across every year since its rent started, for Home. */
export interface AreaStanding {
  /** Unpaid rent of every month up to and including this one, per currency (none when nothing is owed). */
  owed: CurrencyAmount[];
  /** Past months not fully paid, in any year. */
  lateMonths: number;
  /** The currencies of those late months, IQD first. */
  lateIn: Currency[];
  /** This month is not fully paid yet. */
  dueNow: boolean;
}

/**
 * A month whose money or status a price change would alter, for the warning
 * before saving: the money of the receipts is shared out again with the new
 * rent, so a month can gain or lose money and change colour.
 */
export interface StatusChange {
  year: number;
  month: number;
  /** The currency of the amounts. */
  currency: Currency;
  before: MonthStatus;
  after: MonthStatus;
  paidBefore: number;
  paidAfter: number;
}
