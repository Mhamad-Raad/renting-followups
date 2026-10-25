import { z } from 'zod';
import { formatPlain } from './formatNumber';
import { isolateNumber, toDigitStyle, type DigitStyle } from './digits';

/** The years the app accepts anywhere: wide enough for old records and future rent. */
export const MIN_YEAR = 2000;
export const MAX_YEAR = 2100;

/** A calendar month, the unit of rent. Months are always numbers 1–12. */
export interface YearMonth {
  year: number;
  month: number;
}

export const yearSchema = z.number().int().min(MIN_YEAR).max(MAX_YEAR);
export const monthSchema = z.number().int().min(1).max(12);
export const yearMonthSchema = z.object({ year: yearSchema, month: monthSchema });

/** A month as one number, so months can be compared and counted across years. */
export function monthIndex({ year, month }: YearMonth): number {
  return year * 12 + (month - 1);
}

/** The month a `monthIndex` stands for. */
export function fromMonthIndex(index: number): YearMonth {
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

export function compareYearMonth(a: YearMonth, b: YearMonth): number {
  return monthIndex(a) - monthIndex(b);
}

/** A business date stored as `YYYY-MM-DD` text, in local time, never with a time zone. */
export type DateString = string;

export function toDateString(year: number, month: number, day: number): DateString {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function daysInMonth(year: number, month: number): number {
  // Day 0 of the next month is the last day of this one (UTC avoids time-zone shifts).
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function parseDateString(
  value: string,
): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (year < MIN_YEAR || year > MAX_YEAR || month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

/** A real calendar date such as 2026-02-28; impossible dates such as 2026-02-30 are rejected. */
export const dateStringSchema = z.string().refine((value) => parseDateString(value) !== null);

/** The month of a JavaScript Date in local time. Callers pass the clock in; this never reads it. */
export function yearMonthOf(date: Date): YearMonth {
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

/** Today for business rules: the date (to refuse future dates) and its month (for colours and limits). */
export interface BusinessToday {
  date: DateString;
  month: YearMonth;
}

/** The date of a JavaScript Date in local time. Callers pass the clock in; this never reads it. */
export function dateStringFromLocal(date: Date): DateString {
  return toDateString(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

/** Shows a date as day/month/year in the chosen digit style, for example 20/10/2026. */
export function formatDate(value: DateString, style: DigitStyle): string {
  const parts = parseDateString(value);
  if (!parts) return value;
  return [parts.day, parts.month, parts.year].map((part) => formatPlain(part, style)).join('/');
}

/** Shows a moment as local day/month/year and 24-hour time, for example 20/10/2026 14:05. */
export function formatDateTime(date: Date, style: DigitStyle): string {
  const time = [date.getHours(), date.getMinutes()]
    .map((part) => String(part).padStart(2, '0'))
    .join(':');
  return `${isolateNumber(formatDate(dateStringFromLocal(date), style), style)} ${isolateNumber(toDigitStyle(time, style), style)}`;
}

/** Shows a month as month/year, for example 10/2026. */
export function formatYearMonth({ year, month }: YearMonth, style: DigitStyle): string {
  return `${formatPlain(month, style)}/${formatPlain(year, style)}`;
}

/** A run of consecutive months, for showing "1/2025 – 9/2026" instead of every month. */
export interface MonthRun {
  from: YearMonth;
  to: YearMonth;
}

/** Groups months (in any order, repeats allowed) into runs of consecutive months, oldest first. */
export function monthRuns(months: readonly YearMonth[]): MonthRun[] {
  const indexes = [...new Set(months.map(monthIndex))].sort((a, b) => a - b);
  const runs: MonthRun[] = [];
  for (const index of indexes) {
    const last = runs.at(-1);
    if (last && monthIndex(last.to) === index - 1) last.to = fromMonthIndex(index);
    else runs.push({ from: fromMonthIndex(index), to: fromMonthIndex(index) });
  }
  return runs;
}

/** Months as short text: single months as 3/2026, runs as 1/2026 – 4/2026. */
export function formatMonthRuns(
  months: readonly YearMonth[],
  style: DigitStyle,
  separator: string,
): string {
  const month = (value: YearMonth) => isolateNumber(formatYearMonth(value, style), style);
  return monthRuns(months)
    .map(({ from, to }) =>
      compareYearMonth(from, to) === 0 ? month(from) : `${month(from)} – ${month(to)}`,
    )
    .join(separator);
}
