import { z } from 'zod';
import { nameCollator } from '@shared/areas';
import type { Reminder } from '@shared/notifications';
import type { Repositories } from '../db/repositories';
import { businessToday } from '../services/clock';
import { buildBackupReminder, buildReminders } from '../services/notifications';
import { handle } from './handle';

/** The reminders as they stand right now; the same list everywhere they are shown. */
export function currentReminders({
  areaViews,
  settings,
  backupSettings,
}: Repositories): Reminder[] {
  const { language, remindDays } = settings.getAll();
  const collator = nameCollator(language);
  const today = businessToday();
  const areas = areaViews.reminderAreas();
  const backup = buildBackupReminder(backupSettings.lastBackupOn(), today, areas.length > 0);
  return [
    ...buildReminders(areas, today, remindDays, (a, b) => collator.compare(a, b)),
    ...(backup ? [backup] : []),
  ];
}

export function registerNotificationIpc(repos: Repositories): void {
  handle('notifications:list', z.undefined(), () => currentReminders(repos));
}
