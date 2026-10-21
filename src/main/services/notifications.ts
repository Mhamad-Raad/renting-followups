import type { Currency } from '@shared/currency';
import { daysInMonth, parseDateString, toDateString, type BusinessToday } from '@shared/dates';
import {
  ALWAYS_REMIND_LAST_DAYS,
  type LateRent,
  type MonthEndReminder,
  type Reminder,
} from '@shared/notifications';
import type { PriceRow } from '@shared/prices';
import { unpaidMonths, type PaidHistory } from './monthStatus';

/**
 * The one function behind every reminder (ARCHITECTURE.md section 11), so
 * the popup, the Notifications page, the bell and the Windows notification
 * never disagree. Pure: `today` and the settings are passed in.
 */

export interface ReminderArea {
  id: number;
  name: string;
  currency: Currency;
  renterName: string | null;
  renterPhone: string | null;
  /** Oldest first. */
  prices: readonly PriceRow[];
  paid: PaidHistory;
}

/**
 * Late rent first (most late months first), then month-end reminders (fewest
 * days left first); areas with the same urgency by name.
 */
export function buildReminders(
  areas: readonly ReminderArea[],
  today: BusinessToday,
  remindDays: number,
  compareNames: (a: string, b: string) => number,
): Reminder[] {
  const day = parseDateString(today.date)?.day ?? 1;
  const lastDay = daysInMonth(today.month.year, today.month.month);
  const daysLeft = lastDay - day + 1;
  const endsOn = toDateString(today.month.year, today.month.month, lastDay);
  const remindNow = daysLeft <= Math.max(remindDays, ALWAYS_REMIND_LAST_DAYS);
  const late: LateRent[] = [];
  const monthEnd: MonthEndReminder[] = [];

  for (const area of areas) {
    const months = unpaidMonths(area.prices, area.paid, today.month);
    const ref = {
      areaId: area.id,
      areaName: area.name,
      currency: area.currency,
      renterName: area.renterName,
      renterPhone: area.renterPhone,
    };
    const pastMonths = months.filter((month) => month.status === 'late');
    if (pastMonths.length > 0) {
      late.push({
        ...ref,
        kind: 'late',
        months: pastMonths.map(({ year, month }) => ({ year, month })),
        owed: pastMonths.reduce((sum, month) => sum + month.owed, 0),
      });
    }
    const current = months.find((month) => month.status === 'due');
    if (current && remindNow) {
      monthEnd.push({
        ...ref,
        kind: 'month_end',
        month: today.month,
        owed: current.owed,
        daysLeft,
        endsOn,
      });
    }
  }

  late.sort((a, b) => b.months.length - a.months.length || compareNames(a.areaName, b.areaName));
  monthEnd.sort((a, b) => compareNames(a.areaName, b.areaName));
  return [...late, ...monthEnd];
}
