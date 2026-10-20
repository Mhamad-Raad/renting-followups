import type { YearMonth } from '@shared/dates';

/**
 * The current month from the Windows clock, in local time. This is the only
 * place that reads the clock for business rules; everything else receives the
 * month as a parameter, so tests can pin it.
 */
export function currentYearMonth(now: Date = new Date()): YearMonth {
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}
