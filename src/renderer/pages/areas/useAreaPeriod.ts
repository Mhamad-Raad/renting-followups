import { useCallback, useState } from 'react';
import { useIpcQuery } from '../../app/ipc';

/**
 * The year (and optional month) shown on the area page, with that period's
 * month boxes, figures and receipts. Changing the period keeps the old data
 * on screen until the new data arrives, so nothing blinks.
 */
export function useAreaPeriod(areaId: number, currentYear: number) {
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState<number | null>(null);
  const months = useIpcQuery('areas:year', { id: areaId, year, month });
  const receipts = useIpcQuery('payments:forArea', { areaId, year, month });
  const { refresh: refreshMonths } = months;
  const { refresh: refreshReceipts } = receipts;
  const refresh = useCallback(() => {
    refreshMonths();
    refreshReceipts();
  }, [refreshMonths, refreshReceipts]);
  return { year, setYear, month, setMonth, months, receipts, refresh };
}
