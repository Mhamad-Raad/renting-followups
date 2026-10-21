import type { Currency } from './currency';
import type { YearMonth } from './dates';

/** How many days before the end of the month the reminder starts (setting `remind_days_before_month_end`). */
export const DEFAULT_REMIND_DAYS = 7;
/** The reminder always shows in a month's last days, whatever the setting. */
export const ALWAYS_REMIND_LAST_DAYS = 3;

interface AreaRef {
  areaId: number;
  areaName: string;
  currency: Currency;
  renterName: string | null;
  renterPhone: string | null;
}

/** An area with past months not fully paid. Vacant months never appear. */
export interface LateRent extends AreaRef {
  kind: 'late';
  /** Oldest first. */
  months: YearMonth[];
  owed: number;
}

/** This month is not fully paid and it ends soon. */
export interface MonthEndReminder extends AreaRef {
  kind: 'month_end';
  month: YearMonth;
  owed: number;
  /** Days left in the month, counting today (1 on the last day). */
  daysLeft: number;
}

/**
 * Everything the popup, the Notifications page, the bell and the Windows
 * notification show. Worked out from the data each time, never stored, by one
 * function in the main process (`services/notifications.ts`).
 */
export type Reminder = LateRent | MonthEndReminder;
