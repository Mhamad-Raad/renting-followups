import { useEffect } from 'react';
import { monthIndex, yearMonthOf } from '@shared/dates';

const NEW_MONTH = 'rent-tracker:new-month';
/** How often the open app looks at the calendar. */
const CHECK_EVERY_MS = 60_000;

/**
 * Watches the calendar while the app stays open (used once, in Layout): when
 * a new month or year starts, every screen is told, so month colours, Home's
 * cards and the year shown are never left behind.
 */
export function useMonthWatch(): void {
  useEffect(() => {
    let shown = monthIndex(yearMonthOf(new Date()));
    const check = () => {
      const now = monthIndex(yearMonthOf(new Date()));
      if (now === shown) return;
      shown = now;
      window.dispatchEvent(new Event(NEW_MONTH));
    };
    const timer = window.setInterval(check, CHECK_EVERY_MS);
    // Also on coming back to the window, for example after the computer was asleep.
    window.addEventListener('focus', check);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', check);
    };
  }, []);
}

/** Runs `onNewMonth` when a new month starts; the listener is removed when the component goes. */
export function useNewMonth(onNewMonth: () => void): void {
  useEffect(() => {
    window.addEventListener(NEW_MONTH, onNewMonth);
    return () => window.removeEventListener(NEW_MONTH, onNewMonth);
  }, [onNewMonth]);
}
