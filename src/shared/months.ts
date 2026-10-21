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
}

/** The figures of one area for one year (or one month of it), in the area's currency (minor units). */
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

export interface AreaYear {
  year: number;
  /** The month the figures are for, or null for the whole year. */
  month: number | null;
  /** Always 12 boxes, month 1 first. */
  boxes: MonthBox[];
  figures: YearFigures;
  summary: YearSummary;
}

/** Where an area stands today across every year since its rent started, for Home. */
export interface AreaStanding {
  /** Unpaid rent of every month up to and including this one. */
  owed: number;
  /** Past months not fully paid, in any year. */
  lateMonths: number;
  /** This month is not fully paid yet. */
  dueNow: boolean;
}

/**
 * A paid month a price change would alter, for the warning before saving:
 * its status changes, or part of the money on it would stop counting.
 */
export interface StatusChange {
  year: number;
  month: number;
  before: MonthStatus;
  after: MonthStatus;
  /** Money on the month that would no longer count as received (above the new rent). */
  uncounted: number;
}
