import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PrintOutput, PrintResult } from '@shared/printing';
import type { ReportQuery } from '@shared/reports';
import { callIpc } from '../app/ipc';
import { useMountedRef } from '../app/useMountedRef';

export type PrintJob =
  | { kind: 'receipt'; id: number; output: PrintOutput }
  | { kind: 'report'; query: ReportQuery; output: PrintOutput }
  | { kind: 'excel'; query: ReportQuery };

export interface PrintMessage {
  tone: 'success' | 'error';
  text: string;
}

type Translate = ReturnType<typeof useTranslation>['t'];

/** The plain message for a finished job; nothing when the owner cancelled. */
function describe(t: Translate, result: PrintResult | null, job: PrintJob): PrintMessage | null {
  if (!result) return { tone: 'error', text: t('errors.unexpected') };
  if (!result.ok) return { tone: 'error', text: t(`print.results.${result.reason}`) };
  if (result.done === 'cancelled') return null;
  if (result.done === 'printed') return { tone: 'success', text: t('print.results.printed') };
  return {
    tone: 'success',
    text: t(job.kind === 'excel' ? 'print.results.savedExcel' : 'print.results.savedPdf'),
  };
}

/**
 * Runs a print or export and turns the result into one plain message.
 * Cancelling the Windows dialog shows nothing. Only one job runs at a time.
 */
export function usePrint() {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<PrintMessage | null>(null);
  const mounted = useMountedRef();

  const run = useCallback(
    async (job: PrintJob) => {
      setBusy(true);
      setMessage(null);
      const result =
        job.kind === 'receipt'
          ? await callIpc('print:receipt', { id: job.id, output: job.output })
          : job.kind === 'report'
            ? await callIpc('print:report', { query: job.query, output: job.output })
            : await callIpc('export:reportExcel', { query: job.query });
      if (!mounted.current) return;
      setBusy(false);
      setMessage(describe(t, result.ok ? result.data : null, job));
    },
    [mounted, t],
  );

  return { run, busy, message };
}
