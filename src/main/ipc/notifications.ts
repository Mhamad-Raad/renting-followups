import { z } from 'zod';
import type { Reminder } from '@shared/notifications';
import type { Repositories } from '../db/repositories';
import { businessToday } from '../services/clock';
import { buildReminders } from '../services/notifications';
import { handle } from './handle';

/** The reminders as they stand right now; the same list everywhere they are shown. */
export function currentReminders({ areaViews, settings }: Repositories): Reminder[] {
  const { language, remindDays } = settings.getAll();
  const collator = new Intl.Collator(language);
  return buildReminders(areaViews.reminderAreas(), businessToday(), remindDays, (a, b) =>
    collator.compare(a, b),
  );
}

export function registerNotificationIpc(repos: Repositories): void {
  handle('notifications:list', z.undefined(), () => currentReminders(repos));
}
