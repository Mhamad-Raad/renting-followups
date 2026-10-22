import { z } from 'zod';
import { DEFAULT_REMIND_DAYS, type Reminder } from '@shared/notifications';
import type { Repositories } from '../db/repositories';
import { businessToday } from '../services/clock';
import { buildReminders } from '../services/notifications';
import { handle } from './handle';

/** The reminders as they stand right now; the same list everywhere they are shown. */
export function currentReminders({ areaViews, settings }: Repositories): Reminder[] {
  const collator = new Intl.Collator(settings.getAll().language);
  // The "days before month end" setting arrives with the Settings screen (iteration 10).
  return buildReminders(areaViews.reminderAreas(), businessToday(), DEFAULT_REMIND_DAYS, (a, b) =>
    collator.compare(a, b),
  );
}

export function registerNotificationIpc(repos: Repositories): void {
  handle('notifications:list', z.undefined(), () => currentReminders(repos));
}
