import { areaLabel } from '@shared/areas';
import type { Currency } from '@shared/currency';
import {
  daysInMonth,
  parseDateString,
  toDateString,
  type BusinessToday,
  type DateString,
} from '@shared/dates';
import {
  ALWAYS_REMIND_LAST_DAYS,
  type AreaReminder,
  type BackupReminder,
  type LateRent,
  type MonthEndReminder,
} from '@shared/notifications';
import type { PriceRow } from '@shared/prices';
import { owedByCurrency, unpaidMonths, type PaidHistory } from './monthStatus';

/**
 * The one function behind every reminder (ARCHITECTURE.md section 11), so
 * the popup, the Notifications page, the bell and the Windows notification
 * never disagree. Pure: `today` and the settings are passed in.
 */

export interface ReminderArea {
  id: number;
  name: string;
  categoryName: string;
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
): AreaReminder[] {
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
      categoryName: area.categoryName,
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
        owed: owedByCurrency(pastMonths),
      });
    }
    const current = months.find((month) => month.status === 'due');
    if (current && remindNow) {
      monthEnd.push({
        ...ref,
        currency: current.currency,
        kind: 'month_end',
        month: today.month,
        owed: current.owed,
        daysLeft,
        endsOn,
      });
    }
  }

  const label = (reminder: AreaReminder) =>
    areaLabel({ name: reminder.areaName, categoryName: reminder.categoryName });
  const byLabel = (a: AreaReminder, b: AreaReminder) =>
    compareNames(label(a), label(b)) || compareNames(a.renterName ?? '', b.renterName ?? '');
  late.sort((a, b) => b.months.length - a.months.length || byLabel(a, b));
  monthEnd.sort(byLabel);
  return [...late, ...monthEnd];
}

/**
 * The backup reminder: shown while no backup has been made in the current
 * calendar month. Not shown before there is any area, as there is nothing to
 * keep safe yet.
 */
export function buildBackupReminder(
  lastBackupOn: DateString | null,
  today: BusinessToday,
  hasAreas: boolean,
): BackupReminder | null {
  if (!hasAreas) return null;
  const last = lastBackupOn === null ? null : parseDateString(lastBackupOn);
  const thisMonth =
    last !== null && last.year === today.month.year && last.month === today.month.month;
  return thisMonth ? null : { kind: 'backup', lastBackupOn };
}
