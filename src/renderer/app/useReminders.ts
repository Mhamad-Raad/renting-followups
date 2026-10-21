import { useEffect } from 'react';
import { useDataChanged } from './dataChanged';
import { useIpcQuery } from './ipc';

// Looks again now and then, so a month that turns late at midnight shows without a restart.
const RECHECK_MS = 10 * 60 * 1000;

/** The current reminders, refreshed after every save that changes the rent data. */
export function useReminders() {
  const reminders = useIpcQuery('notifications:list');
  const { refresh } = reminders;
  useDataChanged(refresh);
  useEffect(() => {
    const timer = setInterval(refresh, RECHECK_MS);
    return () => clearInterval(timer);
  }, [refresh]);
  return reminders;
}
