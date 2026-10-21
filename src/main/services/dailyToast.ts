import { Notification } from 'electron';
import type { DateString } from '@shared/dates';
import { businessToday } from './clock';

/**
 * The optional Windows notification (ARCHITECTURE.md section 11): at most
 * once a day while the app is running, only when something needs attention.
 * The day the app is opened is skipped, because the popup already shows then.
 */

const CHECK_EVERY_MS = 60 * 60 * 1000;

let timer: NodeJS.Timeout | null = null;
let lastShownOn: DateString | null = null;

export interface DailyToastOptions {
  /** How many reminders there are right now (the same list as the popup). */
  countReminders: () => number;
  /** Title and body in the owner's language. */
  texts: (count: number) => { title: string; body: string };
  onClick: () => void;
}

export function startDailyToast({ countReminders, texts, onClick }: DailyToastOptions): void {
  if (timer || !Notification.isSupported()) return;
  lastShownOn = businessToday().date;
  timer = setInterval(() => {
    const today = businessToday().date;
    if (lastShownOn === today) return;
    const count = countReminders();
    if (count === 0) return;
    const notification = new Notification(texts(count));
    notification.once('click', onClick);
    notification.show();
    lastShownOn = today;
  }, CHECK_EVERY_MS);
}

/** Called when the app quits, so no timer outlives it. */
export function stopDailyToast(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
