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

/** The figures of one area for one year, in the area's currency (minor units). */
export interface YearFigures {
  expected: number;
  received: number;
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
  /** Always 12 boxes, month 1 first. */
  boxes: MonthBox[];
  figures: YearFigures;
  summary: YearSummary;
}
