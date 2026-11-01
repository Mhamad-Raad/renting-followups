import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ReportQuery } from '@shared/reports';
import { BigButton } from '../components/BigButton';
import { Notice } from '../components/Notice';
import styles from './ReportOutputButtons.module.css';
import { ReportPreviewDialog } from './ReportPreviewDialog';
import { usePrint } from './usePrint';

interface ReportOutputButtonsProps {
  query: ReportQuery;
  /** The print button's words, for example "Print selected"; "Print" by default. */
  printLabel?: string;
  /** False leaves out the direct Print button (the area page offers only PDF and Excel). */
  withPrint?: boolean;
}

/** Print, Export to PDF (through the preview pop-up) and Export to Excel for one report, with the result in plain words. */
export function ReportOutputButtons({
  query,
  printLabel,
  withPrint = true,
}: ReportOutputButtonsProps) {
  const { t } = useTranslation();
  const { run, busy, message } = usePrint();
  const [previewing, setPreviewing] = useState(false);
  return (
    <div className={styles.stack}>
      <div className={styles.buttons}>
        {withPrint && (
          <BigButton
            icon="reports"
            disabled={busy}
            onClick={() => void run({ kind: 'report', query, output: 'printer' })}
          >
            {printLabel ?? t('print.actions.print')}
          </BigButton>
        )}
        {/* The PDF opens in a pop-up first, to look at, then save or print. */}
        <BigButton disabled={busy} onClick={() => setPreviewing(true)}>
          {t('print.actions.pdf')}
        </BigButton>
        <BigButton disabled={busy} onClick={() => void run({ kind: 'excel', query })}>
          {t('print.actions.excel')}
        </BigButton>
      </div>
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      <ReportPreviewDialog query={query} open={previewing} onClose={() => setPreviewing(false)} />
    </div>
  );
}
