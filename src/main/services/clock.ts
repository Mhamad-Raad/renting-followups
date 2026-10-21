import {
  dateStringFromLocal,
  yearMonthOf,
  type BusinessToday,
  type YearMonth,
} from '@shared/dates';

/**
 * The current month from the Windows clock, in local time. This is the only
 * place in the main process that reads the clock for business rules;
 * everything else receives the month as a parameter, so tests can pin it.
 */
export function currentYearMonth(): YearMonth {
  return yearMonthOf(new Date());
}

/** Today's date and month from the Windows clock, in local time. */
export function businessToday(): BusinessToday {
  const now = new Date();
  return { date: dateStringFromLocal(now), month: yearMonthOf(now) };
}
